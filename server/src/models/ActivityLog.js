const mongoose = require("mongoose");

const ActivityLogSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        "create",
        "update",
        "status_change",
        "challenge_add",
        "challenge_update",
        "challenge_delete",
        "risk_add",
        "risk_update",
        "item_add",
        "item_delete",
        "approval",
        "system",
      ],
    },
    description: {
      type: String,
      required: true,
    },
    details: {
      type: Map, // Flexible structure for saving changes (oldVal, newVal, field, etc.)
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ActivityLog", ActivityLogSchema);
