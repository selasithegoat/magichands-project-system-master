const mongoose = require("mongoose");

const HelpFeedbackSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    rating: {
      type: String,
      enum: ["helpful", "not_helpful", "still_confused"],
      required: true,
    },
    question: {
      type: String,
      default: "",
      trim: true,
      maxlength: 700,
    },
    answerPreview: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    note: {
      type: String,
      default: "",
      trim: true,
      maxlength: 700,
    },
    source: {
      type: String,
      default: "",
      trim: true,
      maxlength: 40,
    },
    answerId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    relatedArticleIds: {
      type: [String],
      default: [],
    },
    projectIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Project",
      default: [],
    },
    userDepartments: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

HelpFeedbackSchema.index({ user: 1, createdAt: -1 });
HelpFeedbackSchema.index({ rating: 1, createdAt: -1 });

module.exports = mongoose.model("HelpFeedback", HelpFeedbackSchema);
