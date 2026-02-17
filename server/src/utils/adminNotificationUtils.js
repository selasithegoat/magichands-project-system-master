const User = require("../models/User");
const { createNotification } = require("./notificationService");

/**
 * Send a notification to all users with role 'admin'
 * @param {string} senderId - ID of the user sending the notification (or system)
 * @param {string} projectId - ID of the related project (optional)
 * @param {string} type - Notification type (ASSIGNMENT, ACTIVITY, UPDATE, ACCEPTANCE, SYSTEM)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} options - Additional options
 * @param {string[]} options.excludeUserIds - Admin user IDs to skip
 */
const notifyAdmins = async (
  senderId,
  projectId,
  type,
  title,
  message,
  options = {},
) => {
  try {
    const admins = await User.find({ role: "admin" });
    const senderKey = senderId?.toString?.() || "";
    const excludedAdminIds = new Set(
      (Array.isArray(options.excludeUserIds) ? options.excludeUserIds : [])
        .map((id) => id?.toString?.())
        .filter(Boolean),
    );

    // Create notification for each admin
    const notifications = admins.map((admin) => {
      const adminId = admin?._id?.toString?.();
      if (!adminId) return null;

      // Don't notify the sender if they are an admin
      if (senderKey && adminId === senderKey) return null;

      // Skip admins that already received a direct notification in this flow
      if (excludedAdminIds.has(adminId)) return null;

      return createNotification(
        adminId,
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
