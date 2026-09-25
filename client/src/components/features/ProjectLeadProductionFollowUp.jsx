import React, { useEffect, useMemo, useState } from "react";
import "./ProjectLeadProductionFollowUp.css";

const ACTIVE_PRODUCTION_STATUSES = new Set([
  "Pending Production",
  "Production In Progress",
]);
const DEFAULT_COOLDOWN_MS = 30 * 60 * 1000;

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    if (value._id) return toEntityId(value._id);
    if (value.id) return toEntityId(value.id);
  }
  return "";
};

const getPersonName = (person, fallback = "Unassigned") => {
  if (!person || typeof person !== "object") return fallback;
  const fullName = `${person.firstName || ""} ${person.lastName || ""}`
    .trim()
    .replace(/\s+/g, " ");
  return fullName || person.name || person.employeeId || fallback;
};

const formatDateTime = (value) => {
  if (!value) return "Not available";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not available";
  return parsed.toLocaleString("en-GB", {
    timeZone: "Africa/Accra",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatCooldown = (remainingMs) => {
  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes} min${totalMinutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${minutes ? ` ${minutes}m` : ""}`;
};

const ProjectLeadProductionFollowUp = ({ project, user, onUpdate }) => {
  const currentUserId = toEntityId(user?._id || user?.id);
  const isLead = useMemo(
    () =>
      Boolean(
        currentUserId &&
          [project?.projectLeadId, project?.assistantLeadId]
            .map(toEntityId)
            .filter(Boolean)
            .includes(currentUserId),
      ),
    [currentUserId, project?.assistantLeadId, project?.projectLeadId],
  );
  const isActive = ACTIVE_PRODUCTION_STATUSES.has(project?.status);
  const ownerId = toEntityId(project?.productionOwnerId);
  const initialLastSentAt =
    project?.productionTracking?.notificationState?.leadPromptLastSentAt;
  const [lastSentAt, setLastSentAt] = useState(initialLastSentAt || null);
  const [nextAllowedAt, setNextAllowedAt] = useState(
    initialLastSentAt
      ? new Date(new Date(initialLastSentAt).getTime() + DEFAULT_COOLDOWN_MS)
      : null,
  );
  const [now, setNow] = useState(Date.now());
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    setLastSentAt(initialLastSentAt || null);
    setNextAllowedAt(
      initialLastSentAt
        ? new Date(new Date(initialLastSentAt).getTime() + DEFAULT_COOLDOWN_MS)
        : null,
    );
  }, [initialLastSentAt]);

  useEffect(() => {
    if (!nextAllowedAt || nextAllowedAt.getTime() <= Date.now()) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, [nextAllowedAt]);

  if (!isLead || !isActive) return null;

  const remainingCooldownMs = nextAllowedAt
    ? Math.max(0, nextAllowedAt.getTime() - now)
    : 0;
  const onCooldown = remainingCooldownMs > 0;
  const isQueued = project.status === "Pending Production";
  const expectedAt = isQueued
    ? project?.productionTracking?.predictedStartAt
    : project?.productionTracking?.predictedCompletionAt;
  const expectedLabel = isQueued ? "Predicted start" : "Predicted completion";
  const completionReview = project?.productionTracking?.completionReview || {};
  const completionReviewMessage =
    completionReview.status === "awaiting_lead"
      ? "A predicted-time completion check is waiting in your notifications."
      : completionReview.status === "awaiting_owner"
        ? "You confirmed the work is done. Waiting for the Production owner to securely complete the stage."
        : completionReview.status === "not_ready"
          ? `Next completion check: ${formatDateTime(completionReview.nextCheckAt)}`
          : "";

  const handleRemindOwner = async () => {
    if (!project?._id || !ownerId || sending || onCooldown) return;
    setSending(true);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/projects/${project._id}/production/remind-owner`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
      );
      const data = await response.json().catch(() => ({}));
      if (data?.nextAllowedAt) {
        setNextAllowedAt(new Date(data.nextAllowedAt));
        setNow(Date.now());
      }
      if (!response.ok) {
        throw new Error(data.message || "The reminder could not be sent.");
      }

      setLastSentAt(data.sentAt || new Date().toISOString());
      setFeedback({ type: "success", message: data.message || "Reminder sent." });
      if (typeof onUpdate === "function") {
        onUpdate({ silent: true });
      }
    } catch (error) {
      setFeedback({
        type: "error",
        message: error.message || "The reminder could not be sent.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="detail-card production-follow-up-card">
      <div className="card-header production-follow-up-heading">
        <div>
          <p className="production-follow-up-eyebrow">Production follow-up</p>
          <h3 className="card-title">Keep production moving</h3>
        </div>
        <span
          className={`production-follow-up-status ${isQueued ? "queued" : "active"}`}
        >
          {isQueued ? "Not started" : "In progress"}
        </span>
      </div>

      <p className="production-follow-up-copy">
        At the predicted completion time, you will be asked whether the work is
        done. A positive response securely prompts the Production owner to
        complete the stage. Use the button below for a direct progress nudge.
      </p>

      {completionReviewMessage ? (
        <p className="production-follow-up-notice">{completionReviewMessage}</p>
      ) : null}

      <dl className="production-follow-up-details">
        <div>
          <dt>Production owner</dt>
          <dd>{getPersonName(project?.productionOwnerId)}</dd>
        </div>
        <div>
          <dt>{expectedLabel}</dt>
          <dd>{formatDateTime(expectedAt)}</dd>
        </div>
      </dl>

      {!ownerId ? (
        <p className="production-follow-up-notice">
          Waiting for a Production user to acknowledge and own this project.
        </p>
      ) : null}

      {feedback ? (
        <p
          className={`production-follow-up-feedback ${feedback.type}`}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}

      <button
        type="button"
        className="production-follow-up-button"
        onClick={handleRemindOwner}
        disabled={!ownerId || sending || onCooldown}
      >
        {sending
          ? "Sending reminder..."
          : onCooldown
            ? `Available in ${formatCooldown(remainingCooldownMs)}`
            : "Remind Production Owner"}
      </button>

      {lastSentAt ? (
        <p className="production-follow-up-last-sent">
          Last direct reminder: {formatDateTime(lastSentAt)}
        </p>
      ) : null}
    </section>
  );
};

export default ProjectLeadProductionFollowUp;
