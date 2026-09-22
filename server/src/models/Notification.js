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
NotificationSchema.index(
  { recipient: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: "string" } },
  },
);

module.exports = mongoose.model("Notification", NotificationSchema);
