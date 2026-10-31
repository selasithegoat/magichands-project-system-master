const PushSubscription = require("../models/PushSubscription");
const { getPublicVapidKey, sendWebPushToUser } = require("../utils/webPushService");

const normalizePortal = (value) =>
  String(value || "").trim().toLowerCase() === "admin" ? "admin" : "client";

const getConfig = async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    return res.json({ publicKey: await getPublicVapidKey() });
  } catch (error) {
    console.error("Failed to load web push configuration:", error);
    return res.status(503).json({ message: "Browser notifications are unavailable." });
  }
};

const subscribe = async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || "").trim();
    const p256dh = String(req.body?.keys?.p256dh || "").trim();
    const auth = String(req.body?.keys?.auth || "").trim();

    if (!endpoint.startsWith("https://") || !p256dh || !auth) {
      return res.status(400).json({ message: "Invalid browser push subscription." });
    }

    const subscription = await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          user: req.user._id,
          endpoint,
          expirationTime: req.body?.expirationTime || null,
          keys: { p256dh, auth },
          portal: normalizePortal(req.body?.portal),
          userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
          lastUsedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(201).json({
      subscribed: true,
      id: subscription._id,
      portal: subscription.portal,
    });
  } catch (error) {
    console.error("Failed to save browser push subscription:", error);
    return res.status(500).json({ message: "Could not enable browser notifications." });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || "").trim();
    if (!endpoint) {
      return res.status(400).json({ message: "Subscription endpoint is required." });
    }
    await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    return res.json({ subscribed: false });
  } catch (error) {
    console.error("Failed to remove browser push subscription:", error);
    return res.status(500).json({ message: "Could not disable browser notifications." });
  }
};

const sendTest = async (req, res) => {
  try {
    const result = await sendWebPushToUser(
      req.user._id,
      {
        title: "Browser notifications are ready",
        message: "MagicHands can now alert you when this portal is closed.",
        actionUrl: "/",
      },
      { actionUrl: "/" },
    );
    if (!result.attempted || !result.delivered) {
      return res.status(409).json({
        ...result,
        message:
          "No active browser subscription received the test notification.",
      });
    }
    return res.json(result);
  } catch (error) {
    console.error("Failed to send test browser notification:", error);
    return res.status(500).json({ message: "Could not send the test notification." });
  }
};

module.exports = { getConfig, subscribe, unsubscribe, sendTest };
