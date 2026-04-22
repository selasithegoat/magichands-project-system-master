const mongoose = require("mongoose");

const PurchasingOrderItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    image: {
      type: String,
      trim: true,
      default: "",
    },
    qty: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false },
);

const PurchasingOrderSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    orderNumber: {
      type: String,
      trim: true,
      default: "",
    },
    supplierName: {
      type: String,
      required: true,
      trim: true,
    },
    supplierInitials: {
      type: String,
      trim: true,
      default: "",
    },
    supplierTone: {
      type: String,
      trim: true,
      default: "",
    },
    supplierLocation: {
      type: String,
      trim: true,
      default: "",
    },
    items: {
      type: [PurchasingOrderItemSchema],
      default: [],
    },
    itemsCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    category: {
      type: String,
      trim: true,
      default: "",
    },
    unitCost: {
      type: Number,
      min: 0,
      default: 0,
    },
    total: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
      default: "Pending",
    },
    dateRequestPlaced: {
      type: Date,
      required: true,
    },
    dept: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    qty: {
      type: Number,
      min: 0,
      default: 0,
    },
    requestStatus: {
      type: String,
      trim: true,
      default: "",
    },
    qtyReceivedBrought: {
      type: Number,
      min: 0,
      default: null,
    },
    dateItemReceived: {
      type: Date,
      default: null,
    },
    receivedBy: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

PurchasingOrderSchema.index({ dateRequestPlaced: -1, createdAt: -1 });
PurchasingOrderSchema.index({ poNumber: 1 }, { unique: true });
PurchasingOrderSchema.index({ orderNumber: 1 });
PurchasingOrderSchema.index({ supplierName: 1 });

module.exports = mongoose.model("PurchasingOrder", PurchasingOrderSchema);
