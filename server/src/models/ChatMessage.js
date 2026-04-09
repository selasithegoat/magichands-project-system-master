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
  },
  { timestamps: true },
);

ChatMessageSchema.index({ thread: 1, createdAt: -1 });
ChatMessageSchema.index({ sender: 1, createdAt: -1 });

module.exports = mongoose.model("ChatMessage", ChatMessageSchema);
