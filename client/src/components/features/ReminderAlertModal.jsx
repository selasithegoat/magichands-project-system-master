import React from "react";
import { Link } from "react-router-dom";
import "./ReminderAlertModal.css";
import ReminderBellIcon from "../icons/ReminderBellIcon";

const formatTime = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const ReminderAlertModal = ({
  reminder,
  loading = false,
  error = "",
  onSnooze,
  onStop,
  onComplete,
  onNavigateProject,
}) => {
  if (!reminder) return null;

  const triggerText = formatTime(reminder.createdAt);
  const projectOrderId = String(reminder.projectOrderId || "").trim();
  const projectName = String(reminder.projectName || "").trim();
  const projectId = String(reminder.projectId || "").trim();
  const projectPath = String(reminder.projectPath || "").trim();
  const hasProjectMeta = Boolean(projectOrderId || projectName);

  return (
    <div className="reminder-alert-overlay" role="presentation">
      <div
        className="reminder-alert-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Reminder alert"
      >
        <p className="reminder-alert-eyebrow">
          <span className="reminder-alert-eyebrow-icon" aria-hidden="true">
            <ReminderBellIcon width="14" height="14" color="currentColor" />
          </span>
          Reminder Alert
        </p>
        <h3 className="reminder-alert-title">{reminder.title || "Reminder"}</h3>
        {hasProjectMeta ? (
          <div className="reminder-alert-project">
            <div className="reminder-alert-project-text">
              {projectOrderId ? (
                <span className="reminder-alert-project-order">
                  Order: {projectOrderId}
                </span>
              ) : null}
              {projectName ? (
                <span className="reminder-alert-project-name">{projectName}</span>
              ) : null}
            </div>
            {projectId ? (
              <Link
                className="reminder-alert-project-link"
                to={projectPath || `/detail/${projectId}`}
                onClick={onNavigateProject}
              >
                Open Project
              </Link>
            ) : null}
          </div>
        ) : null}
        {reminder.message ? (
          <p className="reminder-alert-message">{reminder.message}</p>
        ) : null}
        {triggerText ? (
          <p className="reminder-alert-meta">Triggered: {triggerText}</p>
        ) : null}
        <p className="reminder-alert-note">
          This alert requires action. Choose one option below.
        </p>

        {error ? (
          <p className="reminder-alert-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="reminder-alert-actions">
          <button
            type="button"
            className="reminder-alert-btn"
            onClick={onSnooze}
            disabled={loading}
          >
            {loading ? "Saving..." : "Snooze 1h"}
          </button>
          <button
            type="button"
            className="reminder-alert-btn danger"
            onClick={onStop}
            disabled={loading}
          >
            {loading ? "Saving..." : "Stop Reminder"}
          </button>
          <button
            type="button"
            className="reminder-alert-btn success"
            onClick={onComplete}
            disabled={loading}
          >
            {loading ? "Saving..." : "Mark Complete"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReminderAlertModal;
