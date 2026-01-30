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
    type: {
      type: String,
      required: true,
      enum: ["ASSIGNMENT", "ACTIVITY", "UPDATE", "ACCEPTANCE", "SYSTEM"],
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
  },
  { timestamps: true },
);

// Indexes
NotificationSchema.index({ recipient: 1, createdAt: -1 }); // Optimize fetching user notifications
NotificationSchema.index({ recipient: 1, isRead: 1 }); // Optimize unread count checks

module.exports = mongoose.model("Notification", NotificationSchema);
