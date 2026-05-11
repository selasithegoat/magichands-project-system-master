const mongoose = require("mongoose");

const ProjectCommentSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProjectComment",
      default: null,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: "",
      trim: true,
      maxlength: 3000,
    },
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true,
      },
    ],
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

ProjectCommentSchema.index({ project: 1, parentComment: 1, createdAt: 1 });
ProjectCommentSchema.index({ project: 1, createdAt: -1 });
ProjectCommentSchema.index({ project: 1, isDeleted: 1, createdAt: -1 });
ProjectCommentSchema.index({ project: 1, mentions: 1 });
ProjectCommentSchema.index({ project: 1, readBy: 1, author: 1, createdAt: -1 });

module.exports = mongoose.model("ProjectComment", ProjectCommentSchema);
