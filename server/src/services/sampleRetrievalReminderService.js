const Notification = require("../models/Notification");
const SampleMovement = require("../models/SampleMovement");
const User = require("../models/User");
const { appendCustodyEvent } = require("./sampleMovementService");
const { createNotification } = require("../utils/notificationService");
const { broadcastNotificationChange } = require("../utils/realtimeHub");

const RETURNABLE_CUSTODY_STATUSES = Object.freeze([
  "dispatched",
  "in_client_custody",
  "partially_returned",
  "ownership_transfer_pending",
]);
const SAMPLE_RETRIEVAL_SOURCE_PREFIX = "sample_retrieval:";
const DAY_MS = 24 * 60 * 60 * 1000;

const getSampleRetrievalReminderStage = (
  movement,
  { now = new Date(), dueSoonDays = 7, dueTodayHours = 24 } = {},
) => {
  if (
    !RETURNABLE_CUSTODY_STATUSES.includes(String(movement?.status || "")) ||
    !["returnable", "decision_pending"].includes(
      String(movement?.disposition || ""),
    )
  ) {
    return "none";
  }

  const dueAt = new Date(movement?.expectedReturnAt || "").getTime();
  const nowAt = new Date(now).getTime();
  if (!Number.isFinite(dueAt) || !Number.isFinite(nowAt)) return "none";

  const remainingMs = dueAt - nowAt;
  if (remainingMs < 0) return "overdue";
  if (remainingMs <= Math.max(1, Number(dueTodayHours) || 24) * 60 * 60 * 1000) {
    return "due_today";
  }
  if (remainingMs <= Math.max(1, Number(dueSoonDays) || 7) * DAY_MS) {
    return "due_soon";
  }
  return "none";
};

const formatRetrievalDate = (value) => {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "the recorded retrieval date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getMovementLabel = (movement) => {
  const clientName = String(movement?.client?.name || "the client").trim();
  const projectReference = String(
    movement?.projectSnapshot?.orderId || movement?.projectSnapshot?.projectName || "",
  ).trim();
  return projectReference ? `${clientName} (${projectReference})` : clientName;
};

const getStageMessage = (movement, stage) => {
  const dueLabel = formatRetrievalDate(movement?.expectedReturnAt);
  const movementLabel = getMovementLabel(movement);
  if (stage === "overdue") {
    return {
      title: `Sample retrieval overdue · ${movement.reference}`,
      message: `${movementLabel} was due for retrieval on ${dueLabel}. Record the return or begin the approved ownership-transfer process.`,
      priority: "urgent",
    };
  }
  if (stage === "due_today") {
    return {
      title: `Sample retrieval due today · ${movement.reference}`,
      message: `${movementLabel} is due for retrieval by ${dueLabel}. Confirm collection arrangements with the client.`,
      priority: "urgent",
    };
  }
  return {
    title: `Sample retrieval due soon · ${movement.reference}`,
    message: `${movementLabel} is due for retrieval on ${dueLabel}. Plan the client follow-up and collection.`,
    priority: "important",
  };
};

const resolveSampleRetrievalNotifications = async (
  sampleMovementId,
  now = new Date(),
) => {
  if (!sampleMovementId) return 0;
  const result = await Notification.updateMany(
    {
      sampleMovement: sampleMovementId,
      source: { $regex: `^${SAMPLE_RETRIEVAL_SOURCE_PREFIX}` },
      resolvedAt: null,
    },
    {
      $set: {
        isRead: true,
        resolvedAt: now,
        nextReminderAt: null,
      },
    },
  );
  if (result.modifiedCount > 0) {
    broadcastNotificationChange({
      path: "/api/notifications",
      method: "PATCH",
      source: "sample_retrieval:resolved",
      sampleMovementId: String(sampleMovementId),
    });
  }
  return result.modifiedCount || 0;
};

const resolveInactiveRetrievalNotifications = async (activeMovementIds, now) => {
  const result = await Notification.updateMany(
    {
      source: { $regex: `^${SAMPLE_RETRIEVAL_SOURCE_PREFIX}` },
      resolvedAt: null,
      sampleMovement: { $nin: activeMovementIds },
    },
    { $set: { isRead: true, resolvedAt: now, nextReminderAt: null } },
  );
  if (result.modifiedCount > 0) {
    broadcastNotificationChange({
      path: "/api/notifications",
      method: "PATCH",
      source: "sample_retrieval:resolved_sweep",
    });
  }
  return result.modifiedCount || 0;
};

const runSampleRetrievalReminderSweep = async (nowValue = new Date()) => {
  const now = new Date(nowValue);
  if (Number.isNaN(now.getTime())) throw new TypeError("Invalid reminder sweep date.");

  const movements = await SampleMovement.find({
    status: { $in: RETURNABLE_CUSTODY_STATUSES },
    disposition: { $in: ["returnable", "decision_pending"] },
    expectedReturnAt: {
      $ne: null,
      $lte: new Date(now.getTime() + 7 * DAY_MS),
    },
  });
  const activeMovementIds = movements.map((movement) => movement._id);
  const adminUsers = await User.find({
    role: "admin",
    department: "Administration",
  }).select("_id");
  const stats = {
    evaluated: movements.length,
    ownerNotifications: 0,
    adminEscalations: 0,
    resolved: 0,
  };

  for (const movement of movements) {
    const stage = getSampleRetrievalReminderStage(movement, { now });
    const reminderField = {
      due_soon: "dueSoonSentAt",
      due_today: "dueTodaySentAt",
      overdue: "overdueSentAt",
    }[stage];
    movement.retrievalReminders ||= {};
    let changed = false;

    if (reminderField && !movement.retrievalReminders[reminderField]) {
      const ownerId = movement.frontDeskOwner?.toString?.();
      if (ownerId) {
        const content = getStageMessage(movement, stage);
        const ownerNotification = await createNotification(
          ownerId,
          ownerId,
          movement.project,
          "REMINDER",
          content.title,
          content.message,
          {
            allowSelf: true,
            sampleMovementId: movement._id,
            source: `${SAMPLE_RETRIEVAL_SOURCE_PREFIX}${stage}`,
            dedupeKey: `sample-retrieval:${movement._id}:${ownerId}:${stage}`,
            priority: content.priority,
            requiresAction: stage === "overdue",
            actionType: stage === "overdue" ? "sample_retrieval" : "",
            actionUrl: `/sample-custody?movement=${movement._id}`,
          },
        );
        if (ownerNotification) {
          stats.ownerNotifications += 1;
          movement.retrievalReminders[reminderField] = now;
          appendCustodyEvent(movement, {
            type: "retrieval_reminder_sent",
            actor: null,
            actorName: "System",
            fromStatus: movement.status,
            toStatus: movement.status,
            note: `${stage.replace(/_/g, " ")} retrieval reminder issued.`,
            details: { stage, expectedReturnAt: movement.expectedReturnAt },
          });
          changed = true;
        }
      }
    }

    if (stage === "overdue" && !movement.retrievalReminders.adminEscalatedAt) {
      const content = getStageMessage(movement, stage);
      let deliveredAdminCount = 0;
      for (const admin of adminUsers) {
        const adminNotification = await createNotification(
          admin._id,
          movement.frontDeskOwner || admin._id,
          movement.project,
          "REMINDER",
          `Overdue sample escalation · ${movement.reference}`,
          `${content.message} Front Desk owner has been notified.`,
          {
            allowSelf: true,
            sampleMovementId: movement._id,
            source: `${SAMPLE_RETRIEVAL_SOURCE_PREFIX}admin_escalation`,
            dedupeKey: `sample-retrieval:${movement._id}:${admin._id}:admin-overdue`,
            priority: "urgent",
            actionUrl: `/sample-authorizations?movement=${movement._id}&attention=overdue`,
          },
        );
        if (adminNotification) deliveredAdminCount += 1;
      }
      if (deliveredAdminCount > 0) {
        stats.adminEscalations += deliveredAdminCount;
        movement.retrievalReminders.adminEscalatedAt = now;
        appendCustodyEvent(movement, {
          type: "retrieval_overdue_escalated",
          actor: null,
          actorName: "System",
          fromStatus: movement.status,
          toStatus: movement.status,
          note: "Overdue retrieval escalated to Administration.",
          details: { expectedReturnAt: movement.expectedReturnAt },
        });
        changed = true;
      }
    }

    if (changed) {
      movement.retrievalReminders.lastEvaluatedAt = now;
      await movement.save();
    }
  }

  stats.resolved = await resolveInactiveRetrievalNotifications(
    activeMovementIds,
    now,
  );
  return stats;
};

module.exports = {
  RETURNABLE_CUSTODY_STATUSES,
  SAMPLE_RETRIEVAL_SOURCE_PREFIX,
  getSampleRetrievalReminderStage,
  getStageMessage,
  resolveSampleRetrievalNotifications,
  runSampleRetrievalReminderSweep,
};
