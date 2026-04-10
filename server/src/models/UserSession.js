const mongoose = require("mongoose");

const UserSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    loggedOutAt: {
      type: Date,
      default: null,
      index: true,
    },
    portal: {
      type: String,
      default: "client",
      trim: true,
    },
  },
  { timestamps: true },
);

UserSessionSchema.index({ user: 1, expiresAt: -1, loggedOutAt: 1 });

module.exports = mongoose.model("UserSession", UserSessionSchema);
