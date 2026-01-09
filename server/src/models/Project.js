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
      projectName: {
        type: String,
        required: true,
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
    status: {
      type: String,
      enum: [
        "Draft",
        "Pending Approval",
        "In Progress",
        "Completed",
        "On Hold",
      ],
      default: "Pending Approval",
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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Project", ProjectSchema);
