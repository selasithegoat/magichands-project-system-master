const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendEmail } = require("./emailService");

const NOTIFICATION_DEDUPE_WINDOW_MS = Number.isFinite(
  Number.parseInt(process.env.NOTIFICATION_DEDUPE_WINDOW_MS, 10),
)
  ? Number.parseInt(process.env.NOTIFICATION_DEDUPE_WINDOW_MS, 10)
  : 20000;

/**
 * Create a new notification and trigger delivery channels based on user preferences
 * @param {string} recipientId - User ID of the recipient
 * @param {string} senderId - User ID of the sender
 * @param {string} projectId - ID of the related project (optional)
 * @param {string} type - Notification type enum
 * @param {string} title - Title of the notification
 * @param {string} message - Content of the notification
 */
const createNotification = async (
  recipientId,
  senderId,
  projectId,
  type,
  title,
  message,
) => {
  try {
    // Avoid notifying the same user who performed the action
    if (recipientId.toString() === senderId.toString()) {
      return null;
    }

    const recipientKey = recipientId?.toString?.() || "";
    const senderKey = senderId?.toString?.() || "";
    const projectKey = projectId?.toString?.() || null;

    // Fetch recipient to check notification preferences
    const recipient = await User.findById(recipientKey);
    if (!recipient) return null;

    // Guard against duplicate notifications from overlapping triggers
    const dedupeStart = new Date(Date.now() - NOTIFICATION_DEDUPE_WINDOW_MS);
    const existing = await Notification.findOne({
      recipient: recipientKey,
      project: projectKey,
      title,
      message,
      createdAt: { $gte: dedupeStart },
    }).lean();
    if (existing) {
      return existing;
    }

    const notification = await Notification.create({
      recipient: recipientKey,
      sender: senderKey,
      project: projectKey,
      type,
      title,
      message,
    });

    // Check preferences and trigger delivery channels
    const settings = {
      email: recipient.notificationSettings?.email ?? false,
      push: recipient.notificationSettings?.push ?? true,
    };

    if (settings.email && recipient.email) {
      await sendEmail(recipient.email, title, message);
    }

    if (settings.push) {
      // Stub for Push Notification Service
    }

    return notification;
  } catch (err) {
    console.error("Failed to create notification:", err);
    return null;
  }
};

module.exports = { createNotification };
