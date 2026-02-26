const mongoose = require("mongoose");
const Reminder = require("../models/Reminder");
const Project = require("../models/Project");

const normalizeObjectId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString();
    if (value._id && value._id !== value) return normalizeObjectId(value._id);
    if (typeof value.id === "string" || typeof value.id === "number") {
      return String(value.id);
    }
  }
  return "";
};

const normalizeDepartments = (value) =>
  (Array.isArray(value) ? value : [value])
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);

const normalizeReminderDate = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const toPositiveInt = (value, fallback, max = Infinity) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const toNonNegativeInt = (value, fallback, max = Infinity) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
};

const canAccessProjectReminder = (user, project) => {
  if (!user || !project) return false;
  if (user.role === "admin") return true;

  const userId = normalizeObjectId(user._id || user.id);
  const leadId = normalizeObjectId(project.projectLeadId);
  const assistantId = normalizeObjectId(project.assistantLeadId);
  const creatorId = normalizeObjectId(project.createdBy);

  if (
    userId &&
    (userId === leadId || userId === assistantId || userId === creatorId)
  ) {
    return true;
  }

  const userDepartments = new Set(normalizeDepartments(user.department));
  if (userDepartments.has("front desk")) return true;

  const projectDepartments = normalizeDepartments(project.departments);
  return projectDepartments.some((dept) => userDepartments.has(dept));
};

const canManageReminder = (user, reminder) => {
  if (!user || !reminder) return false;
  if (user.role === "admin") return true;
  const userId = normalizeObjectId(user._id || user.id);
  return userId && normalizeObjectId(reminder.createdBy) === userId;
};

const canActOnReminder = (user, reminder) => {
  if (canManageReminder(user, reminder)) return true;
  if (!user || !reminder) return false;
  const userId = normalizeObjectId(user._id || user.id);
  if (!userId) return false;

  return (Array.isArray(reminder.recipients) ? reminder.recipients : []).some(
    (entry) => normalizeObjectId(entry?.user) === userId,
  );
};

const sanitizeRecipientIds = (value, fallbackUserId) => {
  const list = Array.isArray(value) ? value : [];
  const unique = new Set();

  for (const entry of list) {
    const id = normalizeObjectId(entry);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) continue;
    unique.add(id);
  }

  if (fallbackUserId && mongoose.Types.ObjectId.isValid(String(fallbackUserId))) {
    unique.add(String(fallbackUserId));
  }

  return Array.from(unique);
};

const populateReminder = (query) =>
  query
    .populate("createdBy", "firstName lastName email role")
    .populate("project", "orderId details.projectName status")
    .populate("recipients.user", "firstName lastName email role");

const allowedRepeats = new Set(["none", "daily", "weekly", "monthly"]);
const allowedTriggerModes = new Set(["absolute_time", "stage_based"]);

const normalizeTriggerMode = (value = "absolute_time") => {
  const normalized = String(value || "absolute_time").trim().toLowerCase();
  return allowedTriggerModes.has(normalized) ? normalized : "";
};

const normalizeDelayMinutes = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") return fallback;
  return toNonNegativeInt(value, fallback, 60 * 24 * 90);
};

const getReminderTimeMs = (value) => {
  const parsed = normalizeReminderDate(value);
  if (!parsed) return null;
  return parsed.getTime();
};

const isScheduledReminderEditable = (reminder) => {
  if (!reminder) return false;
  if (String(reminder.status || "").trim().toLowerCase() !== "scheduled") return false;
  if (reminder.isActive === false) return false;

  const nextTriggerTime = getReminderTimeMs(reminder.nextTriggerAt);
  if (nextTriggerTime !== null) {
    return nextTriggerTime > Date.now();
  }

  if (String(reminder.triggerMode || "").trim().toLowerCase() === "stage_based") {
    return true;
  }

  const remindAtTime = getReminderTimeMs(reminder.remindAt);
  return remindAtTime !== null ? remindAtTime > Date.now() : false;
};

const createReminder = async (req, res) => {
  try {
    const {
      projectId,
      title,
      message,
      remindAt,
      repeat = "none",
      triggerMode = "absolute_time",
      watchStatus = "",
      delayMinutes = 0,
      timezone = "UTC",
      conditionStatus = "",
      templateKey = "custom",
      recipientIds = [],
      channels = {},
    } = req.body || {};

    const trimmedTitle = String(title || "").trim();
    if (!trimmedTitle) {
      return res.status(400).json({ message: "Reminder title is required." });
    }

    const normalizedTriggerMode = normalizeTriggerMode(triggerMode);
    if (!normalizedTriggerMode) {
      return res.status(400).json({ message: "Invalid trigger mode." });
    }

    const normalizedRepeat = String(repeat || "none").trim().toLowerCase();
    if (!allowedRepeats.has(normalizedRepeat)) {
      return res.status(400).json({ message: "Invalid repeat option." });
    }

    if (normalizedTriggerMode === "stage_based" && !projectId) {
      return res.status(400).json({
        message: "Stage-based reminders must be linked to a project.",
      });
    }

    let project = null;
    if (projectId) {
      if (!mongoose.Types.ObjectId.isValid(String(projectId))) {
        return res.status(400).json({ message: "Invalid project reference." });
      }
      project = await Project.findById(projectId).select(
        "_id status projectLeadId assistantLeadId createdBy departments",
      );
      if (!project) {
        return res.status(404).json({ message: "Project not found." });
      }
      if (!canAccessProjectReminder(req.user, project)) {
        return res
          .status(403)
          .json({ message: "Not authorized to set reminders for this project." });
      }
    }

    const now = Date.now();
    let parsedRemindAt = null;
    let nextTriggerAt = null;
    let normalizedWatchStatus = "";
    let normalizedDelayMinutes = 0;
    let stageMatchedAt = null;
    let normalizedConditionStatus = String(conditionStatus || "").trim();

    if (normalizedTriggerMode === "absolute_time") {
      parsedRemindAt = normalizeReminderDate(remindAt);
      if (!parsedRemindAt) {
        return res
          .status(400)
          .json({ message: "A valid reminder date is required." });
      }
      if (parsedRemindAt.getTime() < now - 5000) {
        return res
          .status(400)
          .json({ message: "Reminder date must be in the future." });
      }
      nextTriggerAt = parsedRemindAt;
    } else {
      normalizedWatchStatus = String(watchStatus || conditionStatus || "").trim();
      if (!normalizedWatchStatus) {
        return res.status(400).json({
          message: "Stage-based reminders require a target project status.",
        });
      }
      normalizedDelayMinutes = normalizeDelayMinutes(delayMinutes, 0);
      normalizedConditionStatus = "";

      if (project?.status === normalizedWatchStatus) {
        stageMatchedAt = new Date();
        nextTriggerAt = new Date(
          stageMatchedAt.getTime() + normalizedDelayMinutes * 60 * 1000,
        );
      }
    }

    const inApp = toBoolean(channels?.inApp, true);
    const email = toBoolean(channels?.email, false);
    if (!inApp && !email) {
      return res
        .status(400)
        .json({ message: "At least one reminder delivery channel is required." });
    }

    const userId = normalizeObjectId(req.user?._id || req.user?.id);
    let normalizedRecipients = sanitizeRecipientIds(recipientIds, userId);
    if (req.user?.role !== "admin") {
      normalizedRecipients = [userId].filter(Boolean);
    }

    if (normalizedRecipients.length === 0) {
      return res.status(400).json({ message: "At least one recipient is required." });
    }

    const reminder = await Reminder.create({
      createdBy: userId,
      project: project?._id || null,
      title: trimmedTitle,
      message: String(message || "").trim(),
      triggerMode: normalizedTriggerMode,
      remindAt: parsedRemindAt,
      nextTriggerAt,
      watchStatus: normalizedWatchStatus,
      delayMinutes: normalizedDelayMinutes,
      stageMatchedAt,
      repeat: normalizedRepeat,
      timezone: String(timezone || "UTC").trim() || "UTC",
      conditionStatus: normalizedConditionStatus,
      templateKey: String(templateKey || "custom").trim() || "custom",
      channels: {
        inApp,
        email,
      },
      recipients: normalizedRecipients.map((id) => ({ user: id })),
    });

    const populated = await populateReminder(Reminder.findById(reminder._id));
    return res.status(201).json(populated);
  } catch (error) {
    console.error("Failed to create reminder:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const getReminders = async (req, res) => {
  try {
    const userId = normalizeObjectId(req.user?._id || req.user?.id);
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: "Not authorized." });
    }
    const includeCompleted = toBoolean(req.query.includeCompleted, false);
    const projectId = String(req.query.projectId || "").trim();
    const status = String(req.query.status || "").trim().toLowerCase();

    const query = {
      $or: [{ createdBy: userId }, { "recipients.user": userId }],
    };

    if (projectId) {
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        return res.status(400).json({ message: "Invalid project filter." });
      }
      query.project = projectId;
    }

    if (status) {
      if (!["scheduled", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status filter." });
      }
      query.status = status;
    } else if (!includeCompleted) {
      query.status = "scheduled";
      query.isActive = true;
    }

    const reminders = await populateReminder(
      Reminder.find(query).sort({ nextTriggerAt: 1, createdAt: -1 }).limit(300),
    );

    return res.json(reminders);
  } catch (error) {
    console.error("Failed to fetch reminders:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const updateReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found." });
    }

    if (!canManageReminder(req.user, reminder)) {
      return res.status(403).json({ message: "Not authorized to edit reminder." });
    }

    if (reminder.status !== "scheduled") {
      return res
        .status(400)
        .json({ message: "Only scheduled reminders can be edited." });
    }

    if (!isScheduledReminderEditable(reminder)) {
      return res.status(400).json({
        message: "Only reminders that have not triggered yet can be edited.",
      });
    }

    const {
      title,
      message,
      remindAt,
      repeat,
      triggerMode,
      watchStatus,
      delayMinutes,
      timezone,
      conditionStatus,
      templateKey,
      recipientIds,
      channels,
    } = req.body || {};

    if (typeof title === "string") {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) {
        return res.status(400).json({ message: "Reminder title is required." });
      }
      reminder.title = trimmedTitle;
    }

    if (typeof message === "string") {
      reminder.message = message.trim();
    }

    if (typeof repeat === "string") {
      const normalizedRepeat = repeat.trim().toLowerCase();
      if (!allowedRepeats.has(normalizedRepeat)) {
        return res.status(400).json({ message: "Invalid repeat option." });
      }
      reminder.repeat = normalizedRepeat;
    }

    const previousTriggerMode = reminder.triggerMode || "absolute_time";
    let nextTriggerMode = previousTriggerMode;
    const hasExplicitTriggerMode = triggerMode !== undefined;
    if (hasExplicitTriggerMode) {
      const normalizedTriggerMode = normalizeTriggerMode(triggerMode);
      if (!normalizedTriggerMode) {
        return res.status(400).json({ message: "Invalid trigger mode." });
      }
      nextTriggerMode = normalizedTriggerMode;
      reminder.triggerMode = normalizedTriggerMode;
    }

    if (typeof timezone === "string") {
      reminder.timezone = timezone.trim() || reminder.timezone;
    }

    if (typeof templateKey === "string") {
      reminder.templateKey = templateKey.trim() || "custom";
    }

    if (nextTriggerMode === "absolute_time") {
      const mustProvideRemindAt =
        hasExplicitTriggerMode && previousTriggerMode !== "absolute_time";

      if (mustProvideRemindAt && remindAt === undefined) {
        return res.status(400).json({
          message: "Absolute-time reminders require a reminder date.",
        });
      }

      if (remindAt !== undefined || mustProvideRemindAt) {
        const parsedRemindAt = normalizeReminderDate(remindAt);
        if (!parsedRemindAt) {
          return res.status(400).json({ message: "Invalid reminder date." });
        }
        if (parsedRemindAt.getTime() < Date.now() - 5000) {
          return res
            .status(400)
            .json({ message: "Reminder date must be in the future." });
        }
        reminder.remindAt = parsedRemindAt;
        reminder.nextTriggerAt = parsedRemindAt;
      }

      if (!reminder.remindAt || Number.isNaN(new Date(reminder.remindAt).getTime())) {
        return res.status(400).json({
          message: "Absolute-time reminders require a reminder date.",
        });
      }

      reminder.watchStatus = "";
      reminder.delayMinutes = 0;
      reminder.stageMatchedAt = null;

      if (typeof conditionStatus === "string") {
        reminder.conditionStatus = conditionStatus.trim();
      } else if (hasExplicitTriggerMode) {
        reminder.conditionStatus = "";
      }
    } else {
      if (!reminder.project) {
        return res.status(400).json({
          message: "Stage-based reminders must be linked to a project.",
        });
      }

      const hasWatchStatusInput = watchStatus !== undefined;
      const hasDelayInput = delayMinutes !== undefined;
      const nextWatchStatus = String(
        hasWatchStatusInput ? watchStatus : reminder.watchStatus || conditionStatus || "",
      ).trim();
      if (!nextWatchStatus) {
        return res.status(400).json({
          message: "Stage-based reminders require a target project status.",
        });
      }

      const nextDelayMinutes = normalizeDelayMinutes(
        hasDelayInput ? delayMinutes : reminder.delayMinutes,
        0,
      );

      reminder.watchStatus = nextWatchStatus;
      reminder.delayMinutes = nextDelayMinutes;
      reminder.remindAt = null;
      reminder.conditionStatus = "";

      const project = await Project.findById(reminder.project).select("status").lean();
      if (!project) {
        return res.status(404).json({ message: "Project not found." });
      }

      if (project.status === nextWatchStatus) {
        const matchedAt =
          hasWatchStatusInput || hasDelayInput || hasExplicitTriggerMode
            ? new Date()
            : reminder.stageMatchedAt
              ? new Date(reminder.stageMatchedAt)
              : new Date();
        reminder.stageMatchedAt = matchedAt;
        reminder.nextTriggerAt = new Date(
          matchedAt.getTime() + nextDelayMinutes * 60 * 1000,
        );
      } else {
        reminder.stageMatchedAt = null;
        reminder.nextTriggerAt = null;
      }
    }

    if (channels && typeof channels === "object") {
      const inApp = toBoolean(channels.inApp, reminder.channels?.inApp ?? true);
      const email = toBoolean(channels.email, reminder.channels?.email ?? false);
      if (!inApp && !email) {
        return res.status(400).json({
          message: "At least one reminder delivery channel is required.",
        });
      }
      reminder.channels = { inApp, email };
    }

    if (recipientIds !== undefined) {
      const fallbackUserId = normalizeObjectId(reminder.createdBy);
      const normalizedRecipients = sanitizeRecipientIds(recipientIds, fallbackUserId);
      if (normalizedRecipients.length === 0) {
        return res
          .status(400)
          .json({ message: "At least one recipient is required." });
      }
      reminder.recipients = normalizedRecipients.map((id) => ({ user: id }));
    }

    reminder.processing = false;
    reminder.processingAt = null;
    reminder.lastError = "";

    await reminder.save();
    const populated = await populateReminder(Reminder.findById(reminder._id));
    return res.json(populated);
  } catch (error) {
    console.error("Failed to update reminder:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const snoozeReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found." });
    }

    if (!canActOnReminder(req.user, reminder)) {
      return res.status(403).json({ message: "Not authorized to snooze reminder." });
    }

    if (reminder.status !== "scheduled") {
      return res
        .status(400)
        .json({ message: "Only scheduled reminders can be snoozed." });
    }

    if (!reminder.nextTriggerAt) {
      return res.status(400).json({
        message: "This reminder is waiting for its target stage and cannot be snoozed yet.",
      });
    }

    const minutes = toPositiveInt(req.body?.minutes, 60, 60 * 24 * 14);
    const nextTriggerAt = new Date(Date.now() + minutes * 60 * 1000);
    reminder.nextTriggerAt = nextTriggerAt;
    reminder.processing = false;
    reminder.processingAt = null;
    reminder.lastError = "";
    await reminder.save();

    const populated = await populateReminder(Reminder.findById(reminder._id));
    return res.json(populated);
  } catch (error) {
    console.error("Failed to snooze reminder:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const completeReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found." });
    }

    if (!canActOnReminder(req.user, reminder)) {
      return res
        .status(403)
        .json({ message: "Not authorized to complete reminder." });
    }

    reminder.status = "completed";
    reminder.isActive = false;
    reminder.completedAt = new Date();
    reminder.processing = false;
    reminder.processingAt = null;
    reminder.lastError = "";
    await reminder.save();

    const populated = await populateReminder(Reminder.findById(reminder._id));
    return res.json(populated);
  } catch (error) {
    console.error("Failed to complete reminder:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const cancelReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found." });
    }

    if (!canManageReminder(req.user, reminder)) {
      return res.status(403).json({ message: "Not authorized to cancel reminder." });
    }

    reminder.status = "cancelled";
    reminder.isActive = false;
    reminder.cancelledAt = new Date();
    reminder.processing = false;
    reminder.processingAt = null;
    reminder.lastError = "";
    await reminder.save();

    const populated = await populateReminder(Reminder.findById(reminder._id));
    return res.json(populated);
  } catch (error) {
    console.error("Failed to cancel reminder:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const deleteReminder = async (req, res) => {
  try {
    const reminder = await Reminder.findById(req.params.id);
    if (!reminder) {
      return res.status(404).json({ message: "Reminder not found." });
    }

    if (!canManageReminder(req.user, reminder)) {
      return res.status(403).json({ message: "Not authorized to delete reminder." });
    }

    await Reminder.deleteOne({ _id: reminder._id });
    return res.json({ message: "Reminder deleted." });
  } catch (error) {
    console.error("Failed to delete reminder:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  createReminder,
  getReminders,
  updateReminder,
  snoozeReminder,
  completeReminder,
  cancelReminder,
  deleteReminder,
};
