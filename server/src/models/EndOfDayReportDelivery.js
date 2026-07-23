const mongoose = require("mongoose");

const EndOfDayReportDeliverySchema = new mongoose.Schema(
  {
    reportDate: {
      type: String,
      required: true,
      trim: true,
    },
    recipient: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    timeZone: {
      type: String,
      required: true,
      trim: true,
    },
    scheduledTime: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["processing", "sent", "failed", "skipped_empty"],
      default: "processing",
      required: true,
    },
    projectCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    filename: {
      type: String,
      default: "",
      trim: true,
    },
    messageId: {
      type: String,
      default: "",
      trim: true,
    },
    attempts: {
      type: Number,
      default: 1,
      min: 0,
    },
    lockedAt: {
      type: Date,
      default: Date.now,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    nextAttemptAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true },
);

EndOfDayReportDeliverySchema.index(
  { reportDate: 1, recipient: 1 },
  { unique: true },
);
EndOfDayReportDeliverySchema.index({ status: 1, nextAttemptAt: 1 });

module.exports = mongoose.model(
  "EndOfDayReportDelivery",
  EndOfDayReportDeliverySchema,
);
