import React, { useCallback, useEffect, useMemo, useState } from "react";
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
    delayMinutes: 24 * 60,
    offsetHours: 24,
  },
  {
    key: "production_progress",
    label: "Production Progress Check",
    title: "Check production progress",
    message: "Confirm production progress and update blockers if any.",
    triggerMode: "stage_based",
    watchStatus: "Pending Production",
    delayMinutes: 24 * 60,
    offsetHours: 24,
  },
  {
    key: "delivery_readiness",
    label: "Delivery Readiness",
    title: "Confirm delivery readiness",
    message: "Verify packaging, logistics, and final readiness before delivery.",
    triggerMode: "stage_based",
    watchStatus: "Pending Delivery/Pickup",
    delayMinutes: 12 * 60,
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
    setReminderForm(buildInitialReminderForm("custom"));
    setShowReminderModal(true);
  };

  const handleCloseReminderModal = () => {
    if (savingReminder) return;
    setShowReminderModal(false);
    setReminderError("");
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

  const handleCreateReminder = async (event) => {
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
        projectId,
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

      const res = await fetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create reminder.");
      }

      const createdReminder = await res.json();
      replaceReminder(createdReminder);
      setShowReminderModal(false);
      setReminderForm(buildInitialReminderForm("custom"));
    } catch (error) {
      console.error("Failed to create reminder:", error);
      setReminderError(error.message || "Failed to create reminder.");
    } finally {
      setSavingReminder(false);
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
            aria-label="Set reminder"
          >
            <h3 className="project-reminder-modal-title">Set Reminder</h3>
            <form onSubmit={handleCreateReminder}>
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
                  {savingReminder ? "Saving..." : "Save Reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ProjectReminderPanel;
