const User = require("../models/User");
const { createNotification } = require("./notificationService");
const FRONT_DESK_DEPARTMENT = "Front Desk";
const BILLING_MISSING_LABELS = {
  invoice: "Invoice confirmation",
  payment_verification_any: "Payment method verification",
  full_payment_or_authorized:
    "Full payment or authorization verification",
};

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

const getBillingGuardRecipients = async (project = {}) => {
  const recipients = new Set();

  [project.projectLeadId].forEach((candidate) => {
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

const formatBillingMissingLabels = (missing = []) =>
  Array.from(
    new Set(
      (Array.isArray(missing) ? missing : [])
        .map((entry) => toText(entry).toLowerCase())
        .filter(Boolean),
    ),
  ).map(
    (code) =>
      BILLING_MISSING_LABELS[code] || code.replace(/_/g, " ").trim() || code,
  );

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

const notifyBillingPrerequisiteBlocked = async ({
  project,
  senderId,
  targetStatus,
  missing = [],
}) => {
  try {
    const projectId = toIdString(project?._id);
    const actorId = toIdString(senderId);
    const statusLabel = toText(targetStatus);
    const missingLabels = formatBillingMissingLabels(missing);

    if (!projectId || !actorId || !statusLabel || missingLabels.length === 0) {
      return;
    }

    const recipients = await getBillingGuardRecipients(project);
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((recipientId) => toIdString(recipientId))
          .filter(Boolean)
          .filter((recipientId) => recipientId !== actorId),
      ),
    );

    if (!uniqueRecipients.length) return;

    const message = `Caution: ${missingLabels.join(", ")} must be confirmed before moving project #${toText(project?.orderId) || "N/A"} (${toText(project?.details?.projectName) || "Unnamed Project"}) to ${statusLabel}.`;

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "SYSTEM",
          "Billing Prerequisite Missing",
          message,
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying billing prerequisite block:", error);
  }
};

const notifyBillingOverrideUsed = async ({
  project,
  senderId,
  targetStatus,
  missing = [],
}) => {
  try {
    const projectId = toIdString(project?._id);
    const actorId = toIdString(senderId);
    const statusLabel = toText(targetStatus);
    const missingLabels = formatBillingMissingLabels(missing);

    if (!projectId || !actorId || !statusLabel || missingLabels.length === 0) {
      return;
    }

    const recipients = await getBillingGuardRecipients(project);
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((recipientId) => toIdString(recipientId))
          .filter(Boolean)
          .filter((recipientId) => recipientId !== actorId),
      ),
    );

    if (!uniqueRecipients.length) return;

    const message = `Admin override used for project #${toText(project?.orderId) || "N/A"} (${toText(project?.details?.projectName) || "Unnamed Project"}) to move to ${statusLabel}. Missing: ${missingLabels.join(", ")}.`;

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "SYSTEM",
          "Billing Override Used",
          message,
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying billing override usage:", error);
  }
};

const notifyBillingPrerequisiteResolved = async ({
  project,
  senderId,
  targetStatus,
  resolved = [],
  resolutionNote = "",
}) => {
  try {
    const projectId = toIdString(project?._id);
    const actorId = toIdString(senderId);
    const statusLabel = toText(targetStatus);
    const resolvedLabels = formatBillingMissingLabels(resolved);
    const note = toText(resolutionNote);

    if (!projectId || !actorId || !statusLabel || resolvedLabels.length === 0) {
      return;
    }

    const recipients = await getBillingGuardRecipients(project);
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((recipientId) => toIdString(recipientId))
          .filter(Boolean)
          .filter((recipientId) => recipientId !== actorId),
      ),
    );

    if (!uniqueRecipients.length) return;

    const messageParts = [
      `Billing prerequisites cleared for project #${toText(project?.orderId) || "N/A"} (${toText(project?.details?.projectName) || "Unnamed Project"}).`,
      `${statusLabel} can now proceed.`,
      `Cleared: ${resolvedLabels.join(", ")}.`,
    ];
    if (note) {
      messageParts.push(note);
    }

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "SYSTEM",
          "Billing Prerequisite Cleared",
          messageParts.join(" "),
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying billing prerequisite cleared:", error);
  }
};

module.exports = {
  notifyBillingOptionChange,
  notifyBillingPrerequisiteBlocked,
  notifyBillingOverrideUsed,
  notifyBillingPrerequisiteResolved,
};
