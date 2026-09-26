const Notification = require("../models/Notification");
const User = require("../models/User");
const { createNotification } = require("../utils/notificationService");
const { sendEmail } = require("../utils/emailService");
const { broadcastNotificationChange } = require("../utils/realtimeHub");
const { addProductionWorkingHours } = require("../utils/productionActionWorkingTime");

const LEAD_SOURCE = "production_lead_follow_up:completion_due";
const OWNER_SOURCE = "production_completion_request:ready";
const ACTION_SOURCES = [LEAD_SOURCE, OWNER_SOURCE];
const toId = (value) => String(value?._id || value || "");

const isCurrentProductionAction = (notification) => {
  const project = notification.project;
  const review = project?.productionTracking?.completionReview || {};
  if (project?.cancellation?.isCancelled) return false;
  if (notification.source === LEAD_SOURCE) {
    return (
      project?.status === "Production In Progress" &&
      review.status === "awaiting_lead" &&
      toId(review.leadNotificationId) === toId(notification._id)
    );
  }
  return (
    ["Pending Production", "Production In Progress"].includes(project?.status) &&
    review.status === "awaiting_owner" &&
    toId(review.ownerNotificationId) === toId(notification._id)
  );
};

const getProjectLabel = (project) => {
  const name = String(project?.details?.projectName || "").trim();
  const orderId = String(project?.orderId || "").trim();
  return [orderId && `#${orderId}`, name].filter(Boolean).join(" · ") || "a project";
};

const notifyReminder = async (notification, now) => {
  const recipientId = toId(notification.recipient);
  broadcastNotificationChange({
    path: "/api/notifications",
    method: "PATCH",
    source: "production_action_reminder",
    notificationId: toId(notification._id),
    recipientId,
    reminderSentAt: now,
  });
  const recipient = await User.findById(recipientId).select(
    "email notificationSettings.email",
  );
  if (recipient?.notificationSettings?.email && recipient.email) {
    await sendEmail(
      recipient.email,
      `Reminder: ${notification.title}`,
      `${notification.message}\n\nThis action is still waiting for your response. Open your notification panel to complete it.`,
    );
  }
};

const notifyAdminEscalation = async (notification) => {
  const admins = await User.find({ role: "admin" }).select("_id");
  const projectId = toId(notification.project);
  const actorId = toId(notification.recipient);
  const label = getProjectLabel(notification.project);
  let delivered = 0;
  for (const admin of admins) {
    const result = await createNotification(
      admin._id,
      actorId,
      projectId,
      "REMINDER",
      "Production action overdue",
      `${label}: ${notification.source === LEAD_SOURCE ? "Project Lead feedback" : "Production completion"} has not been completed after 8 working hours. Please follow up.`,
      {
        allowSelf: true,
        inApp: true,
        push: false,
        source: `production_action_escalation:${toId(notification._id)}`,
        dedupeKey: `production-action-escalation:${toId(notification._id)}:${toId(admin._id)}`,
        actionUrl: `/projects/${projectId}`,
      },
    );
    if (result) delivered += 1;
  }
  return { delivered, total: admins.length };
};

const processProductionActionFollowUp = async (notification, now) => {
  if (!isCurrentProductionAction(notification)) {
    if (
      notification.createdAt &&
      now.getTime() - new Date(notification.createdAt).getTime() < 2 * 60 * 1000
    ) {
      return "waiting";
    }
    await Notification.updateOne(
      { _id: notification._id, isRead: false },
      { $set: { isRead: true, resolvedAt: now, nextReminderAt: null } },
    );
    return "stale";
  }

  if (!notification.followUpStartedAt) {
    await Notification.updateOne(
      { _id: notification._id, isRead: false, followUpStartedAt: null },
      {
        $set: {
          followUpStartedAt: now,
          nextReminderAt: addProductionWorkingHours(now, 2),
        },
      },
    );
    return "initialized";
  }

  const reminderDueAt = addProductionWorkingHours(
    notification.followUpStartedAt,
    2,
  );
  const escalationDueAt = addProductionWorkingHours(
    notification.followUpStartedAt,
    8,
  );
  if (!notification.reminderSentAt) {
    if (now < reminderDueAt) return "waiting";
    const claimed = await Notification.findOneAndUpdate(
      { _id: notification._id, isRead: false, reminderSentAt: null },
      {
        $set: {
          reminderSentAt: now,
          nextReminderAt: escalationDueAt,
        },
      },
      { new: true },
    );
    if (!claimed) return "waiting";
    if (!(await Notification.exists({ _id: notification._id, isRead: false }))) {
      return "resolved";
    }
    await notifyReminder(notification, now);
    return "reminded";
  }

  if (notification.escalatedAt || now < escalationDueAt) return "waiting";
  const claimed = await Notification.findOneAndUpdate(
    { _id: notification._id, isRead: false, escalatedAt: null },
    { $set: { escalatedAt: now, nextReminderAt: null } },
    { new: true },
  );
  if (!claimed) return "waiting";
  if (!(await Notification.exists({ _id: notification._id, isRead: false }))) {
    return "resolved";
  }
  const { delivered, total } = await notifyAdminEscalation(notification);
  if (total === 0 || delivered < total) {
    await Notification.updateOne(
      { _id: notification._id, isRead: false, escalatedAt: now },
      { $set: { escalatedAt: null, nextReminderAt: now } },
    );
    return "escalation_pending";
  }
  return "escalated";
};

const runProductionActionFollowUpSweep = async (nowValue = new Date()) => {
  const now = new Date(nowValue);
  const notifications = await Notification.find({
    source: { $in: ACTION_SOURCES },
    isRead: false,
    escalatedAt: null,
  })
    .select("recipient project source title message createdAt followUpStartedAt reminderSentAt escalatedAt nextReminderAt")
    .populate(
      "project",
      "orderId details.projectName status cancellation.isCancelled productionTracking.completionReview",
    )
    .sort({ createdAt: -1 })
    .limit(500);
  const counts = {};
  for (const notification of notifications) {
    try {
      const outcome = await processProductionActionFollowUp(notification, now);
      counts[outcome] = (counts[outcome] || 0) + 1;
    } catch (error) {
      console.error("Production action follow-up failed:", error);
      counts.failed = (counts.failed || 0) + 1;
    }
  }
  return counts;
};

module.exports = {
  ACTION_SOURCES,
  isCurrentProductionAction,
  processProductionActionFollowUp,
  runProductionActionFollowUpSweep,
};
