const mongoose = require("mongoose");

const OrderMeetingSchema = new mongoose.Schema(
  {
    orderRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    orderNumber: {
      type: String,
      required: true,
      trim: true,
    },
    meetingAt: {
      type: Date,
      required: true,
    },
    timezone: {
      type: String,
      default: "UTC",
      trim: true,
    },
    location: {
      type: String,
      default: "",
      trim: true,
    },
    virtualLink: {
      type: String,
      default: "",
      trim: true,
    },
    agenda: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled"],
      default: "scheduled",
    },
    channels: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: true },
    },
    reminderOffsets: {
      type: [Number],
      default: [],
    },
    reminderIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Reminder",
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

OrderMeetingSchema.index({ orderNumber: 1, status: 1, createdAt: -1 });
OrderMeetingSchema.index({ orderRef: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("OrderMeeting", OrderMeetingSchema);
