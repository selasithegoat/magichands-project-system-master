const mongoose = require("mongoose");

const ChatReadStateSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastReadAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const ChatThreadSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["public", "direct"],
      required: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    slug: {
      type: String,
      trim: true,
    },
    directKey: {
      type: String,
      trim: true,
    },
    participants: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
    },
    readState: {
      type: [ChatReadStateSchema],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastMessagePreview: {
      type: String,
      default: "",
      trim: true,
      maxlength: 280,
    },
    lastMessageSender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

ChatThreadSchema.index({ type: 1, lastMessageAt: -1, updatedAt: -1 });
ChatThreadSchema.index({ participants: 1 });
ChatThreadSchema.index({ directKey: 1 }, { unique: true, sparse: true });
ChatThreadSchema.index({ slug: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("ChatThread", ChatThreadSchema);
