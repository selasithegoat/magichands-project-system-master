const mongoose = require("mongoose");

const MaterialRequestItemSchema = new mongoose.Schema(
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
    projectItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    projectItemBreakdown: {
      type: String,
      trim: true,
      default: "",
    },
    projectItemQuantity: {
      type: Number,
      default: null,
    },
  },
  { _id: true },
);

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
    items: {
      type: [MaterialRequestItemSchema],
      default: [],
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
      enum: ["Pending", "In Review", "Ordered", "Fulfilled", "Declined"],
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
    requestType: {
      type: String,
      enum: ["department", "project"],
      default: "department",
      index: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    projectOrderId: {
      type: String,
      trim: true,
      default: "",
    },
    projectName: {
      type: String,
      trim: true,
      default: "",
    },
    projectClientName: {
      type: String,
      trim: true,
      default: "",
    },
    projectLeadName: {
      type: String,
      trim: true,
      default: "",
    },
    projectItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    projectItemDescription: {
      type: String,
      trim: true,
      default: "",
    },
    projectItemBreakdown: {
      type: String,
      trim: true,
      default: "",
    },
    projectItemQuantity: {
      type: Number,
      default: null,
    },
    inventoryRecord: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryRecord",
      default: null,
    },
    inventoryItemName: {
      type: String,
      trim: true,
      default: "",
    },
    inventorySku: {
      type: String,
      trim: true,
      default: "",
    },
    inventoryWarehouse: {
      type: String,
      trim: true,
      default: "",
    },
    inventoryShelfLocation: {
      type: String,
      trim: true,
      default: "",
    },
    inventoryStatus: {
      type: String,
      trim: true,
      default: "",
    },
    inventoryQtyLabel: {
      type: String,
      trim: true,
      default: "",
    },
    inventoryQtyValue: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true },
);

MaterialRequestSchema.index({ departmentKey: 1, status: 1, createdAt: -1 });
MaterialRequestSchema.index({ requestedBy: 1, createdAt: -1 });
MaterialRequestSchema.index({ requestType: 1, project: 1, createdAt: -1 });

module.exports = mongoose.model("MaterialRequest", MaterialRequestSchema);
