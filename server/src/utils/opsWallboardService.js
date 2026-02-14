const ActivityLog = require("../models/ActivityLog");
const Project = require("../models/Project");

const HOUR_MS = 60 * 60 * 1000;

const CLOSED_STATUS_LIST = [
  "Completed",
  "Delivered",
  "Feedback Completed",
  "Finished",
  "Response Sent",
];
const CLOSED_STATUS_SET = new Set(CLOSED_STATUS_LIST);

const PENDING_APPROVAL_STATUSES = new Set([
  "Pending Approval",
  "Pending Scope Approval",
  "Pending Quote Request",
  "Pending Send Response",
]);

const PIPELINE_GROUPS = [
  {
    key: "incoming",
    label: "Incoming",
    statuses: new Set([
      "Draft",
      "New Order",
      "Order Confirmed",
      "Pending Approval",
      "Pending Scope Approval",
      "Scope Approval Completed",
      "Pending Quote Request",
      "Quote Request Completed",
      "Pending Send Response",
    ]),
  },
  {
    key: "design",
    label: "Design + Mockup",
    statuses: new Set(["Pending Mockup", "Mockup Completed"]),
  },
  {
    key: "production",
    label: "Production",
    statuses: new Set(["Pending Production", "Production Completed"]),
  },
  {
    key: "finishing",
    label: "Packaging",
    statuses: new Set(["Pending Packaging", "Packaging Completed"]),
  },
  {
    key: "delivery",
    label: "Delivery + Feedback",
    statuses: new Set(["Pending Delivery/Pickup", "Pending Feedback"]),
  },
  {
    key: "execution",
    label: "Execution",
    statuses: new Set(["In Progress"]),
  },
  {
    key: "on_hold",
    label: "On Hold",
    statuses: new Set(["On Hold"]),
  },
  {
    key: "done",
    label: "Done",
    statuses: new Set(CLOSED_STATUS_LIST),
  },
];

const ACTION_LABELS = {
  create: "Project Created",
  update: "Project Updated",
  status_change: "Status Changed",
  challenge_add: "Challenge Raised",
  challenge_update: "Challenge Updated",
  challenge_delete: "Challenge Removed",
  risk_add: "Risk Added",
  risk_update: "Risk Updated",
  item_add: "Item Added",
  item_update: "Item Updated",
  item_delete: "Item Removed",
  approval: "Approval",
  system: "System Update",
  engagement_acknowledge: "Department Acknowledged",
  engagement_unacknowledge: "Acknowledgement Removed",
  mockup_upload: "Mockup Uploaded",
};

const clampNumber = (value, digits = 0) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

const parseClockTime = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const twentyFourHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHourMatch) {
    const hours = Number(twentyFourHourMatch[1]);
    const minutes = Number(twentyFourHourMatch[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
    return null;
  }

  const twelveHourMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!twelveHourMatch) return null;

  const hourValue = Number(twelveHourMatch[1]);
  const minutes = Number(twelveHourMatch[2]);
  const meridian = twelveHourMatch[3].toUpperCase();

  if (hourValue < 1 || hourValue > 12 || minutes < 0 || minutes > 59) {
    return null;
  }

  const hours = meridian === "PM" && hourValue !== 12
    ? hourValue + 12
    : meridian === "AM" && hourValue === 12
      ? 0
      : hourValue;

  return { hours, minutes };
};

const resolveDeadlineAt = (deliveryDateValue, deliveryTimeValue) => {
  if (!deliveryDateValue) return null;

  const baseDate = new Date(deliveryDateValue);
  if (Number.isNaN(baseDate.getTime())) return null;

  const parsedTime = parseClockTime(deliveryTimeValue);
  if (!parsedTime) return baseDate;

  const deadlineAt = new Date(baseDate);
  deadlineAt.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
  return deadlineAt;
};

const isClosedStatus = (status) => CLOSED_STATUS_SET.has(status);

const getMapValue = (source, key) => {
  if (!source) return undefined;
  if (source instanceof Map) return source.get(key);
  if (typeof source === "object") return source[key];
  return undefined;
};

const getStatusChangeTarget = (details) => {
  const statusChange = getMapValue(details, "statusChange");
  return getMapValue(statusChange, "to") || null;
};

const toUserName = (user) => {
  if (!user) return "Unassigned";
  const first = typeof user.firstName === "string" ? user.firstName.trim() : "";
  const last = typeof user.lastName === "string" ? user.lastName.trim() : "";
  const fullName = `${first} ${last}`.trim();
  if (fullName) return fullName;
  if (typeof user.employeeId === "string" && user.employeeId.trim()) {
    return user.employeeId.trim();
  }
  return "Unnamed User";
};

const buildHourlyOrderTrend = (projects, now, hours = 12) => {
  const start = new Date(now.getTime() - (hours - 1) * HOUR_MS);
  start.setMinutes(0, 0, 0);

  const buckets = Array.from({ length: hours }, (_, index) => {
    const bucketStart = new Date(start.getTime() + index * HOUR_MS);
    const label = `${bucketStart.getHours().toString().padStart(2, "0")}:00`;
    return {
      index,
      bucketStart,
      label,
      count: 0,
    };
  });

  const rangeStart = buckets[0].bucketStart.getTime();
  const rangeEnd = buckets[buckets.length - 1].bucketStart.getTime() + HOUR_MS;

  projects.forEach((project) => {
    const createdAt = new Date(project.createdAt).getTime();
    if (!Number.isFinite(createdAt) || createdAt < rangeStart || createdAt >= rangeEnd) {
      return;
    }
    const bucketIndex = Math.floor((createdAt - rangeStart) / HOUR_MS);
    if (bucketIndex >= 0 && bucketIndex < buckets.length) {
      buckets[bucketIndex].count += 1;
    }
  });

  return buckets.map((bucket) => ({
    label: bucket.label,
    count: bucket.count,
  }));
};

const mapStatusToPipeline = (status) => {
  if (!status) return "execution";

  for (const group of PIPELINE_GROUPS) {
    if (group.statuses.has(status)) {
      return group.key;
    }
  }
  return isClosedStatus(status) ? "done" : "execution";
};

const getEventSeverity = (log) => {
  const action = log?.action;
  const statusTo = getStatusChangeTarget(log?.details);

  if (action === "status_change" && statusTo === "On Hold") return "critical";
  if (action === "status_change" && statusTo && CLOSED_STATUS_SET.has(statusTo)) {
    return "positive";
  }
  if (action === "challenge_add" || action === "challenge_update") return "high";
  if (action === "system") return "medium";
  if (action === "create" || action === "approval") return "positive";
  return "info";
};

const CAPACITY_UNITS = 7;

const getLoadStatus = (utilizationPercent) => {
  if (utilizationPercent >= 130) return "overloaded";
  if (utilizationPercent >= 100) return "high";
  if (utilizationPercent >= 70) return "balanced";
  return "light";
};

const getOpsWallboardOverview = async () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - HOUR_MS);
  const twelveHoursAgo = new Date(now.getTime() - 12 * HOUR_MS);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [
    openProjects,
    statusCounts,
    recentProjects,
    recentActivity,
    totalProjects,
    newOrdersLastHour,
    newOrdersToday,
    completedToday,
  ] = await Promise.all([
    Project.find({ status: { $nin: CLOSED_STATUS_LIST } })
      .select(
        [
          "orderId",
          "status",
          "priority",
          "hold",
          "details.projectName",
          "details.client",
          "details.deliveryDate",
          "details.deliveryTime",
          "projectLeadId",
          "assistantLeadId",
          "createdAt",
        ].join(" "),
      )
      .populate("projectLeadId", "firstName lastName employeeId")
      .populate("assistantLeadId", "firstName lastName employeeId")
      .lean(),
    Project.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Project.find({ createdAt: { $gte: twelveHoursAgo } })
      .select("createdAt")
      .lean(),
    ActivityLog.find({})
      .select("action description details createdAt project user")
      .sort({ createdAt: -1 })
      .limit(40)
      .populate("user", "firstName lastName")
      .populate("project", "orderId details.projectName status")
      .lean(),
    Project.countDocuments(),
    Project.countDocuments({ createdAt: { $gte: oneHourAgo } }),
    Project.countDocuments({ createdAt: { $gte: startOfDay } }),
    Project.countDocuments({
      status: { $in: CLOSED_STATUS_LIST },
      updatedAt: { $gte: startOfDay },
    }),
  ]);

  const pipelineCounts = Object.fromEntries(
    PIPELINE_GROUPS.map((group) => [group.key, 0]),
  );
  statusCounts.forEach((entry) => {
    const status = entry?._id;
    const count = Number(entry?.count || 0);
    const pipelineKey = mapStatusToPipeline(status);
    pipelineCounts[pipelineKey] = (pipelineCounts[pipelineKey] || 0) + count;
  });

  let overdueCount = 0;
  let deadlineWarningCount = 0;
  let blockedCount = 0;
  let urgentCount = 0;
  let pendingApprovalCount = 0;
  let unassignedCount = 0;

  const deadlines = [];
  const workloadMap = new Map();

  const pushWorkload = (user, loadMeta) => {
    if (!user?._id) return;
    const userId = user._id.toString();
    if (!workloadMap.has(userId)) {
      workloadMap.set(userId, {
        userId,
        name: toUserName(user),
        projects: 0,
        weightedLoad: 0,
        urgentProjects: 0,
        overdueProjects: 0,
        deadlineWarningProjects: 0,
      });
    }

    const entry = workloadMap.get(userId);
    entry.projects += 1;
    entry.weightedLoad += loadMeta.weight;
    if (loadMeta.isUrgent) entry.urgentProjects += 1;
    if (loadMeta.isOverdue) entry.overdueProjects += 1;
    if (loadMeta.isDeadlineWarning) entry.deadlineWarningProjects += 1;
  };

  openProjects.forEach((project) => {
    const status = project.status || "";
    const priority = project.priority || "Normal";
    const isBlocked = Boolean(project?.hold?.isOnHold) || status === "On Hold";
    const isUrgent = priority === "Urgent";
    const dueDateRaw = project?.details?.deliveryDate;
    const dueTimeRaw = project?.details?.deliveryTime;
    const deadlineAt = resolveDeadlineAt(dueDateRaw, dueTimeRaw);
    const hoursRemaining = deadlineAt
      ? (deadlineAt.getTime() - now.getTime()) / HOUR_MS
      : null;

    const isOverdue = Number.isFinite(hoursRemaining) && hoursRemaining < 0;
    const isDeadlineWarning =
      Number.isFinite(hoursRemaining) && hoursRemaining >= 0 && hoursRemaining <= 72;

    if (isBlocked) blockedCount += 1;
    if (isUrgent) urgentCount += 1;
    if (PENDING_APPROVAL_STATUSES.has(status)) pendingApprovalCount += 1;
    if (isOverdue) overdueCount += 1;
    if (isDeadlineWarning) deadlineWarningCount += 1;

    const hasLead = Boolean(project?.projectLeadId?._id);
    const hasAssistant = Boolean(project?.assistantLeadId?._id);
    if (!hasLead && !hasAssistant) {
      unassignedCount += 1;
    }

    if (deadlineAt) {
      deadlines.push({
        id: project._id.toString(),
        orderId: project.orderId || project._id.toString().slice(-6).toUpperCase(),
        projectName: project?.details?.projectName || "Untitled Project",
        client: project?.details?.client || "Unknown Client",
        status,
        priority,
        dueAt: deadlineAt.toISOString(),
        deliveryTime: typeof dueTimeRaw === "string" ? dueTimeRaw.trim() : "",
        hoursRemaining: clampNumber(hoursRemaining, 1),
        lead: hasLead
          ? toUserName(project.projectLeadId)
          : hasAssistant
            ? toUserName(project.assistantLeadId)
            : "Unassigned",
      });
    }

    const weight = isUrgent ? 1.8 : 1;
    const participants = new Map();
    if (hasLead) participants.set(project.projectLeadId._id.toString(), project.projectLeadId);
    if (hasAssistant) {
      participants.set(
        project.assistantLeadId._id.toString(),
        project.assistantLeadId,
      );
    }
    participants.forEach((user) => {
      pushWorkload(user, {
        weight,
        isUrgent,
        isOverdue,
        isDeadlineWarning,
      });
    });
  });

  const workload = Array.from(workloadMap.values())
    .map((entry) => {
      const utilizationPercent = clampNumber(
        (entry.weightedLoad / CAPACITY_UNITS) * 100,
        0,
      );

      return {
        ...entry,
        weightedLoad: clampNumber(entry.weightedLoad, 1),
        utilizationPercent,
        loadStatus: getLoadStatus(utilizationPercent),
      };
    })
    .sort((a, b) => b.utilizationPercent - a.utilizationPercent);

  const overloadedUsers = workload.filter(
    (entry) => entry.loadStatus === "overloaded" || entry.loadStatus === "high",
  ).length;

  const teamUtilizationPercent =
    workload.length > 0
      ? clampNumber(
          workload.reduce((sum, entry) => sum + entry.utilizationPercent, 0) /
            workload.length,
          1,
        )
      : 0;

  const alerts = [];
  if (overdueCount > 0) {
    alerts.push({
      id: "overdue",
      severity: "critical",
      title: `${overdueCount} overdue project${overdueCount === 1 ? "" : "s"}`,
      message: "Delivery commitment has passed and requires escalation now.",
    });
  }
  if (overloadedUsers > 0) {
    alerts.push({
      id: "overloaded",
      severity: "high",
      title: `${overloadedUsers} team member${overloadedUsers === 1 ? "" : "s"} over capacity`,
      message: "Rebalance assignments to reduce burnout and SLA risk.",
    });
  }
  if (blockedCount > 0) {
    alerts.push({
      id: "blocked",
      severity: "high",
      title: `${blockedCount} project${blockedCount === 1 ? "" : "s"} on hold`,
      message: "Resolve blockers to protect downstream deadlines.",
    });
  }
  if (pendingApprovalCount > 0) {
    alerts.push({
      id: "approvals",
      severity: "medium",
      title: `${pendingApprovalCount} approval pending`,
      message: "Decision bottlenecks are slowing order progression.",
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      id: "stable",
      severity: "low",
      title: "No major operational risks right now",
      message: "System flow is stable across orders, deadlines, and team load.",
    });
  }

  const recentEvents = recentActivity.slice(0, 25).map((log) => {
    const project = log?.project;
    const user = log?.user;
    return {
      id: log._id.toString(),
      timestamp: log.createdAt,
      severity: getEventSeverity(log),
      action: log.action,
      title: ACTION_LABELS[log.action] || "System Activity",
      message: log.description || "Activity recorded.",
      projectId: project?._id?.toString() || null,
      orderId: project?.orderId || null,
      projectName: project?.details?.projectName || null,
      userName: toUserName(user),
    };
  });

  const openProjectCount = openProjects.length;
  const closedProjectCount = Math.max(totalProjects - openProjectCount, 0);

  return {
    generatedAt: now.toISOString(),
    summary: {
      totalProjects,
      openProjects: openProjectCount,
      closedProjects: closedProjectCount,
      newOrdersLastHour,
      newOrdersToday,
      completedToday,
      approachingDeadlines72h: deadlineWarningCount,
      overdueProjects: overdueCount,
      blockedProjects: blockedCount,
      urgentProjects: urgentCount,
      pendingApprovals: pendingApprovalCount,
      unassignedProjects: unassignedCount,
      activeContributors: workload.length,
      teamUtilizationPercent,
    },
    orderTrend12h: buildHourlyOrderTrend(recentProjects, now, 12),
    pipeline: PIPELINE_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      count: pipelineCounts[group.key] || 0,
    })),
    alerts,
    deadlines: deadlines
      .sort((a, b) => a.hoursRemaining - b.hoursRemaining)
      .slice(0, 14),
    workload: workload.slice(0, 14),
    events: recentEvents,
  };
};

module.exports = {
  CLOSED_STATUS_LIST,
  getOpsWallboardOverview,
};
