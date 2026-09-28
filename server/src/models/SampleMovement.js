const mongoose = require("mongoose");
const {
  SAMPLE_DISPOSITIONS,
  SAMPLE_HANDOVER_METHODS,
  SAMPLE_MOVEMENT_STATUSES,
  SAMPLE_PRODUCTION_TREATMENTS,
  requiresSampleReturn,
} = require("../utils/sampleMovementLifecycle");

const SAMPLE_AUTHORIZATION_STATUSES = Object.freeze([
  "not_submitted",
  "pending",
  "authorized",
  "changes_requested",
  "rejected",
]);
const SAMPLE_DOCUMENT_TYPES = Object.freeze([
  "custody_note",
  "signed_custody_note",
  "ownership_transfer_addendum",
  "client_confirmation",
  "supporting_document",
]);
const SAMPLE_DOCUMENT_STATUSES = Object.freeze([
  "draft",
  "issued",
  "signed",
  "void",
]);
const SAMPLE_CUSTODY_EVENT_TYPES = Object.freeze([
  "created",
  "updated",
  "submitted",
  "changes_requested",
  "authorization_rejected",
  "authorized",
  "dispatched",
  "released",
  "client_receipt_confirmed",
  "partial_return_recorded",
  "return_recorded",
  "ownership_transfer_requested",
  "ownership_transfer_approved",
  "ownership_transfer_rejected",
  "marked_lost",
  "cancelled",
  "document_added",
]);

const FileAttachmentSchema = new mongoose.Schema(
  {
    fileUrl: { type: String, required: true, trim: true },
    originalName: { type: String, trim: true, default: "" },
    mimeType: { type: String, trim: true, default: "" },
    size: { type: Number, min: 0, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: true },
);

const SampleMovementItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 500 },
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, trim: true, default: "unit", maxlength: 60 },
    identifyingMarks: { type: String, trim: true, default: "", maxlength: 500 },
    outboundCondition: { type: String, trim: true, default: "", maxlength: 120 },
    outboundConditionNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    photos: { type: [FileAttachmentSchema], default: [] },
    projectItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    productionTreatment: {
      type: String,
      enum: SAMPLE_PRODUCTION_TREATMENTS,
      default: "not_applicable",
    },
    productionQuantityApplied: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator(value) {
          return Number(value || 0) <= Number(this.quantity || 0);
        },
        message: "Production quantity applied cannot exceed sample quantity.",
      },
    },
    quantityReturned: {
      type: Number,
      min: 0,
      default: 0,
      validate: {
        validator(value) {
          return Number(value || 0) <= Number(this.quantity || 0);
        },
        message: "Returned quantity cannot exceed sample quantity.",
      },
    },
    returnCondition: { type: String, trim: true, default: "", maxlength: 120 },
    returnConditionNotes: {
      type: String,
      trim: true,
      default: "",
      maxlength: 1000,
    },
    returnPhotos: { type: [FileAttachmentSchema], default: [] },
  },
  { _id: true },
);

const ClientSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    contactPerson: { type: String, trim: true, default: "", maxlength: 200 },
    contactRole: { type: String, trim: true, default: "", maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, default: "", maxlength: 254 },
    phone: { type: String, trim: true, default: "", maxlength: 80 },
    address: { type: String, trim: true, default: "", maxlength: 500 },
  },
  { _id: false },
);

const ProjectSnapshotSchema = new mongoose.Schema(
  {
    orderId: { type: String, trim: true, default: "", maxlength: 120 },
    projectName: { type: String, trim: true, default: "", maxlength: 300 },
    projectVersionNumber: { type: Number, min: 1, default: 1 },
  },
  { _id: false },
);

const AuthorizationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: SAMPLE_AUTHORIZATION_STATUSES,
      default: "not_submitted",
    },
    submittedAt: { type: Date, default: null },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decisionNote: { type: String, trim: true, default: "", maxlength: 2000 },
  },
  { _id: false },
);

const OwnershipTransferSchema = new mongoose.Schema(
  {
    requestedAt: { type: Date, default: null },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    requestReason: { type: String, trim: true, default: "", maxlength: 2000 },
    previousStatus: {
      type: String,
      enum: [...SAMPLE_MOVEMENT_STATUSES, null],
      default: null,
    },
    clientConfirmed: { type: Boolean, default: false },
    clientConfirmationNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    linkedBillingDocument: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BillingDocument",
      default: null,
    },
    billingReference: { type: String, trim: true, default: "", maxlength: 120 },
    paymentReference: { type: String, trim: true, default: "", maxlength: 120 },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decisionNote: { type: String, trim: true, default: "", maxlength: 2000 },
    effectiveAt: { type: Date, default: null },
  },
  { _id: false },
);

const SampleDocumentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: SAMPLE_DOCUMENT_TYPES, required: true },
    status: { type: String, enum: SAMPLE_DOCUMENT_STATUSES, default: "draft" },
    documentNumber: { type: String, trim: true, default: "", maxlength: 120 },
    version: { type: Number, min: 1, default: 1 },
    file: { type: FileAttachmentSchema, required: true },
    sha256: { type: String, trim: true, lowercase: true, default: "", maxlength: 64 },
    issuedAt: { type: Date, default: null },
    signedAt: { type: Date, default: null },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, trim: true, default: "", maxlength: 500 },
  },
  { _id: true },
);

const CustodyEventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: SAMPLE_CUSTODY_EVENT_TYPES, required: true, immutable: true },
    fromStatus: {
      type: String,
      enum: [...SAMPLE_MOVEMENT_STATUSES, null],
      default: null,
      immutable: true,
    },
    toStatus: {
      type: String,
      enum: [...SAMPLE_MOVEMENT_STATUSES, null],
      default: null,
      immutable: true,
    },
    occurredAt: { type: Date, default: Date.now, immutable: true },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      immutable: true,
    },
    actorName: { type: String, trim: true, default: "", maxlength: 200, immutable: true },
    note: { type: String, trim: true, default: "", maxlength: 2000, immutable: true },
    details: { type: mongoose.Schema.Types.Mixed, default: null, immutable: true },
  },
  { _id: true },
);

const SampleMovementSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
      match: /^SM-\d{4}-\d{4,}$/,
    },
    referenceYear: { type: Number, required: true, min: 2000, max: 9999 },
    referenceNumber: { type: Number, required: true, min: 1 },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    projectSnapshot: { type: ProjectSnapshotSchema, default: () => ({}) },
    client: { type: ClientSnapshotSchema, required: true },
    purpose: { type: String, required: true, trim: true, maxlength: 2000 },
    handoverMethod: { type: String, enum: SAMPLE_HANDOVER_METHODS, required: true },
    disposition: {
      type: String,
      enum: SAMPLE_DISPOSITIONS,
      required: true,
      default: "returnable",
      index: true,
    },
    expectedReturnAt: { type: Date, default: null, index: true },
    items: {
      type: [SampleMovementItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "At least one sample item is required.",
      },
    },
    frontDeskOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: SAMPLE_MOVEMENT_STATUSES,
      default: "draft",
      required: true,
      index: true,
    },
    authorization: { type: AuthorizationSchema, default: () => ({}) },
    release: {
      releasedAt: { type: Date, default: null },
      releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      recipientName: { type: String, trim: true, default: "", maxlength: 200 },
      recipientRole: { type: String, trim: true, default: "", maxlength: 120 },
      courierName: { type: String, trim: true, default: "", maxlength: 200 },
      trackingReference: { type: String, trim: true, default: "", maxlength: 200 },
      clientReceiptConfirmedAt: { type: Date, default: null },
    },
    returnSummary: {
      completedAt: { type: Date, default: null },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      note: { type: String, trim: true, default: "", maxlength: 2000 },
      hasDamage: { type: Boolean, default: false },
      hasMissingQuantity: { type: Boolean, default: false },
    },
    ownershipTransfer: { type: OwnershipTransferSchema, default: () => ({}) },
    documents: { type: [SampleDocumentSchema], default: [] },
    custodyEvents: { type: [CustodyEventSchema], default: [] },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, optimisticConcurrency: true },
);

SampleMovementSchema.pre("validate", function validateReturnDate() {
  const requiresReturnDate = requiresSampleReturn(this.disposition);
  const statusNeedsCompleteDetails = ![
    "draft",
    "changes_requested",
    "authorization_rejected",
    "cancelled",
  ].includes(this.status);

  if (requiresReturnDate && statusNeedsCompleteDetails && !this.expectedReturnAt) {
    this.invalidate(
      "expectedReturnAt",
      "Expected return date is required for returnable samples.",
    );
  }

  if (this.status === "client_owned" && this.disposition !== "client_owned") {
    this.invalidate(
      "disposition",
      "Client-owned records must use the client_owned disposition.",
    );
  }
});

SampleMovementSchema.index(
  { referenceYear: 1, referenceNumber: 1 },
  { unique: true },
);
SampleMovementSchema.index({ status: 1, expectedReturnAt: 1 });
SampleMovementSchema.index({ frontDeskOwner: 1, status: 1, updatedAt: -1 });
SampleMovementSchema.index({ project: 1, createdAt: -1 });
SampleMovementSchema.index({ "client.name": "text", reference: "text" });

const SampleMovement = mongoose.model("SampleMovement", SampleMovementSchema);

module.exports = SampleMovement;
module.exports.SAMPLE_AUTHORIZATION_STATUSES = SAMPLE_AUTHORIZATION_STATUSES;
module.exports.SAMPLE_CUSTODY_EVENT_TYPES = SAMPLE_CUSTODY_EVENT_TYPES;
module.exports.SAMPLE_DOCUMENT_STATUSES = SAMPLE_DOCUMENT_STATUSES;
module.exports.SAMPLE_DOCUMENT_TYPES = SAMPLE_DOCUMENT_TYPES;
