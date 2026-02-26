const mongoose = require("mongoose");

const ReminderRecipientSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const ReminderSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    templateKey: {
      type: String,
      default: "custom",
      trim: true,
      maxlength: 60,
    },
    timezone: {
      type: String,
      default: "UTC",
      trim: true,
      maxlength: 80,
    },
    repeat: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      default: "none",
    },
    triggerMode: {
      type: String,
      enum: ["absolute_time", "stage_based"],
      default: "absolute_time",
    },
    remindAt: {
      type: Date,
      default: null,
    },
    nextTriggerAt: {
      type: Date,
      default: null,
    },
    watchStatus: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    delayMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 60 * 24 * 90,
    },
    stageMatchedAt: {
      type: Date,
      default: null,
    },
    conditionStatus: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    channels: {
      inApp: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: false,
      },
    },
    recipients: {
      type: [ReminderRecipientSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled"],
      default: "scheduled",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastTriggeredAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    processing: {
      type: Boolean,
      default: false,
    },
    processingAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: "",
      maxlength: 500,
    },
    triggerCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

ReminderSchema.index({ createdBy: 1, status: 1, nextTriggerAt: 1 });
ReminderSchema.index({ "recipients.user": 1, status: 1, nextTriggerAt: 1 });
ReminderSchema.index({ project: 1, status: 1, nextTriggerAt: 1 });
ReminderSchema.index({ status: 1, isActive: 1, nextTriggerAt: 1, processing: 1 });
ReminderSchema.index({
  status: 1,
  isActive: 1,
  triggerMode: 1,
  stageMatchedAt: 1,
  processing: 1,
});

module.exports = mongoose.model("Reminder", ReminderSchema);
