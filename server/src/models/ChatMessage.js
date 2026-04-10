const mongoose = require("mongoose");

const ChatReferenceSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["project"],
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    orderId: {
      type: String,
      default: "",
      trim: true,
    },
    projectName: {
      type: String,
      default: "",
      trim: true,
    },
    projectIndicator: {
      type: String,
      default: "",
      trim: true,
    },
    client: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const ChatAttachmentSchema = new mongoose.Schema(
  {
    fileUrl: {
      type: String,
      required: true,
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
  { _id: false },
);

const ChatMessageSchema = new mongoose.Schema(
  {
    thread: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ChatThread",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    body: {
      type: String,
      default: "",
      trim: true,
      maxlength: 4000,
    },
    references: {
      type: [ChatReferenceSchema],
      default: [],
    },
    attachments: {
      type: [ChatAttachmentSchema],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    editedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

ChatMessageSchema.index({ thread: 1, createdAt: -1 });
ChatMessageSchema.index({ sender: 1, createdAt: -1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
