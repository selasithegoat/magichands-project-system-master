const mongoose = require("mongoose");
const BillingDocument = require("../models/BillingDocument");
const BillingDocumentCounter = require("../models/BillingDocumentCounter");
const BillingReceipt = require("../models/BillingReceipt");

const DOCUMENT_TYPE_META = {
  magichands_invoice: { brand: "magichands", kind: "invoice" },
  magichands_quote: { brand: "magichands", kind: "quote" },
  magic_gifts_invoice: { brand: "magic_gifts", kind: "invoice" },
  magic_gifts_quote: { brand: "magic_gifts", kind: "quote" },
};

const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_META);
const DOCUMENT_STATUSES = new Set([
  "draft",
  "sent",
  "accepted",
  "converted",
  "paid",
  "void",
]);

const COMPANY_PROFILES = {
  magichands: {
    name: "MAGICHANDS COMPANY LTD",
    addressLines: [
      "Hse# 6, 7th Close.",
      "Justice Brobbey Ave. New Achimota .",
      "Accra. Ghana",
    ],
    telephone: "0244529987 / 0302408602",
    tinNumber: "C0004547691",
  },
  magic_gifts: {
    name: "MAGICGIFTS",
    addressLines: [
      "Hse# 6, 7th Close.",
      "Justice Brobbey Ave. New Achimota .",
      "Accra. Ghana",
    ],
    telephone: "0244529987 / 0302408602",
    tinNumber: "P0002366053",
  },
};

const EMPTY_NOTES = {
  terms: [],
  paymentInstructions: [],
  depositNote: "",
  closing: "",
};

const DEFAULT_NOTES_BY_BRAND = {
  magichands: {
    terms: [
      "TERMS & CONDITIONS",
      "Allow 14 working days for production upon payment",
      "* DHL/UPS to major destinations takes 2-4 days",
      "* Please make 60% deposit of payment to commence contract and 40% after delivery",
    ],
    paymentInstructions: [
      "Make all bills payable in Gh\u00a2 and to:",
      "Magichands Co Ltd",
      "Republic Bank. Achimota Branch. Accra .",
      "A/C-No.: 0410356811023",
      "SWIFT: HFCAGHAC",
      "OR",
      "MTN MOBILE MONEY # 0240683485",
    ],
    depositNote: "NOTE: PLEASE MAKE 60% PAYMENT TO COMMENCE CONTRACT",
    closing: "THANK YOU FOR DOING BUSINESS WITH US.",
  },
  magic_gifts: {
    terms: [
      "TERMS & CONDITIONS",
      "Allow 14 working days for production upon payment",
      "Express Shipping Takes 4 Days to 1 week",
      "Please make 60% deposit of payment to commence contract and 40% after delivery",
    ],
    paymentInstructions: [
      "Make all bills payable in Gh\u00a2 and to:",
      "Magic Gifts",
      "Republic Bank. Achimota Branch. Accra .",
      "A/C-No.: 0418815461015",
      "SWIFT: HFCAGHAC",
      "OR",
      "MTN MOBILE MONEY # 0599004765 OR",
      "MERCHANT ID # 435838",
    ],
    depositNote: "NOTE: PLEASE MAKE 60% PAYMENT TO COMMENCE CONTRACT",
    closing: "THANK YOU FOR DOING BUSINESS WITH US.",
  },
};

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

const toPositiveQuantity = (value) => Math.max(0, roundMoney(toNumber(value, 0)));

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date, days) => {
  const base = date instanceof Date && !Number.isNaN(date.getTime())
    ? date
    : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
};

const normalizeDepartmentToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

const getUserDepartments = (user) =>
  (Array.isArray(user?.department) ? user.department : user?.department ? [user.department] : [])
    .map(normalizeDepartmentToken)
    .filter(Boolean);

const hasBillingDocumentAccess = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;

  const departments = getUserDepartments(user);
  return (
    departments.includes("front-desk") ||
    departments.includes("administration")
  );
};

const requireBillingDocumentAccess = (req, res, next) => {
  if (hasBillingDocumentAccess(req.user)) {
    return next();
  }

  return res.status(403).json({
    message:
      "Access denied: billing documents are restricted to Administration admins and Front Desk users.",
  });
};

const resolveDocumentType = (value) => {
  const documentType = toInlineText(value);
  return DOCUMENT_TYPE_META[documentType] ? documentType : "";
};

const getDefaultCompanySnapshot = (brand) => ({
  ...(COMPANY_PROFILES[brand] || COMPANY_PROFILES.magichands),
});

const getDefaultNotes = (brand) => {
  const notes = DEFAULT_NOTES_BY_BRAND[brand] || DEFAULT_NOTES_BY_BRAND.magichands;
  return {
    ...EMPTY_NOTES,
    ...notes,
    terms: [...notes.terms],
    paymentInstructions: [...notes.paymentInstructions],
  };
};

const sanitizeStringArray = (value) => {
  if (Array.isArray(value)) {
    return value.map(toMultilineText).filter(Boolean);
  }

  return toMultilineText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

const sanitizeCompanySnapshot = (value, brand) => {
  const fallback = getDefaultCompanySnapshot(brand);
  const source = value && typeof value === "object" ? value : {};

  return {
    name: toInlineText(source.name) || fallback.name,
    addressLines:
      sanitizeStringArray(source.addressLines).length > 0
        ? sanitizeStringArray(source.addressLines)
        : [...fallback.addressLines],
    telephone: toInlineText(source.telephone) || fallback.telephone,
    tinNumber: toInlineText(source.tinNumber) || fallback.tinNumber,
  };
};

const sanitizeClient = (value) => {
  const source = value && typeof value === "object" ? value : {};

  return {
    name: toMultilineText(source.name).slice(0, 600),
    location: toInlineText(source.location).slice(0, 180),
    address: toMultilineText(source.address).slice(0, 800),
  };
};

const sanitizeLineItems = (value) => {
  const items = Array.isArray(value) ? value : [];
  const sanitized = items
    .map((item) => {
      const quantity = toPositiveQuantity(item?.quantity);
      const unitPrice = toPositiveMoney(item?.unitPrice);
      const total = roundMoney(quantity * unitPrice);

      return {
        description: toMultilineText(item?.description).slice(0, 1600),
        quantity,
        unitPrice,
        total,
      };
    })
    .filter((item) => item.description || item.quantity || item.unitPrice);

  return sanitized.length
    ? sanitized
    : [{ description: "", quantity: 0, unitPrice: 0, total: 0 }];
};

const sanitizePaymentEntries = (value) => {
  const entries = Array.isArray(value) ? value : [];
  return entries
    .map((entry) => ({
      label: toInlineText(entry?.label).slice(0, 180),
      receiptNumber: toInlineText(entry?.receiptNumber).slice(0, 80),
      date: toDateOrNull(entry?.date),
      amount: toPositiveMoney(entry?.amount),
    }))
    .filter((entry) => entry.label || entry.receiptNumber || entry.amount);
};

const sanitizeTaxEntries = (value, subtotal = 0) => {
  const entries = Array.isArray(value) ? value : [];
  return entries
    .map((entry) => {
      const rate = toPositiveMoney(entry?.rate);
      const amount = roundMoney((toPositiveMoney(subtotal) * rate) / 100);

      return {
        label: toInlineText(entry?.label).slice(0, 180),
        rate,
        amount,
      };
    })
    .filter((entry) => entry.label || entry.rate);
};

const sanitizeNotes = (value, brand) => {
  const fallback = getDefaultNotes(brand);
  const source = value && typeof value === "object" ? value : {};
  const terms = sanitizeStringArray(source.terms);
  const paymentInstructions = sanitizeStringArray(source.paymentInstructions);

  return {
    terms: terms.length ? terms : [...fallback.terms],
    paymentInstructions: paymentInstructions.length
      ? paymentInstructions
      : [...fallback.paymentInstructions],
    depositNote: toInlineText(source.depositNote) || fallback.depositNote,
    closing: toInlineText(source.closing) || fallback.closing,
  };
};

const calculateTotals = (lineItems, paymentEntries, taxEntries = []) => {
  const subtotal = roundMoney(
    lineItems.reduce((sum, item) => sum + toPositiveMoney(item.total), 0),
  );
  const taxAmount = roundMoney(
    taxEntries.reduce((sum, entry) => sum + toPositiveMoney(entry.amount), 0),
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

const sanitizeDocumentInput = (body = {}, existingDocument = null) => {
  const existingType = existingDocument?.documentType;
  const documentType =
    existingType || resolveDocumentType(body.documentType) || "magichands_invoice";
  const meta = DOCUMENT_TYPE_META[documentType];
  const issueDate = toDateOrNull(body.issueDate) || existingDocument?.issueDate || new Date();
  const incomingDueDate = toDateOrNull(body.dueDate);
  const dueDate =
    meta.kind === "invoice"
      ? incomingDueDate || existingDocument?.dueDate || addDays(issueDate, 14)
      : null;
  const lineItems = sanitizeLineItems(body.lineItems);
  const itemSubtotal = roundMoney(
    lineItems.reduce((sum, item) => sum + toPositiveMoney(item.total), 0),
  );
  const taxEntries = sanitizeTaxEntries(body.taxEntries, itemSubtotal);
  const paymentEntries =
    meta.kind === "invoice" ? sanitizePaymentEntries(body.paymentEntries) : [];

  return {
    documentType,
    brand: meta.brand,
    kind: meta.kind,
    status: DOCUMENT_STATUSES.has(toInlineText(body.status))
      ? toInlineText(body.status)
      : existingDocument?.status || "draft",
    issueDate,
    dueDate,
    client: sanitizeClient(body.client),
    projectTitle: toMultilineText(body.projectTitle).slice(0, 800),
    currency: toInlineText(body.currency).slice(0, 12) || "GHS",
    companySnapshot: sanitizeCompanySnapshot(body.companySnapshot, meta.brand),
    lineItems,
    paymentEntries,
    taxEntries,
    notes: sanitizeNotes(body.notes, meta.brand),
    totals: calculateTotals(lineItems, paymentEntries, taxEntries),
  };
};

const allocateDocumentNumber = async (documentType) => {
  const counter = await BillingDocumentCounter.findOneAndUpdate(
    { counterKey: documentType },
    { $inc: { lastNumber: 1 } },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  );

  return counter.lastNumber;
};

const parseManualDocumentNumber = (value) => {
  const number = Math.trunc(toNumber(value, 0));
  return Number.isFinite(number) && number > 0 ? number : null;
};

const hasSubmittedDocumentNumber = (body = {}) =>
  Object.prototype.hasOwnProperty.call(body, "documentNumber") &&
  toInlineText(body.documentNumber);

const syncDocumentCounter = async (documentType, documentNumber) => {
  const number = parseManualDocumentNumber(documentNumber);
  if (!number) return;

  await BillingDocumentCounter.findOneAndUpdate(
    { counterKey: documentType },
    { $max: { lastNumber: number } },
    { upsert: true, setDefaultsOnInsert: true },
  );
};

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildListQuery = (req) => {
  const query = {};
  const documentType = resolveDocumentType(req.query.documentType);
  const kind = toInlineText(req.query.kind);
  const brand = toInlineText(req.query.brand);
  const status = toInlineText(req.query.status);
  const search = toInlineText(req.query.search);

  if (documentType) query.documentType = documentType;
  if (kind === "invoice" || kind === "quote") query.kind = kind;
  if (brand === "magichands" || brand === "magic_gifts") query.brand = brand;
  if (DOCUMENT_STATUSES.has(status)) query.status = status;

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    const numericSearch = Math.trunc(toNumber(search, 0));
    query.$or = [
      { "client.name": regex },
      { "client.location": regex },
      { projectTitle: regex },
    ];

    if (numericSearch > 0) {
      query.$or.push({ documentNumber: numericSearch });
    }
  }

  return query;
};

const sendDocument = (res, document, status = 200) =>
  res.status(status).json({ document });

const handleDuplicateDocumentNumber = (error, res) => {
  if (error?.code !== 11000) return false;

  res.status(409).json({
    message:
      "That document number already exists for this billing document type.",
  });
  return true;
};

const getBillingDocuments = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Math.trunc(toNumber(req.query.limit, 150)), 1), 300);
    const documents = await BillingDocument.find(buildListQuery(req))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ documents });
  } catch (error) {
    console.error("Failed to list billing documents", error);
    res.status(500).json({ message: "Failed to load billing documents." });
  }
};

const getBillingDocumentById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Billing document not found." });
    }

    const document = await BillingDocument.findById(req.params.id).lean();
    if (!document) {
      return res.status(404).json({ message: "Billing document not found." });
    }

    return sendDocument(res, document);
  } catch (error) {
    console.error("Failed to load billing document", error);
    return res.status(500).json({ message: "Failed to load billing document." });
  }
};

const createBillingDocument = async (req, res) => {
  try {
    const sanitized = sanitizeDocumentInput(req.body);
    const manualNumber =
      sanitized.kind === "invoice" && hasSubmittedDocumentNumber(req.body)
        ? parseManualDocumentNumber(req.body.documentNumber)
        : null;
    if (
      sanitized.kind === "invoice" &&
      hasSubmittedDocumentNumber(req.body) &&
      !manualNumber
    ) {
      return res.status(400).json({
        message: "Invoice number must be a positive whole number.",
      });
    }

    const documentNumber =
      manualNumber || (await allocateDocumentNumber(sanitized.documentType));

    const document = await BillingDocument.create({
      ...sanitized,
      documentNumber,
      sourceQuoteNumber: parseManualDocumentNumber(req.body?.sourceQuoteNumber),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    if (manualNumber) {
      await syncDocumentCounter(sanitized.documentType, manualNumber);
    }

    return sendDocument(res, document, 201);
  } catch (error) {
    if (handleDuplicateDocumentNumber(error, res)) return undefined;
    console.error("Failed to create billing document", error);
    return res.status(500).json({ message: "Failed to create billing document." });
  }
};

const updateBillingDocument = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Billing document not found." });
    }

    const document = await BillingDocument.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: "Billing document not found." });
    }

    const sanitized = sanitizeDocumentInput(req.body, document);
    const manualNumber =
      document.kind === "invoice" && hasSubmittedDocumentNumber(req.body)
        ? parseManualDocumentNumber(req.body.documentNumber)
        : null;
    if (
      document.kind === "invoice" &&
      hasSubmittedDocumentNumber(req.body) &&
      !manualNumber
    ) {
      return res.status(400).json({
        message: "Invoice number must be a positive whole number.",
      });
    }

    Object.assign(document, sanitized, {
      updatedBy: req.user?._id || null,
    });

    if (manualNumber) {
      document.documentNumber = manualNumber;
    }

    if (document.kind === "invoice" && "sourceQuoteNumber" in req.body) {
      document.sourceQuoteNumber = parseManualDocumentNumber(
        req.body.sourceQuoteNumber,
      );
    }

    await document.save();
    if (document.kind === "invoice") {
      await BillingReceipt.updateMany(
        { invoiceDocument: document._id },
        {
          $set: {
            brand: document.brand,
            invoiceDocumentType: document.documentType,
            referenceInvoiceNumber: document.documentNumber,
            companySnapshot: document.companySnapshot,
            currency: document.currency || "GHS",
          },
        },
      );
    }

    if (manualNumber) {
      await syncDocumentCounter(document.documentType, manualNumber);
    }

    return sendDocument(res, document);
  } catch (error) {
    if (handleDuplicateDocumentNumber(error, res)) return undefined;
    console.error("Failed to update billing document", error);
    return res.status(500).json({ message: "Failed to update billing document." });
  }
};

const convertQuoteToInvoice = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Billing document not found." });
    }

    const quote = await BillingDocument.findById(req.params.id);
    if (!quote) {
      return res.status(404).json({ message: "Billing document not found." });
    }

    if (quote.kind !== "quote") {
      return res.status(400).json({
        message: "Only quotes can be converted into invoices.",
      });
    }

    if (quote.convertedToDocument) {
      const existingInvoice = await BillingDocument.findById(
        quote.convertedToDocument,
      ).lean();
      if (existingInvoice) {
        return res.status(200).json({
          document: existingInvoice,
          message: "This quote has already been converted into an invoice.",
        });
      }
    }

    const invoiceType =
      quote.brand === "magic_gifts"
        ? "magic_gifts_invoice"
        : "magichands_invoice";
    const issueDate = toDateOrNull(req.body?.issueDate) || new Date();
    const dueDate = toDateOrNull(req.body?.dueDate) || addDays(issueDate, 14);
    const documentNumber = await allocateDocumentNumber(invoiceType);
    const invoiceLineItems = quote.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
    }));
    const invoiceSubtotal = roundMoney(
      invoiceLineItems.reduce((sum, item) => sum + toPositiveMoney(item.total), 0),
    );
    const taxEntries = sanitizeTaxEntries(
      Array.isArray(req.body?.taxEntries) ? req.body.taxEntries : quote.taxEntries,
      invoiceSubtotal,
    );
    const paymentEntries = sanitizePaymentEntries(req.body?.paymentEntries);

    const invoice = await BillingDocument.create({
      documentType: invoiceType,
      brand: quote.brand,
      kind: "invoice",
      documentNumber,
      status: "draft",
      issueDate,
      dueDate,
      client: quote.client,
      projectTitle: quote.projectTitle,
      currency: quote.currency || "GHS",
      companySnapshot: quote.companySnapshot,
      lineItems: invoiceLineItems,
      paymentEntries,
      taxEntries,
      notes: quote.notes,
      totals: calculateTotals(invoiceLineItems, paymentEntries, taxEntries),
      sourceQuoteDocument: quote._id,
      sourceQuoteNumber: quote.documentNumber,
      sourceQuoteDocumentType: quote.documentType,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    quote.status = "converted";
    quote.convertedToDocument = invoice._id;
    quote.convertedAt = new Date();
    quote.convertedBy = req.user?._id || null;
    quote.updatedBy = req.user?._id || null;
    await quote.save();

    return sendDocument(res, invoice, 201);
  } catch (error) {
    if (handleDuplicateDocumentNumber(error, res)) return undefined;
    console.error("Failed to convert quote into invoice", error);
    return res.status(500).json({
      message: "Failed to convert quote into invoice.",
    });
  }
};

const deleteBillingDocument = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Billing document not found." });
    }

    const document = await BillingDocument.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: "Billing document not found." });
    }

    if (document.convertedToDocument) {
      return res.status(409).json({
        message:
          "Converted billing documents are linked for audit history and cannot be deleted.",
      });
    }

    if (document.kind === "invoice" && document.sourceQuoteDocument) {
      const sourceQuote = await BillingDocument.findById(document.sourceQuoteDocument);
      if (
        sourceQuote?.convertedToDocument &&
        sourceQuote.convertedToDocument.toString() === document._id.toString()
      ) {
        sourceQuote.convertedToDocument = null;
        sourceQuote.convertedAt = null;
        sourceQuote.convertedBy = null;
        if (sourceQuote.status === "converted") {
          sourceQuote.status = "accepted";
        }
        sourceQuote.updatedBy = req.user?._id || null;
        await sourceQuote.save();
      }
    }

    if (document.kind === "invoice") {
      await BillingReceipt.deleteMany({ invoiceDocument: document._id });
    }

    await document.deleteOne();
    return res.json({ message: "Billing document deleted permanently." });
  } catch (error) {
    console.error("Failed to delete billing document", error);
    return res.status(500).json({ message: "Failed to delete billing document." });
  }
};

module.exports = {
  requireBillingDocumentAccess,
  getBillingDocuments,
  getBillingDocumentById,
  createBillingDocument,
  updateBillingDocument,
  convertQuoteToInvoice,
  deleteBillingDocument,
};
