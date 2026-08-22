const mongoose = require("mongoose");

const PROJECT_REVISION_SECTIONS = [
  "overview",
  "project_details",
  "items",
  "files",
  "people_departments",
  "risks_challenges",
];

const ProjectRevisionChangeSchema = new mongoose.Schema(
  {
    section: {
      type: String,
      enum: PROJECT_REVISION_SECTIONS,
      required: true,
    },
    field: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    changeType: {
      type: String,
      enum: ["added", "updated", "removed"],
      required: true,
    },
    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: false },
);

const ProjectRevisionSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    revisionNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    projectVersionNumber: {
      type: Number,
      default: 1,
      min: 1,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actorName: {
      type: String,
      required: true,
      trim: true,
    },
    source: {
      type: String,
      default: "project_edit",
      trim: true,
    },
    reason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    sections: {
      type: [String],
      enum: PROJECT_REVISION_SECTIONS,
      default: [],
    },
    changes: {
      type: [ProjectRevisionChangeSchema],
      default: [],
    },
  },
  { timestamps: true },
);

ProjectRevisionSchema.index({ project: 1, revisionNumber: -1 }, { unique: true });
ProjectRevisionSchema.index({ project: 1, sections: 1, revisionNumber: -1 });
ProjectRevisionSchema.index({ actor: 1, createdAt: -1 });

const ProjectRevision = mongoose.model("ProjectRevision", ProjectRevisionSchema);

module.exports = ProjectRevision;
module.exports.PROJECT_REVISION_SECTIONS = PROJECT_REVISION_SECTIONS;
