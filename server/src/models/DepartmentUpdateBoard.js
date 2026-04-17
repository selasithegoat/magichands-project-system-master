const mongoose = require("mongoose");

const DepartmentUpdateColumnSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    kind: {
      type: String,
      enum: ["text", "lead", "date", "textarea"],
      default: "text",
    },
    isCore: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const DepartmentUpdateRowSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    dept: {
      type: String,
      default: "",
      trim: true,
    },
    leadName: {
      type: String,
      default: "",
      trim: true,
    },
    leadUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    values: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastUpdatedAt: {
      type: Date,
      default: null,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false },
);

const DepartmentUpdateSectionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    rows: {
      type: [DepartmentUpdateRowSchema],
      default: [],
    },
  },
  { _id: false },
);

const DepartmentUpdateBoardSchema = new mongoose.Schema(
  {
    boardKey: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    title: {
      type: String,
      default: "Department Updates",
      trim: true,
    },
    columns: {
      type: [DepartmentUpdateColumnSchema],
      default: [],
    },
    sections: {
      type: [DepartmentUpdateSectionSchema],
      default: [],
    },
    lastUpdatedAt: {
      type: Date,
      default: null,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "DepartmentUpdateBoard",
  DepartmentUpdateBoardSchema,
);
