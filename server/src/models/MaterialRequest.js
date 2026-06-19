const mongoose = require("mongoose");

const MaterialRequestSchema = new mongoose.Schema(
  {
    materialName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: String,
      required: true,
      trim: true,
    },
    unit: {
      type: String,
      trim: true,
      default: "",
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    departmentKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Normal", "High", "Urgent"],
      default: "Normal",
    },
    neededBy: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    requestedByName: {
      type: String,
      trim: true,
      default: "",
    },
    requestedByEmployeeId: {
      type: String,
      trim: true,
      default: "",
    },
    requesterDepartments: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["Pending", "In Review", "Fulfilled", "Declined"],
      default: "Pending",
    },
    statusNote: {
      type: String,
      trim: true,
      default: "",
    },
    statusUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    statusUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

MaterialRequestSchema.index({ departmentKey: 1, status: 1, createdAt: -1 });
MaterialRequestSchema.index({ requestedBy: 1, createdAt: -1 });

module.exports = mongoose.model("MaterialRequest", MaterialRequestSchema);
