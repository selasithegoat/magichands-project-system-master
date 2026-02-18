const mongoose = require("mongoose");

const PurchasingOrderSchema = new mongoose.Schema(
  {
    orderNo: {
      type: String,
      required: true,
      trim: true,
    },
    dept: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
    },
    requestStatus: {
      type: String,
      required: true,
      trim: true,
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
    dateRequestPlaced: {
      type: Date,
      required: true,
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

module.exports = mongoose.model("PurchasingOrder", PurchasingOrderSchema);
