const User = require("../models/User");
const { createNotification } = require("./notificationService");
const FRONT_DESK_DEPARTMENT = "Front Desk";

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

  [
    project.createdBy,
    project.projectLeadId,
    project.assistantLeadId,
  ].forEach((candidate) => {
    const id = toIdString(candidate);
    if (id) recipients.add(id);
  });

  const adminsAndFrontDesk = await User.find({
    $or: [{ role: "admin" }, { department: FRONT_DESK_DEPARTMENT }],
  })
    .select("_id")
    .lean();
  adminsAndFrontDesk.forEach((user) => {
    const id = toIdString(user?._id);
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
    recipients.push(actorId);
    const uniqueRecipients = Array.from(
      new Set(recipients.map((recipientId) => toIdString(recipientId)).filter(Boolean)),
    );
    if (!uniqueRecipients.length) return;

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
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
