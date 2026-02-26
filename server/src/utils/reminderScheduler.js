const Reminder = require("../models/Reminder");
const Project = require("../models/Project");
const { createNotification } = require("./notificationService");

const REMINDER_INTERVAL_MS = Number.isFinite(
  Number.parseInt(process.env.REMINDER_SCHEDULER_INTERVAL_MS, 10),
)
  ? Number.parseInt(process.env.REMINDER_SCHEDULER_INTERVAL_MS, 10)
  : 1000;

const REMINDER_MIN_INTERVAL_MS = Number.isFinite(
  Number.parseInt(process.env.REMINDER_SCHEDULER_MIN_INTERVAL_MS, 10),
)
  ? Number.parseInt(process.env.REMINDER_SCHEDULER_MIN_INTERVAL_MS, 10)
  : 200;

const REMINDER_BATCH_SIZE = Number.isFinite(
  Number.parseInt(process.env.REMINDER_SCHEDULER_BATCH_SIZE, 10),
)
  ? Number.parseInt(process.env.REMINDER_SCHEDULER_BATCH_SIZE, 10)
  : 50;

const REMINDER_CONDITION_RECHECK_MINUTES = Number.isFinite(
  Number.parseInt(process.env.REMINDER_CONDITION_RECHECK_MINUTES, 10),
)
  ? Number.parseInt(process.env.REMINDER_CONDITION_RECHECK_MINUTES, 10)
  : 60;

const REMINDER_SYSTEM_SENDER_ID = process.env.REMINDER_SYSTEM_SENDER_ID || null;

let schedulerTimer = null;
let schedulerRunning = false;
let schedulerEnabled = false;

const addDays = (date, value) => {
  const next = new Date(date);
  next.setDate(next.getDate() + value);
  return next;
};

const addMonths = (date, value) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + value);
  return next;
};

const computeNextTriggerAt = (reminder, baseDate = new Date()) => {
  const base = reminder?.nextTriggerAt
    ? new Date(reminder.nextTriggerAt)
    : new Date(baseDate);
  if (Number.isNaN(base.getTime())) return null;

  switch (reminder?.repeat) {
    case "daily":
      return addDays(base, 1);
    case "weekly":
      return addDays(base, 7);
    case "monthly":
      return addMonths(base, 1);
    default:
      return null;
  }
};

const parseRecipients = (reminder) =>
  (Array.isArray(reminder?.recipients) ? reminder.recipients : [])
    .map((entry) => entry?.user)
    .filter(Boolean)
    .map((value) => String(value));

const completeReminder = async (reminderId, now, extra = {}) => {
  await Reminder.findByIdAndUpdate(reminderId, {
    $set: {
      status: "completed",
      isActive: false,
      completedAt: now,
      processing: false,
      processingAt: null,
      lastError: "",
      ...extra,
    },
  });
};

const releaseReminderLock = async (reminderId, extra = {}) => {
  await Reminder.findByIdAndUpdate(reminderId, {
    $set: {
      processing: false,
      processingAt: null,
      ...extra,
    },
  });
};

const fetchProjectStatus = async (projectId) => {
  if (!projectId) return null;
  return Project.findById(projectId).select("status").lean();
};

const activateStageReminder = async (candidate) => {
  const now = new Date();
  const lock = await Reminder.findOneAndUpdate(
    {
      _id: candidate._id,
      status: "scheduled",
      isActive: true,
      triggerMode: "stage_based",
      processing: { $ne: true },
      nextTriggerAt: null,
    },
    {
      $set: {
        processing: true,
        processingAt: now,
      },
    },
    { new: true },
  );

  if (!lock) return false;

  try {
    const watchStatus = String(lock.watchStatus || "").trim();
    if (!watchStatus || !lock.project) {
      await completeReminder(lock._id, now);
      return true;
    }

    const project = await fetchProjectStatus(lock.project);
    if (!project) {
      await completeReminder(lock._id, now);
      return true;
    }

    if (project.status !== watchStatus) {
      await releaseReminderLock(lock._id, { lastError: "" });
      return false;
    }

    const delayMinutes = Math.max(0, Number(lock.delayMinutes) || 0);
    const stageMatchedAt = now;
    const nextTriggerAt = new Date(stageMatchedAt.getTime() + delayMinutes * 60 * 1000);

    await Reminder.findByIdAndUpdate(lock._id, {
      $set: {
        stageMatchedAt,
        nextTriggerAt,
        remindAt: lock.remindAt || nextTriggerAt,
        processing: false,
        processingAt: null,
        lastError: "",
      },
    });

    return true;
  } catch (error) {
    await releaseReminderLock(lock._id, {
      lastError: String(error?.message || "Stage activation failed."),
    });
    console.error("Reminder stage activation failed:", error);
    return false;
  }
};

const processReminder = async (reminder) => {
  const now = new Date();
  const lock = await Reminder.findOneAndUpdate(
    {
      _id: reminder._id,
      status: "scheduled",
      isActive: true,
      processing: { $ne: true },
      nextTriggerAt: { $lte: now },
    },
    {
      $set: {
        processing: true,
        processingAt: now,
      },
    },
    { new: true },
  );

  if (!lock) return false;

  try {
    const isStageBased = lock.triggerMode === "stage_based";
    const project = lock.project ? await fetchProjectStatus(lock.project) : null;

    if (isStageBased) {
      const watchStatus = String(lock.watchStatus || "").trim();
      if (!watchStatus || !project || project.status !== watchStatus) {
        await completeReminder(lock._id, now);
        return true;
      }
    } else if (lock.conditionStatus && project && project.status !== lock.conditionStatus) {
      const recheckMinutes = Math.max(5, REMINDER_CONDITION_RECHECK_MINUTES);
      const recheckAt = new Date(now.getTime() + recheckMinutes * 60 * 1000);
      await releaseReminderLock(lock._id, {
        nextTriggerAt: recheckAt,
        lastError: "",
      });
      return true;
    }

    const recipients = parseRecipients(lock);
    const creatorId = lock.createdBy
      ? String(lock.createdBy)
      : REMINDER_SYSTEM_SENDER_ID;
    const title = lock.title || "Reminder";
    const message = lock.message || "You have a scheduled reminder.";

    if (recipients.length > 0) {
      await Promise.all(
        recipients.map((recipientId) =>
          createNotification(
            recipientId,
            creatorId || recipientId,
            lock.project || null,
            "REMINDER",
            title,
            message,
            {
              inApp: lock.channels?.inApp !== false,
              email: Boolean(lock.channels?.email),
              push: false,
              allowSelf: true,
              reminderId: lock._id,
            },
          ),
        ),
      );
    }

    const nextTriggerAt = computeNextTriggerAt(lock, now);
    if (!nextTriggerAt) {
      await Reminder.findByIdAndUpdate(lock._id, {
        $set: {
          status: "completed",
          isActive: false,
          completedAt: now,
          lastTriggeredAt: now,
          processing: false,
          processingAt: null,
          lastError: "",
        },
        $inc: { triggerCount: 1 },
      });
      return true;
    }

    await Reminder.findByIdAndUpdate(lock._id, {
      $set: {
        nextTriggerAt,
        lastTriggeredAt: now,
        processing: false,
        processingAt: null,
        lastError: "",
      },
      $inc: { triggerCount: 1 },
    });

    return true;
  } catch (error) {
    await releaseReminderLock(lock._id, {
      lastError: String(error?.message || "Reminder processing failed."),
    });
    console.error("Reminder processing failed:", error);
    return false;
  }
};

const runStageActivationSweep = async () => {
  const stageCandidates = await Reminder.find({
    status: "scheduled",
    isActive: true,
    triggerMode: "stage_based",
    processing: { $ne: true },
    nextTriggerAt: null,
  })
    .sort({ createdAt: 1 })
    .limit(REMINDER_BATCH_SIZE)
    .lean();

  for (const reminder of stageCandidates) {
    await activateStageReminder(reminder);
  }
};

const runDueReminderSweep = async () => {
  const now = new Date();
  const dueReminders = await Reminder.find({
    status: "scheduled",
    isActive: true,
    processing: { $ne: true },
    nextTriggerAt: { $lte: now },
  })
    .sort({ nextTriggerAt: 1 })
    .limit(REMINDER_BATCH_SIZE)
    .lean();

  for (const reminder of dueReminders) {
    await processReminder(reminder);
  }
};

const runReminderSweep = async () => {
  if (schedulerRunning) return;
  schedulerRunning = true;

  try {
    await runStageActivationSweep();
    await runDueReminderSweep();
  } catch (error) {
    console.error("Reminder scheduler sweep failed:", error);
  } finally {
    schedulerRunning = false;
  }
};

const resolveNextSweepDelay = async () => {
  const fallbackDelay = Math.max(REMINDER_MIN_INTERVAL_MS, REMINDER_INTERVAL_MS);

  try {
    const nextDueReminder = await Reminder.findOne({
      status: "scheduled",
      isActive: true,
      processing: { $ne: true },
      nextTriggerAt: { $ne: null },
    })
      .sort({ nextTriggerAt: 1 })
      .select("nextTriggerAt")
      .lean();

    if (!nextDueReminder?.nextTriggerAt) {
      return fallbackDelay;
    }

    const nextDueAt = new Date(nextDueReminder.nextTriggerAt).getTime();
    if (!Number.isFinite(nextDueAt)) {
      return fallbackDelay;
    }

    const deltaMs = nextDueAt - Date.now();
    if (deltaMs <= REMINDER_MIN_INTERVAL_MS) {
      return REMINDER_MIN_INTERVAL_MS;
    }

    return Math.max(
      REMINDER_MIN_INTERVAL_MS,
      Math.min(fallbackDelay, deltaMs),
    );
  } catch (error) {
    console.error("Failed to resolve next reminder sweep delay:", error);
    return fallbackDelay;
  }
};

const runSchedulerLoop = async () => {
  if (!schedulerEnabled) return;

  await runReminderSweep();

  if (!schedulerEnabled) return;
  const nextDelay = await resolveNextSweepDelay();
  if (!schedulerEnabled) return;

  schedulerTimer = setTimeout(runSchedulerLoop, nextDelay);
};

const startReminderScheduler = () => {
  const enabled = process.env.REMINDER_SCHEDULER_ENABLED !== "false";
  if (!enabled) return;
  if (schedulerTimer) return;
  schedulerEnabled = true;

  runSchedulerLoop();
};

module.exports = {
  startReminderScheduler,
  runReminderSweep,
};
