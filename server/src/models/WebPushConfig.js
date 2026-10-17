const mongoose = require("mongoose");

const WebPushConfigSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "default" },
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model("WebPushConfig", WebPushConfigSchema);
