const mongoose = require("mongoose");

const SupplierProductSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      default: "",
    },
    tone: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const SupplierOpenPOSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const SupplierSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      trim: true,
      default: "",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      trim: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      default: "",
    },
    products: {
      type: [SupplierProductSchema],
      default: [],
    },
    openPO: {
      type: SupplierOpenPOSchema,
      default: () => ({}),
    },
    tone: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

SupplierSchema.index({ name: 1 });
SupplierSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: {
      code: { $type: "string", $ne: "" },
    },
  },
);

module.exports = mongoose.model("Supplier", SupplierSchema);
