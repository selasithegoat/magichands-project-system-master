const ActivityLog = require("../models/ActivityLog");
const Project = require("../models/Project");

const STAGES = [
  {
    key: "mockup",
    label: "Mockup",
    startStatus: "Pending Mockup",
    endStatus: "Pending Production",
  },
  {
    key: "production",
    label: "Production",
    startStatus: "Pending Production",
    endStatus: "Pending Packaging",
  },
  {
    key: "packaging",
    label: "Packaging",
    startStatus: "Pending Packaging",
    endStatus: "Pending Delivery/Pickup",
  },
];

const STATUS_SET = Array.from(
  new Set(
    STAGES.flatMap((stage) => [stage.startStatus, stage.endStatus]),
  ),
);

const parseDateRange = (from, to) => {
  const toDate = to ? new Date(to) : new Date();
  if (Number.isNaN(toDate.getTime())) return null;
  if (to) {
    toDate.setHours(23, 59, 59, 999);
  }
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - 90 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(fromDate.getTime())) return null;
  return { fromDate, toDate };
};

const computeStats = (values) => {
  if (!values.length) {
    return { count: 0, avgHours: null, medianHours: null, minHours: null, maxHours: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avgHours = sum / count;
  const mid = Math.floor(count / 2);
  const medianHours =
    count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const minHours = sorted[0];
  const maxHours = sorted[count - 1];
  return { count, avgHours, medianHours, minHours, maxHours };
};

// @desc    Get stage duration analytics
// @route   GET /api/admin/analytics/stage-durations
// @access  Admin
const getStageDurations = async (req, res) => {
  try {
    const range = parseDateRange(req.query.from, req.query.to);
    if (!range) {
      return res.status(400).json({ message: "Invalid date range." });
    }

    const logs = await ActivityLog.find({
      action: "status_change",
      "details.statusChange.to": { $in: STATUS_SET },
      createdAt: { $lte: range.toDate },
    })
      .select("project details createdAt")
      .sort({ createdAt: 1 })
      .lean();

    const byProject = new Map();
    for (const log of logs) {
      const projectId = log.project?.toString();
      const statusTo = log.details?.statusChange?.to;
      if (!projectId || !statusTo) continue;
      if (!byProject.has(projectId)) {
        byProject.set(projectId, []);
      }
      byProject.get(projectId).push({ status: statusTo, at: log.createdAt });
    }

    const projectIds = Array.from(byProject.keys());
    const projects = await Project.find({ _id: { $in: projectIds } }).select(
      "orderId details.projectName status",
    );
    const projectMap = new Map(
      projects.map((project) => [project._id.toString(), project]),
    );

    const stageBuckets = {
      mockup: [],
      production: [],
      packaging: [],
    };
    const projectResults = [];

    for (const [projectId, events] of byProject.entries()) {
      const statusTimes = {};
      for (const event of events) {
        if (!statusTimes[event.status]) {
          statusTimes[event.status] = event.at;
        }
      }

      const stageData = {};
      let totalHours = 0;

      STAGES.forEach((stage) => {
        const startAt = statusTimes[stage.startStatus];
        const endAt = statusTimes[stage.endStatus];
        if (!startAt || !endAt || endAt <= startAt) return;
        const inRange =
          endAt >= range.fromDate && endAt <= range.toDate;
        if (!inRange) return;
        const hours = (endAt.getTime() - startAt.getTime()) / 36e5;
        stageData[stage.key] = {
          start: startAt,
          end: endAt,
          hours,
        };
        stageBuckets[stage.key].push(hours);
        totalHours += hours;
      });

      if (Object.keys(stageData).length === 0) continue;

      const project = projectMap.get(projectId);
      projectResults.push({
        projectId,
        orderId: project?.orderId || null,
        projectName: project?.details?.projectName || "Untitled",
        status: project?.status || "Unknown",
        totalHours,
        stages: stageData,
      });
    }

    projectResults.sort((a, b) => b.totalHours - a.totalHours);

    const stageStats = STAGES.map((stage) => ({
      key: stage.key,
      label: stage.label,
      ...computeStats(stageBuckets[stage.key]),
    }));

    res.json({
      range: {
        from: range.fromDate,
        to: range.toDate,
      },
      stages: stageStats,
      projects: projectResults,
    });
  } catch (error) {
    console.error("Error fetching stage analytics:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = { getStageDurations };
