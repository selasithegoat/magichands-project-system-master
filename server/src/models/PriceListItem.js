const mongoose = require("mongoose");

const PriceListItemSchema = new mongoose.Schema(
  {
    entryKey: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      trim: true,
      default: "",
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    titleKey: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    sectionKey: {
      type: String,
      required: true,
      trim: true,
    },
    sectionTitle: {
      type: String,
      required: true,
      trim: true,
    },
    sectionDescription: {
      type: String,
      trim: true,
      default: "",
    },
    sectionOrder: {
      type: Number,
      default: 0,
    },
    pageRangeLabel: {
      type: String,
      trim: true,
      default: "",
    },
    pageNumber: {
      type: Number,
      default: 0,
    },
    pageLabel: {
      type: String,
      trim: true,
      default: "",
    },
    itemOrder: {
      type: Number,
      default: 0,
    },
    catalogOrder: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    detailLines: {
      type: [String],
      default: [],
    },
    detailSummary: {
      type: String,
      trim: true,
      default: "",
    },
    priceText: {
      type: String,
      trim: true,
      default: "",
    },
    priceLines: {
      type: [String],
      default: [],
    },
    priceMode: {
      type: String,
      trim: true,
      default: "single",
    },
    priceValues: {
      type: [Number],
      default: [],
    },
    priceMin: {
      type: Number,
      default: null,
    },
    priceMax: {
      type: Number,
      default: null,
    },
    searchText: {
      type: String,
      trim: true,
      default: "",
    },
    sourcePdf: {
      type: String,
      trim: true,
      default: "",
    },
    sourcePath: {
      type: String,
      trim: true,
      default: "",
    },
    sourceTable: {
      type: Number,
      default: 0,
    },
    sourceRow: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
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

PriceListItemSchema.index({ sectionOrder: 1, pageNumber: 1, itemOrder: 1 });
PriceListItemSchema.index({ titleKey: 1 });
PriceListItemSchema.index({ pageNumber: 1 });

module.exports = mongoose.model("PriceListItem", PriceListItemSchema);
