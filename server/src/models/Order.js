const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      trim: true,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    client: {
      type: String,
      default: "",
      trim: true,
    },
    clientEmail: {
      type: String,
      default: "",
      trim: true,
    },
    clientPhone: {
      type: String,
      default: "",
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

OrderSchema.index({ orderNumber: 1 }, { unique: true });
OrderSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Order", OrderSchema);
