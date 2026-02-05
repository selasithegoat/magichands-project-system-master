const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendEmail } = require("./emailService");

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

    // Fetch recipient to check notification preferences
    const recipient = await User.findById(recipientId);
    if (!recipient) return null;

    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      project: projectId,
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
