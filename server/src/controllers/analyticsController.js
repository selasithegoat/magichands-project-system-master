const ActivityLog = require("../models/ActivityLog");
const Project = require("../models/Project");

const STAGES = [
  {
    key: "mockup",
    label: "Mockup Stage",
    startStatus: "Pending Mockup",
    endStatus: "Pending Production",
    description: "Average time spent in the mockup phase",
  },
  {
    key: "production",
    label: "Production Stage",
    startStatus: "Pending Production",
    endStatus: "Pending Packaging",
    description: "Average time spent in the production phase",
  },
  {
    key: "packaging",
    label: "Packaging Stage",
    startStatus: "Pending Packaging",
    endStatus: "Pending Delivery/Pickup",
    description: "Average time spent in the packaging phase",
  },
];

const PROCESS_STAGE = {
  key: "endToEnd",
  label: "End-to-End Cycle",
  startStatus: STAGES[0].startStatus,
  endStatus: STAGES[STAGES.length - 1].endStatus,
  description: "Average total time for a project from start to finish",
  isProcess: true,
};

const ANALYTICS_STAGES = [...STAGES, PROCESS_STAGE];

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

const percentile = (sorted, pct) => {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * pct;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
};

const buildHistogram = (values, bins = 6) => {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ start: min, end: max, count: values.length }];
  }
  const width = (max - min) / bins;
  const buckets = Array.from({ length: bins }, (_, idx) => ({
    start: min + idx * width,
    end: idx === bins - 1 ? max : min + (idx + 1) * width,
    count: 0,
  }));
  values.forEach((value) => {
    const idx = Math.min(
      bins - 1,
      Math.floor((value - min) / width),
    );
    buckets[idx].count += 1;
  });
  return buckets;
};

const computeDistribution = (values) => {
  if (!values.length) {
    return { bins: [], q1: null, q3: null, iqr: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;
  return {
    bins: buildHistogram(values),
    q1,
    q3,
    iqr,
  };
};

const getBucketConfig = (fromDate, toDate) => {
  const rangeDays = Math.max(
    1,
    Math.ceil((toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000)),
  );
  if (rangeDays <= 21) return { bucketDays: 1, label: "Daily" };
  if (rangeDays <= 150) return { bucketDays: 7, label: "Weekly" };
  return { bucketDays: 30, label: "Monthly" };
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

    const stageBuckets = Object.fromEntries(
      ANALYTICS_STAGES.map((stage) => [stage.key, []]),
    );
    const stageTrendBuckets = Object.fromEntries(
      ANALYTICS_STAGES.map((stage) => [stage.key, new Map()]),
    );
    const projectResults = [];
    const { bucketDays, label: bucketLabel } = getBucketConfig(
      range.fromDate,
      range.toDate,
    );
    const bucketMs = bucketDays * 24 * 60 * 60 * 1000;
    const base = new Date(range.fromDate);
    base.setHours(0, 0, 0, 0);
    const bucketStarts = [];
    for (
      let cursor = base.getTime();
      cursor <= range.toDate.getTime();
      cursor += bucketMs
    ) {
      bucketStarts.push(new Date(cursor));
    }

    const addTrendPoint = (stageKey, endAt, hours) => {
      const bucketIndex = Math.floor(
        (endAt.getTime() - base.getTime()) / bucketMs,
      );
      if (bucketIndex < 0) return;
      const bucketStart = bucketStarts[Math.min(bucketIndex, bucketStarts.length - 1)];
      const bucketKey = bucketStart.toISOString();
      if (!stageTrendBuckets[stageKey].has(bucketKey)) {
        stageTrendBuckets[stageKey].set(bucketKey, {
          start: bucketStart,
          sum: 0,
          count: 0,
        });
      }
      const bucket = stageTrendBuckets[stageKey].get(bucketKey);
      bucket.sum += hours;
      bucket.count += 1;
    };

    for (const [projectId, events] of byProject.entries()) {
      const statusTimes = {};
      for (const event of events) {
        if (!statusTimes[event.status]) {
          statusTimes[event.status] = event.at;
        }
      }

      const stageData = {};
      let stageHoursTotal = 0;

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
        addTrendPoint(stage.key, endAt, hours);
        stageHoursTotal += hours;
      });

      let endToEnd = null;
      const processStart = statusTimes[PROCESS_STAGE.startStatus];
      const processEnd = statusTimes[PROCESS_STAGE.endStatus];
      if (processStart && processEnd && processEnd > processStart) {
        const inRange =
          processEnd >= range.fromDate && processEnd <= range.toDate;
        if (inRange) {
          const hours = (processEnd.getTime() - processStart.getTime()) / 36e5;
          endToEnd = {
            start: processStart,
            end: processEnd,
            hours,
          };
          stageBuckets[PROCESS_STAGE.key].push(hours);
          addTrendPoint(PROCESS_STAGE.key, processEnd, hours);
        }
      }

      if (Object.keys(stageData).length === 0 && !endToEnd) continue;

      const project = projectMap.get(projectId);
      projectResults.push({
        projectId,
        orderId: project?.orderId || null,
        projectName: project?.details?.projectName || "Untitled",
        status: project?.status || "Unknown",
        totalHours: endToEnd?.hours ?? stageHoursTotal,
        endToEnd,
        stages: stageData,
      });
    }

    projectResults.sort((a, b) => b.totalHours - a.totalHours);

    const stageStats = ANALYTICS_STAGES.map((stage) => {
      const trendPoints = bucketStarts.map((bucketStart) => {
        const bucketKey = bucketStart.toISOString();
        const bucket = stageTrendBuckets[stage.key].get(bucketKey);
        return {
          start: bucketStart,
          avgHours: bucket ? bucket.sum / bucket.count : null,
          count: bucket ? bucket.count : 0,
        };
      });

      return {
        key: stage.key,
        label: stage.label,
        description: stage.description,
        rangeLabel: `${stage.startStatus} to ${stage.endStatus}`,
        isProcess: Boolean(stage.isProcess),
        ...computeStats(stageBuckets[stage.key]),
        distribution: computeDistribution(stageBuckets[stage.key]),
        trend: {
          bucketDays,
          bucketLabel,
          points: trendPoints,
        },
      };
    });

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
