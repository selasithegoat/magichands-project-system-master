const mongoose = require("mongoose");

const BILLING_DOCUMENT_TYPES = [
  "magichands_invoice",
  "magichands_quote",
  "magichands_waybill",
  "magic_gifts_invoice",
  "magic_gifts_quote",
  "magic_gifts_waybill",
  "receivable_waybill",
];

const BILLING_DOCUMENT_BRANDS = ["magichands", "magic_gifts"];
const BILLING_DOCUMENT_KINDS = ["invoice", "quote", "waybill"];
const BILLING_DOCUMENT_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "converted",
  "delivered",
  "paid",
  "void",
];

const BillingDocumentLineItemSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      trim: true,
      default: "",
    },
    quantity: {
      type: Number,
      min: 0,
      default: 1,
    },
    unitPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    quantityRemaining: {
      type: Number,
      min: 0,
      default: 0,
    },
    total: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: true },
);

const BillingDocumentPaymentEntrySchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      default: "",
    },
    receiptNumber: {
      type: String,
      trim: true,
      default: "",
    },
    date: {
      type: Date,
      default: null,
    },
    amount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: true },
);

const BillingDocumentTaxEntrySchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      default: "",
    },
    rate: {
      type: Number,
      min: 0,
      default: 0,
    },
    amount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: true },
);

const BillingDocumentNotesSchema = new mongoose.Schema(
  {
    terms: {
      type: [String],
      default: [],
    },
    paymentInstructions: {
      type: [String],
      default: [],
    },
    depositNote: {
      type: String,
      trim: true,
      default: "",
    },
    closing: {
      type: String,
      trim: true,
      default: "THANK YOU FOR DOING BUSINESS WITH US.",
    },
  },
  { _id: false },
);

const BillingDocumentCompanySnapshotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    addressLines: {
      type: [String],
      default: [],
    },
    telephone: {
      type: String,
      trim: true,
      default: "",
    },
    tinNumber: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const BillingDocumentClientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "Accra - Ghana",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const BillingDocumentTotalsSchema = new mongoose.Schema(
  {
    subtotal: {
      type: Number,
      min: 0,
      default: 0,
    },
    taxAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    paidAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    balanceDue: {
      type: Number,
      default: 0,
    },
  },
  { _id: false },
);

const BillingDocumentSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: BILLING_DOCUMENT_TYPES,
      required: true,
      index: true,
    },
    brand: {
      type: String,
      enum: BILLING_DOCUMENT_BRANDS,
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: BILLING_DOCUMENT_KINDS,
      required: true,
      index: true,
    },
    documentNumber: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },
    status: {
      type: String,
      enum: BILLING_DOCUMENT_STATUSES,
      default: "draft",
      index: true,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      default: null,
    },
    client: {
      type: BillingDocumentClientSchema,
      default: () => ({}),
    },
    projectTitle: {
      type: String,
      trim: true,
      default: "",
    },
    currency: {
      type: String,
      trim: true,
      default: "GHS",
    },
    companySnapshot: {
      type: BillingDocumentCompanySnapshotSchema,
      default: () => ({}),
    },
    lineItems: {
      type: [BillingDocumentLineItemSchema],
      default: [],
    },
    paymentEntries: {
      type: [BillingDocumentPaymentEntrySchema],
      default: [],
    },
    taxEntries: {
      type: [BillingDocumentTaxEntrySchema],
      default: [],
    },
    notes: {
      type: BillingDocumentNotesSchema,
      default: () => ({}),
    },
    totals: {
      type: BillingDocumentTotalsSchema,
      default: () => ({}),
    },
    sourceQuoteDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingDocument",
      default: null,
    },
    sourceQuoteNumber: {
      type: Number,
      default: null,
    },
    sourceQuoteDocumentType: {
      type: String,
      enum: [...BILLING_DOCUMENT_TYPES, null],
      default: null,
    },
    linkedInvoiceDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingDocument",
      default: null,
    },
    linkedInvoiceNumber: {
      type: Number,
      default: null,
      index: true,
    },
    convertedToDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingDocument",
      default: null,
    },
    convertedAt: {
      type: Date,
      default: null,
    },
    convertedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

BillingDocumentSchema.index(
  { documentType: 1, documentNumber: 1 },
  { unique: true },
);
BillingDocumentSchema.index({ createdAt: -1 });
BillingDocumentSchema.index({ "client.name": "text", projectTitle: "text" });

module.exports = mongoose.model("BillingDocument", BillingDocumentSchema);
module.exports.BILLING_DOCUMENT_TYPES = BILLING_DOCUMENT_TYPES;
module.exports.BILLING_DOCUMENT_STATUSES = BILLING_DOCUMENT_STATUSES;
