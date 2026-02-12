const WeeklyDigest = require("../models/WeeklyDigest");
const Project = require("../models/Project");
const ActivityLog = require("../models/ActivityLog");
const User = require("../models/User");
const { sendEmail } = require("./emailService");

const DIGEST_PREVIEW_LIMIT = 5;

const STATUS_OWNER = {
  "Pending Scope Approval": "Project Lead",
  "Pending Mockup": "Graphics",
  "Pending Production": "Production",
  "Pending Packaging": "Stores",
  "Pending Delivery/Pickup": "Front Desk",
  "Pending Feedback": "Front Desk",
};

const getWeekRange = (baseDate = new Date()) => {
  const date = new Date(baseDate);
  const day = date.getDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7; // days since Monday
  const start = new Date(date);
  start.setDate(date.getDate() - diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const getOwnerForStatus = (status) => STATUS_OWNER[status] || "Team";

  const formatDate = (value) => {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatDueLabel = (dateValue, timeValue) => {
    if (!dateValue) return "No date";
    const dateLabel = formatDate(dateValue);
    return timeValue ? `${dateLabel} (${timeValue})` : dateLabel;
  };

const buildEmailText = (digest, userName) => {
  const lines = [];
  const startLabel = formatDate(digest.periodStart);
  const endLabel = formatDate(digest.periodEnd);

  lines.push(`Weekly Digest (${startLabel} - ${endLabel})`);
  lines.push("");

  lines.push(`Who needs to act: ${digest.summary.actionCount}`);
  if (digest.actionRequired.length === 0) {
    lines.push("- No actions required.");
  } else {
    digest.actionRequired.forEach((item) => {
      const name = item.projectName || item.orderId || "Project";
      const due = formatDueLabel(item.deliveryDate, item.deliveryTime);
      lines.push(`- ${name}: ${item.owner} (${item.status}) • Due ${due}`);
    });
  }
  if (digest.summary.actionCount > digest.actionRequired.length) {
    lines.push(
      `+${digest.summary.actionCount - digest.actionRequired.length} more`,
    );
  }

  if (userName) {
    lines.push("");
    lines.push(`Thanks, ${userName}`);
  }

  return lines.join("\n");
};

const generateWeeklyDigestForUser = async (user, range, options = {}) => {
  if (!user) return null;

  const { start, end } = range;
  const projects = await Project.find({
    $or: [{ projectLeadId: user._id }, { assistantLeadId: user._id }],
  })
    .select(
      "details.projectName details.deliveryDate details.deliveryTime orderId status projectLeadId assistantLeadId",
    )
    .lean();

  if (projects.length === 0) return null;

  const projectIds = projects.map((project) => project._id);

  const statusChanges = await ActivityLog.find({
    project: { $in: projectIds },
    action: "status_change",
    createdAt: { $gte: start, $lte: end },
  })
    .populate("project", "details.projectName orderId")
    .sort({ createdAt: -1 })
    .lean();

  const movedItems = statusChanges
    .map((log) => {
      const project = log.project || {};
      const statusChange = log.details?.statusChange || {};
      return {
        project: project._id,
        projectName: project.details?.projectName || "Untitled",
        orderId: project.orderId,
        fromStatus: statusChange.from || "",
        toStatus: statusChange.to || "",
        changedAt: log.createdAt,
      };
    })
    .filter((item) => item.projectName || item.orderId);

  const pendingProjects = projects.filter((project) =>
    project.status?.startsWith("Pending"),
  );

  const pendingItems = pendingProjects.map((project) => ({
    project: project._id,
    projectName: project.details?.projectName || "Untitled",
    orderId: project.orderId,
    status: project.status,
    deliveryDate: project.details?.deliveryDate,
    deliveryTime: project.details?.deliveryTime,
  }));

  const actionItems = pendingProjects.map((project) => {
    const ownerLabel = getOwnerForStatus(project.status);
    const isLead =
      project.projectLeadId?.toString() === user._id.toString() ||
      project.assistantLeadId?.toString() === user._id.toString();
    return {
      project: project._id,
      projectName: project.details?.projectName || "Untitled",
      orderId: project.orderId,
      status: project.status,
      owner: ownerLabel === "Project Lead" && isLead ? "You" : ownerLabel,
      deliveryDate: project.details?.deliveryDate,
      deliveryTime: project.details?.deliveryTime,
    };
  });

  const digest = await WeeklyDigest.create({
    recipient: user._id,
    periodStart: start,
    periodEnd: end,
    moved: movedItems.slice(0, DIGEST_PREVIEW_LIMIT),
    pending: pendingItems.slice(0, DIGEST_PREVIEW_LIMIT),
    actionRequired: actionItems.slice(0, DIGEST_PREVIEW_LIMIT),
    summary: {
      movedCount: movedItems.length,
      pendingCount: pendingItems.length,
      actionCount: actionItems.length,
    },
  });

  const shouldEmail =
    options.sendEmail !== false &&
    Boolean(user.notificationSettings?.email && user.email);
  if (shouldEmail) {
    const subject = `Weekly Digest (${formatDate(start)} - ${formatDate(end)})`;
    const name = user.firstName || "";
    const text = buildEmailText(digest, name);
    await sendEmail(user.email, subject, text);
  }

  return digest;
};

const generateWeeklyDigests = async (runDate = new Date()) => {
  const range = getWeekRange(runDate);
  const nextStart = new Date(range.start);
  nextStart.setDate(nextStart.getDate() + 7);

  const leadIds = await Project.distinct("projectLeadId", {
    projectLeadId: { $ne: null },
  });
  const assistantIds = await Project.distinct("assistantLeadId", {
    assistantLeadId: { $ne: null },
  });

  const userIds = Array.from(
    new Set([
      ...leadIds.map((id) => id.toString()),
      ...assistantIds.map((id) => id.toString()),
    ]),
  );

  if (userIds.length === 0) return;

  const users = await User.find({ _id: { $in: userIds } });

  for (const user of users) {
    const existing = await WeeklyDigest.findOne({
      recipient: user._id,
      periodStart: { $gte: range.start, $lt: nextStart },
    });

    if (existing) {
      continue;
    }

    await generateWeeklyDigestForUser(user, range);
  }
};

let schedulerStarted = false;
let lastRunWeekKey = null;

const startWeeklyDigestScheduler = () => {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const DIGEST_DAY = Number(process.env.DIGEST_DAY || 1); // Monday
  const DIGEST_HOUR = Number(process.env.DIGEST_HOUR || 8); // 8 AM

  const checkAndRun = async () => {
    try {
      const now = new Date();
      const { start } = getWeekRange(now);
      const key = start.toISOString();
      if (lastRunWeekKey === key) return;

      const isAfterScheduledTime =
        now.getDay() > DIGEST_DAY ||
        (now.getDay() === DIGEST_DAY && now.getHours() >= DIGEST_HOUR);
      if (!isAfterScheduledTime) return;

      await generateWeeklyDigests(now);
      lastRunWeekKey = key;
    } catch (error) {
      console.error("Weekly digest scheduler failed:", error);
    }
  };

  checkAndRun();
  setInterval(checkAndRun, 1000 * 60 * 60); // hourly
};

module.exports = {
  getWeekRange,
  generateWeeklyDigestForUser,
  generateWeeklyDigests,
  startWeeklyDigestScheduler,
};
