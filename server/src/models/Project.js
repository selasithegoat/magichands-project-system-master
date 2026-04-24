const mongoose = require("mongoose");

const QUOTE_REQUIREMENT_STATUSES = [
  "not_required",
  "assigned",
  "in_progress",
  "dept_submitted",
  "frontdesk_review",
  "sent_to_client",
  "client_approved",
  "client_revision_requested",
  "blocked",
  "cancelled",
];

const QuoteRequirementHistorySchema = new mongoose.Schema(
  {
    fromStatus: {
      type: String,
      enum: QUOTE_REQUIREMENT_STATUSES,
    },
    toStatus: {
      type: String,
      enum: QUOTE_REQUIREMENT_STATUSES,
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    note: {
      type: String,
      default: "",
    },
  },
  { _id: false },
);

const QuoteRequirementItemSchema = new mongoose.Schema(
  {
    isRequired: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: QUOTE_REQUIREMENT_STATUSES,
      default: "not_required",
    },
    updatedAt: Date,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    completionConfirmedAt: Date,
    completionConfirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    note: {
      type: String,
      default: "",
    },
    history: {
      type: [QuoteRequirementHistorySchema],
      default: [],
    },
  },
  { _id: false },
);

const createDefaultQuoteRequirementItem = () => ({
  isRequired: false,
  status: "not_required",
  updatedAt: null,
  updatedBy: null,
  completionConfirmedAt: null,
  completionConfirmedBy: null,
  note: "",
  history: [],
});

const BATCH_STATUSES = [
  "planned",
  "in_production",
  "produced",
  "in_packaging",
  "packaged",
  "delivered",
  "cancelled",
];
const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const MAX_STATUS_HISTORY_ENTRIES = 75;
const SLA_CLOSED_STATUSES = new Set([
  "Completed",
  "Finished",
  "Declined",
]);
const STATUS_SLA_RULES = {
  "Order Created": { yellowHours: 8, redHours: 24 },
  "Quote Created": { yellowHours: 8, redHours: 24 },
  "Pending Acceptance": { yellowHours: 8, redHours: 24 },
  "Pending Scope Approval": { yellowHours: 8, redHours: 24 },
  "Scope Approval Completed": { yellowHours: 12, redHours: 24 },
  "Pending Departmental Meeting": { yellowHours: 24, redHours: 48 },
  "Pending Departmental Engagement": { yellowHours: 24, redHours: 48 },
  "Departmental Engagement Completed": { yellowHours: 12, redHours: 24 },
  "Pending Mockup": { yellowHours: 24, redHours: 48 },
  "Mockup Completed": { yellowHours: 12, redHours: 24 },
  "Pending Master Approval": { yellowHours: 8, redHours: 24 },
  "Master Approval Completed": { yellowHours: 12, redHours: 24 },
  "Pending Production": { yellowHours: 48, redHours: 96 },
  "Pending Sample Production": { yellowHours: 24, redHours: 48 },
  "Production Completed": { yellowHours: 12, redHours: 24 },
  "Pending Quality Control": { yellowHours: 12, redHours: 24 },
  "Quality Control Completed": { yellowHours: 12, redHours: 24 },
  "Pending Photography": { yellowHours: 24, redHours: 48 },
  "Photography Completed": { yellowHours: 12, redHours: 24 },
  "Pending Packaging": { yellowHours: 24, redHours: 48 },
  "Packaging Completed": { yellowHours: 12, redHours: 24 },
  "Pending Delivery/Pickup": { yellowHours: 24, redHours: 48 },
  Delivered: { yellowHours: 48, redHours: 72 },
  "Pending Feedback": { yellowHours: 48, redHours: 96 },
  "Feedback Completed": { yellowHours: 24, redHours: 48 },
  "Pending Cost Verification": { yellowHours: 24, redHours: 48 },
  "Cost Verification Completed": { yellowHours: 12, redHours: 24 },
  "Pending Quote Submission": { yellowHours: 24, redHours: 48 },
  "Quote Submission Completed": { yellowHours: 12, redHours: 24 },
  "Pending Client Decision": { yellowHours: 72, redHours: 120 },
  "Pending Quote Request": { yellowHours: 24, redHours: 48 },
  "Quote Request Completed": { yellowHours: 12, redHours: 24 },
  "Pending Send Response": { yellowHours: 24, redHours: 48 },
  "Response Sent": { yellowHours: 24, redHours: 48 },
  "On Hold": { yellowHours: 72, redHours: 168 },
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatStatusElapsed = (elapsedMs) => {
  const safeElapsed = Math.max(0, Number(elapsedMs) || 0);
  const days = Math.floor(safeElapsed / DAY_IN_MS);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;

  const hours = Math.floor(safeElapsed / HOUR_IN_MS);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;

  const minutes = Math.floor(safeElapsed / (60 * 1000));
  if (minutes >= 1) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  return "less than 1 minute";
};

const getProjectStatusStartedAt = (project = {}) => {
  const status = project?.status;
  const statusHistory = Array.isArray(project?.statusHistory)
    ? project.statusHistory
    : [];
  const latestMatchingHistory = [...statusHistory]
    .reverse()
    .find((entry) => entry?.toStatus === status && entry?.changedAt);

  return (
    toDateOrNull(project?.statusChangedAt) ||
    toDateOrNull(latestMatchingHistory?.changedAt) ||
    toDateOrNull(project?.updatedAt) ||
    toDateOrNull(project?.createdAt) ||
    toDateOrNull(project?.orderDate)
  );
};

const buildStatusSla = (project = {}, now = new Date()) => {
  const status = project?.status || "";
  if (!status || SLA_CLOSED_STATUSES.has(status)) return null;

  const sinceDate = getProjectStatusStartedAt(project);
  if (!sinceDate) return null;

  const elapsedMs = Math.max(0, now.getTime() - sinceDate.getTime());
  const rule = STATUS_SLA_RULES[status] || null;
  const isEmergency =
    project?.priority === "Urgent" || project?.projectType === "Emergency";
  const multiplier = isEmergency ? 0.5 : 1;
  const yellowAfterMs = rule ? Math.max(HOUR_IN_MS, rule.yellowHours * multiplier * HOUR_IN_MS) : null;
  const redAfterMs = rule ? Math.max(HOUR_IN_MS, rule.redHours * multiplier * HOUR_IN_MS) : null;
  let severity = "normal";

  if (redAfterMs && elapsedMs >= redAfterMs) {
    severity = "red";
  } else if (yellowAfterMs && elapsedMs >= yellowAfterMs) {
    severity = "yellow";
  }

  return {
    status,
    since: sinceDate.toISOString(),
    elapsedMs,
    elapsedLabel: formatStatusElapsed(elapsedMs),
    label: `${status} for ${formatStatusElapsed(elapsedMs)}`,
    severity,
    yellowAfterMs,
    redAfterMs,
    tracked: Boolean(rule),
  };
};

const getUpdateStatusValue = (update = {}) => {
  if (!update || Array.isArray(update)) return "";
  if (Object.prototype.hasOwnProperty.call(update, "status")) return update.status;
  if (
    update.$set &&
    Object.prototype.hasOwnProperty.call(update.$set, "status")
  ) {
    return update.$set.status;
  }
  return "";
};

const applyStatusSlaUpdateMetadata = async function applyStatusSlaUpdateMetadata(next) {
  const update = this.getUpdate();
  const nextStatus = getUpdateStatusValue(update);
  if (!nextStatus) return next();

  const now = new Date();
  const historyEntry = {
    fromStatus: "",
    toStatus: nextStatus,
    changedAt: now,
  };

  if (this.op !== "updateMany") {
    try {
      const currentProject = await this.model
        .findOne(this.getQuery())
        .select("status")
        .lean();
      const previousStatus = currentProject?.status || "";
      if (previousStatus === nextStatus) return next();
      historyEntry.fromStatus = previousStatus;
    } catch (error) {
      return next(error);
    }
  }

  const usesOperators = Object.keys(update || {}).some((key) =>
    key.startsWith("$"),
  );

  if (!usesOperators) {
    this.setUpdate({
      $set: {
        ...update,
        statusChangedAt: now,
      },
      $push: {
        statusHistory: {
          $each: [historyEntry],
          $slice: -MAX_STATUS_HISTORY_ENTRIES,
        },
      },
    });
    return next();
  }

  update.$set = {
    ...(update.$set || {}),
    statusChangedAt: now,
  };
  update.$push = {
    ...(update.$push || {}),
    statusHistory: {
      $each: [historyEntry],
      $slice: -MAX_STATUS_HISTORY_ENTRIES,
    },
  };
  this.setUpdate(update);
  return next();
};

const ProjectBatchItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false },
);

const ProjectBatchSchema = new mongoose.Schema(
  {
    batchId: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    items: {
      type: [ProjectBatchItemSchema],
      default: [],
    },
    status: {
      type: String,
      enum: BATCH_STATUSES,
      default: "planned",
    },
    productionSubDepartment: {
      type: String,
      default: "",
      trim: true,
    },
    production: {
      startedAt: Date,
      completedAt: Date,
      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    packaging: {
      receivedAt: Date,
      receivedQty: {
        type: Number,
        min: 0,
      },
      completedAt: Date,
      by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    delivery: {
      deliveredAt: Date,
      deliveredQty: {
        type: Number,
        min: 0,
      },
      deliveredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      recipient: {
        type: String,
        default: "",
      },
      notes: {
        type: String,
        default: "",
      },
    },
    cancellation: {
      cancelledAt: Date,
      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reason: {
        type: String,
        default: "",
      },
    },
    handoffs: [
      {
        fromDept: String,
        toDept: String,
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: Date,
  },
  { _id: false },
);

const ProjectOrderEmailNotificationSchema = new mongoose.Schema(
  {
    sentAt: Date,
    subject: {
      type: String,
      default: "",
      trim: true,
    },
    recipients: {
      type: [String],
      default: [],
    },
    messageId: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const ProjectRevisionEmailNotificationSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      enum: ["update", "reopen"],
      default: "update",
    },
    orderRevisionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    versionNumber: {
      type: Number,
      default: 1,
      min: 1,
    },
    sentAt: Date,
    subject: {
      type: String,
      default: "",
      trim: true,
    },
    recipients: {
      type: [String],
      default: [],
    },
    messageId: {
      type: String,
      default: "",
      trim: true,
    },
    changedParts: {
      type: [String],
      default: [],
    },
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    triggeredByName: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const ProjectStatusHistorySchema = new mongoose.Schema(
  {
    fromStatus: {
      type: String,
      default: "",
    },
    toStatus: {
      type: String,
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false },
);

const ProjectSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: [true, "Order number is required"],
      trim: true,
    },
    orderRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    orderDate: {
      type: Date,
      default: Date.now,
    },
    receivedTime: {
      type: String,
    },
    details: {
      lead: {
        type: String, // Storing value like "sarah" for now, could be User ID reference later
      },
      client: {
        type: String,
      },
      clientEmail: {
        type: String, // [New]
      },
      clientPhone: {
        type: String, // [New]
      },
      projectName: {
        type: String,
        required: true,
      },
      projectNameRaw: {
        type: String,
        default: "",
        trim: true,
      },
      projectIndicator: {
        type: String,
        default: "",
        trim: true,
      },
      briefOverview: {
        type: String, // [New] High-level summary
      },
      deliveryDate: {
        type: Date,
      },
      deliveryTime: {
        type: String,
      },
      deliveryLocation: {
        type: String,
      },
      contactType: {
        type: String,
        enum: ["MH", "None", "3rd Party"],
        default: "None",
      },
      supplySource: {
        type: [String],
        enum: ["in-house", "purchase", "client-supply"],
        default: [],
      },
      packagingType: {
        type: String,
        trim: true,
        default: "",
      },
      sampleImage: {
        type: String, // Path to the uploaded image
      },
      sampleImageNote: {
        type: String,
        default: "",
      },
      attachments: {
        type: [mongoose.Schema.Types.Mixed], // Legacy strings + new attachment objects with notes
        default: [],
      },
    },
    departments: [String], // Step 2: List of department IDs
    items: [
      {
        description: String,
        breakdown: String,
        qty: Number,
      },
    ], // Step 3: List of items
    batches: {
      type: [ProjectBatchSchema],
      default: [],
    },
    uncontrollableFactors: [
      {
        description: String,
        responsible: {
          label: String,
          value: String,
        },
        status: {
          label: String,
          value: String,
        },
      },
    ], // Step 4
    productionRisks: [
      {
        description: String,
        preventive: String,
      },
    ], // Step 4
    challenges: [
      {
        title: String,
        description: String,
        assistance: String,
        status: {
          type: String,
          enum: ["Open", "Resolved", "Escalated"],
          default: "Open",
        },
        reporter: {
          name: String,
          initials: String,
          initialsColor: String,
          date: String,
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        },
        resolvedDate: String,
      },
    ],
    status: {
      type: String,
      enum: [
        "Draft",
        "Pending Approval",
        "In Progress",
        "Completed",
        "On Hold",
        // New Workflow Statuses
        "New Order", // [New]
        "Order Created",
        // Quote-specific workflow statuses
        "Quote Created",
        "Pending Scope Approval",
        "Scope Approval Completed",
        "Pending Quote Requirements",
        "Pending Sample Retrieval",
        "Pending Departmental Meeting",
        "Pending Departmental Engagement",
        "Departmental Engagement Completed",
        "Pending Mockup",
        "Mockup Completed",
        "Pending Master Approval",
        "Master Approval Completed",
        // Legacy (deprecated)
        "Pending Proof Reading",
        "Proof Reading Completed",
        "Pending Production",
        "Production Completed",
        "Pending Quality Control",
        "Quality Control Completed",
        "Pending Photography",
        "Photography Completed",
        "Pending Packaging",
        "Packaging Completed",
        "Pending Delivery/Pickup",
        "Delivered",
        "Pending Feedback",
        "Feedback Completed",
        "Pending Cost Verification",
        "Cost Verification Completed",
        "Pending Quote Submission",
        "Quote Submission Completed",
        "Pending Client Decision",
        "Declined",
        "Finished",
        // Quote-Specific Statuses
        "Pending Quote Request",
        "Quote Request Completed",
        "Pending Send Response",
        "Response Sent",
      ],
      default: "Order Created",
    },
    statusChangedAt: {
      type: Date,
    },
    statusHistory: {
      type: [ProjectStatusHistorySchema],
      default: [],
    },
    hold: {
      isOnHold: {
        type: Boolean,
        default: false,
      },
      reason: {
        type: String,
        default: "",
      },
      heldAt: Date,
      heldBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      previousStatus: String,
      releasedAt: Date,
      releasedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    cancellation: {
      isCancelled: {
        type: Boolean,
        default: false,
      },
      reason: {
        type: String,
        default: "",
      },
      cancelledAt: Date,
      cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      resumedStatus: String,
      resumedHoldState: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },
      reactivatedAt: Date,
      reactivatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    currentStep: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lineageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
    },
    parentProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    versionNumber: {
      type: Number,
      default: 1,
      min: 1,
    },
    isLatestVersion: {
      type: Boolean,
      default: true,
    },
    versionState: {
      type: String,
      enum: ["active", "superseded", "archived"],
      default: "active",
    },
    reopenMeta: {
      reason: {
        type: String,
        default: "",
      },
      reopenedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      reopenedAt: Date,
      sourceProjectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project",
      },
      sourceStatus: String,
    },
    projectLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assistantLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    workstreamCode: {
      type: String,
      trim: true,
      default: "",
    },
    // Track last update time for specific sections
    sectionUpdates: {
      details: Date,
      items: Date,
      departments: Date,
      uncontrollableFactors: Date,
      productionRisks: Date,
      feedbacks: Date,
      challenges: Date,
    },
    orderRevisionMeta: {
      updatedAt: Date,
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      updatedByName: {
        type: String,
        default: "",
        trim: true,
      },
    },
    orderRevisionCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    emailNotifications: {
      orderCreated: {
        type: ProjectOrderEmailNotificationSchema,
        default: () => ({}),
      },
      revisions: {
        type: [ProjectRevisionEmailNotificationSchema],
        default: [],
      },
    },
    feedbacks: [
      {
        type: {
          type: String,
          enum: ["Positive", "Negative"],
          required: true,
        },
        notes: String,
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        createdByName: String,
        attachments: [
          {
            fileUrl: String,
            fileName: String,
            fileType: String,
            uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            uploadedAt: Date,
          },
        ],
        createdAt: { type: Date, default: Date.now },
      },
    ],
    endOfDayUpdate: {
      type: String,
    },
    endOfDayUpdateDate: {
      type: Date,
    },
    endOfDayUpdateBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    excludeFromEndOfDayUpdates: {
      type: Boolean,
      default: false,
    },
    includeInEndOfDayUpdates: {
      type: Boolean,
      default: false,
    },
    projectType: {
      type: String,
      enum: ["Standard", "Emergency", "Quote", "Corporate Job"],
      default: "Standard",
    },
    priority: {
      type: String,
      enum: ["Normal", "Urgent"],
      default: "Normal",
    },
    corporateEmergency: {
      isEnabled: {
        type: Boolean,
        default: false,
      },
      updatedAt: Date,
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    // Quote Specific Details
    quoteDetails: {
      quoteNumber: String,
      quoteDate: Date,
      emailResponseSent: Boolean,
      projectCoordinatorSignature: String,
      scopeApproved: Boolean,
      checklist: {
        cost: {
          type: Boolean,
          default: true,
        },
        mockup: Boolean,
        previousSamples: Boolean,
        sampleProduction: Boolean,
        bidSubmission: Boolean,
      },
      costVerification: {
        amount: {
          type: Number,
          min: 0,
        },
        currency: {
          type: String,
          trim: true,
          default: "",
        },
        note: {
          type: String,
          default: "",
        },
        completedAt: Date,
        completedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        updatedAt: Date,
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
      requirementItems: {
        cost: {
          type: QuoteRequirementItemSchema,
          default: createDefaultQuoteRequirementItem,
        },
        mockup: {
          type: QuoteRequirementItemSchema,
          default: createDefaultQuoteRequirementItem,
        },
        previousSamples: {
          type: QuoteRequirementItemSchema,
          default: createDefaultQuoteRequirementItem,
        },
        sampleProduction: {
          type: QuoteRequirementItemSchema,
          default: createDefaultQuoteRequirementItem,
        },
        bidSubmission: {
          type: QuoteRequirementItemSchema,
          default: createDefaultQuoteRequirementItem,
        },
      },
      bidSubmission: {
        isSensitive: {
          type: Boolean,
          default: false,
        },
        documents: {
          type: [mongoose.Schema.Types.Mixed],
          default: [],
        },
        updatedAt: Date,
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
      productionChecklist: {
        inHouse: Boolean,
        outside: Boolean,
        localOutsourcing: Boolean,
        overseasOutsourcing: Boolean,
      },
      productionProof: {
        proofreadingDone: Boolean,
        approvedArtworkSent: Boolean,
        pictureVideoTaken: Boolean,
      },
      submission: {
        sentBy: String,
        sentVia: [String], // Email, WhatsApp, Call, Other
      },
      clientFeedback: String,
      finalUpdate: {
        accepted: Boolean,
        cancelled: Boolean,
      },
      decision: {
        status: {
          type: String,
          enum: ["pending", "go_ahead", "declined", "no_response"],
          default: "pending",
        },
        note: String,
        validatedAt: Date,
        validatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        convertedAt: Date,
        convertedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        convertedToType: {
          type: String,
          enum: ["Standard", "Emergency", "Corporate Job", "Quote"],
          default: "Quote",
        },
      },
      filledBy: String, // Self / With Colleague
      leadSignature: String,
      submissionDate: Date,
    },
    acknowledgements: [
      {
        department: String,
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        date: { type: Date, default: Date.now },
      },
    ],
    meetingOverride: {
      skipped: { type: Boolean, default: false },
      skippedAt: { type: Date, default: null },
      skippedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    invoice: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    paymentVerifications: [
      {
        type: {
          type: String,
          enum: ["part_payment", "full_payment", "po", "authorized"],
          required: true,
        },
        verifiedAt: { type: Date, default: Date.now },
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    sampleRequirement: {
      isRequired: {
        type: Boolean,
        default: false,
      },
      updatedAt: Date,
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    sampleApproval: {
      status: {
        type: String,
        enum: ["pending", "approved"],
        default: "pending",
      },
      approvedAt: Date,
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      note: String,
    },
    mockup: {
      fileUrl: String,
      fileName: String,
      fileType: String,
      note: String,
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      uploadedAt: Date,
      clientApprovedAtIntake: {
        type: Boolean,
        default: false,
      },
      source: {
        type: String,
        enum: ["client", "graphics"],
        default: "graphics",
      },
      intakeUpload: {
        type: Boolean,
        default: false,
      },
      graphicsReview: {
        status: {
          type: String,
          enum: ["pending", "validated", "superseded", "not_required"],
          default: "not_required",
        },
        reviewedAt: Date,
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: String,
      },
      version: {
        type: Number,
        default: 1,
      },
      clientApproval: {
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        isApproved: {
          type: Boolean,
          default: false,
        },
        approvedAt: Date,
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        rejectedAt: Date,
        rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        rejectionReason: String,
        note: String,
        rejectionAttachment: {
          fileUrl: String,
          fileName: String,
          fileType: String,
          uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          uploadedAt: Date,
        },
        rejectionAttachments: [
          {
            fileUrl: String,
            fileName: String,
            fileType: String,
            uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            uploadedAt: Date,
          },
        ],
        approvedVersion: Number,
      },
      versions: [
        {
          version: {
            type: Number,
            required: true,
          },
          fileUrl: String,
          fileName: String,
          fileType: String,
          note: String,
          uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          uploadedAt: Date,
          clientApprovedAtIntake: {
            type: Boolean,
            default: false,
          },
          source: {
            type: String,
            enum: ["client", "graphics"],
            default: "graphics",
          },
          intakeUpload: {
            type: Boolean,
            default: false,
          },
          graphicsReview: {
            status: {
              type: String,
              enum: ["pending", "validated", "superseded", "not_required"],
              default: "not_required",
            },
            reviewedAt: Date,
            reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            note: String,
          },
          clientApproval: {
            status: {
              type: String,
              enum: ["pending", "approved", "rejected"],
              default: "pending",
            },
            isApproved: {
              type: Boolean,
              default: false,
            },
            approvedAt: Date,
            approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            rejectedAt: Date,
            rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            rejectionReason: String,
            note: String,
            rejectionAttachment: {
              fileUrl: String,
              fileName: String,
              fileType: String,
              uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
              uploadedAt: Date,
            },
            rejectionAttachments: [
              {
                fileUrl: String,
                fileName: String,
                fileType: String,
                uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                uploadedAt: Date,
              },
            ],
          },
        },
      ],
    },
    updates: [
      {
        date: { type: Date, default: Date.now },
        event: String,
        status: String, // email update – projects dept only
        note: String,
      },
    ],
  },
  { timestamps: true },
);

ProjectSchema.virtual("sla").get(function getProjectSlaVirtual() {
  return buildStatusSla(this);
});

ProjectSchema.set("toJSON", { virtuals: true });
ProjectSchema.set("toObject", { virtuals: true });

ProjectSchema.pre("validate", function normalizeLegacyStatus() {
  const rawStatus = String(this.status || "").trim();
  if (rawStatus.toLowerCase() === "order confirmed") {
    this.status = "Order Created";
  }
});

ProjectSchema.pre("save", async function trackStatusAge(next) {
  try {
    const now = new Date();

    if (this.isNew) {
      if (!this.statusChangedAt) {
        this.statusChangedAt = this.createdAt || this.orderDate || now;
      }
      if (this.status && (!this.statusHistory || this.statusHistory.length === 0)) {
        this.statusHistory = [
          {
            fromStatus: "",
            toStatus: this.status,
            changedAt: this.statusChangedAt,
          },
        ];
      }
      return next();
    }

    if (!this.isModified("status")) {
      if (!this.statusChangedAt) {
        const previous = await this.constructor
          .findById(this._id)
          .select("statusChangedAt updatedAt createdAt orderDate")
          .lean();
        this.statusChangedAt =
          previous?.statusChangedAt ||
          previous?.updatedAt ||
          previous?.createdAt ||
          previous?.orderDate ||
          this.createdAt ||
          now;
      }
      return next();
    }

    const previous = await this.constructor
      .findById(this._id)
      .select("status")
      .lean();
    const previousStatus = previous?.status || "";
    if (previousStatus !== this.status) {
      this.statusChangedAt = now;
      this.statusHistory = [
        ...(Array.isArray(this.statusHistory) ? this.statusHistory : []),
        {
          fromStatus: previousStatus,
          toStatus: this.status,
          changedAt: now,
        },
      ].slice(-MAX_STATUS_HISTORY_ENTRIES);
    } else if (!this.statusChangedAt) {
      this.statusChangedAt =
        previous?.updatedAt ||
        previous?.createdAt ||
        previous?.orderDate ||
        this.createdAt ||
        now;
    }

    return next();
  } catch (error) {
    return next(error);
  }
});

ProjectSchema.pre("findOneAndUpdate", applyStatusSlaUpdateMetadata);
ProjectSchema.pre("updateOne", applyStatusSlaUpdateMetadata);
ProjectSchema.pre("updateMany", applyStatusSlaUpdateMetadata);

// Indexes for performance optimization
// Combined index for Dashboard/Filtering: Most common filter combo
ProjectSchema.index({ status: 1, projectType: 1, createdAt: -1 });

// Single field indexes for specific lookups
ProjectSchema.index({ priority: 1 });
ProjectSchema.index({ projectLeadId: 1 });
ProjectSchema.index({ assistantLeadId: 1 });
ProjectSchema.index({ createdBy: 1 });
ProjectSchema.index({ orderRef: 1, createdAt: -1 });
ProjectSchema.index({ orderId: 1, createdAt: -1 });
ProjectSchema.index({ "details.client": 1 });
ProjectSchema.index({ "details.deliveryDate": 1 });
ProjectSchema.index({ "cancellation.isCancelled": 1, createdAt: -1 });
ProjectSchema.index({ lineageId: 1, versionNumber: -1 });
ProjectSchema.index({ isLatestVersion: 1, status: 1, createdAt: -1 });
ProjectSchema.index({ status: 1, statusChangedAt: 1 });

ProjectSchema.statics.buildStatusSla = buildStatusSla;

module.exports = mongoose.model("Project", ProjectSchema);

