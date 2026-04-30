const mongoose = require("mongoose");

const BillingDocumentCounterSchema = new mongoose.Schema(
  {
    counterKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    lastNumber: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "BillingDocumentCounter",
  BillingDocumentCounterSchema,
);
