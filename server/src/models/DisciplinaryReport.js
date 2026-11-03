const mongoose = require("mongoose");

const personSnapshotFields = {
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  name: { type: String, trim: true, required: true },
  employeeId: { type: String, trim: true, default: "" },
  department: { type: [String], default: [] },
  role: { type: String, trim: true, default: "" },
};

const PersonSnapshotSchema = new mongoose.Schema(personSnapshotFields, { _id: false });

const AttendanceSchema = new mongoose.Schema(
  {
    ...personSnapshotFields,
    attendanceStatus: {
      type: String,
      enum: ["present", "absent", "apology"],
      default: "present",
    },
  },
  { _id: true },
);

const FindingSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    discussion: { type: String, trim: true, default: "" },
    evidence: { type: String, trim: true, default: "" },
    conclusion: { type: String, trim: true, required: true },
  },
  { _id: true },
);

const ProposalSchema = new mongoose.Schema(
  {
    recommendation: { type: String, trim: true, required: true },
    votesFor: { type: Number, min: 0, default: 0 },
    votesAgainst: { type: Number, min: 0, default: 0 },
    abstentions: { type: Number, min: 0, default: 0 },
    selected: { type: Boolean, default: false },
  },
  { _id: true },
);

const EvidenceFileSchema = new mongoose.Schema(
  {
    fileUrl: { type: String, trim: true, required: true },
    originalName: { type: String, trim: true, required: true },
    mimeType: { type: String, trim: true, default: "" },
    size: { type: Number, min: 0, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const AccountabilitySchema = new mongoose.Schema(
  {
    ...personSnapshotFields,
    summary: { type: String, trim: true, required: true },
    severity: {
      type: String,
      enum: ["minor", "moderate", "major", "critical"],
      required: true,
    },
    penalized: { type: Boolean, default: false },
    penaltyType: {
      type: String,
      enum: [
        "none",
        "coaching",
        "verbal_warning",
        "written_warning",
        "restitution",
        "suspension",
        "other",
      ],
      default: "none",
    },
    penaltyDetails: { type: String, trim: true, default: "" },
    effectiveDate: { type: Date, default: null },
    penaltyStatus: {
      type: String,
      enum: ["not_applicable", "pending", "active", "completed", "cancelled"],
      default: "not_applicable",
    },
    correctiveAction: { type: String, trim: true, default: "" },
    correctiveOwner: { type: PersonSnapshotSchema, default: null },
    correctiveDueDate: { type: Date, default: null },
    correctiveStatus: {
      type: String,
      enum: ["not_required", "open", "in_progress", "completed", "overdue"],
      default: "not_required",
    },
  },
  { _id: true },
);

const AuditEntrySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["created", "updated", "submitted", "finalized", "reopened", "voided", "attachment_added"],
      required: true,
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    actorName: { type: String, trim: true, required: true },
    note: { type: String, trim: true, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const DisciplinaryReportSchema = new mongoose.Schema(
  {
    reportNumber: { type: String, required: true, unique: true, trim: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    projectSnapshot: {
      orderId: { type: String, trim: true, required: true },
      projectName: { type: String, trim: true, required: true },
      clientName: { type: String, trim: true, default: "" },
    },
    challengeTitle: { type: String, trim: true, required: true },
    moderator: { type: PersonSnapshotSchema, required: true },
    meeting: {
      startedAt: { type: Date, required: true },
      endedAt: { type: Date, default: null },
      location: { type: String, trim: true, default: "" },
    },
    attendees: { type: [AttendanceSchema], default: [] },
    challengeBrief: { type: String, trim: true, required: true },
    projectImpact: { type: String, trim: true, default: "" },
    findings: { type: [FindingSchema], default: [] },
    proposals: { type: [ProposalSchema], default: [] },
    accountability: { type: [AccountabilitySchema], default: [] },
    committeeConclusion: { type: String, trim: true, default: "" },
    managementDecision: { type: String, trim: true, default: "" },
    evidenceFiles: { type: [EvidenceFileSchema], default: [] },
    status: {
      type: String,
      enum: ["draft", "submitted", "finalized", "voided"],
      default: "draft",
      index: true,
    },
    version: { type: Number, min: 1, default: 1 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    submittedAt: { type: Date, default: null },
    finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    finalizedAt: { type: Date, default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, trim: true, default: "" },
    auditTrail: { type: [AuditEntrySchema], default: [] },
  },
  { timestamps: true },
);

DisciplinaryReportSchema.index({ "projectSnapshot.orderId": 1, createdAt: -1 });
DisciplinaryReportSchema.index({ "accountability.user": 1, status: 1, finalizedAt: -1 });
DisciplinaryReportSchema.index({ createdBy: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model("DisciplinaryReport", DisciplinaryReportSchema);
