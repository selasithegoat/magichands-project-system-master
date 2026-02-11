#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const Project = require("../src/models/Project");
const ActivityLog = require("../src/models/ActivityLog");
const User = require("../src/models/User");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const getArgValue = (flag, fallback) => {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.split("=")[1];
  return fallback;
};

const MOCKUP_HOURS = Number(getArgValue("--mockup-hours", "24"));
const PRODUCTION_HOURS = Number(getArgValue("--production-hours", "72"));
const PACKAGING_HOURS = Number(getArgValue("--packaging-hours", "24"));
const PROJECT_ID = getArgValue("--project-id", null);

const STATUS_ORDER = [
  "Order Confirmed",
  "Pending Scope Approval",
  "Scope Approval Completed",
  "Pending Mockup",
  "Mockup Completed",
  "Pending Production",
  "Production Completed",
  "Pending Packaging",
  "Packaging Completed",
  "Pending Delivery/Pickup",
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
];

const STATUS_RANK = STATUS_ORDER.reduce((acc, status, idx) => {
  acc[status] = idx;
  return acc;
}, {});

const STAGES = [
  {
    key: "mockup",
    to: "Pending Mockup",
    from: "Scope Approval Completed",
    minRank: STATUS_RANK["Pending Mockup"],
    offsetHours: 0,
  },
  {
    key: "production",
    to: "Pending Production",
    from: "Mockup Completed",
    minRank: STATUS_RANK["Pending Production"],
    offsetHours: MOCKUP_HOURS,
  },
  {
    key: "packaging",
    to: "Pending Packaging",
    from: "Production Completed",
    minRank: STATUS_RANK["Pending Packaging"],
    offsetHours: PRODUCTION_HOURS,
  },
  {
    key: "delivery",
    to: "Pending Delivery/Pickup",
    from: "Packaging Completed",
    minRank: STATUS_RANK["Pending Delivery/Pickup"],
    offsetHours: PACKAGING_HOURS,
  },
];

const addHours = (date, hours) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);

const pickBaseTime = (project) => {
  const candidates = [];
  if (project.orderDate) candidates.push(new Date(project.orderDate));
  if (project.createdAt) candidates.push(new Date(project.createdAt));
  if (project.sectionUpdates?.details)
    candidates.push(new Date(project.sectionUpdates.details));
  const valid = candidates.filter((d) => !Number.isNaN(d.getTime()));
  if (!valid.length) return new Date();
  return new Date(Math.min(...valid.map((d) => d.getTime())));
};

const clampTime = (time, project) => {
  if (!project.updatedAt) return time;
  const updated = new Date(project.updatedAt);
  if (Number.isNaN(updated.getTime())) return time;
  return time > updated ? updated : time;
};

const ensureAfter = (time, prevTime) => {
  if (!prevTime) return time;
  if (time > prevTime) return time;
  return new Date(prevTime.getTime() + 60 * 1000);
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const adminUser = await User.findOne({ role: "admin" }).select("_id");
  if (!adminUser) {
    console.error("No admin user found. Cannot attribute backfill logs.");
    process.exit(1);
  }

  const projectQuery = PROJECT_ID ? { _id: PROJECT_ID } : {};
  const projects = await Project.find(projectQuery).select(
    "orderId orderDate createdAt updatedAt projectType status mockup sectionUpdates createdBy projectLeadId details.projectName",
  );

  const existingLogs = await ActivityLog.find({
    action: "status_change",
    "details.statusChange.to": { $in: STAGES.map((s) => s.to) },
  })
    .select("project details createdAt")
    .lean();

  const logMap = new Map();
  existingLogs.forEach((log) => {
    const projectId = log.project?.toString();
    const statusTo = log.details?.statusChange?.to;
    if (!projectId || !statusTo) return;
    if (!logMap.has(projectId)) logMap.set(projectId, {});
    const existing = logMap.get(projectId)[statusTo];
    if (!existing || log.createdAt < existing) {
      logMap.get(projectId)[statusTo] = log.createdAt;
    }
  });

  const inserts = [];
  let skipped = 0;

  projects.forEach((project) => {
    if (project.projectType === "Quote") {
      skipped += 1;
      return;
    }

    const statusRank = STATUS_RANK[project.status];
    if (statusRank === undefined) {
      skipped += 1;
      return;
    }

    const existing = logMap.get(project._id.toString()) || {};
    const baseTime = pickBaseTime(project);
    let prevTime = null;

    STAGES.forEach((stage) => {
      if (statusRank < stage.minRank) return;
      if (existing[stage.to]) {
        prevTime = new Date(existing[stage.to]);
        return;
      }

      let time = baseTime;
      if (stage.to === "Pending Production") {
        if (project.mockup?.uploadedAt) {
          time = new Date(project.mockup.uploadedAt);
        } else if (prevTime) {
          time = addHours(prevTime, stage.offsetHours || 0);
        } else {
          time = addHours(baseTime, stage.offsetHours || 0);
        }
      } else if (stage.to === "Pending Packaging") {
        if (prevTime) {
          time = addHours(prevTime, stage.offsetHours || 0);
        } else {
          time = addHours(baseTime, stage.offsetHours || 0);
        }
      } else if (stage.to === "Pending Delivery/Pickup") {
        if (prevTime) {
          time = addHours(prevTime, stage.offsetHours || 0);
        } else {
          time = addHours(baseTime, stage.offsetHours || 0);
        }
      }

      time = clampTime(ensureAfter(time, prevTime), project);
      prevTime = time;

      const actorId = project.createdBy || project.projectLeadId || adminUser._id;

      inserts.push({
        project: project._id,
        user: actorId,
        action: "status_change",
        description: `Backfill: Project status updated to ${stage.to}`,
        details: {
          statusChange: { from: stage.from, to: stage.to },
          source: "backfill",
        },
        createdAt: time,
        updatedAt: time,
      });
    });
  });

  console.log(
    `Projects scanned: ${projects.length}. Logs to create: ${inserts.length}. Skipped: ${skipped}.`,
  );

  if (!APPLY) {
    console.log("Dry run only. Use --apply to insert ActivityLog entries.");
    await mongoose.disconnect();
    return;
  }

  if (inserts.length) {
    await ActivityLog.insertMany(inserts, { ordered: false });
  }

  console.log("Backfill complete.");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
