const mongoose = require("mongoose");

const InventorySettingsSchema = new mongoose.Schema(
  {
    organizationName: {
      type: String,
      trim: true,
      default: "MagicHands Logistics",
    },
    primaryContactEmail: {
      type: String,
      trim: true,
      default: "ops@magichands.io",
    },
    currency: {
      type: String,
      trim: true,
      default: "GHS",
    },
    currencyRate: {
      type: Number,
      min: 0,
      default: 1,
    },
    timezone: {
      type: String,
      trim: true,
      default: "Africa/Accra",
    },
    dateFormat: {
      type: String,
      trim: true,
      default: "DD MMM, YYYY",
    },
    numberFormat: {
      type: String,
      trim: true,
      default: "1,234.56",
    },
    notifyLowStock: {
      type: Boolean,
      default: true,
    },
    notifyPurchaseOrders: {
      type: Boolean,
      default: true,
    },
    notifyWeeklySummary: {
      type: Boolean,
      default: false,
    },
    defaultWarehouse: {
      type: String,
      trim: true,
      default: "Central Warehouse",
    },
    lowStockThreshold: {
      type: Number,
      min: 0,
      default: 18,
    },
    unitOfMeasure: {
      type: String,
      trim: true,
      default: "Pieces",
    },
    autoReorder: {
      type: Boolean,
      default: false,
    },
    theme: {
      type: String,
      trim: true,
      default: "System",
    },
    tableDensity: {
      type: String,
      trim: true,
      default: "Comfortable",
    },
    defaultExportFormat: {
      type: String,
      trim: true,
      default: "CSV",
    },
    dataRetention: {
      type: String,
      trim: true,
      default: "24 months",
    },
    auditLogAccess: {
      type: String,
      trim: true,
      default: "Admins only",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("InventorySettings", InventorySettingsSchema);
