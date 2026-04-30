const mongoose = require("mongoose");

const BILLING_RECEIPT_TYPES = ["magichands_receipt", "magic_gifts_receipt"];
const BILLING_RECEIPT_BRANDS = ["magichands", "magic_gifts"];

const BillingReceiptCompanySnapshotSchema = new mongoose.Schema(
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

const BillingReceiptSchema = new mongoose.Schema(
  {
    receiptType: {
      type: String,
      enum: BILLING_RECEIPT_TYPES,
      required: true,
      index: true,
    },
    brand: {
      type: String,
      enum: BILLING_RECEIPT_BRANDS,
      required: true,
      index: true,
    },
    receiptNumber: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },
    invoiceDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingDocument",
      required: true,
      index: true,
    },
    invoiceDocumentType: {
      type: String,
      trim: true,
      required: true,
    },
    referenceInvoiceNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    accountType: {
      type: String,
      trim: true,
      default: "Accounts receivable",
    },
    customerName: {
      type: String,
      trim: true,
      default: "",
    },
    customerLocation: {
      type: String,
      trim: true,
      default: "",
    },
    customerPhone: {
      type: String,
      trim: true,
      default: "",
    },
    projectTitle: {
      type: String,
      trim: true,
      default: "",
    },
    receiptDate: {
      type: Date,
      default: Date.now,
    },
    amount: {
      type: Number,
      min: 0,
      required: true,
    },
    currency: {
      type: String,
      trim: true,
      default: "GHS",
    },
    companySnapshot: {
      type: BillingReceiptCompanySnapshotSchema,
      default: () => ({}),
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

BillingReceiptSchema.index(
  { receiptType: 1, receiptNumber: 1 },
  { unique: true },
);
BillingReceiptSchema.index({ invoiceDocument: 1, createdAt: -1 });
BillingReceiptSchema.index({ customerName: "text", projectTitle: "text" });

module.exports = mongoose.model("BillingReceipt", BillingReceiptSchema);
module.exports.BILLING_RECEIPT_TYPES = BILLING_RECEIPT_TYPES;
