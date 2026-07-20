const mongoose = require("mongoose");

const DraftFileSchema = new mongoose.Schema(
  {
    fieldName: {
      type: String,
      enum: ["attachments", "sampleImage", "clientMockup", "approvedMockup"],
      required: true,
    },
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
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    note: {
      type: String,
      default: "",
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

const createEmptyFiles = () => ({
  attachments: [],
  sampleImage: [],
  clientMockup: [],
  approvedMockup: [],
});

const ProjectCreationDraftSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    draftType: {
      type: String,
      enum: ["project", "quote"],
      default: "project",
      required: true,
    },
    formData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    files: {
      attachments: {
        type: [DraftFileSchema],
        default: [],
      },
      sampleImage: {
        type: [DraftFileSchema],
        default: [],
      },
      clientMockup: {
        type: [DraftFileSchema],
        default: [],
      },
      approvedMockup: {
        type: [DraftFileSchema],
        default: [],
      },
    },
    status: {
      type: String,
      enum: ["active", "finalizing", "finalized"],
      default: "active",
      index: true,
    },
    finalizationStartedAt: {
      type: Date,
      default: null,
    },
    finalizationToken: {
      type: String,
      default: "",
      select: false,
    },
    finalizedProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    revision: {
      type: Number,
      default: 1,
      min: 1,
    },
    schemaVersion: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastSavedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    minimize: false,
    optimisticConcurrency: true,
  },
);

ProjectCreationDraftSchema.pre("validate", function normalizeFiles() {
  if (!this.files) {
    this.files = createEmptyFiles();
  }
});

ProjectCreationDraftSchema.index({ owner: 1, status: 1, updatedAt: -1 });
ProjectCreationDraftSchema.index({ owner: 1, draftType: 1, updatedAt: -1 });
ProjectCreationDraftSchema.index(
  { finalizedProject: 1 },
  {
    unique: true,
    partialFilterExpression: { finalizedProject: { $type: "objectId" } },
  },
);

module.exports = mongoose.model(
  "ProjectCreationDraft",
  ProjectCreationDraftSchema,
);
