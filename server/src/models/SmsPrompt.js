const mongoose = require("mongoose");

const SmsPromptSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    projectStatus: {
      type: String,
      default: "",
      trim: true,
    },
    progressPercent: {
      type: Number,
      default: 0,
    },
    type: {
      type: String,
      enum: ["status_update", "custom", "feedback_appreciation"],
      default: "status_update",
    },
    state: {
      type: String,
      enum: ["pending", "sent", "skipped", "failed"],
      default: "pending",
      index: true,
    },
    message: {
      type: String,
      default: "",
    },
    title: {
      type: String,
      default: "",
    },
    overrideClientName: {
      type: String,
      default: "",
    },
    overrideClientPhone: {
      type: String,
      default: "",
    },
    originalMessage: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    sentAt: Date,
    skippedAt: Date,
    lastError: {
      type: String,
      default: "",
    },
    providerMessageId: {
      type: String,
      default: "",
    },
    providerResponse: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true },
);

SmsPromptSchema.index({ project: 1, createdAt: -1 });
SmsPromptSchema.index({ project: 1, projectStatus: 1, createdAt: -1 });

module.exports = mongoose.model("SmsPrompt", SmsPromptSchema);
