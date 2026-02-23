const mongoose = require("mongoose");

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
      },
      supplySource: {
        type: String,
        enum: ["in-house", "purchase", "client-supply"],
      },
      sampleImage: {
        type: String, // Path to the uploaded image
      },
      attachments: [String], // Multiple reference files
    },
    departments: [String], // Step 2: List of department IDs
    items: [
      {
        description: String,
        breakdown: String,
        qty: Number,
      },
    ], // Step 3: List of items
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
        "Order Confirmed",
        "Pending Scope Approval",
        "Scope Approval Completed",
        "Pending Departmental Engagement",
        "Departmental Engagement Completed",
        "Pending Mockup",
        "Mockup Completed",
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
        "Finished",
        // Quote-Specific Statuses
        "Pending Quote Request",
        "Quote Request Completed",
        "Pending Send Response",
        "Response Sent",
      ],
      default: "Order Confirmed",
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
    mockup: {
      fileUrl: String,
      fileName: String,
      fileType: String,
      note: String,
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      uploadedAt: Date,
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
ProjectSchema.index({ lineageId: 1, versionNumber: -1 });
ProjectSchema.index({ isLatestVersion: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Project", ProjectSchema);
