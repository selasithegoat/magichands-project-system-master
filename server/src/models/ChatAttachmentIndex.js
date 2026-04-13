const mongoose = require("mongoose");

const ChatAttachmentIndexSchema = new mongoose.Schema(
  {
    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },
    thread: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatThread",
      required: true,
      index: true,
    },
    messageId: {
      type: String,
      default: "",
      trim: true,
    },
    fileName: {
      type: String,
      default: "",
      trim: true,
    },
    fileType: {
      type: String,
      default: "",
      trim: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

ChatAttachmentIndexSchema.index({ fileUrl: 1 }, { unique: true });
ChatAttachmentIndexSchema.index({ thread: 1, uploadedAt: -1 });

module.exports = mongoose.model("ChatAttachmentIndex", ChatAttachmentIndexSchema);
