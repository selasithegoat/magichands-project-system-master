const ActivityLog = require("../models/ActivityLog");
const Project = require("../models/Project");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
  "Pending Departmental Engagement",
  "Pending Proof Reading",
  "Pending Quality Control",
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
      "Pending Departmental Engagement",
      "Departmental Engagement Completed",
      "Pending Quote Request",
      "Quote Request Completed",
      "Pending Send Response",
    ]),
  },
  {
    key: "design",
    label: "Design + Mockup",
    statuses: new Set([
      "Pending Mockup",
      "Mockup Completed",
      "Pending Proof Reading",
      "Proof Reading Completed",
    ]),
  },
  {
    key: "production",
    label: "Production",
    statuses: new Set([
      "Pending Production",
      "Production Completed",
      "Pending Quality Control",
      "Quality Control Completed",
    ]),
  },
  {
    key: "finishing",
    label: "Packaging",
    statuses: new Set([
      "Pending Photography",
      "Photography Completed",
      "Pending Packaging",
      "Packaging Completed",
    ]),
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

const toOrderLabel = (project = {}) =>
  project.orderId || project?._id?.toString()?.slice(-6)?.toUpperCase() || "Unknown";

const toProjectLabel = (project = {}) => project?.details?.projectName || "Untitled Project";

const getOwnerLabel = (snapshot) => {
  if (snapshot?.lead) return snapshot.lead;
  if (snapshot?.assistant) return snapshot.assistant;
  return "Unassigned";
};

const buildIncomingLoadForecast = (orderTrend = [], now, horizonHours = 6) => {
  if (!Array.isArray(orderTrend) || orderTrend.length === 0) {
    return Array.from({ length: horizonHours }, (_, index) => {
      const pointAt = new Date(now.getTime() + (index + 1) * HOUR_MS);
      return {
        label: `${pointAt.getHours().toString().padStart(2, "0")}:00`,
        expectedOrders: 0,
      };
    });
  }

  const last6 = orderTrend.slice(-6).map((entry) => Number(entry?.count || 0));
  const firstHalf = last6.slice(0, Math.max(Math.floor(last6.length / 2), 1));
  const secondHalf = last6.slice(Math.floor(last6.length / 2));
  const average = last6.reduce((sum, count) => sum + count, 0) / last6.length;
  const firstAverage =
    firstHalf.reduce((sum, count) => sum + count, 0) / Math.max(firstHalf.length, 1);
  const secondAverage =
    secondHalf.reduce((sum, count) => sum + count, 0) / Math.max(secondHalf.length, 1);
  const momentum = secondAverage - firstAverage;

  return Array.from({ length: horizonHours }, (_, index) => {
    const pointAt = new Date(now.getTime() + (index + 1) * HOUR_MS);
    const drift = momentum * ((index + 1) / Math.max(horizonHours, 1));
    const expectedOrders = Math.max(0, Math.round(average + drift));
    return {
      label: `${pointAt.getHours().toString().padStart(2, "0")}:00`,
      expectedOrders,
    };
  });
};

const severityRank = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const getOpsWallboardOverview = async () => {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - HOUR_MS);
  const twelveHoursAgo = new Date(now.getTime() - 12 * HOUR_MS);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
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
    closedProjectsLast7Days,
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
    Project.find({
      status: { $in: CLOSED_STATUS_LIST },
      updatedAt: { $gte: sevenDaysAgo },
    })
      .select(
        [
          "orderId",
          "status",
          "updatedAt",
          "details.projectName",
          "details.deliveryDate",
          "details.deliveryTime",
        ].join(" "),
      )
      .lean(),
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

  const pipelineLabelMap = Object.fromEntries(
    PIPELINE_GROUPS.map((group) => [group.key, group.label]),
  );
  const flowMap = new Map(
    PIPELINE_GROUPS.map((group) => [
      group.key,
      {
        key: group.key,
        label: group.label,
        count: 0,
        totalAgeHours: 0,
        maxAgeHours: 0,
        stuck48hCount: 0,
      },
    ]),
  );

  const projectSnapshots = [];
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
    const isPendingApproval = PENDING_APPROVAL_STATUSES.has(status);
    const dueDateRaw = project?.details?.deliveryDate;
    const dueTimeRaw = project?.details?.deliveryTime;
    const deadlineAt = resolveDeadlineAt(dueDateRaw, dueTimeRaw);
    const hoursRemaining = deadlineAt
      ? (deadlineAt.getTime() - now.getTime()) / HOUR_MS
      : null;
    const createdAt = project?.createdAt ? new Date(project.createdAt) : null;
    const ageHours =
      createdAt && !Number.isNaN(createdAt.getTime())
        ? Math.max(0, (now.getTime() - createdAt.getTime()) / HOUR_MS)
        : 0;
    const pipelineKey = mapStatusToPipeline(status);

    const isOverdue = Number.isFinite(hoursRemaining) && hoursRemaining < 0;
    const isDeadlineWarning =
      Number.isFinite(hoursRemaining) && hoursRemaining >= 0 && hoursRemaining <= 72;

    if (isBlocked) blockedCount += 1;
    if (isUrgent) urgentCount += 1;
    if (isPendingApproval) pendingApprovalCount += 1;
    if (isOverdue) overdueCount += 1;
    if (isDeadlineWarning) deadlineWarningCount += 1;

    const hasLead = Boolean(project?.projectLeadId?._id);
    const hasAssistant = Boolean(project?.assistantLeadId?._id);
    const leadId = hasLead ? project.projectLeadId._id.toString() : null;
    const assistantId = hasAssistant ? project.assistantLeadId._id.toString() : null;
    const leadName = hasLead ? toUserName(project.projectLeadId) : "";
    const assistantName = hasAssistant ? toUserName(project.assistantLeadId) : "";
    const owner = leadName || assistantName || "Unassigned";
    if (!hasLead && !hasAssistant) {
      unassignedCount += 1;
    }

    const flowEntry = flowMap.get(pipelineKey);
    if (flowEntry) {
      flowEntry.count += 1;
      flowEntry.totalAgeHours += ageHours;
      flowEntry.maxAgeHours = Math.max(flowEntry.maxAgeHours, ageHours);
      if (ageHours >= 48) flowEntry.stuck48hCount += 1;
    }

    projectSnapshots.push({
      id: project._id.toString(),
      orderId: toOrderLabel(project),
      projectName: toProjectLabel(project),
      status,
      priority,
      pipelineKey,
      pipelineLabel: pipelineLabelMap[pipelineKey] || pipelineKey,
      ageHours: clampNumber(ageHours, 1),
      dueAt: deadlineAt ? deadlineAt.toISOString() : null,
      deliveryTime: typeof dueTimeRaw === "string" ? dueTimeRaw.trim() : "",
      hoursRemaining: Number.isFinite(hoursRemaining) ? clampNumber(hoursRemaining, 1) : null,
      isBlocked,
      isUrgent,
      isPendingApproval,
      isOverdue,
      hasLead,
      hasAssistant,
      leadId,
      assistantId,
      lead: leadName,
      assistant: assistantName,
      owner,
    });

    if (deadlineAt) {
      deadlines.push({
        id: project._id.toString(),
        orderId: toOrderLabel(project),
        projectName: toProjectLabel(project),
        client: project?.details?.client || "Unknown Client",
        status,
        priority,
        dueAt: deadlineAt.toISOString(),
        deliveryTime: typeof dueTimeRaw === "string" ? dueTimeRaw.trim() : "",
        hoursRemaining: clampNumber(hoursRemaining, 1),
        lead: owner,
      });
    }

    const weight = isUrgent ? 1.8 : 1;
    const participants = new Map();
    if (hasLead) participants.set(leadId, project.projectLeadId);
    if (hasAssistant) {
      participants.set(assistantId, project.assistantLeadId);
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

  const overloadedUserIds = new Set(
    workload
      .filter(
        (entry) => entry.loadStatus === "overloaded" || entry.loadStatus === "high",
      )
      .map((entry) => entry.userId),
  );

  const stageBottlenecks = PIPELINE_GROUPS.map((group) => {
    const entry = flowMap.get(group.key) || {
      key: group.key,
      label: group.label,
      count: 0,
      totalAgeHours: 0,
      maxAgeHours: 0,
      stuck48hCount: 0,
    };

    const averageAgeHours =
      entry.count > 0 ? clampNumber(entry.totalAgeHours / entry.count, 1) : 0;

    return {
      key: entry.key,
      label: entry.label,
      count: entry.count,
      averageAgeHours,
      maxAgeHours: clampNumber(entry.maxAgeHours, 1),
      stuck48hCount: entry.stuck48hCount,
      intensity:
        entry.count > 0
          ? clampNumber((entry.count / Math.max(openProjects.length, 1)) * 100, 1)
          : 0,
    };
  });

  const stalledProjectsAll = projectSnapshots
    .filter((snapshot) => snapshot.ageHours >= 48)
    .sort((a, b) => b.ageHours - a.ageHours);
  const stalledProjects = stalledProjectsAll
    .slice(0, 12)
    .map((snapshot) => ({
      id: snapshot.id,
      orderId: snapshot.orderId,
      projectName: snapshot.projectName,
      status: snapshot.status,
      pipelineLabel: snapshot.pipelineLabel,
      ageHours: snapshot.ageHours,
      owner: getOwnerLabel(snapshot),
    }));

  const handoffGapsAll = projectSnapshots
    .filter((snapshot) => !snapshot.hasLead || !snapshot.hasAssistant)
    .map((snapshot) => ({
      id: snapshot.id,
      orderId: snapshot.orderId,
      projectName: snapshot.projectName,
      status: snapshot.status,
      lead: snapshot.lead || "--",
      assistant: snapshot.assistant || "--",
      gapType: !snapshot.hasLead && !snapshot.hasAssistant
        ? "No lead or assistant"
        : !snapshot.hasLead
          ? "Lead missing"
          : "Assistant missing",
      hoursRemaining: snapshot.hoursRemaining,
    }));
  const handoffGaps = handoffGapsAll
    .slice(0, 12);

  const atRiskProjects = projectSnapshots
    .filter(
      (snapshot) =>
        Number.isFinite(snapshot.hoursRemaining) &&
        snapshot.hoursRemaining >= 0 &&
        snapshot.hoursRemaining <= 72,
    )
    .map((snapshot) => {
      const reasons = [];
      const ownerOverCapacity =
        (snapshot.leadId && overloadedUserIds.has(snapshot.leadId)) ||
        (snapshot.assistantId && overloadedUserIds.has(snapshot.assistantId));

      if (snapshot.hoursRemaining <= 24) reasons.push("Due within 24h");
      if (snapshot.isBlocked) reasons.push("Currently blocked/on hold");
      if (snapshot.isPendingApproval) reasons.push("Pending approval decision");
      if (!snapshot.hasLead) reasons.push("No lead assigned");
      if (ownerOverCapacity) reasons.push("Owner over capacity");

      const riskScore =
        reasons.length +
        (snapshot.hoursRemaining <= 12 ? 2 : 0) +
        (snapshot.hoursRemaining <= 24 ? 1 : 0);

      return {
        id: snapshot.id,
        orderId: snapshot.orderId,
        projectName: snapshot.projectName,
        status: snapshot.status,
        dueAt: snapshot.dueAt,
        deliveryTime: snapshot.deliveryTime,
        hoursRemaining: snapshot.hoursRemaining,
        owner: getOwnerLabel(snapshot),
        reasons,
        riskScore,
      };
    })
    .filter(
      (item) =>
        item.reasons.length >= 2 ||
        (item.hoursRemaining <= 24 && item.reasons.length >= 1),
    )
    .sort((a, b) => {
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      return (a.hoursRemaining || 0) - (b.hoursRemaining || 0);
    });

  const predictedMisses24h = atRiskProjects.filter(
    (item) => item.hoursRemaining <= 24,
  ).length;
  const predictedMisses72h = atRiskProjects.length;

  const orderTrend12h = buildHourlyOrderTrend(recentProjects, now, 12);
  const incomingLoadForecast = buildIncomingLoadForecast(orderTrend12h, now, 6);

  const slaSeed = {
    today: { total: 0, onTime: 0 },
    sevenDays: { total: 0, onTime: 0 },
  };

  closedProjectsLast7Days.forEach((project) => {
    const completedAt = project?.updatedAt ? new Date(project.updatedAt) : null;
    if (!completedAt || Number.isNaN(completedAt.getTime())) return;

    const dueAt = resolveDeadlineAt(
      project?.details?.deliveryDate,
      project?.details?.deliveryTime,
    );
    if (!dueAt || Number.isNaN(dueAt.getTime())) return;

    const onTime = completedAt.getTime() <= dueAt.getTime();

    slaSeed.sevenDays.total += 1;
    if (onTime) slaSeed.sevenDays.onTime += 1;

    if (completedAt >= startOfDay) {
      slaSeed.today.total += 1;
      if (onTime) slaSeed.today.onTime += 1;
    }
  });

  const onTimeRateToday =
    slaSeed.today.total > 0
      ? clampNumber((slaSeed.today.onTime / slaSeed.today.total) * 100, 1)
      : 0;
  const onTimeRate7d =
    slaSeed.sevenDays.total > 0
      ? clampNumber((slaSeed.sevenDays.onTime / slaSeed.sevenDays.total) * 100, 1)
      : 0;

  const majorStatusChanges30m = recentActivity
    .filter((log) => {
      const changedAt = log?.createdAt ? new Date(log.createdAt) : null;
      return (
        log?.action === "status_change" &&
        changedAt &&
        !Number.isNaN(changedAt.getTime()) &&
        changedAt >= thirtyMinutesAgo
      );
    })
    .slice(0, 14)
    .map((log) => {
      const statusChange = getMapValue(log?.details, "statusChange");
      const project = log?.project;
      return {
        id: log._id.toString(),
        timestamp: log.createdAt,
        orderId: project?.orderId || null,
        projectName: project?.details?.projectName || null,
        fromStatus: getMapValue(statusChange, "from") || "--",
        toStatus: getMapValue(statusChange, "to") || "--",
        userName: toUserName(log?.user),
      };
    });

  const handoffActionRequired = projectSnapshots
    .map((snapshot) => {
      let severity = null;
      let reason = "";

      if (snapshot.isBlocked) {
        severity = "critical";
        reason = "Blocked/on hold and needs escalation.";
      } else if (!snapshot.hasLead) {
        severity = "high";
        reason = "No lead assigned.";
      } else if (Number.isFinite(snapshot.hoursRemaining) && snapshot.hoursRemaining <= 24) {
        severity = "high";
        reason = "Deadline within 24 hours.";
      } else if (snapshot.isPendingApproval) {
        severity = "medium";
        reason = "Awaiting approval decision.";
      }

      if (!severity) return null;

      return {
        id: snapshot.id,
        orderId: snapshot.orderId,
        projectName: snapshot.projectName,
        status: snapshot.status,
        owner: getOwnerLabel(snapshot),
        severity,
        reason,
        dueAt: snapshot.dueAt,
        deliveryTime: snapshot.deliveryTime,
        hoursRemaining: snapshot.hoursRemaining,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const severityDiff = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
      if (severityDiff !== 0) return severityDiff;
      const aHours = Number.isFinite(a.hoursRemaining) ? a.hoursRemaining : Number.POSITIVE_INFINITY;
      const bHours = Number.isFinite(b.hoursRemaining) ? b.hoursRemaining : Number.POSITIVE_INFINITY;
      return aHours - bHours;
    })
    .slice(0, 14);

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
  const rankedDeadlines = deadlines
    .sort((a, b) => a.hoursRemaining - b.hoursRemaining)
    .slice(0, 14);
  const rankedStageBottlenecks = stageBottlenecks
    .filter((entry) => entry.key !== "done")
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.averageAgeHours - a.averageAgeHours;
    });

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
    orderTrend12h,
    pipeline: PIPELINE_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      count: pipelineCounts[group.key] || 0,
    })),
    alerts,
    deadlines: rankedDeadlines,
    workload: workload.slice(0, 14),
    events: recentEvents,
    flow: {
      stageBottlenecks: rankedStageBottlenecks,
      stuckProjects48h: stalledProjectsAll.length,
      stalledProjects,
    },
    team: {
      overloadedContributors: overloadedUsers,
      unassignedProjects: unassignedCount,
      handoffGapCount: handoffGapsAll.length,
      handoffGaps,
    },
    forecast: {
      sla: {
        onTimeRateToday,
        onTimeRate7d,
        completedWithDueDateToday: slaSeed.today.total,
        completedWithDueDate7d: slaSeed.sevenDays.total,
        onTimeCompletedToday: slaSeed.today.onTime,
        onTimeCompleted7d: slaSeed.sevenDays.onTime,
      },
      predictedMisses: {
        next24h: predictedMisses24h,
        next72h: predictedMisses72h,
        atRiskProjects: atRiskProjects.slice(0, 14),
      },
      incomingLoadForecast,
    },
    handoff: {
      majorStatusChanges30m,
      actionRequired: handoffActionRequired,
    },
  };
};

module.exports = {
  CLOSED_STATUS_LIST,
  getOpsWallboardOverview,
};
