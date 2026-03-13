const mongoose = require("mongoose");

const InventoryRecordSchema = new mongoose.Schema(
  {
    item: {
      type: String,
      required: true,
      trim: true,
    },
    subtext: {
      type: String,
      trim: true,
      default: "",
    },
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
      default: "",
    },
    categoryTone: {
      type: String,
      trim: true,
      default: "",
    },
    qtyLabel: {
      type: String,
      trim: true,
      default: "",
    },
    qtyMeta: {
      type: String,
      trim: true,
      default: "",
    },
    qtyState: {
      type: String,
      trim: true,
      default: "",
    },
    qtyFill: {
      type: String,
      trim: true,
      default: "",
    },
    price: {
      type: String,
      trim: true,
      default: "",
    },
    value: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      trim: true,
      default: "",
    },
    statusTone: {
      type: String,
      trim: true,
      default: "",
    },
    reorder: {
      type: Boolean,
      default: false,
    },
    image: {
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

InventoryRecordSchema.index({ item: 1, sku: 1 });

module.exports = mongoose.model("InventoryRecord", InventoryRecordSchema);
