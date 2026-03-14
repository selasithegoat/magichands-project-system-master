const mongoose = require("mongoose");

const InventoryVariantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    color: {
      type: String,
      trim: true,
      default: "",
    },
    colors: {
      type: [
        new mongoose.Schema(
          {
            name: {
              type: String,
              trim: true,
              default: "",
            },
            qtyValue: {
              type: Number,
              min: 0,
              default: null,
            },
            qtyLabel: {
              type: String,
              trim: true,
              default: "",
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    sku: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      trim: true,
      default: "In Stock",
    },
    qtyValue: {
      type: Number,
      min: 0,
      default: null,
    },
    qtyLabel: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const InventoryBrandGroupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    price: {
      type: String,
      trim: true,
      default: "",
    },
    priceValue: {
      type: Number,
      default: null,
    },
    variants: {
      type: [InventoryVariantSchema],
      default: [],
    },
  },
  { _id: false },
);

const InventoryRecordSchema = new mongoose.Schema(
  {
    item: {
      type: String,
      required: true,
      trim: true,
    },
    warehouse: {
      type: String,
      trim: true,
      default: "",
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
    brand: {
      type: String,
      trim: true,
      default: "",
    },
    brandGroups: {
      type: [InventoryBrandGroupSchema],
      default: [],
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
    qtyValue: {
      type: Number,
      min: 0,
      default: null,
    },
    maxQty: {
      type: Number,
      min: 0,
      default: null,
    },
    qtyMeta: {
      type: String,
      trim: true,
      default: "",
    },
    variations: {
      type: String,
      trim: true,
      default: "",
    },
    colors: {
      type: String,
      trim: true,
      default: "",
    },
    variants: {
      type: [InventoryVariantSchema],
      default: [],
    },
    price: {
      type: String,
      trim: true,
      default: "",
    },
    priceValue: {
      type: Number,
      default: null,
    },
    value: {
      type: String,
      trim: true,
      default: "",
    },
    valueValue: {
      type: Number,
      default: null,
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
