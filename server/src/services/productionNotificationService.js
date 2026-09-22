const Notification = require("../models/Notification");
const Project = require("../models/Project");
const { createNotification } = require("../utils/notificationService");
const { broadcastNotificationChange } = require("../utils/realtimeHub");

const PENDING_PRODUCTION_STATUS = "Pending Production";
const PRODUCTION_NOTIFICATION_SOURCE_PREFIX = "production_follow_up";
const MINUTE_MS = 60 * 1000;

const toPositiveMinutes = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const AT_RISK_CADENCE_MS =
  toPositiveMinutes(process.env.PRODUCTION_AT_RISK_REMINDER_MINUTES, 30) *
  MINUTE_MS;
const OVERDUE_CADENCE_MS =
  toPositiveMinutes(process.env.PRODUCTION_OVERDUE_REMINDER_MINUTES, 15) *
  MINUTE_MS;

const toId = (value) => {
  if (!value) return "";
  if (value?._id) return String(value._id);
  return String(value);
};

const toValidDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const datesMatch = (left, right) => {
  const leftDate = toValidDate(left);
  const rightDate = toValidDate(right);
  if (!leftDate && !rightDate) return true;
  if (!leftDate || !rightDate) return false;
  return leftDate.getTime() === rightDate.getTime();
};

const getNotificationState = (project) =>
  project?.productionTracking?.notificationState?.toObject?.() ||
  project?.productionTracking?.notificationState ||
  {};

const getProjectReference = (project) =>
  String(project?.orderId || project?._id || "this project").trim();

const getProjectName = (project) =>
  String(
    project?.details?.projectNameRaw ||
      project?.details?.projectName ||
      project?.details?.projectIndicator ||
      "Production job",
  ).trim();

const formatMinutes = (minutes) => {
  const safeMinutes = Math.max(0, Math.ceil(Number(minutes) || 0));
  if (safeMinutes < 60) return `${safeMinutes} minute${safeMinutes === 1 ? "" : "s"}`;
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  if (!remainder) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${remainder}m`;
};

const getLatestProductionStartAt = (project) => {
  const dueAt = toValidDate(project?.productionTracking?.productionDueAt);
  if (!dueAt) return null;
  const estimatedMinutes = Math.max(
    0,
    Number(project?.productionTracking?.estimatedProductionMinutes) || 0,
  );
  return new Date(dueAt.getTime() - estimatedMinutes * MINUTE_MS);
};

const getEstimatedProductionMinutes = (project) =>
  Math.max(
    0,
    Number(project?.productionTracking?.estimatedProductionMinutes) || 0,
  );

const resolveProductionAlertStage = (project, nowValue = new Date()) => {
  const now = toValidDate(nowValue) || new Date();
  const tracking = project?.productionTracking || {};
  const riskLevel = String(tracking.riskLevel || "").trim();

  if (riskLevel === "overdue") return "overdue";
  if (riskLevel === "at_risk") return "at_risk";

  const latestStartAt = getLatestProductionStartAt(project);
  if (latestStartAt && now.getTime() >= latestStartAt.getTime()) {
    return "time_to_begin";
  }

  if (riskLevel === "attention") return "attention";
  return "";
};

const getProductionAlertCadenceMs = (stage) => {
  if (stage === "at_risk") return AT_RISK_CADENCE_MS;
  if (stage === "overdue") return OVERDUE_CADENCE_MS;
  return null;
};

const shouldSendProductionAlert = (stage, state = {}, nowValue = new Date()) => {
  const now = toValidDate(nowValue) || new Date();
  if (stage === "attention") return !toValidDate(state.attentionSentAt);
  if (stage === "time_to_begin") return !toValidDate(state.timeToBeginSentAt);

  const cadenceMs = getProductionAlertCadenceMs(stage);
  if (!cadenceMs) return false;
  const lastSentAt = toValidDate(
    stage === "overdue" ? state.overdueLastSentAt : state.atRiskLastSentAt,
  );
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= cadenceMs;
};

const buildProductionAlert = (project, stage, nowValue = new Date()) => {
  const now = toValidDate(nowValue) || new Date();
  const reference = getProjectReference(project);
  const name = getProjectName(project);
  const tracking = project?.productionTracking || {};
  const dueAt = toValidDate(tracking.productionDueAt);
  const minutesToDue = dueAt
    ? Math.ceil((dueAt.getTime() - now.getTime()) / MINUTE_MS)
    : null;

  const common = {
    source: `${PRODUCTION_NOTIFICATION_SOURCE_PREFIX}:${stage}`,
    type: "REMINDER",
  };

  if (stage === "attention") {
    return {
      ...common,
      title: "Production deadline approaching",
      message: `#${reference}: ${name} has one hour or less of schedule margin. Review the job in My Production Queue.`,
    };
  }
  if (stage === "time_to_begin") {
    return {
      ...common,
      title: "Production should start now",
      message: `#${reference}: ${name} should begin now to meet its production deadline.`,
    };
  }
  if (stage === "at_risk") {
    return {
      ...common,
      title: "Production is at risk",
      message: `#${reference}: ${name} is predicted to miss its production deadline${
        minutesToDue !== null && minutesToDue > 0
          ? ` in ${formatMinutes(minutesToDue)}`
          : ""
      }. Open the job and take action now.`,
    };
  }
  if (stage === "overdue") {
    const overdueMinutes =
      minutesToDue === null ? 0 : Math.max(0, Math.abs(minutesToDue));
    return {
      ...common,
      title: "Production deadline overdue",
      message: `#${reference}: ${name} is overdue${
        overdueMinutes ? ` by ${formatMinutes(overdueMinutes)}` : ""
      }. Complete production or update the project immediately.`,
    };
  }
  return null;
};

const buildProductionNotificationKey = (
  project,
  ownerId,
  stage,
  nowValue = new Date(),
) => {
  const projectId = toId(project?._id);
  const normalizedOwnerId = toId(ownerId);
  const dueAt = toValidDate(project?.productionTracking?.productionDueAt);
  const planKey = dueAt ? dueAt.getTime() : "no-deadline";
  const estimateKey = getEstimatedProductionMinutes(project);
  const cadenceMs = getProductionAlertCadenceMs(stage);
  const cadenceKey = cadenceMs
    ? Math.floor((toValidDate(nowValue) || new Date()).getTime() / cadenceMs)
    : "once";
  return `production:${projectId}:${normalizedOwnerId}:${planKey}:${estimateKey}:${stage}:${cadenceKey}`;
};

const createInitialNotificationState = (ownerId = null, nowValue = null) => ({
  assignedOwnerId: ownerId || null,
  planDueAt: null,
  planEstimatedProductionMinutes: null,
  assignmentSentAt: null,
  attentionSentAt: null,
  timeToBeginSentAt: null,
  atRiskLastSentAt: null,
  overdueLastSentAt: null,
  lastAlertStage: "",
  lastEvaluatedAt: nowValue || null,
  closedAt: null,
});

const shouldCloseProductionNotifications = ({
  project,
  previousStatus = "",
  state = {},
} = {}) =>
  previousStatus === PENDING_PRODUCTION_STATUS ||
  Boolean(project?.cancellation?.isCancelled) ||
  Boolean(
    toValidDate(state.attentionSentAt) ||
      toValidDate(state.timeToBeginSentAt) ||
      toValidDate(state.atRiskLastSentAt) ||
      toValidDate(state.overdueLastSentAt),
  );

const resolveProductionNotifications = async (
  projectId,
  ownerId,
  nowValue = new Date(),
) => {
  const normalizedProjectId = toId(projectId);
  const normalizedOwnerId = toId(ownerId);
  if (!normalizedProjectId || !normalizedOwnerId) return 0;

  const result = await Notification.updateMany(
    {
      project: normalizedProjectId,
      recipient: normalizedOwnerId,
      source: { $regex: `^${PRODUCTION_NOTIFICATION_SOURCE_PREFIX}:` },
      isRead: false,
    },
    { $set: { isRead: true } },
  );
  const modifiedCount = Number(result?.modifiedCount || 0);
  if (modifiedCount > 0) {
    broadcastNotificationChange({
      path: "/api/notifications",
      method: "PATCH",
      source: "production_notification_service",
      portal: PRODUCTION_NOTIFICATION_SOURCE_PREFIX,
      recipientId: normalizedOwnerId,
      projectId: normalizedProjectId,
      resolvedAt: nowValue,
    });
  }
  return modifiedCount;
};

const notifyProductionOwnership = async (project, nowValue = new Date()) => {
  const ownerId = toId(project?.productionOwnerId);
  if (!project?._id || !ownerId) return null;

  const state = getNotificationState(project);
  if (
    toId(state.assignedOwnerId) === ownerId &&
    toValidDate(state.assignmentSentAt)
  ) {
    return null;
  }

  const reference = getProjectReference(project);
  const name = getProjectName(project);
  const notification = await createNotification(
    ownerId,
    ownerId,
    project._id,
    "ASSIGNMENT",
    "Production ownership assigned",
    `You acknowledged and now own production for #${reference}: ${name}.`,
    {
      allowSelf: true,
      inApp: true,
      email: false,
      push: false,
      source: `${PRODUCTION_NOTIFICATION_SOURCE_PREFIX}:assigned`,
      dedupeKey: `production:${toId(project._id)}:${ownerId}:assigned`,
    },
  );

  if (notification) {
    await Project.updateOne(
      { _id: project._id, productionOwnerId: ownerId },
      {
        $set: {
          "productionTracking.notificationState.assignedOwnerId": ownerId,
          "productionTracking.notificationState.assignmentSentAt": nowValue,
          "productionTracking.notificationState.closedAt": null,
        },
      },
    );
  }
  return notification;
};

const resetPlanNotificationState = async (project, nowValue) => {
  const dueAt = toValidDate(project?.productionTracking?.productionDueAt);
  const estimatedProductionMinutes = getEstimatedProductionMinutes(project);
  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        "productionTracking.notificationState.planDueAt": dueAt,
        "productionTracking.notificationState.planEstimatedProductionMinutes":
          estimatedProductionMinutes,
        "productionTracking.notificationState.attentionSentAt": null,
        "productionTracking.notificationState.timeToBeginSentAt": null,
        "productionTracking.notificationState.atRiskLastSentAt": null,
        "productionTracking.notificationState.overdueLastSentAt": null,
        "productionTracking.notificationState.lastAlertStage": "",
        "productionTracking.notificationState.lastEvaluatedAt": nowValue,
        "productionTracking.notificationState.closedAt": null,
      },
    },
  );
  return {
    ...getNotificationState(project),
    planDueAt: dueAt,
    planEstimatedProductionMinutes: estimatedProductionMinutes,
    attentionSentAt: null,
    timeToBeginSentAt: null,
    atRiskLastSentAt: null,
    overdueLastSentAt: null,
    lastAlertStage: "",
    lastEvaluatedAt: nowValue,
    closedAt: null,
  };
};

const processProductionProjectNotification = async (
  project,
  nowValue = new Date(),
) => {
  const now = toValidDate(nowValue) || new Date();
  const ownerId = toId(project?.productionOwnerId);
  if (
    !project?._id ||
    !ownerId ||
    project.status !== PENDING_PRODUCTION_STATUS ||
    project?.cancellation?.isCancelled
  ) {
    return null;
  }

  await notifyProductionOwnership(project, now);

  let state = getNotificationState(project);
  const currentDueAt = project?.productionTracking?.productionDueAt;
  const currentEstimatedProductionMinutes =
    getEstimatedProductionMinutes(project);
  if (
    !datesMatch(state.planDueAt, currentDueAt) ||
    Number(state.planEstimatedProductionMinutes) !==
      currentEstimatedProductionMinutes
  ) {
    state = await resetPlanNotificationState(project, now);
  }

  const stage = resolveProductionAlertStage(project, now);
  if (!stage || !shouldSendProductionAlert(stage, state, now)) {
    await Project.updateOne(
      { _id: project._id, productionOwnerId: ownerId },
      {
        $set: {
          "productionTracking.notificationState.lastAlertStage": stage,
          "productionTracking.notificationState.lastEvaluatedAt": now,
          "productionTracking.notificationState.closedAt": null,
        },
      },
    );
    return null;
  }

  const alert = buildProductionAlert(project, stage, now);
  if (!alert) return null;
  const notification = await createNotification(
    ownerId,
    ownerId,
    project._id,
    alert.type,
    alert.title,
    alert.message,
    {
      allowSelf: true,
      inApp: true,
      email: false,
      push: false,
      source: alert.source,
      dedupeKey: buildProductionNotificationKey(
        project,
        ownerId,
        stage,
        now,
      ),
    },
  );

  if (!notification) return null;
  const sentField =
    stage === "attention"
      ? "attentionSentAt"
      : stage === "time_to_begin"
        ? "timeToBeginSentAt"
        : stage === "at_risk"
          ? "atRiskLastSentAt"
          : "overdueLastSentAt";
  await Project.updateOne(
    { _id: project._id, productionOwnerId: ownerId },
    {
      $set: {
        [`productionTracking.notificationState.${sentField}`]: now,
        "productionTracking.notificationState.lastAlertStage": stage,
        "productionTracking.notificationState.lastEvaluatedAt": now,
        "productionTracking.notificationState.closedAt": null,
      },
    },
  );
  return notification;
};

const closeProductionNotifications = async (
  project,
  ownerIdValue = null,
  nowValue = new Date(),
) => {
  const ownerId = toId(ownerIdValue || project?.productionOwnerId);
  if (!project?._id || !ownerId) return 0;
  const modifiedCount = await resolveProductionNotifications(
    project._id,
    ownerId,
    nowValue,
  );
  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        "productionTracking.notificationState.lastAlertStage": "",
        "productionTracking.notificationState.lastEvaluatedAt": nowValue,
        "productionTracking.notificationState.closedAt": nowValue,
      },
    },
  );
  return modifiedCount;
};

const syncProductionNotificationsAfterProjectChange = async ({
  project,
  previousStatus = "",
  previousOwnerId = null,
  now: nowValue = new Date(),
} = {}) => {
  if (!project?._id) return null;
  const currentOwnerId = toId(project.productionOwnerId);
  const oldOwnerId = toId(previousOwnerId);
  const ownerChanged = currentOwnerId !== oldOwnerId;

  if (ownerChanged && oldOwnerId) {
    await resolveProductionNotifications(project._id, oldOwnerId, nowValue);
  }

  if (ownerChanged) {
    await Project.updateOne(
      { _id: project._id },
      {
        $set: {
          "productionTracking.notificationState":
            createInitialNotificationState(currentOwnerId, nowValue),
        },
      },
    );
    project.productionTracking = project.productionTracking || {};
    project.productionTracking.notificationState =
      createInitialNotificationState(currentOwnerId, nowValue);
  }

  if (!currentOwnerId) return null;
  await notifyProductionOwnership(project, nowValue);

  if (
    project.status !== PENDING_PRODUCTION_STATUS ||
    project?.cancellation?.isCancelled
  ) {
    const state = getNotificationState(project);
    if (shouldCloseProductionNotifications({ project, previousStatus, state })) {
      return closeProductionNotifications(project, currentOwnerId, nowValue);
    }
    return null;
  }
  return processProductionProjectNotification(project, nowValue);
};

const runProductionNotificationSweep = async (nowValue = new Date()) => {
  const activeProjects = await Project.find({
    status: PENDING_PRODUCTION_STATUS,
    productionOwnerId: { $ne: null },
    "cancellation.isCancelled": { $ne: true },
    isLatestVersion: { $ne: false },
    versionState: { $nin: ["superseded", "archived"] },
  });

  let sentCount = 0;
  for (const project of activeProjects) {
    const notification = await processProductionProjectNotification(
      project,
      nowValue,
    );
    if (notification) sentCount += 1;
  }

  const inactiveProjects = await Project.find({
    productionOwnerId: { $ne: null },
    "productionTracking.notificationState.closedAt": null,
    $and: [
      {
        $or: [
          { status: { $ne: PENDING_PRODUCTION_STATUS } },
          { "cancellation.isCancelled": true },
          { isLatestVersion: false },
          { versionState: { $in: ["superseded", "archived"] } },
        ],
      },
      {
        $or: [
          { "productionTracking.notificationState.attentionSentAt": { $ne: null } },
          { "productionTracking.notificationState.timeToBeginSentAt": { $ne: null } },
          { "productionTracking.notificationState.atRiskLastSentAt": { $ne: null } },
          { "productionTracking.notificationState.overdueLastSentAt": { $ne: null } },
        ],
      },
    ],
  });
  let resolvedCount = 0;
  for (const project of inactiveProjects) {
    resolvedCount += await closeProductionNotifications(
      project,
      project.productionOwnerId,
      nowValue,
    );
  }

  return {
    evaluatedCount: activeProjects.length,
    sentCount,
    resolvedCount,
  };
};

module.exports = {
  AT_RISK_CADENCE_MS,
  OVERDUE_CADENCE_MS,
  PRODUCTION_NOTIFICATION_SOURCE_PREFIX,
  buildProductionAlert,
  buildProductionNotificationKey,
  closeProductionNotifications,
  getLatestProductionStartAt,
  getProductionAlertCadenceMs,
  notifyProductionOwnership,
  processProductionProjectNotification,
  resolveProductionAlertStage,
  runProductionNotificationSweep,
  shouldCloseProductionNotifications,
  shouldSendProductionAlert,
  syncProductionNotificationsAfterProjectChange,
};
