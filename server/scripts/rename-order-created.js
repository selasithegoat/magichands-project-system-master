#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

const resolveEnvPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(__dirname, "..", raw);
};

const dotenvPath =
  resolveEnvPath(process.env.DOTENV_FILE) || path.resolve(__dirname, "../.env");
dotenv.config({ path: dotenvPath });

const Project = require("../src/models/Project");
const ActivityLog = require("../src/models/ActivityLog");
const SmsPrompt = require("../src/models/SmsPrompt");
const WeeklyDigest = require("../src/models/WeeklyDigest");
const Reminder = require("../src/models/Reminder");
const Notification = require("../src/models/Notification");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const OLD_STATUS = "Order Confirmed";
const NEW_STATUS = "Order Created";

const replaceText = (value) => {
  if (typeof value !== "string") return value;
  if (!value.includes(OLD_STATUS)) return value;
  return value.split(OLD_STATUS).join(NEW_STATUS);
};

const buildRegexQuery = (fields) => ({
  $or: fields.map((field) => ({
    [field]: { $regex: OLD_STATUS },
  })),
});

const bulkUpdate = async (Model, query, buildUpdate) => {
  const cursor = Model.find(query).cursor();
  const ops = [];
  let updated = 0;

  for await (const doc of cursor) {
    const update = buildUpdate(doc);
    if (!update) continue;
    ops.push({ updateOne: { filter: { _id: doc._id }, update } });
    updated += 1;

    if (ops.length >= 500) {
      await Model.bulkWrite(ops);
      ops.length = 0;
    }
  }

  if (ops.length) {
    await Model.bulkWrite(ops);
  }

  return updated;
};

const getStatusChangeValue = (details, key) => {
  if (!details) return "";
  const statusChange = details instanceof Map ? details.get("statusChange") : details.statusChange;
  if (!statusChange) return "";
  if (statusChange instanceof Map) return statusChange.get(key);
  return statusChange[key];
};

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in environment.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const counts = {
    projectStatus: await Project.countDocuments({ status: OLD_STATUS }),
    projectHold: await Project.countDocuments({ "hold.previousStatus": OLD_STATUS }),
    projectCancel: await Project.countDocuments({
      "cancellation.resumedStatus": OLD_STATUS,
    }),
    projectReopen: await Project.countDocuments({
      "reopenMeta.sourceStatus": OLD_STATUS,
    }),
    projectUpdates: await Project.countDocuments({ "updates.status": OLD_STATUS }),
    activityFrom: await ActivityLog.countDocuments({
      "details.statusChange.from": OLD_STATUS,
    }),
    activityTo: await ActivityLog.countDocuments({
      "details.statusChange.to": OLD_STATUS,
    }),
    activityDesc: await ActivityLog.countDocuments({
      description: { $regex: OLD_STATUS },
    }),
    smsPromptStatus: await SmsPrompt.countDocuments({
      projectStatus: OLD_STATUS,
    }),
    smsPromptText: await SmsPrompt.countDocuments(
      buildRegexQuery(["title", "message", "originalMessage"]),
    ),
    reminderWatch: await Reminder.countDocuments({
      watchStatus: OLD_STATUS,
    }),
    reminderCondition: await Reminder.countDocuments({
      conditionStatus: OLD_STATUS,
    }),
    weeklyDigest: await WeeklyDigest.countDocuments({
      $or: [
        { "moved.status": OLD_STATUS },
        { "moved.fromStatus": OLD_STATUS },
        { "moved.toStatus": OLD_STATUS },
        { "pending.status": OLD_STATUS },
        { "pending.fromStatus": OLD_STATUS },
        { "pending.toStatus": OLD_STATUS },
        { "actionRequired.status": OLD_STATUS },
        { "actionRequired.fromStatus": OLD_STATUS },
        { "actionRequired.toStatus": OLD_STATUS },
      ],
    }),
    notificationText: await Notification.countDocuments(
      buildRegexQuery(["title", "message"]),
    ),
  };

  console.log("Order Confirmed -> Order Created counts:");
  Object.entries(counts).forEach(([key, value]) => {
    console.log(`- ${key}: ${value}`);
  });

  if (!APPLY) {
    console.log("Dry run only. Use --apply to update stored values.");
    await mongoose.disconnect();
    return;
  }

  const results = {};

  results.projectStatus = await Project.updateMany(
    { status: OLD_STATUS },
    { $set: { status: NEW_STATUS } },
  );
  results.projectHold = await Project.updateMany(
    { "hold.previousStatus": OLD_STATUS },
    { $set: { "hold.previousStatus": NEW_STATUS } },
  );
  results.projectCancel = await Project.updateMany(
    { "cancellation.resumedStatus": OLD_STATUS },
    { $set: { "cancellation.resumedStatus": NEW_STATUS } },
  );
  results.projectReopen = await Project.updateMany(
    { "reopenMeta.sourceStatus": OLD_STATUS },
    { $set: { "reopenMeta.sourceStatus": NEW_STATUS } },
  );
  results.projectUpdates = await Project.updateMany(
    { "updates.status": OLD_STATUS },
    { $set: { "updates.$[entry].status": NEW_STATUS } },
    { arrayFilters: [{ "entry.status": OLD_STATUS }] },
  );

  results.activityFrom = await ActivityLog.updateMany(
    { "details.statusChange.from": OLD_STATUS },
    { $set: { "details.statusChange.from": NEW_STATUS } },
  );
  results.activityTo = await ActivityLog.updateMany(
    { "details.statusChange.to": OLD_STATUS },
    { $set: { "details.statusChange.to": NEW_STATUS } },
  );

  const activityDescriptionUpdated = await bulkUpdate(
    ActivityLog,
    { description: { $regex: OLD_STATUS } },
    (doc) => {
      const nextDescription = replaceText(doc.description);
      const update = {};

      const currentFrom = getStatusChangeValue(doc.details, "from");
      const currentTo = getStatusChangeValue(doc.details, "to");
      const nextFrom = replaceText(currentFrom);
      const nextTo = replaceText(currentTo);

      if (nextDescription !== doc.description) {
        update.description = nextDescription;
      }
      if (nextFrom && nextFrom !== currentFrom) {
        update["details.statusChange.from"] = nextFrom;
      }
      if (nextTo && nextTo !== currentTo) {
        update["details.statusChange.to"] = nextTo;
      }

      if (!Object.keys(update).length) return null;
      return { $set: update };
    },
  );

  results.smsPromptStatus = await SmsPrompt.updateMany(
    { projectStatus: OLD_STATUS },
    { $set: { projectStatus: NEW_STATUS } },
  );

  const smsPromptTextUpdated = await bulkUpdate(
    SmsPrompt,
    buildRegexQuery(["title", "message", "originalMessage"]),
    (doc) => {
      const update = {};
      const nextTitle = replaceText(doc.title);
      const nextMessage = replaceText(doc.message);
      const nextOriginal = replaceText(doc.originalMessage);

      if (nextTitle !== doc.title) update.title = nextTitle;
      if (nextMessage !== doc.message) update.message = nextMessage;
      if (nextOriginal !== doc.originalMessage) update.originalMessage = nextOriginal;

      if (!Object.keys(update).length) return null;
      return { $set: update };
    },
  );

  results.reminderWatch = await Reminder.updateMany(
    { watchStatus: OLD_STATUS },
    { $set: { watchStatus: NEW_STATUS } },
  );
  results.reminderCondition = await Reminder.updateMany(
    { conditionStatus: OLD_STATUS },
    { $set: { conditionStatus: NEW_STATUS } },
  );

  const weeklyDigestUpdated = await bulkUpdate(
    WeeklyDigest,
    {
      $or: [
        { "moved.status": OLD_STATUS },
        { "moved.fromStatus": OLD_STATUS },
        { "moved.toStatus": OLD_STATUS },
        { "pending.status": OLD_STATUS },
        { "pending.fromStatus": OLD_STATUS },
        { "pending.toStatus": OLD_STATUS },
        { "actionRequired.status": OLD_STATUS },
        { "actionRequired.fromStatus": OLD_STATUS },
        { "actionRequired.toStatus": OLD_STATUS },
      ],
    },
    (doc) => {
      const update = {};
      const lists = ["moved", "pending", "actionRequired"];
      let changed = false;

      lists.forEach((listKey) => {
        const list = doc[listKey] || [];
        let listChanged = false;
        const nextList = list.map((item) => {
          const entry = item?.toObject ? item.toObject() : { ...item };
          ["status", "fromStatus", "toStatus"].forEach((field) => {
            const nextVal = replaceText(entry[field]);
            if (nextVal !== entry[field]) {
              entry[field] = nextVal;
              listChanged = true;
            }
          });
          return entry;
        });

        if (listChanged) {
          update[listKey] = nextList;
          changed = true;
        }
      });

      if (!changed) return null;
      return { $set: update };
    },
  );

  const notificationUpdated = await bulkUpdate(
    Notification,
    buildRegexQuery(["title", "message"]),
    (doc) => {
      const update = {};
      const nextTitle = replaceText(doc.title);
      const nextMessage = replaceText(doc.message);

      if (nextTitle !== doc.title) update.title = nextTitle;
      if (nextMessage !== doc.message) update.message = nextMessage;

      if (!Object.keys(update).length) return null;
      return { $set: update };
    },
  );

  console.log("Updates applied:");
  console.log(
    `- Projects status: ${results.projectStatus.modifiedCount || 0}`,
  );
  console.log(
    `- Projects hold.previousStatus: ${results.projectHold.modifiedCount || 0}`,
  );
  console.log(
    `- Projects cancellation.resumedStatus: ${
      results.projectCancel.modifiedCount || 0
    }`,
  );
  console.log(
    `- Projects reopenMeta.sourceStatus: ${
      results.projectReopen.modifiedCount || 0
    }`,
  );
  console.log(
    `- Projects updates[].status: ${results.projectUpdates.modifiedCount || 0}`,
  );
  console.log(
    `- ActivityLog statusChange.from: ${results.activityFrom.modifiedCount || 0}`,
  );
  console.log(
    `- ActivityLog statusChange.to: ${results.activityTo.modifiedCount || 0}`,
  );
  console.log(`- ActivityLog descriptions: ${activityDescriptionUpdated}`);
  console.log(
    `- SmsPrompt projectStatus: ${results.smsPromptStatus.modifiedCount || 0}`,
  );
  console.log(`- SmsPrompt text fields: ${smsPromptTextUpdated}`);
  console.log(
    `- Reminder watchStatus: ${results.reminderWatch.modifiedCount || 0}`,
  );
  console.log(
    `- Reminder conditionStatus: ${results.reminderCondition.modifiedCount || 0}`,
  );
  console.log(`- WeeklyDigest entries: ${weeklyDigestUpdated}`);
  console.log(`- Notification text fields: ${notificationUpdated}`);

  console.log("Status rename complete.");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Status rename failed:", err);
  process.exit(1);
});
