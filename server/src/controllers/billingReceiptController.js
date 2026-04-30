const mongoose = require("mongoose");
const BillingDocument = require("../models/BillingDocument");
const BillingDocumentCounter = require("../models/BillingDocumentCounter");
const BillingReceipt = require("../models/BillingReceipt");

const RECEIPT_TYPE_BY_BRAND = {
  magichands: "magichands_receipt",
  magic_gifts: "magic_gifts_receipt",
};

const ACCOUNT_TYPE_DEFAULT = "Accounts receivable";

const toText = (value) =>
  String(value === null || value === undefined ? "" : value).trim();

const toInlineText = (value) => toText(value).replace(/\s+/g, " ");

const toMultilineText = (value) =>
  String(value === null || value === undefined ? "" : value)
    .replace(/\r\n/g, "\n")
    .trim();

const toNumber = (value, fallback = 0) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number.parseFloat(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const toPositiveMoney = (value) => Math.max(0, roundMoney(toNumber(value)));

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toLines = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const getCustomerName = (invoice) =>
  toLines(invoice?.client?.name)[0] || toInlineText(invoice?.client?.name);

const sanitizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map(toMultilineText).filter(Boolean);
  }

  return toMultilineText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const sanitizeCompanySnapshot = (value, invoice) => {
  const source =
    value && typeof value === "object" ? value : invoice?.companySnapshot || {};

  return {
    name: toInlineText(source.name),
    addressLines: sanitizeStringArray(source.addressLines),
    telephone: toInlineText(source.telephone),
    tinNumber: toInlineText(source.tinNumber),
  };
};

const parseManualReceiptNumber = (value) => {
  const number = Math.trunc(toNumber(value, 0));
  return Number.isFinite(number) && number > 0 ? number : null;
};

const hasSubmittedReceiptNumber = (body = {}) =>
  Object.prototype.hasOwnProperty.call(body, "receiptNumber") &&
  toInlineText(body.receiptNumber);

const allocateReceiptNumber = async (receiptType) => {
  const counter = await BillingDocumentCounter.findOneAndUpdate(
    { counterKey: receiptType },
    { $inc: { lastNumber: 1 } },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  return counter.lastNumber;
};

const syncReceiptCounter = async (receiptType, receiptNumber) => {
  const number = parseManualReceiptNumber(receiptNumber);
  if (!number) return;

  await BillingDocumentCounter.findOneAndUpdate(
    { counterKey: receiptType },
    { $max: { lastNumber: number } },
    { upsert: true, setDefaultsOnInsert: true },
  );
};

const calculateTotals = (lineItems, paymentEntries, taxEntries = []) => {
  const subtotal = roundMoney(
    (Array.isArray(lineItems) ? lineItems : []).reduce(
      (sum, item) => sum + toPositiveMoney(item.total),
      0,
    ),
  );
  const taxAmount = roundMoney(
    (Array.isArray(taxEntries) ? taxEntries : []).reduce(
      (sum, entry) => sum + toPositiveMoney(entry.amount),
      0,
    ),
  );
  const totalAmount = roundMoney(subtotal + taxAmount);
  const paidAmount = roundMoney(
    paymentEntries.reduce((sum, entry) => sum + toPositiveMoney(entry.amount), 0),
  );

  return {
    subtotal,
    taxAmount,
    totalAmount,
    paidAmount,
    balanceDue: roundMoney(totalAmount - paidAmount),
  };
};

const isPaidInFull = (totals) =>
  toPositiveMoney(totals?.totalAmount) > 0 &&
  toPositiveMoney(totals?.paidAmount) > 0 &&
  roundMoney(totals?.balanceDue) <= 0;

const receiptToPaymentEntry = (receipt) => ({
  label: "Receipt",
  receiptNumber: String(receipt.receiptNumber || ""),
  date: receipt.receiptDate || null,
  amount: toPositiveMoney(receipt.amount),
});

const listReceiptsForInvoice = (invoiceId) =>
  BillingReceipt.find({ invoiceDocument: invoiceId })
    .sort({ receiptDate: 1, receiptNumber: 1, createdAt: 1 })
    .lean();

const syncInvoiceReceipts = async (invoiceId, userId = null) => {
  const invoice = await BillingDocument.findById(invoiceId);
  if (!invoice) return null;

  const receipts = await listReceiptsForInvoice(invoiceId);
  const paymentEntries = receipts.map(receiptToPaymentEntry);
  invoice.paymentEntries = paymentEntries;
  invoice.totals = calculateTotals(
    invoice.lineItems,
    paymentEntries,
    invoice.taxEntries,
  );
  if (
    invoice.kind === "invoice" &&
    invoice.status !== "void" &&
    isPaidInFull(invoice.totals)
  ) {
    invoice.status = "paid";
  }
  invoice.updatedBy = userId || invoice.updatedBy || null;
  await invoice.save();

  return invoice.toObject();
};

const resolveInvoice = async (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  const invoice = await BillingDocument.findById(value);
  return invoice?.kind === "invoice" ? invoice : null;
};

const sanitizeReceiptInput = (body = {}, invoice, existingReceipt = null) => ({
  accountType:
    toInlineText(body.accountType) ||
    existingReceipt?.accountType ||
    ACCOUNT_TYPE_DEFAULT,
  customerName:
    toMultilineText(body.customerName).slice(0, 600) ||
    existingReceipt?.customerName ||
    getCustomerName(invoice),
  customerLocation:
    toInlineText(body.customerLocation).slice(0, 180) ||
    existingReceipt?.customerLocation ||
    invoice?.client?.location ||
    "",
  customerPhone:
    toInlineText(body.customerPhone).slice(0, 80) ||
    existingReceipt?.customerPhone ||
    "",
  projectTitle:
    toMultilineText(body.projectTitle).slice(0, 800) ||
    existingReceipt?.projectTitle ||
    invoice?.projectTitle ||
    "",
  receiptDate:
    toDateOrNull(body.receiptDate) ||
    existingReceipt?.receiptDate ||
    new Date(),
  amount: toPositiveMoney(body.amount ?? existingReceipt?.amount),
  currency:
    toInlineText(body.currency).slice(0, 12) ||
    existingReceipt?.currency ||
    invoice?.currency ||
    "GHS",
  companySnapshot: sanitizeCompanySnapshot(body.companySnapshot, invoice),
});

const buildReceiptQuery = (req) => {
  const query = {};
  const invoiceId = toInlineText(req.query.invoiceId);
  const brand = toInlineText(req.query.brand);
  const search = toInlineText(req.query.search);

  if (mongoose.Types.ObjectId.isValid(invoiceId)) {
    query.invoiceDocument = invoiceId;
  }

  if (brand === "magichands" || brand === "magic_gifts") {
    query.brand = brand;
  }

  if (search) {
    const regex = new RegExp(
      String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    const numericSearch = Math.trunc(toNumber(search, 0));
    query.$or = [{ customerName: regex }, { projectTitle: regex }];
    if (numericSearch > 0) {
      query.$or.push(
        { receiptNumber: numericSearch },
        { referenceInvoiceNumber: numericSearch },
      );
    }
  }

  return query;
};

const sendReceipt = async (
  res,
  receipt,
  invoiceId,
  status = 200,
  invoice = null,
) => {
  const receipts = invoiceId ? await listReceiptsForInvoice(invoiceId) : [];
  return res.status(status).json({ receipt, receipts, invoice });
};

const handleDuplicateReceiptNumber = (error, res) => {
  if (error?.code !== 11000) return false;

  res.status(409).json({
    message: "That receipt number already exists for this receipt type.",
  });
  return true;
};

const getBillingReceipts = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Math.trunc(toNumber(req.query.limit, 150)), 1), 300);
    const receipts = await BillingReceipt.find(buildReceiptQuery(req))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ receipts });
  } catch (error) {
    console.error("Failed to list billing receipts", error);
    return res.status(500).json({ message: "Failed to load billing receipts." });
  }
};

const getBillingReceiptById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Billing receipt not found." });
    }

    const receipt = await BillingReceipt.findById(req.params.id).lean();
    if (!receipt) {
      return res.status(404).json({ message: "Billing receipt not found." });
    }

    return res.json({ receipt });
  } catch (error) {
    console.error("Failed to load billing receipt", error);
    return res.status(500).json({ message: "Failed to load billing receipt." });
  }
};

const createBillingReceipt = async (req, res) => {
  try {
    const invoice = await resolveInvoice(req.body?.invoiceDocument);
    if (!invoice) {
      return res.status(400).json({
        message: "A valid invoice is required before creating a receipt.",
      });
    }

    const receiptType = RECEIPT_TYPE_BY_BRAND[invoice.brand] || "magichands_receipt";
    const manualNumber = hasSubmittedReceiptNumber(req.body)
      ? parseManualReceiptNumber(req.body.receiptNumber)
      : null;
    if (hasSubmittedReceiptNumber(req.body) && !manualNumber) {
      return res.status(400).json({
        message: "Receipt number must be a positive whole number.",
      });
    }

    const receiptNumber =
      manualNumber || (await allocateReceiptNumber(receiptType));
    const sanitized = sanitizeReceiptInput(req.body, invoice);

    const receipt = await BillingReceipt.create({
      ...sanitized,
      receiptType,
      brand: invoice.brand,
      receiptNumber,
      invoiceDocument: invoice._id,
      invoiceDocumentType: invoice.documentType,
      referenceInvoiceNumber: invoice.documentNumber,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    if (manualNumber) {
      await syncReceiptCounter(receiptType, manualNumber);
    }

    const syncedInvoice = await syncInvoiceReceipts(
      invoice._id,
      req.user?._id || null,
    );
    return sendReceipt(res, receipt.toObject(), invoice._id, 201, syncedInvoice);
  } catch (error) {
    if (handleDuplicateReceiptNumber(error, res)) return undefined;
    console.error("Failed to create billing receipt", error);
    return res.status(500).json({ message: "Failed to create billing receipt." });
  }
};

const updateBillingReceipt = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Billing receipt not found." });
    }

    const receipt = await BillingReceipt.findById(req.params.id);
    if (!receipt) {
      return res.status(404).json({ message: "Billing receipt not found." });
    }

    const invoice = await resolveInvoice(receipt.invoiceDocument);
    if (!invoice) {
      return res.status(409).json({
        message: "The invoice linked to this receipt could not be found.",
      });
    }

    const manualNumber = hasSubmittedReceiptNumber(req.body)
      ? parseManualReceiptNumber(req.body.receiptNumber)
      : null;
    if (hasSubmittedReceiptNumber(req.body) && !manualNumber) {
      return res.status(400).json({
        message: "Receipt number must be a positive whole number.",
      });
    }

    Object.assign(receipt, sanitizeReceiptInput(req.body, invoice, receipt), {
      invoiceDocumentType: invoice.documentType,
      referenceInvoiceNumber: invoice.documentNumber,
      brand: invoice.brand,
      receiptType: RECEIPT_TYPE_BY_BRAND[invoice.brand] || receipt.receiptType,
      updatedBy: req.user?._id || null,
    });

    if (manualNumber) {
      receipt.receiptNumber = manualNumber;
    }

    await receipt.save();
    if (manualNumber) {
      await syncReceiptCounter(receipt.receiptType, manualNumber);
    }

    const syncedInvoice = await syncInvoiceReceipts(
      invoice._id,
      req.user?._id || null,
    );
    return sendReceipt(res, receipt.toObject(), invoice._id, 200, syncedInvoice);
  } catch (error) {
    if (handleDuplicateReceiptNumber(error, res)) return undefined;
    console.error("Failed to update billing receipt", error);
    return res.status(500).json({ message: "Failed to update billing receipt." });
  }
};

const deleteBillingReceipt = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Billing receipt not found." });
    }

    const receipt = await BillingReceipt.findById(req.params.id);
    if (!receipt) {
      return res.status(404).json({ message: "Billing receipt not found." });
    }

    const invoiceId = receipt.invoiceDocument;
    await receipt.deleteOne();
    const invoice = await syncInvoiceReceipts(invoiceId, req.user?._id || null);
    const receipts = await listReceiptsForInvoice(invoiceId);

    return res.json({
      receipts,
      invoice,
      message: "Billing receipt deleted permanently.",
    });
  } catch (error) {
    console.error("Failed to delete billing receipt", error);
    return res.status(500).json({ message: "Failed to delete billing receipt." });
  }
};

module.exports = {
  getBillingReceipts,
  getBillingReceiptById,
  createBillingReceipt,
  updateBillingReceipt,
  deleteBillingReceipt,
  syncInvoiceReceipts,
};
