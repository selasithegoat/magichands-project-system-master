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
        "item_update", // [NEW]
        "departments_update", // [NEW]
        "factor_add", // [NEW]
        "factor_update", // [NEW]
        "update_post", // [NEW]
        "engagement_acknowledge", // [NEW]
        "engagement_unacknowledge", // [NEW]
        "mockup_upload", // [NEW]
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
  { timestamps: true },
);

// Indexes tuned to current read patterns in controllers/services
ActivityLogSchema.index({ project: 1, createdAt: -1 }); // project activity timeline
ActivityLogSchema.index({ user: 1, createdAt: -1 }); // user activity feed + pagination
ActivityLogSchema.index({ project: 1, action: 1, createdAt: 1 }); // project status timeline/digest queries
ActivityLogSchema.index({ action: 1, "details.statusChange.to": 1, createdAt: 1 }); // analytics filters
ActivityLogSchema.index({ createdAt: -1 }); // latest events feed

module.exports = mongoose.model("ActivityLog", ActivityLogSchema);
