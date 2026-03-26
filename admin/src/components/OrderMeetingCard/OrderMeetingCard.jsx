import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import "./OrderMeetingCard.css";

const REMINDER_OPTIONS = [
  { value: 1440, label: "24 hours before" },
  { value: 60, label: "1 hour before" },
];

const normalizeDepartmentValue = (value) => {
  if (value && typeof value === "object") {
    const optionValue = value.value || value.label || "";
    return String(optionValue).trim().toLowerCase();
  }
  return String(value || "")
    .trim()
    .toLowerCase();
};

const toDepartmentArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
};

const isFrontDeskUser = (user) =>
  toDepartmentArray(user?.department)
    .map(normalizeDepartmentValue)
    .includes("front desk");

const canManageMeetings = (user) =>
  Boolean(user && (user.role === "admin" || isFrontDeskUser(user)));

const getDefaultTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const toLocalInputValue = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoFromLocalInput = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
};

const formatMeetingStatus = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "Not Scheduled";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatMeetingDateTime = (value) => {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBD";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatReminderOffset = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value % 1440 === 0) {
    const days = value / 1440;
    return `${days} day${days === 1 ? "" : "s"} before`;
  }
  if (value % 60 === 0) {
    const hours = value / 60;
    return `${hours} hour${hours === 1 ? "" : "s"} before`;
  }
  return `${value} mins before`;
};

const buildInitialForm = (meeting) => ({
  meetingAt: meeting?.meetingAt ? toLocalInputValue(meeting.meetingAt) : "",
  location: meeting?.location || "",
  virtualLink: meeting?.virtualLink || "",
  agenda: meeting?.agenda || "",
  reminderOffsets: Array.isArray(meeting?.reminderOffsets)
    ? meeting.reminderOffsets
    : [],
});

const OrderMeetingCard = ({
  project,
  orderNumber: orderNumberProp,
  orderGroupProjects = [],
  user,
  readOnly = false,
  showHistory = true,
  manageHint = "",
  onMeetingOverrideChange,
}) => {
  const orderNumber = String(
    orderNumberProp || project?.orderId || project?.orderRef?.orderNumber || "",
  ).trim();
  const isRequired = Boolean(
    project?.projectType === "Corporate Job" ||
      (Array.isArray(orderGroupProjects) && orderGroupProjects.length > 1),
  );
  const allowManage = canManageMeetings(user) && !readOnly;
  const allowSkip = Boolean(user?.role === "admin" && !readOnly);
  const meetingSkipped = useMemo(() => {
    if (project?.meetingOverride?.skipped) return true;
    if (Array.isArray(orderGroupProjects) && orderGroupProjects.length > 0) {
      return orderGroupProjects.some((entry) => entry?.meetingOverride?.skipped);
    }
    return false;
  }, [project, orderGroupProjects]);

  const [meeting, setMeeting] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState(() => buildInitialForm(null));

  const reminderLabels = useMemo(() => {
    const offsets = Array.isArray(meeting?.reminderOffsets)
      ? meeting.reminderOffsets
      : [];
    return offsets
      .map(formatReminderOffset)
      .filter(Boolean)
      .join(", ");
  }, [meeting?.reminderOffsets]);

  const fetchMeeting = async (targetOrderNumber) => {
    if (!targetOrderNumber) {
      setMeeting(null);
      setMeetings([]);
      setForm(buildInitialForm(null));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/meetings/order/${encodeURIComponent(
          targetOrderNumber,
        )}?source=admin`,
        { credentials: "include" },
      );
      if (!res.ok) {
        if (res.status === 404) {
          setMeeting(null);
          setForm(buildInitialForm(null));
          return;
        }
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load meeting.");
      }
      const data = await res.json();
      const meetingData = data?.meeting || null;
      const meetingList = Array.isArray(data?.meetings) ? data.meetings : [];
      setMeeting(meetingData);
      setMeetings(meetingList);
      setForm(buildInitialForm(meetingData));
    } catch (fetchError) {
      console.error("Failed to fetch meeting:", fetchError);
      setError(fetchError.message || "Failed to load meeting.");
      setMeeting(null);
      setMeetings([]);
      setForm(buildInitialForm(null));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeeting(orderNumber);
  }, [orderNumber]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleReminderOffset = (value) => {
    setForm((prev) => {
      const next = new Set(prev.reminderOffsets || []);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...prev, reminderOffsets: Array.from(next).sort((a, b) => b - a) };
    });
  };

  const handleSaveMeeting = async () => {
    if (!allowManage || saving) return;
    setError("");

    if (!orderNumber) {
      setError("Order number is required to schedule a meeting.");
      return;
    }

    if (!form.meetingAt) {
      setError("Meeting date/time is required.");
      return;
    }

    const meetingAt = toIsoFromLocalInput(form.meetingAt);
    if (!meetingAt) {
      setError("Meeting date/time is invalid.");
      return;
    }

    const isScheduled = meeting?.status === "scheduled";
    const url = isScheduled ? `/api/meetings/${meeting._id}` : "/api/meetings";
    const method = isScheduled ? "PATCH" : "POST";

    const payload = {
      orderNumber,
      meetingAt,
      timezone: meeting?.timezone || getDefaultTimezone(),
      location: form.location,
      virtualLink: form.virtualLink,
      agenda: form.agenda,
      reminderOffsets: form.reminderOffsets || [],
      channels: { inApp: true, email: true },
    };

    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            (isScheduled ? "Failed to update meeting." : "Failed to schedule meeting."),
        );
      }
      await res.json();
      await fetchMeeting(orderNumber);
      toast.success(isScheduled ? "Meeting updated." : "Meeting scheduled.");
    } catch (saveError) {
      console.error("Meeting save failed:", saveError);
      setError(saveError.message || "Failed to save meeting.");
      toast.error(saveError.message || "Failed to save meeting.");
    } finally {
      setSaving(false);
    }
  };

  const handleMeetingOverride = async (nextSkipped) => {
    if (!allowSkip || skipping) return;
    const targetProjectId =
      project?._id || orderGroupProjects?.[0]?._id || "";
    if (!targetProjectId) {
      setError("Project reference is required to update meeting overrides.");
      return;
    }

    const confirmMessage = nextSkipped
      ? "Skip the departmental meeting requirement? This lets the project move past the meeting gate."
      : "Restore the departmental meeting requirement for this order?";
    if (!window.confirm(confirmMessage)) return;

    setSkipping(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${targetProjectId}/meeting-override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ skipped: nextSkipped }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update meeting override.");
      }
      const updatedProject = await res.json();
      if (typeof onMeetingOverrideChange === "function") {
        onMeetingOverrideChange(updatedProject);
      }
      toast.success(
        nextSkipped ? "Meeting requirement skipped." : "Meeting requirement restored.",
      );
    } catch (overrideError) {
      console.error("Meeting override failed:", overrideError);
      setError(overrideError.message || "Failed to update meeting override.");
      toast.error(overrideError.message || "Failed to update meeting override.");
    } finally {
      setSkipping(false);
    }
  };

  const runMeetingAction = async ({ meetingId, endpoint, successMessage }) => {
    if (!allowManage || !meetingId) return;
    if (actionId) return;
    setError("");
    setActionId(meetingId);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update meeting.");
      }
      await res.json();
      await fetchMeeting(orderNumber);
      if (successMessage) toast.success(successMessage);
    } catch (actionError) {
      console.error("Meeting action failed:", actionError);
      setError(actionError.message || "Failed to update meeting.");
      toast.error(actionError.message || "Failed to update meeting.");
    } finally {
      setActionId("");
    }
  };

  const handleEditMeeting = (entry) => {
    if (!entry) return;
    setMeeting(entry);
    setForm(buildInitialForm(entry));
  };

  const canEdit = allowManage;

  return (
    <div className="detail-card order-meeting-card">
      <div className="detail-card-header">
        <h3 className="card-title">Departmental Meeting</h3>
        <div className="order-meeting-badges">
          {isRequired && <span className="meeting-pill required">Required</span>}
          {meetingSkipped && <span className="meeting-pill skipped">Skipped</span>}
          <span className="meeting-pill status">
            {meetingSkipped ? "Override Active" : formatMeetingStatus(meeting?.status)}
          </span>
        </div>
      </div>

      {loading && <p className="order-meeting-note">Loading meeting details...</p>}
      {error && <div className="order-meeting-error">{error}</div>}

      {!loading && !meeting && !meetingSkipped && (
        <p className="order-meeting-note">
          No meeting has been scheduled for this order yet.
        </p>
      )}

      {meetingSkipped && (
        <p className="order-meeting-note">
          Meeting requirement has been skipped by an admin. This order can advance
          without a departmental meeting.
        </p>
      )}

      {meeting && (
        <div className="order-meeting-summary">
          <div>
            <span className="order-meeting-label">Scheduled for</span>
            <p className="order-meeting-value">
              {formatMeetingDateTime(meeting.meetingAt)}
              {meeting.timezone ? ` (${meeting.timezone})` : ""}
            </p>
          </div>
          {meeting.location && (
            <div>
              <span className="order-meeting-label">Location</span>
              <p className="order-meeting-value">{meeting.location}</p>
            </div>
          )}
          {meeting.virtualLink && (
            <div>
              <span className="order-meeting-label">Virtual Link</span>
              <p className="order-meeting-value">
                <a href={meeting.virtualLink} target="_blank" rel="noreferrer">
                  {meeting.virtualLink}
                </a>
              </p>
            </div>
          )}
          {meeting.agenda && (
            <div>
              <span className="order-meeting-label">Agenda</span>
              <p className="order-meeting-value">{meeting.agenda}</p>
            </div>
          )}
          {reminderLabels && (
            <div>
              <span className="order-meeting-label">Reminders</span>
              <p className="order-meeting-value">{reminderLabels}</p>
            </div>
          )}
        </div>
      )}

      {manageHint && (
        <div className="order-meeting-hint">{manageHint}</div>
      )}

      {canEdit && (
        <>
          <div className="order-meeting-form">
            <div className="order-meeting-row">
              <div className="order-meeting-field">
                <label htmlFor="meeting-at">Meeting Date &amp; Time</label>
                <input
                  id="meeting-at"
                  className="edit-input"
                  type="datetime-local"
                  value={form.meetingAt}
                  onChange={(event) => updateField("meetingAt", event.target.value)}
                />
              </div>
            </div>

            <div className="order-meeting-row">
              <div className="order-meeting-field">
                <label htmlFor="meeting-location">Location</label>
                <input
                  id="meeting-location"
                  className="edit-input"
                  type="text"
                  value={form.location}
                  onChange={(event) => updateField("location", event.target.value)}
                  placeholder="Office / Address"
                />
              </div>
              <div className="order-meeting-field">
                <label htmlFor="meeting-link">Virtual Link</label>
                <input
                  id="meeting-link"
                  className="edit-input"
                  type="url"
                  value={form.virtualLink}
                  onChange={(event) => updateField("virtualLink", event.target.value)}
                  placeholder="https://meet..."
                />
              </div>
            </div>

            <div className="order-meeting-field">
              <label htmlFor="meeting-agenda">Agenda</label>
              <textarea
                id="meeting-agenda"
                className="edit-input"
                rows="3"
                value={form.agenda}
                onChange={(event) => updateField("agenda", event.target.value)}
                placeholder="Key discussion points"
              />
            </div>

            <div className="order-meeting-field">
              <label>Reminder Offsets</label>
              <div className="order-meeting-reminders">
                {REMINDER_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="order-meeting-reminder-option"
                  >
                    <input
                      type="checkbox"
                      checked={form.reminderOffsets.includes(option.value)}
                      onChange={() => toggleReminderOffset(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <p className="order-meeting-note">
                Notifications are sent via email and in-app only.
              </p>
            </div>
          </div>

          <div className="order-meeting-actions">
            <button
              type="button"
              className="order-meeting-btn primary"
              onClick={handleSaveMeeting}
              disabled={saving || !orderNumber}
            >
              {saving
                ? "Saving..."
                : meeting?.status === "scheduled"
                  ? "Update Meeting"
                  : "Schedule Meeting"}
            </button>
            {allowSkip && isRequired && (
              <button
                type="button"
                className={`order-meeting-btn ${meetingSkipped ? "ghost" : "warn"}`}
                onClick={() => handleMeetingOverride(!meetingSkipped)}
                disabled={skipping}
              >
                {skipping
                  ? meetingSkipped
                    ? "Restoring..."
                    : "Skipping..."
                  : meetingSkipped
                    ? "Require Meeting"
                    : "Skip Meeting"}
              </button>
            )}
          </div>
        </>
      )}

      {showHistory && meetings.length > 0 && (
        <div className="order-meeting-history">
          <h4>Meeting Records</h4>
          <div className="order-meeting-history-list">
            {meetings.map((entry) => {
              const isScheduled = entry.status === "scheduled";
              const isActionLoading = actionId === entry._id;
              return (
              <div
                key={entry._id || entry.meetingAt}
                className={`order-meeting-history-item ${entry.status || ""}`}
              >
                <div className="order-meeting-history-main">
                  <span className="order-meeting-history-date">
                    {formatMeetingDateTime(entry.meetingAt)}
                  </span>
                  <span className="meeting-pill status">
                    {formatMeetingStatus(entry.status)}
                  </span>
                </div>
                <div className="order-meeting-history-meta">
                  {entry.timezone && <span>{entry.timezone}</span>}
                  {entry.location && <span>{entry.location}</span>}
                  {entry.virtualLink && (
                    <a href={entry.virtualLink} target="_blank" rel="noreferrer">
                      Virtual link
                    </a>
                  )}
                </div>
                {allowManage && isScheduled && (
                  <div className="order-meeting-history-actions">
                    <button
                      type="button"
                      className="order-meeting-action-btn ghost"
                      onClick={() => handleEditMeeting(entry)}
                      disabled={isActionLoading}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="order-meeting-action-btn warn"
                      onClick={() =>
                        runMeetingAction({
                          meetingId: entry._id,
                          endpoint: "cancel",
                          successMessage: "Meeting cancelled.",
                        })
                      }
                      disabled={isActionLoading}
                    >
                      {isActionLoading ? "Cancelling..." : "Cancel"}
                    </button>
                    <button
                      type="button"
                      className="order-meeting-action-btn complete"
                      onClick={() =>
                        runMeetingAction({
                          meetingId: entry._id,
                          endpoint: "complete",
                          successMessage: "Meeting marked complete.",
                        })
                      }
                      disabled={isActionLoading}
                    >
                      {isActionLoading ? "Completing..." : "Mark Complete"}
                    </button>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderMeetingCard;
