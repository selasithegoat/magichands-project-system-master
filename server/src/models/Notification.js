const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
    sampleMovement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SampleMovement",
      default: null,
    },
    reminder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Reminder",
      default: null,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "ASSIGNMENT",
        "ACTIVITY",
        "UPDATE",
        "REVISION",
        "ACCEPTANCE",
        "SYSTEM",
        "REMINDER",
      ],
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    seenAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    requiresAction: { type: Boolean, default: false },
    priority: {
      type: String,
      enum: ["informational", "important", "urgent"],
      default: "informational",
    },
    actionType: { type: String, trim: true, default: "" },
    actionUrl: { type: String, trim: true, default: "" },
    followUpStartedAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    escalatedAt: { type: Date, default: null },
    nextReminderAt: { type: Date, default: null },
    source: {
      type: String,
      trim: true,
      default: "",
    },
    dedupeKey: {
      type: String,
      trim: true,
      default: undefined,
    },
  },
  { timestamps: true },
);

// Indexes
NotificationSchema.index({ recipient: 1, createdAt: -1 }); // Optimize fetching user notifications
NotificationSchema.index({ recipient: 1, isRead: 1 }); // Optimize unread count checks
NotificationSchema.index({ recipient: 1, requiresAction: 1, isRead: 1 });
NotificationSchema.index({ source: 1, isRead: 1, nextReminderAt: 1 });
NotificationSchema.index({ sampleMovement: 1, source: 1, resolvedAt: 1 });
NotificationSchema.index(
  { recipient: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: "string" } },
  },
);

module.exports = mongoose.model("Notification", NotificationSchema);
