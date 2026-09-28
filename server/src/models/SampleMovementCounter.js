const mongoose = require("mongoose");

const SampleMovementCounterSchema = new mongoose.Schema(
  {
    counterKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
      max: 9999,
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
  "SampleMovementCounter",
  SampleMovementCounterSchema,
);
