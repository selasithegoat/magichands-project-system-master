import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./ProjectRemindersCard.css";

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

const canActReminder = (reminder, userId, role) => {
  if (!userId || !reminder) return false;
  if (role === "admin") return true;
  if (toEntityId(reminder?.createdBy) === userId) return true;

  return (Array.isArray(reminder?.recipients) ? reminder.recipients : []).some(
    (entry) => toEntityId(entry?.user) === userId,
  );
};

const canManageReminder = (reminder, userId, role) => {
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

const ProjectRemindersCard = ({ project, user }) => {
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

  const buildInitialForm = useCallback((templateKey = "custom") => {
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
  }, []);

  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => buildInitialForm("custom"));

  const fetchReminders = useCallback(async () => {
    if (!projectId) {
      setReminders([]);
      return;
    }

    setLoading(true);
    setError("");
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
    } catch (fetchError) {
      console.error("Failed to fetch reminders:", fetchError);
      setError(fetchError.message || "Failed to load reminders.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const scheduledReminders = useMemo(
    () => reminders.filter((item) => isReminderScheduled(item)),
    [reminders],
  );

  const historyReminders = useMemo(
    () => reminders.filter((item) => !isReminderScheduled(item)),
    [reminders],
  );

  const applyReminder = (updatedReminder) => {
    if (!updatedReminder?._id) return;
    setReminders((prev) => {
      const existingIndex = prev.findIndex((item) => item._id === updatedReminder._id);
      if (existingIndex === -1) return [updatedReminder, ...prev];
      const next = [...prev];
      next[existingIndex] = updatedReminder;
      return next;
    });
  };

  const handleTemplateChange = (templateKey) => {
    const template = getReminderTemplate(templateKey);
    const isCustom = templateKey === "custom";

    setForm((prev) => ({
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
    setForm((prev) => ({
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

  const openModal = () => {
    setError("");
    setForm(buildInitialForm("custom"));
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setError("");
  };

  const submitReminder = async (event) => {
    event.preventDefault();
    setError("");

    const trimmedTitle = String(form.title || "").trim();
    if (!trimmedTitle) {
      setError("Reminder title is required.");
      return;
    }

    if (!form.inApp && !form.email) {
      setError("Select at least one delivery channel.");
      return;
    }

    const normalizedTriggerMode =
      form.triggerMode === "stage_based" ? "stage_based" : "absolute_time";

    let remindAtIso = null;
    if (normalizedTriggerMode === "absolute_time") {
      const parsedRemindAt = new Date(form.remindAt);
      if (Number.isNaN(parsedRemindAt.getTime())) {
        setError("Select a valid reminder time.");
        return;
      }
      remindAtIso = parsedRemindAt.toISOString();
    } else if (!String(form.watchStatus || "").trim()) {
      setError("Select the project stage to watch.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        projectId,
        title: trimmedTitle,
        message: String(form.message || "").trim(),
        triggerMode: normalizedTriggerMode,
        remindAt: remindAtIso,
        repeat: form.repeat,
        watchStatus:
          normalizedTriggerMode === "stage_based" ? String(form.watchStatus || "").trim() : "",
        delayMinutes:
          normalizedTriggerMode === "stage_based"
            ? Math.max(0, Number.parseInt(form.delayMinutes, 10) || 0)
            : 0,
        templateKey: form.templateKey,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        channels: {
          inApp: Boolean(form.inApp),
          email: Boolean(form.email),
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
      applyReminder(createdReminder);
      setShowModal(false);
      setForm(buildInitialForm("custom"));
    } catch (submitError) {
      console.error("Failed to create reminder:", submitError);
      setError(submitError.message || "Failed to create reminder.");
    } finally {
      setSaving(false);
    }
  };

  const runReminderAction = async (reminderId, endpoint, body = {}) => {
    if (!reminderId) return;
    setActionId(reminderId);
    setError("");

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
      applyReminder(updatedReminder);
    } catch (actionError) {
      console.error("Failed to update reminder:", actionError);
      setError(actionError.message || "Failed to update reminder.");
    } finally {
      setActionId("");
    }
  };

  const renderReminder = (item) => {
    const canAct = canActReminder(item, userId, userRole);
    const canManage = canManageReminder(item, userId, userRole);
    const isScheduled = isReminderScheduled(item);
    const isActionLoading = actionId === item._id;
    const isStageBased = item.triggerMode === "stage_based";
    const hasConcreteTrigger = Boolean(item.nextTriggerAt || item.remindAt);

    return (
      <div key={item._id} className="admin-reminder-item">
        <div className="admin-reminder-item-head">
          <p className="admin-reminder-item-title">{item.title || "Reminder"}</p>
          <span
            className={`admin-reminder-status ${normalizeReminderStatus(item.status)}`}
          >
            {getReminderStatusLabel(item.status)}
          </span>
        </div>

        {item.message ? <p className="admin-reminder-message">{item.message}</p> : null}

        <div className="admin-reminder-meta">
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
          {isStageBased ? <span>Delay: {formatDelayMinutes(item.delayMinutes)}</span> : null}
          {isStageBased && item.stageMatchedAt ? (
            <span>Stage reached: {formatReminderTime(item.stageMatchedAt)}</span>
          ) : null}
          {item.repeat && item.repeat !== "none" ? <span>Repeats: {item.repeat}</span> : null}
          {!isStageBased && item.conditionStatus ? (
            <span>Condition: {item.conditionStatus}</span>
          ) : null}
        </div>

        {isScheduled && canAct ? (
          <div className="admin-reminder-actions">
            <button
              type="button"
              className="admin-reminder-btn"
              onClick={() => runReminderAction(item._id, "/snooze", { minutes: 60 })}
              disabled={isActionLoading || !hasConcreteTrigger}
            >
              {isActionLoading ? "Saving..." : "Snooze 1h"}
            </button>
            <button
              type="button"
              className="admin-reminder-btn success"
              onClick={() => runReminderAction(item._id, "/complete")}
              disabled={isActionLoading}
            >
              {isActionLoading ? "Saving..." : "Complete"}
            </button>
            {canManage ? (
              <button
                type="button"
                className="admin-reminder-btn danger"
                onClick={() => runReminderAction(item._id, "/cancel")}
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
    <div className="detail-card admin-reminder-card">
      <h3 className="card-title admin-reminder-card-title">
        <span>Reminders</span>
        <div className="admin-reminder-head-actions">
          <button
            type="button"
            className="admin-reminder-btn"
            onClick={fetchReminders}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="admin-reminder-btn primary"
            onClick={openModal}
          >
            Set Reminder
          </button>
        </div>
      </h3>

      {error ? (
        <p className="admin-reminder-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="admin-reminder-empty">Loading reminders...</p>
      ) : scheduledReminders.length > 0 ? (
        <div className="admin-reminder-list">
          {scheduledReminders.map((item) => renderReminder(item))}
        </div>
      ) : (
        <p className="admin-reminder-empty">No active reminders for this project.</p>
      )}

      {historyReminders.length > 0 ? (
        <details className="admin-reminder-history">
          <summary>History ({historyReminders.length})</summary>
          <div className="admin-reminder-list">
            {historyReminders.slice(0, 8).map((item) => renderReminder(item))}
          </div>
        </details>
      ) : null}

      {showModal ? (
        <div className="admin-reminder-modal-overlay" role="presentation">
          <div
            className="admin-reminder-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Set reminder"
          >
            <h3 className="admin-reminder-modal-title">Set Reminder</h3>
            <form onSubmit={submitReminder}>
              <div className="admin-reminder-field">
                <label htmlFor="admin-reminder-template">Template</label>
                <select
                  id="admin-reminder-template"
                  className="admin-reminder-input"
                  value={form.templateKey}
                  onChange={(event) => handleTemplateChange(event.target.value)}
                >
                  {REMINDER_TEMPLATE_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-reminder-field">
                <label htmlFor="admin-reminder-trigger-mode">Trigger mode</label>
                <select
                  id="admin-reminder-trigger-mode"
                  className="admin-reminder-input"
                  value={form.triggerMode}
                  onChange={(event) => handleTriggerModeChange(event.target.value)}
                >
                  <option value="absolute_time">Specific date/time</option>
                  <option value="stage_based">When project reaches a stage</option>
                </select>
              </div>

              <div className="admin-reminder-field">
                <label htmlFor="admin-reminder-title">Title</label>
                <input
                  id="admin-reminder-title"
                  className="admin-reminder-input"
                  type="text"
                  maxLength={140}
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>

              <div className="admin-reminder-field">
                <label htmlFor="admin-reminder-message">Message</label>
                <textarea
                  id="admin-reminder-message"
                  className="admin-reminder-input"
                  rows="3"
                  maxLength={800}
                  value={form.message}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, message: event.target.value }))
                  }
                />
              </div>

              {form.triggerMode === "absolute_time" ? (
                <div className="admin-reminder-row">
                  <div className="admin-reminder-field">
                    <label htmlFor="admin-reminder-time">Remind at</label>
                    <input
                      id="admin-reminder-time"
                      className="admin-reminder-input"
                      type="datetime-local"
                      required
                      value={form.remindAt}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, remindAt: event.target.value }))
                      }
                    />
                  </div>
                  <div className="admin-reminder-field">
                    <label htmlFor="admin-reminder-repeat">Repeat</label>
                    <select
                      id="admin-reminder-repeat"
                      className="admin-reminder-input"
                      value={form.repeat}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, repeat: event.target.value }))
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
                <>
                  <div className="admin-reminder-row">
                    <div className="admin-reminder-field">
                      <label htmlFor="admin-reminder-watch-status">Watch status</label>
                      <select
                        id="admin-reminder-watch-status"
                        className="admin-reminder-input"
                        value={form.watchStatus}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, watchStatus: event.target.value }))
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
                    <div className="admin-reminder-field">
                      <label htmlFor="admin-reminder-delay">Delay after stage (minutes)</label>
                      <input
                        id="admin-reminder-delay"
                        className="admin-reminder-input"
                        type="number"
                        min="0"
                        max={String(60 * 24 * 90)}
                        value={form.delayMinutes}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, delayMinutes: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="admin-reminder-field">
                    <label htmlFor="admin-reminder-repeat-stage">Repeat</label>
                    <select
                      id="admin-reminder-repeat-stage"
                      className="admin-reminder-input"
                      value={form.repeat}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, repeat: event.target.value }))
                      }
                    >
                      {REMINDER_REPEAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="admin-reminder-channel-grid">
                <label className="admin-reminder-channel-option">
                  <input
                    type="checkbox"
                    checked={form.inApp}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, inApp: event.target.checked }))
                    }
                  />
                  In-app notification
                </label>
                <label className="admin-reminder-channel-option">
                  <input
                    type="checkbox"
                    checked={form.email}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, email: event.target.checked }))
                    }
                  />
                  Email notification
                </label>
              </div>

              <div className="admin-reminder-modal-actions">
                <button
                  type="button"
                  className="admin-reminder-btn"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-reminder-btn primary"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ProjectRemindersCard;
