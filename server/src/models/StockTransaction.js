const mongoose = require("mongoose");

const StockTransactionSchema = new mongoose.Schema(
  {
    txid: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    item: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
      default: "",
    },
    brandGroup: {
      type: String,
      trim: true,
      default: "",
    },
    variantName: {
      type: String,
      trim: true,
      default: "",
    },
    variantSku: {
      type: String,
      trim: true,
      default: "",
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    supplierName: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    qty: {
      type: Number,
      required: true,
    },
    beforeQty: {
      type: Number,
      default: null,
    },
    afterQty: {
      type: Number,
      default: null,
    },
    source: {
      type: String,
      trim: true,
      default: "",
    },
    destination: {
      type: String,
      trim: true,
      default: "",
    },
    date: {
      type: Date,
      required: true,
    },
    staff: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

StockTransactionSchema.index({ date: -1, createdAt: -1 });

module.exports = mongoose.model("StockTransaction", StockTransactionSchema);
