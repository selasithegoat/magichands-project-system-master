const mongoose = require("mongoose");

const InventoryReportSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
      default: "",
    },
    createdAtOverride: {
      type: Date,
      default: null,
    },
    generatedBy: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      trim: true,
      default: "Ready",
    },
    downloads: {
      type: [String],
      default: ["PDF", "CSV", "EXCEL"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

InventoryReportSchema.index({ createdAt: -1 });

module.exports = mongoose.model("InventoryReport", InventoryReportSchema);
