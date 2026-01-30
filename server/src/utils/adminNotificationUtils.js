const User = require("../models/User");
const { createNotification } = require("./notificationService");

/**
 * Send a notification to all users with role 'admin'
 * @param {string} senderId - ID of the user sending the notification (or system)
 * @param {string} projectId - ID of the related project (optional)
 * @param {string} type - Notification type (ASSIGNMENT, ACTIVITY, UPDATE, ACCEPTANCE, SYSTEM)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 */
const notifyAdmins = async (senderId, projectId, type, title, message) => {
  try {
    const admins = await User.find({ role: "admin" });

    // Create notification for each admin
    const notifications = admins.map((admin) => {
      // Don't notify the sender if they are an admin
      if (admin._id.toString() === senderId.toString()) return null;

      return createNotification(
        admin._id,
        senderId,
        projectId,
        type,
        title,
        message,
      );
    });

    await Promise.all(notifications);
  } catch (error) {
    console.error("Error notifying admins:", error);
  }
};

module.exports = { notifyAdmins };
