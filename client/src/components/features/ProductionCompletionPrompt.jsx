import React, { useEffect, useMemo, useState } from "react";
import XIcon from "../icons/XIcon";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import AlertTriangleIcon from "../icons/AlertTriangleIcon";
import { formatProjectDisplayName } from "../../utils/projectName";
import "./ProductionCompletionPrompt.css";

const COMPLETE_PHRASE = "I confirm this engagement is complete";

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value._id) return toEntityId(value._id);
  if (value.id) return toEntityId(value.id);
  return "";
};

const toLocalDateTimeInput = (value) => {
  const date = value ? new Date(value) : new Date(Date.now() + 30 * 60 * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const ProductionCompletionPrompt = ({ notification, onClose, onResolved }) => {
  const source = String(notification?.source || "").toLowerCase();
  const isLeadReview = source === "production_lead_follow_up:completion_due";
  const isOwnerRequest = source === "production_completion_request:ready";
  const project = notification?.project;
  const projectId = toEntityId(project?._id || project);
  const projectName = formatProjectDisplayName(project?.details, null, "Production project");
  const projectReference = String(project?.orderId || projectId.slice(-6).toUpperCase());
  const [view, setView] = useState(isLeadReview ? "choice" : "confirm");
  const [note, setNote] = useState("");
  const [revisedCompletionAt, setRevisedCompletionAt] = useState(
    toLocalDateTimeInput(),
  );
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setView(isLeadReview ? "choice" : "confirm");
    setNote("");
    setRevisedCompletionAt(toLocalDateTimeInput());
    setConfirmationPhrase("");
    setSubmitting(false);
    setError("");
  }, [isLeadReview, notification?._id]);

  const revisedTimeIsValid = useMemo(() => {
    const parsed = new Date(revisedCompletionAt);
    return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now();
  }, [revisedCompletionAt]);

  if (!notification || (!isLeadReview && !isOwnerRequest)) return null;

  const submitLeadDecision = async (decision) => {
    if (!projectId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/production/completion-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            notificationId: notification._id,
            decision,
            note,
            ...(decision === "not_done"
              ? { revisedCompletionAt: new Date(revisedCompletionAt).toISOString() }
              : {}),
          }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Feedback could not be saved.");
      onResolved?.({
        notificationId: notification._id,
        message: data.message || "Production feedback recorded.",
      });
    } catch (requestError) {
      setError(requestError.message || "Feedback could not be saved.");
    } finally {
      setSubmitting(false);
    }
  };

  const completeProduction = async () => {
    if (!projectId || submitting || confirmationPhrase.trim() !== COMPLETE_PHRASE) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: "Production Completed",
          confirmationPhrase: confirmationPhrase.trim(),
          completionRequestId: notification._id,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Production could not be completed.");
      onResolved?.({
        notificationId: notification._id,
        message: "Production completed successfully.",
      });
    } catch (requestError) {
      setError(requestError.message || "Production could not be completed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="production-prompt-overlay" onMouseDown={onClose}>
      <section
        className="production-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="production-prompt-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="production-prompt-orbit" aria-hidden="true" />
        <header className="production-prompt-header">
          <div className="production-prompt-icon" aria-hidden="true">
            {isLeadReview ? (
              <AlertTriangleIcon width="24" height="24" color="currentColor" />
            ) : (
              <CheckCircleIcon width="24" height="24" color="currentColor" />
            )}
          </div>
          <div>
            <span className="production-prompt-eyebrow">
              {isLeadReview ? "Lead confirmation" : "Production action"}
            </span>
            <h2 id="production-prompt-title">
              {isLeadReview ? "Is production complete?" : "Complete production"}
            </h2>
          </div>
          <button
            type="button"
            className="production-prompt-close"
            onClick={onClose}
            aria-label="Close prompt"
          >
            <XIcon width="18" height="18" />
          </button>
        </header>

        <div className="production-prompt-project">
          <span>#{projectReference}</span>
          <strong>{projectName}</strong>
        </div>

        {isLeadReview && view === "choice" ? (
          <>
            <p className="production-prompt-copy">
              This project has reached its predicted completion time. Confirm what
              you observed so the Production owner receives the correct next action.
            </p>
            <div className="production-prompt-choice-grid">
              <button
                type="button"
                className="production-prompt-choice positive"
                disabled={submitting}
                onClick={() => submitLeadDecision("done")}
              >
                <CheckCircleIcon width="20" height="20" color="currentColor" />
                <span>
                  <strong>Yes, it is done</strong>
                  <small>Prompt the Production owner to complete the stage.</small>
                </span>
              </button>
              <button
                type="button"
                className="production-prompt-choice pending"
                disabled={submitting}
                onClick={() => setView("not_done")}
              >
                <AlertTriangleIcon width="20" height="20" color="currentColor" />
                <span>
                  <strong>No, not yet</strong>
                  <small>Record the reason and schedule the next check.</small>
                </span>
              </button>
            </div>
          </>
        ) : null}

        {isLeadReview && view === "not_done" ? (
          <div className="production-prompt-form">
            <p className="production-prompt-copy">
              Add a brief reason and choose when the Lead should be prompted again.
            </p>
            <label>
              Reason
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                placeholder="What remains to be completed?"
                autoFocus
              />
            </label>
            <label>
              Revised completion time
              <input
                type="datetime-local"
                value={revisedCompletionAt}
                min={toLocalDateTimeInput(new Date(Date.now() + 60000))}
                onChange={(event) => setRevisedCompletionAt(event.target.value)}
              />
            </label>
            <div className="production-prompt-actions">
              <button type="button" className="secondary" onClick={() => setView("choice")}>
                Back
              </button>
              <button
                type="button"
                className="primary"
                disabled={submitting || note.trim().length < 3 || !revisedTimeIsValid}
                onClick={() => submitLeadDecision("not_done")}
              >
                {submitting ? "Saving..." : "Save & reschedule"}
              </button>
            </div>
          </div>
        ) : null}

        {isOwnerRequest ? (
          <div className="production-prompt-form">
            <p className="production-prompt-copy">
              The Project Lead confirmed that the work appears complete. Review the
              project, then type the phrase below to securely complete Production.
            </p>
            <div className="production-prompt-phrase">{COMPLETE_PHRASE}</div>
            <label>
              Confirmation phrase
              <input
                type="text"
                value={confirmationPhrase}
                onChange={(event) => setConfirmationPhrase(event.target.value)}
                placeholder="Type the phrase exactly"
                autoComplete="off"
                autoFocus
              />
            </label>
            <div className="production-prompt-actions">
              <button type="button" className="secondary" onClick={onClose}>
                Review later
              </button>
              <button
                type="button"
                className="primary"
                disabled={submitting || confirmationPhrase.trim() !== COMPLETE_PHRASE}
                onClick={completeProduction}
              >
                {submitting ? "Completing..." : "Complete production"}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="production-prompt-error" role="alert">{error}</p> : null}
      </section>
    </div>
  );
};

export default ProductionCompletionPrompt;
