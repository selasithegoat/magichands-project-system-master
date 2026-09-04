#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const Project = require("../src/models/Project");
const ProjectRevision = require("../src/models/ProjectRevision");
const User = require("../src/models/User");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");

const getArgValue = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) return args[index + 1];
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : fallback;
};

const PROJECT_ID = getArgValue("--project-id");
const BATCH_SIZE = Math.max(
  1,
  Math.min(Number.parseInt(getArgValue("--batch-size", "100"), 10) || 100, 500),
);

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLegacyRevisionDate = (project) =>
  toValidDate(project?.orderRevisionMeta?.updatedAt) ||
  toValidDate(project?.updatedAt) ||
  toValidDate(project?.createdAt) ||
  new Date();

const getUserName = (user) => {
  if (!user) return "";
  return (
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    String(user.name || user.employeeId || "").trim()
  );
};

const getActor = (project, userById, fallbackAdmin) => {
  const candidateIds = [
    project?.orderRevisionMeta?.updatedBy,
    project?.createdBy,
    project?.projectLeadId,
    fallbackAdmin._id,
  ];
  const actorId = candidateIds
    .map((value) => String(value?._id || value || ""))
    .find((value) => mongoose.isValidObjectId(value) && userById.has(value));
  return userById.get(actorId) || fallbackAdmin;
};

const runBatches = async (collection, operations) => {
  let modified = 0;
  let upserted = 0;
  for (let index = 0; index < operations.length; index += BATCH_SIZE) {
    const result = await collection.bulkWrite(
      operations.slice(index, index + BATCH_SIZE),
      { ordered: false },
    );
    modified += result.modifiedCount || 0;
    upserted += result.upsertedCount || 0;
  }
  return { modified, upserted };
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("Missing MONGO_URI in environment.");
  }
  if (PROJECT_ID && !mongoose.isValidObjectId(PROJECT_ID)) {
    throw new Error("--project-id must be a valid MongoDB ObjectId.");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const projectFilter = PROJECT_ID ? { _id: PROJECT_ID } : {};
  const revisionFilter = PROJECT_ID ? { project: PROJECT_ID } : {};
  const [projects, users, existingRevisions] = await Promise.all([
    Project.find(projectFilter),
    User.find({}).select("_id firstName lastName name employeeId role").lean(),
    ProjectRevision.find(revisionFilter).lean(),
  ]);

  const fallbackAdmin = users.find((user) => user.role === "admin") || users[0];
  if (!fallbackAdmin?._id) {
    throw new Error("No user exists to attribute imported legacy revisions.");
  }

  const userById = new Map(users.map((user) => [String(user._id), user]));
  const oldBaselines = existingRevisions.filter(
    (revision) => revision.source === "historical_backfill",
  );
  const retainedByProject = new Map();
  existingRevisions
    .filter((revision) => revision.source !== "historical_backfill")
    .forEach((revision) => {
      const projectId = String(revision.project);
      if (!retainedByProject.has(projectId)) retainedByProject.set(projectId, []);
      retainedByProject.get(projectId).push(revision);
    });

  const revisionOperations = [];
  const projectOperations = [];
  let legacySummariesPlanned = 0;
  let legacySummariesRetained = 0;
  let projectsResetToNoRevisions = 0;
  let projectsWithStructuredHistory = 0;

  for (const project of projects) {
    const projectId = String(project._id);
    const retained = retainedByProject.get(projectId) || [];
    const structuredRevisions = retained.filter(
      (revision) => revision.source !== "legacy_revision_import",
    );
    if (structuredRevisions.length > 0) {
      projectsWithStructuredHistory += 1;
      continue;
    }

    const existingLegacy = retained.find(
      (revision) => revision.source === "legacy_revision_import",
    );
    const recordedLegacyCount = Math.max(
      0,
      Math.floor(Number(project.orderRevisionCount) || 0),
    );
    // Once imported, keep the original legacy boundary fixed. The old counter
    // may continue increasing alongside new structured revisions.
    const legacyCount = existingLegacy
      ? Number(existingLegacy.revisionNumber) || 0
      : recordedLegacyCount;

    if (legacyCount === 0) {
      projectOperations.push({
        updateOne: {
          filter: { _id: project._id },
          update: {
            $set: {
              revisionTracking: {
                currentRevision: 0,
                lastRevisedByName: "",
                sections: {},
              },
            },
          },
        },
      });
      projectsResetToNoRevisions += 1;
      continue;
    }

    const actor = getActor(project, userById, fallbackAdmin);
    const actorName =
      String(project?.orderRevisionMeta?.updatedByName || "").trim() ||
      getUserName(actor) ||
      "Historical Import";
    const legacyDate = getLegacyRevisionDate(project);

    if (!existingLegacy) {
      const reason = `${legacyCount} legacy order revision${
        legacyCount === 1 ? " was" : "s were"
      } recorded before detailed change tracking. Order creation is not included; field-level differences are unavailable.`;
      revisionOperations.push({
        updateOne: {
          filter: { project: project._id, source: "legacy_revision_import" },
          update: {
            $set: {
              revisionNumber: legacyCount,
              projectVersionNumber: Math.max(Number(project.versionNumber) || 1, 1),
              actor: actor._id,
              actorName,
              reason,
              sections: [],
              changes: [],
              createdAt: legacyDate,
              updatedAt: legacyDate,
            },
            $setOnInsert: {
              project: project._id,
              source: "legacy_revision_import",
            },
          },
          upsert: true,
        },
      });
      legacySummariesPlanned += 1;
    } else {
      legacySummariesRetained += 1;
    }

    const trackingActor = existingLegacy?.actor || actor._id;
    const trackingActorName = existingLegacy?.actorName || actorName;
    const trackingDate = existingLegacy?.createdAt || legacyDate;

    projectOperations.push({
      updateOne: {
        filter: { _id: project._id },
        update: {
          $set: {
            revisionTracking: {
              currentRevision: legacyCount,
              lastRevisedAt: trackingDate,
              lastRevisedBy: trackingActor,
              lastRevisedByName: trackingActorName,
              sections: {},
            },
          },
        },
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        projectsScanned: projects.length,
        creationBaselinesToRemove: oldBaselines.length,
        legacyRevisionSummariesPlanned: legacySummariesPlanned,
        legacyRevisionSummariesRetained: legacySummariesRetained,
        projectsResetToNoRevisions,
        projectsWithStructuredHistory,
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply to correct revision history.");
    return;
  }

  const baselineDeleteFilter = {
    source: "historical_backfill",
    ...(PROJECT_ID ? { project: PROJECT_ID } : {}),
  };
  const deleteResult = await ProjectRevision.deleteMany(baselineDeleteFilter);
  const revisionResult = await runBatches(
    ProjectRevision.collection,
    revisionOperations,
  );
  const projectResult = await runBatches(Project.collection, projectOperations);

  const [revisionTotal, trackedProjectTotal, unrevisionedProjectTotal] =
    await Promise.all([
      ProjectRevision.countDocuments(revisionFilter),
      Project.countDocuments({
        ...projectFilter,
        "revisionTracking.currentRevision": { $gt: 0 },
      }),
      Project.countDocuments({
        ...projectFilter,
        "revisionTracking.currentRevision": 0,
      }),
    ]);
  console.log(
    JSON.stringify(
      {
        creationBaselinesRemoved: deleteResult.deletedCount || 0,
        legacyRevisionSummariesWritten:
          revisionResult.upserted + revisionResult.modified,
        trackingRecordsUpdated: projectResult.modified,
        revisionTotal,
        trackedProjectTotal,
        unrevisionedProjectTotal,
      },
      null,
      2,
    ),
  );
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
