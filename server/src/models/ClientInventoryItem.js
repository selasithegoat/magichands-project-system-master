const mongoose = require("mongoose");

const ClientInventoryItemSchema = new mongoose.Schema(
  {
    orderNo: {
      type: String,
      required: true,
      trim: true,
    },
    jobLead: {
      type: String,
      trim: true,
      default: "",
    },
    dateReceived: {
      type: Date,
      required: true,
    },
    itemDescription: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    production: {
      type: String,
      trim: true,
      default: "",
    },
    deliveryDateTime: {
      type: Date,
      default: null,
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

ClientInventoryItemSchema.index({ dateReceived: -1, createdAt: -1 });

module.exports = mongoose.model("ClientInventoryItem", ClientInventoryItemSchema);
