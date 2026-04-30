import React, { useCallback, useEffect, useMemo, useState } from "react";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import TrashIcon from "../../components/icons/TrashIcon";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Toast from "../../components/ui/Toast";
import { appendPortalSource, resolvePortalSource } from "../../utils/portalSource";
import "./BillingDocuments.css";

const DOCUMENT_TYPES = [
  {
    value: "magichands_invoice",
    label: "Magichands Invoice",
    brand: "magichands",
    kind: "invoice",
  },
  {
    value: "magichands_quote",
    label: "Magichands Quote",
    brand: "magichands",
    kind: "quote",
  },
  {
    value: "magic_gifts_quote",
    label: "Magic Gifts Quote",
    brand: "magic_gifts",
    kind: "quote",
  },
  {
    value: "magic_gifts_invoice",
    label: "Magic Gifts Invoice",
    brand: "magic_gifts",
    kind: "invoice",
  },
];

const DOCUMENT_META = DOCUMENT_TYPES.reduce((acc, entry) => {
  acc[entry.value] = entry;
  return acc;
}, {});

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

const DEFAULT_TAX_ENTRIES = [
  { label: "NHIL - 2.5%", rate: 2.5 },
  { label: "GET FUND LEVY 2.5%", rate: 2.5 },
  { label: "VAT - 15%", rate: 15 },
];

const CURRENCY_SYMBOL = "GH\u00a2";
const DEFAULT_RECEIPT_ACCOUNT_TYPE = "Accounts receivable";

const EMPTY_CONFIRM_DIALOG = {
  isOpen: false,
  action: "",
  targetDocument: null,
  targetReceipt: null,
  title: "",
  message: "",
  confirmText: "Confirm",
  cancelText: "Cancel",
  type: "primary",
};

const normalizeDepartmentToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

const userHasBillingAccess = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;

  const departments = Array.isArray(user.department)
    ? user.department
    : user.department
      ? [user.department]
      : [];

  return departments
    .map(normalizeDepartmentToken)
    .some((department) => department === "front-desk" || department === "administration");
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const addDaysIso = (value, days) => {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return todayIso();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const toDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const formatDate = (value) => toDateInput(value) || "---- -- --";

const toNumber = (value, fallback = 0) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const parsed = Number.parseFloat(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isBlankValue = (value) =>
  value === "" || value === null || value === undefined;

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

const formatMoney = (value) =>
  roundMoney(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatQuantity = (value) => {
  const number = toNumber(value, 0);
  return Number.isInteger(number)
    ? number.toLocaleString("en-US")
    : number.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
};

const toLines = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const cloneArray = (value) => (Array.isArray(value) ? [...value] : []);

const makeLineItem = (item = {}) => ({
  _id: item._id || "",
  description: item.description || "",
  quantity: item.quantity ?? "",
  unitPrice: item.unitPrice ?? "",
});

const makePaymentEntry = (entry = {}) => ({
  _id: entry._id || "",
  label: entry.label || "",
  receiptNumber: entry.receiptNumber || "",
  date: toDateInput(entry.date) || "",
  amount: entry.amount ?? "",
});

const makeReceiptForm = (entry = {}) => ({
  _id: entry._id || "",
  receiptNumber: entry.receiptNumber || "",
  accountType: entry.accountType || DEFAULT_RECEIPT_ACCOUNT_TYPE,
  customerName: entry.customerName || "",
  customerLocation: entry.customerLocation || "",
  customerPhone: entry.customerPhone || "",
  projectTitle: entry.projectTitle || "",
  receiptDate: toDateInput(entry.receiptDate) || todayIso(),
  amount: entry.amount ?? "",
});

const receiptToPaymentEntry = (receipt = {}) =>
  makePaymentEntry({
    _id: receipt._id || "",
    label: "Receipt",
    receiptNumber: receipt.receiptNumber || "",
    date: receipt.receiptDate,
    amount: receipt.amount ?? 0,
  });

const receiptsToPaymentEntries = (receipts = []) =>
  receipts.map(receiptToPaymentEntry);

const createReceiptDraftFromInvoice = (invoice, amount = "") => {
  const customerLines = toLines(invoice?.client?.name);

  return makeReceiptForm({
    accountType: DEFAULT_RECEIPT_ACCOUNT_TYPE,
    customerName: customerLines[0] || invoice?.client?.name || "",
    customerLocation: invoice?.client?.location || "",
    customerPhone: "",
    projectTitle: invoice?.projectTitle || "",
    receiptDate: todayIso(),
    amount,
  });
};

const buildReceiptPayload = (receiptForm, invoice) => ({
  invoiceDocument: invoice._id,
  receiptNumber: receiptForm.receiptNumber,
  accountType: receiptForm.accountType,
  customerName: receiptForm.customerName,
  customerLocation: receiptForm.customerLocation,
  customerPhone: receiptForm.customerPhone,
  projectTitle: receiptForm.projectTitle,
  receiptDate: receiptForm.receiptDate,
  amount: toNumber(receiptForm.amount, 0),
  currency: invoice.currency || "GHS",
  companySnapshot: invoice.companySnapshot,
});

const makeTaxEntry = (entry = {}) => ({
  _id: entry._id || "",
  label: entry.label || "",
  rate: entry.rate ?? "",
  amount: entry.amount ?? "",
});

const createDefaultTaxEntries = () => DEFAULT_TAX_ENTRIES.map(makeTaxEntry);

const getMeta = (documentType) =>
  DOCUMENT_META[documentType] || DOCUMENT_META.magichands_invoice;

const getDefaultNotes = (brand) => {
  const notes = DEFAULT_NOTES_BY_BRAND[brand] || DEFAULT_NOTES_BY_BRAND.magichands;
  return {
    ...EMPTY_NOTES,
    ...notes,
    terms: cloneArray(notes.terms),
    paymentInstructions: cloneArray(notes.paymentInstructions),
  };
};

const getBrandDefaults = (brand) => ({
  companySnapshot: {
    ...COMPANY_PROFILES[brand],
    addressLines: cloneArray(COMPANY_PROFILES[brand]?.addressLines),
  },
  notes: getDefaultNotes(brand),
});

const createBlankForm = (documentType = "magichands_invoice") => {
  const meta = getMeta(documentType);
  const defaults = getBrandDefaults(meta.brand);

  return {
    _id: "",
    documentType,
    documentNumber: "",
    status: "draft",
    issueDate: "",
    dueDate: "",
    client: {
      name: "",
      location: "",
      address: "",
    },
    projectTitle: "",
    currency: "GHS",
    lineItems: [makeLineItem()],
    paymentEntries: [],
    taxEntries: [],
    sourceQuoteNumber: "",
    sourceQuoteDocument: "",
    companySnapshot: defaults.companySnapshot,
    notes: defaults.notes,
  };
};

const normalizeDocumentForForm = (document) => {
  if (!document) return createBlankForm();

  const meta = getMeta(document.documentType);
  const defaults = getBrandDefaults(meta.brand);
  const issueDate = toDateInput(document.issueDate) || todayIso();
  const lineItems = Array.isArray(document.lineItems)
    ? document.lineItems.map(makeLineItem)
    : [];
  const paymentEntries = Array.isArray(document.paymentEntries)
    ? document.paymentEntries.map(makePaymentEntry)
    : [];
  const taxEntries = Array.isArray(document.taxEntries)
    ? document.taxEntries.map(makeTaxEntry)
    : [];
  const terms = cloneArray(document.notes?.terms);
  const paymentInstructions = cloneArray(document.notes?.paymentInstructions);

  return {
    _id: document._id || "",
    documentType: document.documentType || "magichands_invoice",
    documentNumber: document.documentNumber || "",
    status: document.status || "draft",
    issueDate,
    dueDate:
      meta.kind === "invoice"
        ? toDateInput(document.dueDate) || addDaysIso(issueDate, 14)
        : "",
    client: {
      name: document.client?.name || "",
      location: document.client?.location || "",
      address: document.client?.address || "",
    },
    projectTitle: document.projectTitle || "",
    currency: document.currency || "GHS",
    lineItems: lineItems.length ? lineItems : [makeLineItem()],
    paymentEntries,
    taxEntries,
    sourceQuoteNumber: document.sourceQuoteNumber || "",
    sourceQuoteDocument: document.sourceQuoteDocument || "",
    companySnapshot: {
      ...defaults.companySnapshot,
      ...(document.companySnapshot || {}),
      addressLines:
        document.companySnapshot?.addressLines?.length > 0
          ? cloneArray(document.companySnapshot.addressLines)
          : defaults.companySnapshot.addressLines,
    },
    notes: {
      ...defaults.notes,
      ...(document.notes || {}),
      terms: terms.length ? terms : cloneArray(defaults.notes.terms),
      paymentInstructions: paymentInstructions.length
        ? paymentInstructions
        : cloneArray(defaults.notes.paymentInstructions),
      depositNote: document.notes?.depositNote || defaults.notes.depositNote,
      closing: document.notes?.closing || defaults.notes.closing,
    },
  };
};

const calculateTaxEntries = (taxEntries, subtotal) =>
  (Array.isArray(taxEntries) ? taxEntries : [])
    .map((entry) => {
      const rate = toNumber(entry.rate, 0);
      return {
        ...entry,
        rate,
        amount: roundMoney((subtotal * rate) / 100),
      };
    })
    .filter((entry) => entry.label || entry.rate);

const calculateTotals = (lineItems, paymentEntries, taxEntries = []) => {
  const subtotal = roundMoney(
    lineItems.reduce((sum, item) => {
      return sum + toNumber(item.quantity, 0) * toNumber(item.unitPrice, 0);
    }, 0),
  );
  const computedTaxEntries = calculateTaxEntries(taxEntries, subtotal);
  const taxAmount = roundMoney(
    computedTaxEntries.reduce((sum, entry) => sum + toNumber(entry.amount, 0), 0),
  );
  const totalAmount = roundMoney(subtotal + taxAmount);
  const paidAmount = roundMoney(
    paymentEntries.reduce((sum, entry) => sum + toNumber(entry.amount, 0), 0),
  );

  return {
    subtotal,
    taxEntries: computedTaxEntries,
    taxAmount,
    totalAmount,
    paidAmount,
    balanceDue: roundMoney(totalAmount - paidAmount),
  };
};

const buildPayload = (form) => ({
  documentType: form.documentType,
  documentNumber:
    getMeta(form.documentType).kind === "invoice" ? form.documentNumber : "",
  status: form.status,
  issueDate: form.issueDate,
  dueDate: getMeta(form.documentType).kind === "invoice" ? form.dueDate : "",
  client: form.client,
  projectTitle: form.projectTitle,
  currency: form.currency || "GHS",
  companySnapshot: form.companySnapshot,
  lineItems: form.lineItems.map((item) => ({
    description: item.description,
    quantity: toNumber(item.quantity, 0),
    unitPrice: toNumber(item.unitPrice, 0),
  })),
  paymentEntries: form.paymentEntries.map((entry) => ({
    label: entry.label,
    receiptNumber: entry.receiptNumber,
    date: entry.date,
    amount: toNumber(entry.amount, 0),
  })),
  taxEntries: form.taxEntries
    .map((entry) => ({
      label: entry.label,
      rate: toNumber(entry.rate, 0),
    }))
    .filter((entry) => entry.label || entry.rate),
  sourceQuoteNumber:
    getMeta(form.documentType).kind === "invoice" ? form.sourceQuoteNumber : "",
  notes: form.notes,
});

const StatusBadge = ({ status }) => (
  <span className={`billing-status-badge ${status || "draft"}`}>
    {String(status || "draft").replace(/_/g, " ")}
  </span>
);

const ReceiptIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M7 3h10a2 2 0 0 1 2 2v16l-3-1.6-2.6 1.6L11 19.4 8.6 21 6 19.4 3 21V5a2 2 0 0 1 2-2h2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path
      d="M8 8h8M8 12h8M8 16h5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M12 5v14M5 12h14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const PrinterIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M7 8V4h10v4M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v7H7v-7Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const BillingPreview = ({ form, totals }) => {
  const meta = getMeta(form.documentType);
  const isInvoice = meta.kind === "invoice";
  const company = form.companySnapshot || COMPANY_PROFILES[meta.brand];
  const itemRows = form.lineItems.length ? form.lineItems : [makeLineItem()];
  const clientLines = toLines(form.client.name);
  const showPaidStamp = isInvoice && totals.paidAmount > 0 && totals.balanceDue <= 0;
  const hasTaxEntries = totals.taxEntries.length > 0;

  return (
    <section className={`billing-paper ${meta.brand}`}>
      <header className="billing-paper-header">
        <h2>{isInvoice ? "Invoice" : "Quote"}</h2>
        {meta.brand === "magichands" ? (
          <img src="/mhlogo.png" alt="Magichands" className="billing-mh-logo" />
        ) : (
          <img
            src="/magic-gifts-logo.png"
            alt="Magic Gifts"
            className="billing-magic-gifts-logo"
          />
        )}
      </header>

      <section className="billing-paper-meta">
        <div className="billing-paper-client">
          {clientLines.length ? (
            clientLines.map((line) => <strong key={line}>{line}</strong>)
          ) : (
            <strong>&nbsp;</strong>
          )}
          {form.client.location && <span>{form.client.location}</span>}
          {toLines(form.client.address).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>

        <dl className="billing-paper-facts">
          <div>
            <dt>{isInvoice ? "Invoice date" : "Issue date"}</dt>
            <dd>{formatDate(form.issueDate)}</dd>
          </div>
          {isInvoice && (
            <div>
              <dt>Due date</dt>
              <dd>{formatDate(form.dueDate)}</dd>
            </div>
          )}
          <div>
            <dt>{isInvoice ? "Invoice number" : "Reference"}</dt>
            <dd>{form.documentNumber || "Pending"}</dd>
          </div>
          {isInvoice && form.sourceQuoteNumber && (
            <div>
              <dt>Quote number</dt>
              <dd>{form.sourceQuoteNumber}</dd>
            </div>
          )}
        </dl>

        <div className="billing-paper-company">
          <strong>{company.name}</strong>
          {(company.addressLines || []).map((line) => (
            <span key={line}>{line}</span>
          ))}
          {company.telephone && <span>Tel: {company.telephone}</span>}
          {company.tinNumber && <span>Tin Number: {company.tinNumber}</span>}
        </div>
      </section>

      <h3 className="billing-project-title">
        {form.projectTitle || "\u00a0"}
      </h3>

      <table className="billing-items-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {itemRows.map((item, index) => (
            <tr key={item._id || `${index}-${item.description}`}>
              <td>{index + 1}</td>
              <td>
                {toLines(item.description).length ? (
                  toLines(item.description).map((line) => (
                    <span key={line}>{line}</span>
                  ))
                ) : (
                  <span>&nbsp;</span>
                )}
              </td>
              <td>{isBlankValue(item.quantity) ? "" : formatQuantity(item.quantity)}</td>
              <td>{isBlankValue(item.unitPrice) ? "" : formatMoney(item.unitPrice)}</td>
              <td>
                {isBlankValue(item.quantity) && isBlankValue(item.unitPrice)
                  ? ""
                  : formatMoney(toNumber(item.quantity) * toNumber(item.unitPrice))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {hasTaxEntries && (
            <>
              <tr>
                <td className="billing-footer-spacer" colSpan="3" />
                <th className="billing-footer-label">Sub-total</th>
                <td className="billing-footer-amount">
                  {formatMoney(totals.subtotal)}
                </td>
              </tr>
              {totals.taxEntries.map((entry, index) => (
                <tr key={entry._id || `${entry.label}-${index}`}>
                  <td className="billing-footer-spacer" colSpan="3" />
                  <th className="billing-footer-label">{entry.label}</th>
                  <td className="billing-footer-amount">
                    {formatMoney(entry.amount)}
                  </td>
                </tr>
              ))}
              <tr className="billing-grand-total">
                <td className="billing-footer-spacer" colSpan="3" />
                <th className="billing-footer-label">
                  Total Amount {CURRENCY_SYMBOL}
                </th>
                <td className="billing-footer-amount">
                  <strong>{formatMoney(totals.totalAmount)}</strong>
                </td>
              </tr>
            </>
          )}
          {!hasTaxEntries && (
            <tr>
              <td className="billing-footer-spacer" colSpan="3" />
              <th className="billing-footer-label">Total</th>
              <td className="billing-footer-amount">
                <strong>
                  {CURRENCY_SYMBOL} {formatMoney(totals.totalAmount)}
                </strong>
              </td>
            </tr>
          )}
          {isInvoice &&
            form.paymentEntries.map((entry, index) => (
              <tr key={entry._id || `${entry.receiptNumber}-${index}`}>
                <td className="billing-footer-spacer" colSpan="3" />
                <th className="billing-footer-label">
                  {entry.label || "Receipt"}
                  {entry.receiptNumber ? ` - ${entry.receiptNumber}` : ""}
                  {entry.date ? ` - ${formatDate(entry.date)}` : ""}
                </th>
                <td className="billing-footer-amount">
                  - {formatMoney(entry.amount)}
                </td>
              </tr>
            ))}
          {isInvoice && form.paymentEntries.length > 0 && (
            <tr>
              <td className="billing-footer-spacer" colSpan="3" />
              <th className="billing-footer-label">Balance due</th>
              <td className="billing-footer-amount">
                <strong>{formatMoney(totals.balanceDue)}</strong>
              </td>
            </tr>
          )}
        </tfoot>
      </table>

      {(form.notes.terms.length > 0 ||
        form.notes.paymentInstructions.length > 0 ||
        form.notes.depositNote ||
        form.notes.closing) && (
        <section className="billing-paper-notes">
          <strong>Notes</strong>
          {form.notes.terms.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {form.notes.paymentInstructions.length > 0 && (
            <div className="billing-paper-payment">
              {form.notes.paymentInstructions.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
          {form.notes.depositNote && <p>{form.notes.depositNote}</p>}
          {form.notes.closing && <p>{form.notes.closing}</p>}
        </section>
      )}

      {showPaidStamp && <div className="billing-paid-stamp">PAID IN FULL</div>}
    </section>
  );
};

const BillingReceiptPreview = ({ receipt, invoice }) => {
  const meta = getMeta(invoice.documentType);
  const company =
    receipt.companySnapshot || invoice.companySnapshot || COMPANY_PROFILES[meta.brand];
  const amount = toNumber(receipt.amount, 0);
  const receiptDate = receipt.receiptDate || todayIso();
  const receiptNumber = receipt.receiptNumber || "Pending";
  const invoiceNumber =
    receipt.referenceInvoiceNumber || invoice.documentNumber || "Pending";
  const customerName =
    receipt.customerName || toLines(invoice.client.name)[0] || invoice.client.name || "";
  const customerLocation = receipt.customerLocation || invoice.client.location || "";
  const projectTitle = receipt.projectTitle || invoice.projectTitle || "\u00a0";
  const accountType = receipt.accountType || DEFAULT_RECEIPT_ACCOUNT_TYPE;
  const footerAmount =
    meta.brand === "magichands"
      ? `${CURRENCY_SYMBOL} ${formatMoney(amount)}`
      : formatMoney(amount);
  const accountLine = [
    accountType,
    customerName,
    invoiceNumber,
    formatDate(receiptDate),
  ]
    .filter(Boolean)
    .join(" - ");

  return (
    <section className={`billing-paper billing-receipt-paper ${meta.brand}`}>
      <header className="billing-paper-header">
        <h2>Receipt</h2>
        {meta.brand === "magichands" ? (
          <img src="/mhlogo.png" alt="Magichands" className="billing-mh-logo" />
        ) : (
          <img
            src="/magic-gifts-logo.png"
            alt="Magic Gifts"
            className="billing-magic-gifts-logo"
          />
        )}
      </header>

      <section className="billing-paper-meta">
        <div className="billing-paper-client">
          {toLines(customerName).length ? (
            toLines(customerName).map((line) => <strong key={line}>{line}</strong>)
          ) : (
            <strong>&nbsp;</strong>
          )}
          {customerLocation && <span>{customerLocation}</span>}
          {receipt.customerPhone && <span>{receipt.customerPhone}</span>}
        </div>

        <dl className="billing-paper-facts">
          <div>
            <dt>Date</dt>
            <dd>{formatDate(receiptDate)}</dd>
          </div>
          <div>
            <dt>Receipt #</dt>
            <dd>{receiptNumber}</dd>
          </div>
        </dl>

        <div className="billing-paper-company">
          <strong>{company.name}</strong>
          {(company.addressLines || []).map((line) => (
            <span key={line}>{line}</span>
          ))}
          {company.telephone && <span>Tel: {company.telephone}</span>}
          {company.tinNumber && <span>Tin Number: {company.tinNumber}</span>}
        </div>
      </section>

      <h3 className="billing-project-title">{projectTitle}</h3>

      <table className="billing-items-table billing-receipt-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{accountLine || "\u00a0"}</td>
            <td>{formatMoney(amount)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="billing-footer-label">Total</td>
            <td className="billing-footer-amount">
              <strong>{footerAmount}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
};

const BillingDocuments = ({ user, requestSource = "" }) => {
  const portalSource = requestSource || resolvePortalSource();
  const [documents, setDocuments] = useState([]);
  const [form, setForm] = useState(() => createBlankForm());
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [receiptForm, setReceiptForm] = useState(() => makeReceiptForm());
  const [selectedReceiptId, setSelectedReceiptId] = useState("");
  const [activePreview, setActivePreview] = useState("invoice");
  const [confirmDialog, setConfirmDialog] = useState(EMPTY_CONFIRM_DIALOG);
  const canAccess = userHasBillingAccess(user);
  const totals = useMemo(
    () => calculateTotals(form.lineItems, form.paymentEntries, form.taxEntries),
    [form.lineItems, form.paymentEntries, form.taxEntries],
  );
  const formMeta = getMeta(form.documentType);
  const feedbackMessage = error || notice;
  const feedbackType = error ? "error" : "success";

  const makeApiUrl = useCallback(
    (path = "", params = {}) => {
      const urlParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value && value !== "all") urlParams.set(key, value);
      });

      const query = urlParams.toString();
      const url = `/api/billing-documents${path}${query ? `?${query}` : ""}`;
      return appendPortalSource(url, portalSource);
    },
    [portalSource],
  );

  const makeReceiptApiUrl = useCallback(
    (path = "", params = {}) => {
      const urlParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value) urlParams.set(key, value);
      });

      const query = urlParams.toString();
      const url = `/api/billing-receipts${path}${query ? `?${query}` : ""}`;
      return appendPortalSource(url, portalSource);
    },
    [portalSource],
  );

  const fetchDocuments = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        makeApiUrl("", {
          search,
          documentType: typeFilter,
          status: statusFilter,
        }),
        { credentials: "include", cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to load billing documents.");
      }
      const nextDocuments = Array.isArray(data.documents) ? data.documents : [];
      setDocuments(nextDocuments);

      if (selectedId) {
        const refreshedSelection = nextDocuments.find(
          (document) => document._id === selectedId,
        );
        if (refreshedSelection) {
          setForm(normalizeDocumentForForm(refreshedSelection));
        }
      }
    } catch (fetchError) {
      setError(fetchError.message || "Failed to load billing documents.");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess, makeApiUrl, search, selectedId, statusFilter, typeFilter]);

  const syncReceiptState = useCallback(
    (nextReceipts, invoiceId, { replacePayments = false } = {}) => {
      const normalizedReceipts = Array.isArray(nextReceipts) ? nextReceipts : [];
      setReceipts(normalizedReceipts);

      if (replacePayments || normalizedReceipts.length > 0) {
        setForm((prev) =>
          prev._id === invoiceId
            ? {
                ...prev,
                paymentEntries: receiptsToPaymentEntries(normalizedReceipts),
              }
            : prev,
        );
      }
    },
    [],
  );

  const fetchReceipts = useCallback(
    async (invoice) => {
      if (!invoice?._id || getMeta(invoice.documentType).kind !== "invoice") {
        setReceipts([]);
        setSelectedReceiptId("");
        setReceiptForm(makeReceiptForm());
        setActivePreview("invoice");
        return;
      }

      try {
        const res = await fetch(
          makeReceiptApiUrl("", { invoiceId: invoice._id }),
          { credentials: "include", cache: "no-store" },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.message || "Failed to load billing receipts.");
        }

        const nextReceipts = Array.isArray(data.receipts) ? data.receipts : [];
        syncReceiptState(nextReceipts, invoice._id, {
          replacePayments: nextReceipts.length > 0,
        });
        setSelectedReceiptId((current) =>
          current && nextReceipts.some((receipt) => receipt._id === current)
            ? current
            : "",
        );
        setReceiptForm((current) =>
          current._id && nextReceipts.some((receipt) => receipt._id === current._id)
            ? current
            : createReceiptDraftFromInvoice(
                invoice,
                Math.max(
                  0,
                  calculateTotals(
                    invoice.lineItems || [],
                    invoice.paymentEntries || [],
                    invoice.taxEntries || [],
                  ).balanceDue || 0,
                ),
              ),
        );
      } catch (receiptError) {
        setError(receiptError.message || "Failed to load billing receipts.");
      }
    },
    [makeReceiptApiUrl, syncReceiptState],
  );

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    fetchReceipts(form);
  }, [fetchReceipts, form._id, form.documentType]);

  useRealtimeRefresh(fetchDocuments, {
    enabled: canAccess,
    paths: ["/api/billing-documents", "/api/billing-receipts"],
  });

  const selectDocument = (document) => {
    setSelectedId(document._id);
    setForm(normalizeDocumentForForm(document));
    setReceipts([]);
    setSelectedReceiptId("");
    setReceiptForm(createReceiptDraftFromInvoice(document));
    setActivePreview("invoice");
    setNotice("");
    setError("");
  };

  const startNewDocument = (documentType = "magichands_invoice") => {
    setSelectedId("");
    setForm(createBlankForm(documentType));
    setReceipts([]);
    setSelectedReceiptId("");
    setReceiptForm(makeReceiptForm());
    setActivePreview("invoice");
    setNotice("");
    setError("");
  };

  const updateForm = (path, value) => {
    setForm((prev) => {
      const next = { ...prev };
      if (path.length === 1) {
        next[path[0]] = value;
        return next;
      }

      const [section, key] = path;
      next[section] = {
        ...next[section],
        [key]: value,
      };
      return next;
    });
  };

  const updateDocumentType = (documentType) => {
    const meta = getMeta(documentType);
    const defaults = getBrandDefaults(meta.brand);
    setForm((prev) => ({
      ...prev,
      documentType,
      dueDate: meta.kind === "invoice" ? prev.dueDate : "",
      paymentEntries: meta.kind === "invoice" ? prev.paymentEntries : [],
      companySnapshot: defaults.companySnapshot,
      notes: defaults.notes,
    }));
  };

  const updateLineItem = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));
  };

  const addLineItem = () => {
    setForm((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, makeLineItem()],
    }));
  };

  const removeLineItem = (index) => {
    setForm((prev) => ({
      ...prev,
      lineItems:
        prev.lineItems.length > 1
          ? prev.lineItems.filter((_, itemIndex) => itemIndex !== index)
          : prev.lineItems,
    }));
  };

  const startNewReceipt = (amount = "") => {
    setSelectedReceiptId("");
    setReceiptForm(
      createReceiptDraftFromInvoice(
        form,
        amount === "" ? Math.max(0, totals.balanceDue || 0) : amount,
      ),
    );
    setActivePreview("receipt");
    setNotice("");
    setError("");
  };

  const selectReceipt = (receipt) => {
    setSelectedReceiptId(receipt._id);
    setReceiptForm(makeReceiptForm(receipt));
    setActivePreview("receipt");
    setNotice("");
    setError("");
  };

  const updateReceiptForm = (key, value) => {
    setReceiptForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const saveReceipt = async () => {
    if (!form._id || formMeta.kind !== "invoice") {
      setError("Save the invoice before adding a receipt.");
      return;
    }

    setReceiptSaving(true);
    setNotice("");
    setError("");
    try {
      const isExisting = Boolean(receiptForm._id);
      const res = await fetch(
        makeReceiptApiUrl(isExisting ? `/${receiptForm._id}` : ""),
        {
          method: isExisting ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(buildReceiptPayload(receiptForm, form)),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to save billing receipt.");
      }

      const savedReceipt = data.receipt;
      const nextReceipts = Array.isArray(data.receipts) ? data.receipts : [];
      syncReceiptState(nextReceipts, form._id, { replacePayments: true });
      setSelectedReceiptId(savedReceipt._id);
      setReceiptForm(makeReceiptForm(savedReceipt));
      setActivePreview("receipt");
      setNotice(`Receipt #${savedReceipt.receiptNumber} saved.`);
      fetchDocuments();
    } catch (receiptError) {
      setError(receiptError.message || "Failed to save billing receipt.");
    } finally {
      setReceiptSaving(false);
    }
  };

  const deleteReceipt = async (receipt) => {
    if (!receipt?._id || !form._id) return;

    setReceiptSaving(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch(makeReceiptApiUrl(`/${receipt._id}`), {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete billing receipt.");
      }

      const nextReceipts = Array.isArray(data.receipts) ? data.receipts : [];
      syncReceiptState(nextReceipts, form._id, { replacePayments: true });
      setSelectedReceiptId("");
      setReceiptForm(
        createReceiptDraftFromInvoice(form, Math.max(0, totals.balanceDue || 0)),
      );
      setActivePreview("invoice");
      setNotice(data.message || "Billing receipt deleted permanently.");
      fetchDocuments();
    } catch (receiptError) {
      setError(receiptError.message || "Failed to delete billing receipt.");
    } finally {
      setReceiptSaving(false);
    }
  };

  const toggleTaxEntries = (enabled) => {
    setForm((prev) => ({
      ...prev,
      taxEntries: enabled ? createDefaultTaxEntries() : [],
    }));
  };

  const updateTaxEntry = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      taxEntries: prev.taxEntries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [key]: value } : entry,
      ),
    }));
  };

  const addTaxEntry = () => {
    setForm((prev) => ({
      ...prev,
      taxEntries: [...prev.taxEntries, makeTaxEntry()],
    }));
  };

  const removeTaxEntry = (index) => {
    setForm((prev) => ({
      ...prev,
      taxEntries: prev.taxEntries.filter((_, entryIndex) => entryIndex !== index),
    }));
  };

  const saveDocument = async () => {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const isExisting = Boolean(form._id);
      const res = await fetch(makeApiUrl(isExisting ? `/${form._id}` : ""), {
        method: isExisting ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to save billing document.");
      }

      const savedDocument = data.document;
      setSelectedId(savedDocument._id);
      setForm(normalizeDocumentForForm(savedDocument));
      setActivePreview("invoice");
      setDocuments((prev) => {
        const withoutSaved = prev.filter((document) => document._id !== savedDocument._id);
        return [savedDocument, ...withoutSaved];
      });
      setNotice(
        `${getMeta(savedDocument.documentType).label} #${savedDocument.documentNumber} saved.`,
      );
    } catch (saveError) {
      setError(saveError.message || "Failed to save billing document.");
    } finally {
      setSaving(false);
    }
  };

  const closeConfirmDialog = () => {
    setConfirmDialog(EMPTY_CONFIRM_DIALOG);
  };

  const openConvertQuoteDialog = () => {
    if (!form._id || formMeta.kind !== "quote") return;

    setConfirmDialog({
      isOpen: true,
      action: "convert-quote",
      targetDocument: form,
      title: "Convert Quote",
      message:
        "Convert this quote into an invoice? The new invoice will keep this quote number as a reference.",
      confirmText: "Convert",
      cancelText: "Cancel",
      type: "primary",
    });
  };

  const openDeleteInvoiceDialog = (targetDocument = form) => {
    const targetMeta = getMeta(targetDocument.documentType);
    if (!targetDocument?._id || targetMeta.kind !== "invoice") return;

    const number = targetDocument.documentNumber || "Pending";
    setConfirmDialog({
      isOpen: true,
      action: "delete-invoice",
      targetDocument,
      title: "Delete Invoice",
      message: `Permanently delete ${targetMeta.label} #${number}? This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      type: "danger",
    });
  };

  const openDeleteReceiptDialog = (receipt) => {
    if (!receipt?._id) return;

    setConfirmDialog({
      isOpen: true,
      action: "delete-receipt",
      targetDocument: form,
      targetReceipt: receipt,
      title: "Delete Receipt",
      message: `Permanently delete receipt #${receipt.receiptNumber}? This cannot be undone.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      type: "danger",
    });
  };

  const convertQuoteToInvoice = async (targetDocument = form) => {
    const targetMeta = getMeta(targetDocument.documentType);
    if (!targetDocument?._id || targetMeta.kind !== "quote") return;

    setSaving(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch(makeApiUrl(`/${targetDocument._id}/convert-to-invoice`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to convert quote into invoice.");
      }

      const invoice = data.document;
      setSelectedId(invoice._id);
      setForm(normalizeDocumentForForm(invoice));
      setNotice(
        data.message ||
          `Invoice #${invoice.documentNumber} created from quote #${invoice.sourceQuoteNumber}.`,
      );
      fetchDocuments();
    } catch (convertError) {
      setError(convertError.message || "Failed to convert quote into invoice.");
    } finally {
      setSaving(false);
    }
  };

  const deleteInvoiceDocument = async (targetDocument = form) => {
    const targetMeta = getMeta(targetDocument.documentType);
    if (!targetDocument?._id || targetMeta.kind !== "invoice") return;

    const number = targetDocument.documentNumber || "Pending";
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const res = await fetch(makeApiUrl(`/${targetDocument._id}`), {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to delete billing document.");
      }

      const deletingSelected =
        selectedId === targetDocument._id || form._id === targetDocument._id;
      setDocuments((prev) =>
        prev.filter((document) => document._id !== targetDocument._id),
      );
      if (deletingSelected) {
        setSelectedId("");
        setForm(createBlankForm(targetDocument.documentType));
      }
      setNotice(data.message || `${targetMeta.label} #${number} deleted permanently.`);
      fetchDocuments();
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete billing document.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDialog = async () => {
    const { action, targetDocument, targetReceipt } = confirmDialog;
    closeConfirmDialog();

    if (action === "convert-quote") {
      await convertQuoteToInvoice(targetDocument);
      return;
    }

    if (action === "delete-invoice") {
      await deleteInvoiceDocument(targetDocument);
      return;
    }

    if (action === "delete-receipt") {
      await deleteReceipt(targetReceipt);
    }
  };

  const printDocument = () => {
    window.print();
  };

  const printInvoice = () => {
    setActivePreview("invoice");
    window.setTimeout(() => window.print(), 0);
  };

  const printReceipt = (receipt) => {
    selectReceipt(receipt);
    window.setTimeout(() => window.print(), 0);
  };

  if (!canAccess) {
    return (
      <div className="billing-documents-page">
        <section className="billing-access-denied">
          <ReceiptIcon />
          <h1>Billing Documents</h1>
          <p>This page is available to Front Desk users and Administration admins.</p>
        </section>
      </div>
    );
  }

  return (
    <div
      className={`billing-documents-page ${
        portalSource === "admin" ? "admin-portal" : "client-portal"
      }`}
    >
      <header className="billing-documents-header">
        <div>
          <span className="billing-eyebrow">Front Desk Billing</span>
          <h1>Billing Documents</h1>
          <p>Magichands and Magic Gifts</p>
        </div>
        <div className="billing-header-actions">
          <button
            type="button"
            className="billing-secondary-button"
            onClick={fetchDocuments}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="billing-primary-button"
            onClick={() => startNewDocument()}
          >
            <PlusIcon />
            New document
          </button>
        </div>
      </header>

      {feedbackMessage && (
        <div className="ui-toast-container">
          <Toast
            key={`${feedbackType}-${feedbackMessage}`}
            message={feedbackMessage}
            type={feedbackType}
            onClose={() => {
              setNotice("");
              setError("");
            }}
          />
        </div>
      )}

      <div className="billing-documents-workspace">
        <aside className="billing-document-list" aria-label="Billing documents">
          <div className="billing-list-header">
            <strong>Documents</strong>
            <span>{loading ? "Loading" : `${documents.length} shown`}</span>
          </div>
          <section className="billing-documents-toolbar">
            <label className="billing-list-search">
              Search
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Client, project, or number"
              />
            </label>
            <label>
              Type
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="all">All types</option>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="accepted">Accepted</option>
                <option value="converted">Converted</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </select>
            </label>
          </section>
          <div className="billing-list-scroll">
            {documents.map((document) => {
              const meta = getMeta(document.documentType);
              const active = selectedId === document._id;
              return (
                <div
                  key={document._id}
                  className={`billing-list-item ${active ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="billing-list-select"
                    onClick={() => selectDocument(document)}
                  >
                    <span>
                      <strong>
                        {meta.kind === "invoice" ? "Invoice" : "Quote"} #
                        {document.documentNumber}
                      </strong>
                      <small>{meta.label}</small>
                    </span>
                    <span>
                      <em>{document.client?.name || "Unnamed client"}</em>
                      <small>{formatDate(document.issueDate)}</small>
                    </span>
                    <StatusBadge status={document.status} />
                  </button>
                  {meta.kind === "invoice" && (
                    <button
                      type="button"
                      className="billing-list-delete"
                      onClick={() => openDeleteInvoiceDialog(document)}
                      disabled={saving}
                      title={`Delete invoice #${document.documentNumber}`}
                      aria-label={`Delete invoice #${document.documentNumber}`}
                    >
                      <TrashIcon width={15} height={15} />
                    </button>
                  )}
                </div>
              );
            })}
            {!documents.length && !loading && (
              <div className="billing-empty-state">
                <ReceiptIcon />
                <strong>No billing documents yet</strong>
              </div>
            )}
          </div>
        </aside>

        <section className="billing-document-editor">
          <div className="billing-editor-header">
            <div>
              <span>{form._id ? "Editing" : "New draft"}</span>
              <h2>
                {formMeta.label}
                {form.documentNumber ? ` #${form.documentNumber}` : ""}
              </h2>
            </div>
            <div className="billing-editor-actions">
              {formMeta.kind === "quote" && form._id && (
                <button
                  type="button"
                  className="billing-secondary-button"
                  onClick={openConvertQuoteDialog}
                  disabled={saving}
                >
                  Convert to invoice
                </button>
              )}
              {formMeta.kind === "invoice" && form._id && (
                <button
                  type="button"
                  className="billing-secondary-button billing-danger-button"
                  onClick={() => openDeleteInvoiceDialog()}
                  disabled={saving}
                >
                  <TrashIcon width={16} height={16} />
                  Delete
                </button>
              )}
              <button
                type="button"
                className="billing-secondary-button"
                onClick={printDocument}
              >
                <PrinterIcon />
                Print
              </button>
              <button
                type="button"
                className="billing-primary-button"
                onClick={saveDocument}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          <div className="billing-editor-grid">
            <form
              className="billing-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveDocument();
              }}
            >
              <fieldset>
                <legend>Document</legend>
                <label>
                  Type
                  <select
                    value={form.documentType}
                    onChange={(event) => updateDocumentType(event.target.value)}
                    disabled={Boolean(form._id)}
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => updateForm(["status"], event.target.value)}
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="accepted">Accepted</option>
                    {formMeta.kind === "quote" && (
                      <option value="converted">Converted</option>
                    )}
                    {formMeta.kind === "invoice" && <option value="paid">Paid</option>}
                    <option value="void">Void</option>
                  </select>
                </label>
                {formMeta.kind === "invoice" && (
                  <label>
                    Invoice number
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      placeholder={form._id ? "" : "Auto generated"}
                      value={form.documentNumber}
                      onChange={(event) =>
                        updateForm(["documentNumber"], event.target.value)
                      }
                    />
                  </label>
                )}
                <label>
                  Issue date
                  <input
                    type="date"
                    value={form.issueDate}
                    onChange={(event) => updateForm(["issueDate"], event.target.value)}
                  />
                </label>
                {formMeta.kind === "invoice" && (
                  <label>
                    Due date
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(event) => updateForm(["dueDate"], event.target.value)}
                    />
                  </label>
                )}
                {formMeta.kind === "invoice" && form.sourceQuoteNumber && (
                  <label>
                    Quote reference
                    <input
                      value={form.sourceQuoteNumber}
                      onChange={(event) =>
                        updateForm(["sourceQuoteNumber"], event.target.value)
                      }
                    />
                  </label>
                )}
              </fieldset>

              <fieldset>
                <legend>Client</legend>
                <label className="billing-wide-field">
                  Client name
                  <textarea
                    rows="3"
                    value={form.client.name}
                    onChange={(event) =>
                      updateForm(["client", "name"], event.target.value)
                    }
                  />
                </label>
                <label>
                  Location
                  <input
                    value={form.client.location}
                    onChange={(event) =>
                      updateForm(["client", "location"], event.target.value)
                    }
                  />
                </label>
                <label className="billing-wide-field">
                  Project title
                  <textarea
                    rows="2"
                    value={form.projectTitle}
                    onChange={(event) =>
                      updateForm(["projectTitle"], event.target.value)
                    }
                  />
                </label>
              </fieldset>

              <fieldset>
                <legend>Items</legend>
                <div className="billing-items-editor">
                  {form.lineItems.map((item, index) => (
                    <div className="billing-item-row" key={item._id || index}>
                      <label>
                        Description
                        <textarea
                          rows="3"
                          value={item.description}
                          onChange={(event) =>
                            updateLineItem(index, "description", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Qty
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(event) =>
                            updateLineItem(index, "quantity", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Unit price
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(event) =>
                            updateLineItem(index, "unitPrice", event.target.value)
                          }
                        />
                      </label>
                      <div className="billing-item-total">
                        <span>Total</span>
                        <strong>
                          {isBlankValue(item.quantity) && isBlankValue(item.unitPrice)
                            ? ""
                            : formatMoney(
                                toNumber(item.quantity, 0) *
                                  toNumber(item.unitPrice, 0),
                              )}
                        </strong>
                      </div>
                      <button
                        type="button"
                        className="billing-icon-button"
                        onClick={() => removeLineItem(index)}
                        disabled={form.lineItems.length === 1}
                        aria-label="Remove item"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="billing-secondary-button"
                  onClick={addLineItem}
                >
                  <PlusIcon />
                  Add item
                </button>
              </fieldset>

              <fieldset>
                <legend>Tax information</legend>
                <label className="billing-tax-toggle">
                  <input
                    type="checkbox"
                    checked={form.taxEntries.length > 0}
                    onChange={(event) => toggleTaxEntries(event.target.checked)}
                  />
                  <span>Add tax information</span>
                </label>
                {form.taxEntries.length > 0 && (
                  <>
                    <div className="billing-tax-editor">
                      {form.taxEntries.map((entry, index) => (
                        <div className="billing-tax-row" key={entry._id || index}>
                          <label>
                            Tax label
                            <input
                              value={entry.label}
                              onChange={(event) =>
                                updateTaxEntry(index, "label", event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Rate %
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={entry.rate}
                              onChange={(event) =>
                                updateTaxEntry(index, "rate", event.target.value)
                              }
                            />
                          </label>
                          <div className="billing-tax-amount">
                            <span>Amount</span>
                            <strong>
                              {CURRENCY_SYMBOL}{" "}
                              {formatMoney(
                                (totals.subtotal * toNumber(entry.rate, 0)) / 100,
                              )}
                            </strong>
                          </div>
                          <button
                            type="button"
                            className="billing-icon-button"
                            onClick={() => removeTaxEntry(index)}
                            aria-label="Remove tax"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="billing-inline-actions">
                      <button
                        type="button"
                        className="billing-secondary-button"
                        onClick={addTaxEntry}
                      >
                        <PlusIcon />
                        Add tax line
                      </button>
                    </div>
                  </>
                )}
              </fieldset>

              {formMeta.kind === "invoice" && (
                <fieldset>
                  <legend>Linked receipts</legend>
                  {!form._id ? (
                    <p className="billing-field-note">
                      Save this invoice before creating linked receipts.
                    </p>
                  ) : (
                    <>
                      <div className="billing-receipt-editor">
                        <label>
                          Account type
                          <input
                            value={receiptForm.accountType}
                            onChange={(event) =>
                              updateReceiptForm("accountType", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Receipt #
                          <input
                            value={receiptForm.receiptNumber}
                            placeholder="Auto generated"
                            onChange={(event) =>
                              updateReceiptForm("receiptNumber", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Date
                          <input
                            type="date"
                            value={receiptForm.receiptDate}
                            onChange={(event) =>
                              updateReceiptForm("receiptDate", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Amount
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={receiptForm.amount}
                            onChange={(event) =>
                              updateReceiptForm("amount", event.target.value)
                            }
                          />
                        </label>
                        <label className="billing-wide-field">
                          Customer name
                          <textarea
                            rows="2"
                            value={receiptForm.customerName}
                            onChange={(event) =>
                              updateReceiptForm("customerName", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Location
                          <input
                            value={receiptForm.customerLocation}
                            onChange={(event) =>
                              updateReceiptForm(
                                "customerLocation",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label>
                          Phone
                          <input
                            value={receiptForm.customerPhone}
                            onChange={(event) =>
                              updateReceiptForm("customerPhone", event.target.value)
                            }
                          />
                        </label>
                        <label className="billing-wide-field">
                          Project title
                          <textarea
                            rows="2"
                            value={receiptForm.projectTitle}
                            onChange={(event) =>
                              updateReceiptForm("projectTitle", event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <div className="billing-inline-actions">
                        <button
                          type="button"
                          className="billing-primary-button"
                          onClick={saveReceipt}
                          disabled={receiptSaving}
                        >
                          {receiptSaving ? "Saving..." : "Save receipt"}
                        </button>
                        <button
                          type="button"
                          className="billing-secondary-button"
                          onClick={() => startNewReceipt()}
                        >
                          <PlusIcon />
                          New receipt
                        </button>
                        <button
                          type="button"
                          className="billing-secondary-button"
                          onClick={() => startNewReceipt(totals.balanceDue)}
                          disabled={totals.balanceDue <= 0}
                        >
                          Use balance due
                        </button>
                        <button
                          type="button"
                          className="billing-secondary-button"
                          onClick={printInvoice}
                        >
                          <PrinterIcon />
                          Invoice preview
                        </button>
                      </div>

                      <div className="billing-receipts-list">
                        {receipts.map((receipt) => (
                          <div
                            key={receipt._id}
                            className={`billing-receipt-row ${
                              selectedReceiptId === receipt._id ? "active" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="billing-receipt-select"
                              onClick={() => selectReceipt(receipt)}
                            >
                              <strong>Receipt #{receipt.receiptNumber}</strong>
                              <span>{formatDate(receipt.receiptDate)}</span>
                              <em>
                                {CURRENCY_SYMBOL} {formatMoney(receipt.amount)}
                              </em>
                            </button>
                            <button
                              type="button"
                              className="billing-icon-button billing-print-icon-button"
                              onClick={() => printReceipt(receipt)}
                              aria-label={`Print receipt #${receipt.receiptNumber}`}
                            >
                              <PrinterIcon />
                            </button>
                            <button
                              type="button"
                              className="billing-icon-button"
                              onClick={() => openDeleteReceiptDialog(receipt)}
                              aria-label={`Delete receipt #${receipt.receiptNumber}`}
                            >
                              <TrashIcon width={15} height={15} />
                            </button>
                          </div>
                        ))}
                        {!receipts.length && (
                          <p className="billing-field-note">
                            No linked receipts yet.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </fieldset>
              )}

              <fieldset>
                <legend>Notes</legend>
                <label className="billing-wide-field">
                  Terms
                  <textarea
                    rows="5"
                    value={form.notes.terms.join("\n")}
                    onChange={(event) =>
                      updateForm(["notes", "terms"], toLines(event.target.value))
                    }
                  />
                </label>
                <label className="billing-wide-field">
                  Payment instructions
                  <textarea
                    rows="7"
                    value={form.notes.paymentInstructions.join("\n")}
                    onChange={(event) =>
                      updateForm(
                        ["notes", "paymentInstructions"],
                        toLines(event.target.value),
                      )
                    }
                  />
                </label>
                <label className="billing-wide-field">
                  Deposit note
                  <input
                    value={form.notes.depositNote}
                    onChange={(event) =>
                      updateForm(["notes", "depositNote"], event.target.value)
                    }
                  />
                </label>
              </fieldset>
            </form>

            <div className="billing-preview-pane">
              {activePreview === "receipt" && formMeta.kind === "invoice" ? (
                <BillingReceiptPreview
                  receipt={receiptForm}
                  invoice={form}
                />
              ) : (
                <BillingPreview form={form} totals={totals} />
              )}
            </div>
          </div>
        </section>
      </div>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        type={confirmDialog.type}
        onConfirm={handleConfirmDialog}
        onCancel={closeConfirmDialog}
      />
    </div>
  );
};

export default BillingDocuments;
