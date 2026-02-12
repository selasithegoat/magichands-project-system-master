const mongoose = require("mongoose");

const DigestItemSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    projectName: String,
    orderId: String,
    status: String,
    fromStatus: String,
    toStatus: String,
    owner: String,
    deliveryDate: Date,
    deliveryTime: String,
    changedAt: Date,
  },
  { _id: false },
);

const WeeklyDigestSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    moved: [DigestItemSchema],
    pending: [DigestItemSchema],
    actionRequired: [DigestItemSchema],
    summary: {
      movedCount: { type: Number, default: 0 },
      pendingCount: { type: Number, default: 0 },
      actionCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

WeeklyDigestSchema.index({ recipient: 1, periodStart: -1 });

module.exports = mongoose.model("WeeklyDigest", WeeklyDigestSchema);
