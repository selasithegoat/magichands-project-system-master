import React, { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmationModal from "../ui/ConfirmationModal";
import EditIcon from "../icons/EditIcon";
import TrashIcon from "../icons/TrashIcon";
import "./ProjectReminderPanel.css";

const REMINDER_TEMPLATE_OPTIONS = [
  {
    key: "custom",
    label: "Custom Reminder",
    title: "",
    message: "",
    triggerMode: "absolute_time",
    watchStatus: "",
    delayMinutes: 0,
    offsetHours: 24,
  },
  {
    key: "mockup_follow_up",
    label: "Mockup Follow-up",
    title: "Follow up on mockup design",
    message: "Check if mockup is still pending and follow up with the team/client.",
    triggerMode: "stage_based",
    watchStatus: "Pending Mockup",
    delayMinutes: 0,
    offsetHours: 24,
  },
  {
    key: "production_progress",
    label: "Production Progress Check",
    title: "Check production progress",
    message: "Confirm production progress and update blockers if any.",
    triggerMode: "stage_based",
    watchStatus: "Pending Production",
    delayMinutes: 0,
    offsetHours: 24,
  },
  {
    key: "delivery_readiness",
    label: "Delivery Readiness",
    title: "Confirm delivery readiness",
    message: "Verify packaging, logistics, and final readiness before delivery.",
    triggerMode: "stage_based",
    watchStatus: "Pending Delivery/Pickup",
    delayMinutes: 0,
    offsetHours: 12,
  },
];

const REMINDER_REPEAT_OPTIONS = [
  { value: "none", label: "One-time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const STANDARD_STATUS_OPTIONS = [
  "Order Confirmed",
  "Pending Scope Approval",
  "Scope Approval Completed",
  "Pending Departmental Engagement",
  "Departmental Engagement Completed",
  "Pending Mockup",
  "Mockup Completed",
  "Pending Proof Reading",
  "Proof Reading Completed",
  "Pending Production",
  "Production Completed",
  "Pending Quality Control",
  "Quality Control Completed",
  "Pending Photography",
  "Photography Completed",
  "Pending Packaging",
  "Packaging Completed",
  "Pending Delivery/Pickup",
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
];

const QUOTE_STATUS_OPTIONS = [
  "Order Confirmed",
  "Pending Scope Approval",
  "Scope Approval Completed",
  "Pending Departmental Engagement",
  "Departmental Engagement Completed",
  "Pending Quote Request",
  "Quote Request Completed",
  "Pending Send Response",
  "Response Sent",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
];

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    if (value._id) return toEntityId(value._id);
    if (value.id) return String(value.id);
  }
  return "";
};

const toDateTimeLocalValue = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const timezoneOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const buildReminderDefaultDateTimeValue = (offsetHours = 24) => {
  const next = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  next.setSeconds(0, 0);
  return toDateTimeLocalValue(next);
};

const formatReminderTime = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatDelayMinutes = (value) => {
  const minutes = Math.max(0, Number.parseInt(value, 10) || 0);
  if (minutes === 0) return "Immediately";
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(" ");
};

const getReminderTemplate = (templateKey = "custom") =>
  REMINDER_TEMPLATE_OPTIONS.find((item) => item.key === templateKey) ||
  REMINDER_TEMPLATE_OPTIONS[0];

const normalizeReminderStatus = (value) => {
  const status = String(value || "").trim().toLowerCase();
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "scheduled";
};

const isReminderScheduled = (reminder) =>
  normalizeReminderStatus(reminder?.status) === "scheduled" &&
  reminder?.isActive !== false;

const parseReminderTime = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
};

const isReminderEditable = (reminder) => {
  if (!isReminderScheduled(reminder)) return false;

  const nextTriggerTime = parseReminderTime(reminder?.nextTriggerAt);
  if (nextTriggerTime !== null) return nextTriggerTime > Date.now();

  if (reminder?.triggerMode === "stage_based") return true;

  const remindAtTime = parseReminderTime(reminder?.remindAt);
  return remindAtTime !== null ? remindAtTime > Date.now() : false;
};

const isReminderActionAllowed = (reminder, userId, role) => {
  if (!userId || !reminder) return false;
  if (role === "admin") return true;

  if (toEntityId(reminder?.createdBy) === userId) return true;

  return (Array.isArray(reminder?.recipients) ? reminder.recipients : []).some(
    (entry) => toEntityId(entry?.user) === userId,
  );
};

const isReminderManageAllowed = (reminder, userId, role) => {
  if (!userId || !reminder) return false;
  if (role === "admin") return true;
  return toEntityId(reminder?.createdBy) === userId;
};

const getReminderStatusLabel = (status) => {
  const normalized = normalizeReminderStatus(status);
  if (normalized === "completed") return "Completed";
  if (normalized === "cancelled") return "Cancelled";
  return "Scheduled";
};

const ProjectReminderPanel = ({ project, user }) => {
  const projectId = toEntityId(project?._id);
  const userId = toEntityId(user?._id || user?.id);
  const userRole = String(user?.role || "").trim().toLowerCase();

  const statusOptions = useMemo(
    () =>
      project?.projectType === "Quote"
        ? QUOTE_STATUS_OPTIONS
        : STANDARD_STATUS_OPTIONS,
    [project?.projectType],
  );

  const buildInitialReminderForm = useCallback(
    (templateKey = "custom") => {
      const template = getReminderTemplate(templateKey);
      const isCustom = templateKey === "custom";
      return {
        templateKey,
        title: isCustom ? "" : template.title,
        message: isCustom ? "" : template.message,
        triggerMode: isCustom ? "absolute_time" : template.triggerMode || "stage_based",
        watchStatus: isCustom ? "" : template.watchStatus || "",
        delayMinutes: isCustom ? 0 : template.delayMinutes || 0,
        remindAt: buildReminderDefaultDateTimeValue(template.offsetHours || 24),
        repeat: "none",
        inApp: true,
        email: false,
      };
    },
    [],
  );

  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);
  const [actionReminderId, setActionReminderId] = useState("");
  const [reminderError, setReminderError] = useState("");
  const [editingReminderId, setEditingReminderId] = useState("");
  const [showDeleteReminderModal, setShowDeleteReminderModal] = useState(false);
  const [deleteReminderTarget, setDeleteReminderTarget] = useState(null);
  const [reminderForm, setReminderForm] = useState(() =>
    buildInitialReminderForm("custom"),
  );

  const fetchReminders = useCallback(
    async ({ silent = false } = {}) => {
      if (!projectId) {
        setReminders([]);
        return;
      }

      if (!silent) setRemindersLoading(true);
      setReminderError("");

      try {
        const query = new URLSearchParams({
          projectId,
          includeCompleted: "true",
        });
        const res = await fetch(`/api/reminders?${query.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to load reminders.");
        }

        const data = await res.json();
        setReminders(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Failed to fetch reminders:", error);
        setReminderError(error.message || "Failed to load reminders.");
      } finally {
        if (!silent) setRemindersLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const scheduledReminders = useMemo(
    () => reminders.filter((item) => isReminderScheduled(item)),
    [reminders],
  );

  const historicalReminders = useMemo(
    () =>
      reminders
        .filter((item) => !isReminderScheduled(item))
        .sort(
          (a, b) =>
            new Date(b?.createdAt || 0).getTime() -
            new Date(a?.createdAt || 0).getTime(),
        ),
    [reminders],
  );

  const handleTemplateChange = (templateKey) => {
    const template = getReminderTemplate(templateKey);
    const isCustom = templateKey === "custom";

    setReminderForm((prev) => ({
      ...prev,
      templateKey,
      title: isCustom ? prev.title : template.title,
      message: isCustom ? prev.message : template.message,
      triggerMode: isCustom
        ? prev.triggerMode || "absolute_time"
        : template.triggerMode || "stage_based",
      watchStatus: isCustom ? prev.watchStatus : template.watchStatus || "",
      delayMinutes: isCustom ? prev.delayMinutes : template.delayMinutes || 0,
      remindAt: buildReminderDefaultDateTimeValue(template.offsetHours || 24),
    }));
  };

  const handleTriggerModeChange = (value) => {
    const mode = value === "stage_based" ? "stage_based" : "absolute_time";
    setReminderForm((prev) => ({
      ...prev,
      triggerMode: mode,
      remindAt:
        mode === "absolute_time"
          ? prev.remindAt || buildReminderDefaultDateTimeValue(24)
          : prev.remindAt,
      watchStatus: mode === "stage_based" ? prev.watchStatus || project?.status || "" : "",
      delayMinutes: mode === "stage_based" ? prev.delayMinutes || 0 : 0,
    }));
  };

  const handleOpenReminderModal = () => {
    setReminderError("");
    setEditingReminderId("");
    setReminderForm(buildInitialReminderForm("custom"));
    setShowReminderModal(true);
  };

  const handleCloseReminderModal = () => {
    if (savingReminder) return;
    setShowReminderModal(false);
    setReminderError("");
    setEditingReminderId("");
  };

  const replaceReminder = (updatedReminder) => {
    if (!updatedReminder?._id) return;
    setReminders((prev) => {
      const existingIndex = prev.findIndex((entry) => entry._id === updatedReminder._id);
      if (existingIndex === -1) {
        return [updatedReminder, ...prev];
      }
      const next = [...prev];
      next[existingIndex] = updatedReminder;
      return next;
    });
  };

  const removeReminder = (reminderId) => {
    if (!reminderId) return;
    setReminders((prev) => prev.filter((entry) => entry._id !== reminderId));
  };

  const handleEditReminder = (reminder) => {
    if (!reminder?._id || !isReminderEditable(reminder)) return;
    const reminderTemplate = getReminderTemplate(reminder.templateKey || "custom");
    const triggerMode =
      reminder.triggerMode === "stage_based" ? "stage_based" : "absolute_time";
    const remindAtValue = reminder.nextTriggerAt || reminder.remindAt;

    setReminderError("");
    setEditingReminderId(reminder._id);
    setReminderForm({
      templateKey: reminderTemplate.key || "custom",
      title: String(reminder.title || ""),
      message: String(reminder.message || ""),
      triggerMode,
      watchStatus:
        triggerMode === "stage_based"
          ? String(reminder.watchStatus || reminder.conditionStatus || "")
          : "",
      delayMinutes:
        triggerMode === "stage_based"
          ? Math.max(0, Number.parseInt(reminder.delayMinutes, 10) || 0)
          : 0,
      remindAt:
        triggerMode === "absolute_time"
          ? toDateTimeLocalValue(remindAtValue) || buildReminderDefaultDateTimeValue(24)
          : buildReminderDefaultDateTimeValue(reminderTemplate.offsetHours || 24),
      repeat: String(reminder.repeat || "none"),
      inApp: Boolean(reminder.channels?.inApp),
      email: Boolean(reminder.channels?.email),
    });
    setShowReminderModal(true);
  };

  const handleSubmitReminder = async (event) => {
    event.preventDefault();
    setReminderError("");

    const trimmedTitle = String(reminderForm.title || "").trim();
    if (!trimmedTitle) {
      setReminderError("Reminder title is required.");
      return;
    }

    if (!reminderForm.inApp && !reminderForm.email) {
      setReminderError("Select at least one delivery channel.");
      return;
    }

    const normalizedTriggerMode =
      reminderForm.triggerMode === "stage_based" ? "stage_based" : "absolute_time";
    let remindAtIso = null;

    if (normalizedTriggerMode === "absolute_time") {
      const parsedRemindAt = new Date(reminderForm.remindAt);
      if (Number.isNaN(parsedRemindAt.getTime())) {
        setReminderError("Select a valid reminder time.");
        return;
      }
      remindAtIso = parsedRemindAt.toISOString();
    } else if (!String(reminderForm.watchStatus || "").trim()) {
      setReminderError("Select the project stage to watch.");
      return;
    }

    setSavingReminder(true);

    try {
      const payload = {
        title: trimmedTitle,
        message: String(reminderForm.message || "").trim(),
        triggerMode: normalizedTriggerMode,
        remindAt: remindAtIso,
        repeat: reminderForm.repeat,
        watchStatus:
          normalizedTriggerMode === "stage_based"
            ? String(reminderForm.watchStatus || "").trim()
            : "",
        delayMinutes:
          normalizedTriggerMode === "stage_based"
            ? Math.max(0, Number.parseInt(reminderForm.delayMinutes, 10) || 0)
            : 0,
        templateKey: reminderForm.templateKey,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        channels: {
          inApp: Boolean(reminderForm.inApp),
          email: Boolean(reminderForm.email),
        },
      };

      if (!editingReminderId) {
        payload.projectId = projectId;
      }

      const res = await fetch(
        editingReminderId ? `/api/reminders/${editingReminderId}` : "/api/reminders",
        {
          method: editingReminderId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            (editingReminderId
              ? "Failed to update reminder."
              : "Failed to create reminder."),
        );
      }

      const savedReminder = await res.json();
      replaceReminder(savedReminder);
      setShowReminderModal(false);
      setEditingReminderId("");
      setReminderForm(buildInitialReminderForm("custom"));
    } catch (error) {
      console.error(
        editingReminderId ? "Failed to update reminder:" : "Failed to create reminder:",
        error,
      );
      setReminderError(
        error.message ||
          (editingReminderId
            ? "Failed to update reminder."
            : "Failed to create reminder."),
      );
    } finally {
      setSavingReminder(false);
    }
  };

  const handleRequestDeleteReminder = (reminder) => {
    if (!reminder?._id) return;
    setDeleteReminderTarget(reminder);
    setShowDeleteReminderModal(true);
  };

  const handleCloseDeleteReminderModal = () => {
    if (actionReminderId && actionReminderId === deleteReminderTarget?._id) {
      return;
    }
    setShowDeleteReminderModal(false);
    setDeleteReminderTarget(null);
  };

  const handleDeleteReminder = async () => {
    const reminderId = deleteReminderTarget?._id;
    if (!reminderId) return;

    setActionReminderId(reminderId);
    setReminderError("");

    try {
      const res = await fetch(`/api/reminders/${reminderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete reminder.");
      }

      removeReminder(reminderId);
      setShowDeleteReminderModal(false);
      setDeleteReminderTarget(null);
      if (editingReminderId === reminderId) {
        setShowReminderModal(false);
        setEditingReminderId("");
      }
    } catch (error) {
      console.error("Failed to delete reminder:", error);
      setReminderError(error.message || "Failed to delete reminder.");
    } finally {
      setActionReminderId("");
    }
  };

  const handleReminderAction = async (reminderId, endpoint, body = {}) => {
    if (!reminderId) return;
    setActionReminderId(reminderId);
    setReminderError("");

    try {
      const res = await fetch(`/api/reminders/${reminderId}${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update reminder.");
      }

      const updatedReminder = await res.json();
      replaceReminder(updatedReminder);
    } catch (error) {
      console.error("Failed to update reminder:", error);
      setReminderError(error.message || "Failed to update reminder.");
    } finally {
      setActionReminderId("");
    }
  };

  const renderReminderItem = (item) => {
    const canAct = isReminderActionAllowed(item, userId, userRole);
    const canManage = isReminderManageAllowed(item, userId, userRole);
    const isScheduled = isReminderScheduled(item);
    const isActionLoading = actionReminderId === item._id;
    const isStageBased = item.triggerMode === "stage_based";
    const hasConcreteTrigger = Boolean(item.nextTriggerAt || item.remindAt);
    const canEditReminder = canManage && isReminderEditable(item);

    return (
      <div key={item._id} className="project-reminder-item">
        <div className="project-reminder-item-head">
          <p className="project-reminder-item-title">{item.title || "Reminder"}</p>
          <span
            className={`project-reminder-status ${normalizeReminderStatus(
              item.status,
            )}`}
          >
            {getReminderStatusLabel(item.status)}
          </span>
        </div>

        {item.message ? (
          <p className="project-reminder-item-message">{item.message}</p>
        ) : null}

        <div className="project-reminder-meta">
          <span>{isStageBased ? "Type: Stage-based" : "Type: Date/Time"}</span>
          {isStageBased ? (
            <span>
              {hasConcreteTrigger
                ? `Next: ${formatReminderTime(item.nextTriggerAt || item.remindAt)}`
                : `Awaiting stage: ${item.watchStatus || "N/A"}`}
            </span>
          ) : (
            <span>Next: {formatReminderTime(item.nextTriggerAt || item.remindAt)}</span>
          )}
          {isStageBased ? (
            <span>Delay: {formatDelayMinutes(item.delayMinutes)}</span>
          ) : null}
          {isStageBased && item.stageMatchedAt ? (
            <span>Stage reached: {formatReminderTime(item.stageMatchedAt)}</span>
          ) : null}
          {item.repeat && item.repeat !== "none" ? (
            <span>Repeats: {item.repeat}</span>
          ) : null}
          {!isStageBased && item.conditionStatus ? (
            <span>Condition: {item.conditionStatus}</span>
          ) : null}
        </div>

        {isScheduled && canAct ? (
          <div className="project-reminder-actions">
            {canEditReminder ? (
              <button
                type="button"
                className="project-reminder-btn icon primary"
                onClick={() => handleEditReminder(item)}
                disabled={isActionLoading || savingReminder}
                aria-label="Edit reminder"
                title="Edit reminder"
              >
                <EditIcon />
              </button>
            ) : null}
            <button
              type="button"
              className="project-reminder-btn"
              onClick={() =>
                handleReminderAction(item._id, "/snooze", { minutes: 60 })
              }
              disabled={isActionLoading || !hasConcreteTrigger}
            >
              {isActionLoading ? "Saving..." : "Snooze 1h"}
            </button>
            <button
              type="button"
              className="project-reminder-btn success"
              onClick={() => handleReminderAction(item._id, "/complete")}
              disabled={isActionLoading}
            >
              {isActionLoading ? "Saving..." : "Complete"}
            </button>
            {canManage ? (
              <button
                type="button"
                className="project-reminder-btn danger"
                onClick={() => handleReminderAction(item._id, "/cancel")}
                disabled={isActionLoading}
              >
                {isActionLoading ? "Saving..." : "Cancel"}
              </button>
            ) : null}
          </div>
        ) : !isScheduled && canManage ? (
          <div className="project-reminder-actions">
            <button
              type="button"
              className="project-reminder-btn icon danger"
              onClick={() => handleRequestDeleteReminder(item)}
              disabled={isActionLoading}
              aria-label="Delete reminder"
              title="Delete reminder"
            >
              <TrashIcon width={14} height={14} color="currentColor" />
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="detail-card project-reminder-card">
      <div className="card-header project-reminder-card-head">
        <h3 className="card-title">Reminders</h3>
        <div className="project-reminder-head-actions">
          <button
            type="button"
            className="project-reminder-btn"
            onClick={() => fetchReminders()}
            disabled={remindersLoading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="project-reminder-btn primary"
            onClick={handleOpenReminderModal}
          >
            Set Reminder
          </button>
        </div>
      </div>

      {reminderError ? (
        <p className="project-reminder-error" role="alert">
          {reminderError}
        </p>
      ) : null}

      {remindersLoading ? (
        <p className="project-reminder-empty">Loading reminders...</p>
      ) : scheduledReminders.length > 0 ? (
        <div className="project-reminder-list">
          {scheduledReminders.map((item) => renderReminderItem(item))}
        </div>
      ) : (
        <p className="project-reminder-empty">
          No active reminders yet. Set one for follow-ups and stage checks.
        </p>
      )}

      {historicalReminders.length > 0 ? (
        <details className="project-reminder-history">
          <summary>History ({historicalReminders.length})</summary>
          <div className="project-reminder-list">
            {historicalReminders.slice(0, 8).map((item) => renderReminderItem(item))}
          </div>
        </details>
      ) : null}

      {showReminderModal ? (
        <div className="project-reminder-modal-overlay" role="presentation">
          <div
            className="project-reminder-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingReminderId ? "Edit reminder" : "Set reminder"}
          >
            <h3 className="project-reminder-modal-title">
              {editingReminderId ? "Edit Reminder" : "Set Reminder"}
            </h3>
            <form onSubmit={handleSubmitReminder}>
              <div className="form-group">
                <label htmlFor="project-reminder-template">Template</label>
                <select
                  id="project-reminder-template"
                  className="input-field"
                  value={reminderForm.templateKey}
                  onChange={(event) => handleTemplateChange(event.target.value)}
                >
                  {REMINDER_TEMPLATE_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="project-reminder-trigger-mode">Trigger mode</label>
                <select
                  id="project-reminder-trigger-mode"
                  className="input-field"
                  value={reminderForm.triggerMode}
                  onChange={(event) => handleTriggerModeChange(event.target.value)}
                >
                  <option value="absolute_time">Specific date/time</option>
                  <option value="stage_based">When project reaches a stage</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="project-reminder-title">Title</label>
                <input
                  id="project-reminder-title"
                  className="input-field"
                  type="text"
                  maxLength={140}
                  required
                  value={reminderForm.title}
                  onChange={(event) =>
                    setReminderForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="project-reminder-message">Message</label>
                <textarea
                  id="project-reminder-message"
                  className="input-field"
                  rows="3"
                  maxLength={800}
                  value={reminderForm.message}
                  onChange={(event) =>
                    setReminderForm((prev) => ({ ...prev, message: event.target.value }))
                  }
                />
              </div>

              {reminderForm.triggerMode === "absolute_time" ? (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="project-reminder-time">Remind at</label>
                    <input
                      id="project-reminder-time"
                      className="input-field"
                      type="datetime-local"
                      required
                      value={reminderForm.remindAt}
                      onChange={(event) =>
                        setReminderForm((prev) => ({ ...prev, remindAt: event.target.value }))
                      }
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="project-reminder-repeat">Repeat</label>
                    <select
                      id="project-reminder-repeat"
                      className="input-field"
                      value={reminderForm.repeat}
                      onChange={(event) =>
                        setReminderForm((prev) => ({ ...prev, repeat: event.target.value }))
                      }
                    >
                      {REMINDER_REPEAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="project-reminder-watch-status">Watch status</label>
                    <select
                      id="project-reminder-watch-status"
                      className="input-field"
                      value={reminderForm.watchStatus}
                      onChange={(event) =>
                        setReminderForm((prev) => ({
                          ...prev,
                          watchStatus: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select status</option>
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="project-reminder-delay">Delay after stage (minutes)</label>
                    <input
                      id="project-reminder-delay"
                      className="input-field"
                      type="number"
                      min="0"
                      max={String(60 * 24 * 90)}
                      value={reminderForm.delayMinutes}
                      onChange={(event) =>
                        setReminderForm((prev) => ({
                          ...prev,
                          delayMinutes: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              {reminderForm.triggerMode === "stage_based" ? (
                <div className="form-group">
                  <label htmlFor="project-reminder-repeat-stage">Repeat</label>
                  <select
                    id="project-reminder-repeat-stage"
                    className="input-field"
                    value={reminderForm.repeat}
                    onChange={(event) =>
                      setReminderForm((prev) => ({ ...prev, repeat: event.target.value }))
                    }
                  >
                    {REMINDER_REPEAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="project-reminder-channel-grid">
                <label className="project-reminder-channel-option">
                  <input
                    type="checkbox"
                    checked={reminderForm.inApp}
                    onChange={(event) =>
                      setReminderForm((prev) => ({
                        ...prev,
                        inApp: event.target.checked,
                      }))
                    }
                  />
                  In-app notification
                </label>
                <label className="project-reminder-channel-option">
                  <input
                    type="checkbox"
                    checked={reminderForm.email}
                    onChange={(event) =>
                      setReminderForm((prev) => ({
                        ...prev,
                        email: event.target.checked,
                      }))
                    }
                  />
                  Email notification
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCloseReminderModal}
                  disabled={savingReminder}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={savingReminder}>
                  {savingReminder
                    ? "Saving..."
                    : editingReminderId
                      ? "Save Changes"
                      : "Save Reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmationModal
        isOpen={showDeleteReminderModal}
        title="Delete Reminder"
        message={`Delete "${
          deleteReminderTarget?.title || "this reminder"
        }" from history? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteReminder}
        onCancel={handleCloseDeleteReminderModal}
      />
    </div>
  );
};

export default ProjectReminderPanel;
