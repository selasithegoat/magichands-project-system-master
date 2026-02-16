const User = require("../models/User");
const { createNotification } = require("./notificationService");

const toIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value._id) return toIdString(value._id);
  if (typeof value.toString === "function") return value.toString();
  return "";
};

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const getBillingRecipients = async (project = {}) => {
  const recipients = new Set();

  [project.projectLeadId, project.assistantLeadId].forEach((candidate) => {
    const id = toIdString(candidate);
    if (id) recipients.add(id);
  });

  const admins = await User.find({ role: "admin" }).select("_id").lean();
  admins.forEach((admin) => {
    const id = toIdString(admin?._id);
    if (id) recipients.add(id);
  });

  return Array.from(recipients);
};

/**
 * Notify key stakeholders when billing options/status changes
 * recipients: project lead, assistant lead, and all admins
 */
const notifyBillingOptionChange = async ({
  project,
  senderId,
  title,
  message,
  type = "ACTIVITY",
}) => {
  try {
    const projectId = toIdString(project?._id);
    const actorId = toIdString(senderId);
    const notificationTitle = toText(title);
    const notificationMessage = toText(message);

    if (!projectId || !actorId || !notificationTitle || !notificationMessage) {
      return;
    }

    const recipients = await getBillingRecipients(project);
    if (!recipients.length) return;

    await Promise.all(
      recipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          type,
          notificationTitle,
          notificationMessage,
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying billing option change:", error);
  }
};

module.exports = { notifyBillingOptionChange };

