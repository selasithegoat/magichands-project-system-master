const webpush = require("web-push");
const PushSubscription = require("../models/PushSubscription");
const WebPushConfig = require("../models/WebPushConfig");

const DEFAULT_AUTO_CLOSE_MS = 9000;
let cachedConfig = null;

const getConfiguredKeys = () => {
  const publicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
  return publicKey && privateKey ? { publicKey, privateKey } : null;
};

const loadWebPushConfig = async () => {
  if (cachedConfig) return cachedConfig;

  const configuredKeys = getConfiguredKeys();
  if (configuredKeys) {
    cachedConfig = configuredKeys;
  } else {
    let stored = await WebPushConfig.findOne({ key: "default" })
      .select("+privateKey")
      .lean();

    if (!stored) {
      const generated = webpush.generateVAPIDKeys();
      try {
        stored = await WebPushConfig.create({
          key: "default",
          publicKey: generated.publicKey,
          privateKey: generated.privateKey,
        });
      } catch (error) {
        if (error?.code !== 11000) throw error;
        stored = await WebPushConfig.findOne({ key: "default" })
          .select("+privateKey")
          .lean();
      }
    }

    cachedConfig = {
      publicKey: stored.publicKey,
      privateKey: stored.privateKey,
    };
  }

  const subject = String(
    process.env.WEB_PUSH_SUBJECT || "mailto:notifications@magichands.com",
  ).trim();
  webpush.setVapidDetails(subject, cachedConfig.publicKey, cachedConfig.privateKey);
  return cachedConfig;
};

const getPublicVapidKey = async () => (await loadWebPushConfig()).publicKey;

const normalizeActionUrl = (value) => {
  const url = String(value || "").trim();
  return url.startsWith("/") ? url : "";
};

const buildPayload = (notification = {}, deliveryOptions = {}) => {
  const notificationId = String(notification?._id || "").trim();
  const projectId = String(notification?.project || "").trim();
  const typeKey = String(notification?.type || "update")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 40);
  const actionUrl =
    normalizeActionUrl(deliveryOptions?.actionUrl || notification?.actionUrl) ||
    (projectId ? `/projects/${projectId}` : "/");

  return {
    title: String(notification?.title || "MagicHands update").slice(0, 120),
    body: String(notification?.message || "You have a new update.").slice(0, 320),
    icon: "/mhlogo.png",
    badge: "/favicon-32x32.png",
    // Replace a previous alert for the same project/category instead of
    // allowing desktop notifications to build up.
    tag: projectId ? `mh-project-${projectId}` : `mh-${typeKey || "update"}`,
    notificationId,
    actionUrl,
    autoCloseMs: DEFAULT_AUTO_CLOSE_MS,
  };
};

const sendToSubscription = async (subscription, payload) => {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime
          ? new Date(subscription.expirationTime).getTime()
          : null,
        keys: subscription.keys,
      },
      JSON.stringify(payload),
      { TTL: 60, urgency: "normal" },
    );
    await PushSubscription.updateOne(
      { _id: subscription._id },
      { $set: { lastUsedAt: new Date() } },
    );
    return true;
  } catch (error) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await PushSubscription.deleteOne({ _id: subscription._id });
      return false;
    }
    console.error("Web push delivery failed:", error?.message || error);
    return false;
  }
};

const sendWebPushToUser = async (userId, notification, deliveryOptions = {}) => {
  if (!userId) return { attempted: 0, delivered: 0 };
  await loadWebPushConfig();
  const subscriptions = await PushSubscription.find({ user: userId }).lean();
  if (!subscriptions.length) return { attempted: 0, delivered: 0 };

  const payload = buildPayload(notification, deliveryOptions);
  const outcomes = await Promise.all(
    subscriptions.map((subscription) => sendToSubscription(subscription, payload)),
  );
  return {
    attempted: subscriptions.length,
    delivered: outcomes.filter(Boolean).length,
  };
};

module.exports = {
  getPublicVapidKey,
  sendWebPushToUser,
};
