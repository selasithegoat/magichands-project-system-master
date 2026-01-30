const mongoose = require("mongoose");

const ProjectSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: false, // Can be generated or optional for now
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
        "Pending Mockup",
        "Pending Production",
        "Pending Packaging",
        "Pending Delivery/Pickup",
        "Delivered",
        "Finished",
        // Quote-Specific Statuses
        "Pending Quote Request",
        "Pending Send Response",
        "Response Sent",
      ],
      default: "Order Confirmed",
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
    projectLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Track last update time for specific sections
    sectionUpdates: {
      details: Date,
      items: Date,
      departments: Date,
      uncontrollableFactors: Date,
      productionRisks: Date,
      challenges: Date,
    },
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
ProjectSchema.index({ createdBy: 1 });
ProjectSchema.index({ "details.client": 1 });
ProjectSchema.index({ "details.deliveryDate": 1 });

module.exports = mongoose.model("Project", ProjectSchema);
