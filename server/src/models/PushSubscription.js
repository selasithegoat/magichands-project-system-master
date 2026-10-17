const mongoose = require("mongoose");

const PushSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    endpoint: { type: String, required: true, unique: true, trim: true },
    expirationTime: { type: Date, default: null },
    keys: {
      p256dh: { type: String, required: true, trim: true },
      auth: { type: String, required: true, trim: true },
    },
    portal: {
      type: String,
      enum: ["client", "admin"],
      default: "client",
    },
    userAgent: { type: String, trim: true, default: "" },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

PushSubscriptionSchema.index({ user: 1, portal: 1, updatedAt: -1 });

module.exports = mongoose.model("PushSubscription", PushSubscriptionSchema);
