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
    status: {
      type: String,
      enum: ["Draft", "In Progress", "Completed", "On Hold"],
      default: "Draft",
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
