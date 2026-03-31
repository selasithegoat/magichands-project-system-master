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

const ProjectSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: false, // Can be generated or optional for now
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
        cost: Boolean,
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
          enum: ["pending", "go_ahead", "declined"],
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

module.exports = mongoose.model("Project", ProjectSchema);

