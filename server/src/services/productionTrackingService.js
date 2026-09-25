const Project = require("../models/Project");
const User = require("../models/User");
const {
  calculateProductionTracking,
} = require("../utils/productionDeadline");
const {
  PRODUCTION_SUB_DEPARTMENT_TOKENS,
  normalizeProductionDepartmentToken,
} = require("../utils/productionDepartmentAccess");
const {
  resolveProductionStartedNotifications,
  syncProductionNotificationsAfterProjectChange,
} = require("./productionNotificationService");
const {
  ACTIVE_PRODUCTION_STATUSES,
  PENDING_PRODUCTION_STATUS,
  PRODUCTION_IN_PROGRESS_STATUS,
  isActiveProductionStatus,
} = require("../utils/productionStatus");
const POST_PRODUCTION_STATUSES = new Set([
  "Production Completed",
  "Pending Quality Control",
  "Quality Control Completed",
  "Pending Photography",
  "Photography Completed",
  "Pending Packaging",
  "Packaging Completed",
  "Pending Delivery/Pickup",
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Pending Quote Submission",
  "Quote Submission Completed",
  "Pending Client Decision",
  "Completed",
  "Finished",
]);
const OWNER_BACKFILL_EXCLUDED_STATUSES = [
  "Completed",
  "Finished",
  "Declined",
  "Feedback Completed",
];
let legacyOwnerBackfillComplete = false;
let legacyExecutionStatusBackfillComplete = false;

const toId = (value) => {
  if (!value) return "";
  if (value?._id) return String(value._id);
  return String(value);
};

const calculateActualProductionMinutes = (startedAtValue, completedAtValue) => {
  const startedAt = startedAtValue ? new Date(startedAtValue) : null;
  const completedAt = completedAtValue ? new Date(completedAtValue) : null;
  if (
    !startedAt ||
    !completedAt ||
    Number.isNaN(startedAt.getTime()) ||
    Number.isNaN(completedAt.getTime())
  ) {
    return null;
  }
  return Math.max(
    0,
    Math.round((completedAt.getTime() - startedAt.getTime()) / 60000),
  );
};

const isProductionDepartmentToken = (value) => {
  const token = normalizeProductionDepartmentToken(value);
  return token === "production" || PRODUCTION_SUB_DEPARTMENT_TOKENS.has(token);
};

const resolveAcknowledgedProductionOwnerId = async (project) => {
  const acknowledgements = Array.isArray(project?.acknowledgements)
    ? [...project.acknowledgements].reverse()
    : [];
  for (const acknowledgement of acknowledgements) {
    if (
      !isProductionDepartmentToken(acknowledgement?.department) ||
      !acknowledgement?.user
    ) {
      continue;
    }
    const user = await User.findById(toId(acknowledgement.user))
      .select("department")
      .lean();
    const isProductionUser = (Array.isArray(user?.department)
      ? user.department
      : [user?.department]
    ).some(isProductionDepartmentToken);
    if (isProductionUser) return acknowledgement.user;
  }
  return null;
};

const ensureProductionOwnerFromAcknowledgement = async (projectOrId) => {
  const project =
    typeof projectOrId === "object" && projectOrId?._id
      ? projectOrId
      : await Project.findById(projectOrId).select(
          "productionOwnerId acknowledgements",
        );
  if (!project) return null;
  if (project.productionOwnerId) return project.productionOwnerId;

  const acknowledgedOwnerId =
    await resolveAcknowledgedProductionOwnerId(project);
  if (!acknowledgedOwnerId) return null;

  await Project.updateOne(
    {
      _id: project._id,
      $or: [
        { productionOwnerId: null },
        { productionOwnerId: { $exists: false } },
      ],
    },
    { $set: { productionOwnerId: acknowledgedOwnerId } },
  );
  return acknowledgedOwnerId;
};

const toTrackingPayload = (tracking, existing = {}) => ({
  ...existing,
  ...tracking,
  completedAt: null,
  actualProductionMinutes: null,
});

const comparePlans = (left, right) => {
  const leftInProgress =
    left.project?.status === PRODUCTION_IN_PROGRESS_STATUS ? 0 : 1;
  const rightInProgress =
    right.project?.status === PRODUCTION_IN_PROGRESS_STATUS ? 0 : 1;
  if (leftInProgress !== rightInProgress) return leftInProgress - rightInProgress;

  const leftDue = left.plan.productionDueAt?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
  const rightDue = right.plan.productionDueAt?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;

  const leftStarted = left.plan.startedAt?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
  const rightStarted = right.plan.startedAt?.getTime?.() ?? Number.MAX_SAFE_INTEGER;
  return leftStarted - rightStarted;
};

const recalculateProductionProject = async (projectOrId, nowValue = new Date()) => {
  const project =
    typeof projectOrId === "object" && projectOrId?._id
      ? projectOrId
      : await Project.findById(projectOrId);
  if (!project || !isActiveProductionStatus(project.status)) return null;

  const tracking = calculateProductionTracking(project, {
    now: nowValue,
    predictedStartAt: nowValue,
  });
  const payload = toTrackingPayload(
    tracking,
    project.productionTracking?.toObject?.() || project.productionTracking || {},
  );
  await Project.updateOne(
    { _id: project._id },
    { $set: { productionTracking: payload } },
  );
  return payload;
};

const recalculateProductionQueueForOwner = async (
  ownerId,
  nowValue = new Date(),
) => {
  const normalizedOwnerId = toId(ownerId);
  if (!normalizedOwnerId) return [];

  const projects = await Project.find({
    productionOwnerId: normalizedOwnerId,
    status: { $in: ACTIVE_PRODUCTION_STATUSES },
    "cancellation.isCancelled": { $ne: true },
    isLatestVersion: { $ne: false },
    versionState: { $nin: ["superseded", "archived"] },
  });

  const planned = projects
    .map((project) => ({
      project,
      plan: calculateProductionTracking(project, { now: nowValue }),
    }))
    .sort(comparePlans);

  const parsedNow = new Date(nowValue);
  let queueCursor = Number.isNaN(parsedNow.getTime()) ? new Date() : parsedNow;
  const results = [];
  for (const entry of planned) {
    const startedAt = entry.plan.startedAt;
    const predictedStartAt =
      queueCursor.getTime() > startedAt.getTime() ? queueCursor : startedAt;
    const tracking = calculateProductionTracking(entry.project, {
      now: nowValue,
      predictedStartAt,
    });
    const payload = toTrackingPayload(
      tracking,
      entry.project.productionTracking?.toObject?.() ||
        entry.project.productionTracking ||
        {},
    );

    await Project.updateOne(
      { _id: entry.project._id },
      { $set: { productionTracking: payload } },
    );
    queueCursor = tracking.predictedCompletionAt;
    results.push({ projectId: String(entry.project._id), productionTracking: payload });
  }

  return results;
};

const completeProductionTracking = async (
  project,
  nowValue = new Date(),
  actorId = null,
) => {
  if (!project?._id) return;
  const startedAtValue = project?.productionTracking?.workStartedAt;
  const completedAt = new Date(nowValue);
  const actualProductionMinutes = calculateActualProductionMinutes(
    startedAtValue,
    completedAt,
  );

  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        "productionTracking.completedAt": completedAt,
        "productionTracking.completedBy": actorId || null,
        "productionTracking.actualProductionMinutes": actualProductionMinutes,
        "productionTracking.executionState": "completed",
        "productionTracking.elapsedProductionMinutes":
          actualProductionMinutes || 0,
        "productionTracking.remainingProductionMinutes": 0,
        "productionTracking.riskLevel": "completed",
        "productionTracking.riskReasons": [],
        "productionTracking.lastCalculatedAt": completedAt,
        "productionTracking.completionReview.status": "completed",
        "productionTracking.completionReview.completedAt": completedAt,
        "productionTracking.completionReview.completedBy": actorId || null,
      },
    },
  );
};

const resetInactiveProductionTracking = async (project, nowValue = new Date()) => {
  if (!project?._id) return;
  await Project.updateOne(
    { _id: project._id },
    {
      $set: {
        "productionTracking.completedAt": null,
        "productionTracking.completedBy": null,
        "productionTracking.actualProductionMinutes": null,
        "productionTracking.executionState": "queued",
        "productionTracking.workStartedAt": null,
        "productionTracking.startedBy": null,
        "productionTracking.elapsedProductionMinutes": 0,
        "productionTracking.riskLevel": "not_started",
        "productionTracking.riskReasons": [],
        "productionTracking.lastCalculatedAt": new Date(nowValue),
      },
    },
  );
};

const syncProductionTrackingAfterProjectChange = async ({
  projectId,
  previousStatus = "",
  previousOwnerId = null,
  actorId = null,
  now: nowValue = new Date(),
} = {}) => {
  if (!projectId) return null;
  const project = await Project.findById(projectId);
  if (!project) return null;

  const currentOwnerId = toId(project.productionOwnerId);
  const oldOwnerId = toId(previousOwnerId);
  const enteredProduction =
    isActiveProductionStatus(project.status) &&
    !isActiveProductionStatus(previousStatus);
  const startedProduction =
    project.status === PRODUCTION_IN_PROGRESS_STATUS &&
    previousStatus !== PRODUCTION_IN_PROGRESS_STATUS;
  const leftProduction =
    isActiveProductionStatus(previousStatus) &&
    !isActiveProductionStatus(project.status);

  if (enteredProduction) {
    await Project.updateOne(
      { _id: project._id },
      {
        $set: {
          "productionTracking.startedAt":
            project.statusChangedAt || new Date(nowValue),
          "productionTracking.queuedAt":
            project.statusChangedAt || new Date(nowValue),
          "productionTracking.workStartedAt":
            project.status === PRODUCTION_IN_PROGRESS_STATUS
              ? project.statusChangedAt || new Date(nowValue)
              : null,
          "productionTracking.startedBy":
            project.status === PRODUCTION_IN_PROGRESS_STATUS
              ? actorId || null
              : null,
          "productionTracking.completedAt": null,
          "productionTracking.completedBy": null,
          "productionTracking.actualProductionMinutes": null,
          "productionTracking.executionState":
            project.status === PRODUCTION_IN_PROGRESS_STATUS
              ? "in_progress"
              : "queued",
          "productionTracking.elapsedProductionMinutes": 0,
          "productionTracking.notificationState.leadPromptLastSentAt": null,
          "productionTracking.notificationState.leadPromptedBy": null,
        },
      },
    );
    project.productionTracking = {
      ...(project.productionTracking?.toObject?.() ||
        project.productionTracking ||
        {}),
      startedAt: project.statusChangedAt || new Date(nowValue),
      queuedAt: project.statusChangedAt || new Date(nowValue),
      workStartedAt:
        project.status === PRODUCTION_IN_PROGRESS_STATUS
          ? project.statusChangedAt || new Date(nowValue)
          : null,
      startedBy:
        project.status === PRODUCTION_IN_PROGRESS_STATUS ? actorId || null : null,
      completedAt: null,
      completedBy: null,
      actualProductionMinutes: null,
      executionState:
        project.status === PRODUCTION_IN_PROGRESS_STATUS
          ? "in_progress"
          : "queued",
      elapsedProductionMinutes: 0,
      notificationState: {
        ...(project.productionTracking?.notificationState?.toObject?.() ||
          project.productionTracking?.notificationState ||
          {}),
        leadPromptLastSentAt: null,
        leadPromptedBy: null,
      },
    };
  }

  if (startedProduction && !enteredProduction) {
    const workStartedAt = project.statusChangedAt || new Date(nowValue);
    await Project.updateOne(
      { _id: project._id, status: PRODUCTION_IN_PROGRESS_STATUS },
      {
        $set: {
          "productionTracking.executionState": "in_progress",
          "productionTracking.workStartedAt": workStartedAt,
          "productionTracking.startedBy": actorId || null,
          "productionTracking.completedAt": null,
          "productionTracking.completedBy": null,
          "productionTracking.actualProductionMinutes": null,
          "productionTracking.elapsedProductionMinutes": 0,
          "productionTracking.completionReview": {},
        },
      },
    );
    project.productionTracking = {
      ...(project.productionTracking?.toObject?.() ||
        project.productionTracking ||
        {}),
      executionState: "in_progress",
      workStartedAt,
      startedBy: actorId || null,
      completedAt: null,
      completedBy: null,
      actualProductionMinutes: null,
      elapsedProductionMinutes: 0,
    };
  }

  if (leftProduction) {
    if (POST_PRODUCTION_STATUSES.has(project.status)) {
      await completeProductionTracking(project, nowValue, actorId);
    } else {
      await resetInactiveProductionTracking(project, nowValue);
    }
  }

  const ownersToRefresh = new Set([oldOwnerId, currentOwnerId].filter(Boolean));
  for (const ownerId of ownersToRefresh) {
    await recalculateProductionQueueForOwner(ownerId, nowValue);
  }

  if (isActiveProductionStatus(project.status) && !currentOwnerId) {
    await recalculateProductionProject(project, nowValue);
  }

  const refreshedProject = await Project.findById(project._id);
  if (refreshedProject) {
    await syncProductionNotificationsAfterProjectChange({
      project: refreshedProject,
      previousStatus,
      previousOwnerId,
      now: nowValue,
    });
  }

  return Project.findById(project._id);
};

const startProductionTracking = async ({
  projectId,
  actorId,
  now: nowValue = new Date(),
} = {}) => {
  if (!projectId || !actorId) return null;
  const project = await Project.findById(projectId);
  if (!project || !isActiveProductionStatus(project.status)) return null;

  const state = String(
    project?.productionTracking?.executionState || "queued",
  );
  if (project.status === PENDING_PRODUCTION_STATUS) {
    project.status = PRODUCTION_IN_PROGRESS_STATUS;
    await project.save();
  }

  if (state !== "in_progress") {
    const startedAt = new Date(nowValue);
    await Project.updateOne(
      { _id: project._id, status: PRODUCTION_IN_PROGRESS_STATUS },
      {
        $set: {
          "productionTracking.executionState": "in_progress",
          "productionTracking.queuedAt":
            project?.productionTracking?.queuedAt ||
            project?.productionTracking?.startedAt ||
            project.statusChangedAt ||
            startedAt,
          "productionTracking.workStartedAt": startedAt,
          "productionTracking.startedBy": actorId,
          "productionTracking.completedAt": null,
          "productionTracking.completedBy": null,
          "productionTracking.actualProductionMinutes": null,
          "productionTracking.elapsedProductionMinutes": 0,
          "productionTracking.completionReview": {},
        },
      },
    );
  }

  if (project.productionOwnerId) {
    await resolveProductionStartedNotifications(
      project._id,
      project.productionOwnerId,
      nowValue,
    );
    await recalculateProductionQueueForOwner(
      project.productionOwnerId,
      nowValue,
    );
  } else {
    await recalculateProductionProject(project._id, nowValue);
  }

  return Project.findById(project._id);
};

const recalculateAllPendingProduction = async (nowValue = new Date()) => {
  // Preserve jobs started before Production In Progress became an official
  // project status.
  if (!legacyExecutionStatusBackfillComplete) {
    const legacyStartedProjects = await Project.find({
      status: PENDING_PRODUCTION_STATUS,
      "productionTracking.executionState": "in_progress",
      "cancellation.isCancelled": { $ne: true },
      isLatestVersion: { $ne: false },
      versionState: { $nin: ["superseded", "archived"] },
    });
    for (const project of legacyStartedProjects) {
      project.status = PRODUCTION_IN_PROGRESS_STATUS;
      await project.save();
    }
    legacyExecutionStatusBackfillComplete = true;
  }

  const activeQuery = {
    status: { $in: ACTIVE_PRODUCTION_STATUSES },
    "cancellation.isCancelled": { $ne: true },
    isLatestVersion: { $ne: false },
    versionState: { $nin: ["superseded", "archived"] },
  };

  // One-time startup backfill for active projects acknowledged before
  // automatic Production ownership was introduced.
  if (!legacyOwnerBackfillComplete) {
    const ownerlessAcknowledgedProjects = await Project.find({
      status: { $nin: OWNER_BACKFILL_EXCLUDED_STATUSES },
      "cancellation.isCancelled": { $ne: true },
      isLatestVersion: { $ne: false },
      versionState: { $nin: ["superseded", "archived"] },
      $or: [
        { productionOwnerId: null },
        { productionOwnerId: { $exists: false } },
      ],
      "acknowledgements.0": { $exists: true },
    }).select("acknowledgements");
    for (const project of ownerlessAcknowledgedProjects) {
      const acknowledgedOwnerId =
        await resolveAcknowledgedProductionOwnerId(project);
      if (acknowledgedOwnerId) {
        await Project.updateOne(
          { _id: project._id },
          { $set: { productionOwnerId: acknowledgedOwnerId } },
        );
      }
    }
    legacyOwnerBackfillComplete = true;
  }

  const ownerIds = await Project.distinct("productionOwnerId", {
    ...activeQuery,
    productionOwnerId: { $ne: null },
  });

  let recalculatedCount = 0;
  for (const ownerId of ownerIds) {
    const results = await recalculateProductionQueueForOwner(ownerId, nowValue);
    recalculatedCount += results.length;
  }

  const unassignedProjects = await Project.find({
    ...activeQuery,
    $or: [
      { productionOwnerId: null },
      { productionOwnerId: { $exists: false } },
    ],
  });
  for (const project of unassignedProjects) {
    const result = await recalculateProductionProject(project, nowValue);
    if (result) recalculatedCount += 1;
  }

  return { recalculatedCount };
};

module.exports = {
  PENDING_PRODUCTION_STATUS,
  PRODUCTION_IN_PROGRESS_STATUS,
  calculateActualProductionMinutes,
  ensureProductionOwnerFromAcknowledgement,
  recalculateAllPendingProduction,
  recalculateProductionProject,
  recalculateProductionQueueForOwner,
  startProductionTracking,
  syncProductionTrackingAfterProjectChange,
};
