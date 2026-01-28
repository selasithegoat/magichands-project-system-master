const Notification = require("../models/Notification");

/**
 * Create a new notification
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

    const notification = await Notification.create({
      recipient: recipientId,
      sender: senderId,
      project: projectId,
      type,
      title,
      message,
    });
    return notification;
  } catch (err) {
    console.error("Failed to create notification:", err);
    return null;
  }
};

module.exports = { createNotification };
