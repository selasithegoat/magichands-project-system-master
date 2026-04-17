import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./GlobalSmsPrompt.css";
import { formatProjectDisplayName } from "../../utils/projectName";
import useAdaptivePolling from "../../hooks/useAdaptivePolling";

const POLL_INTERVAL_MS = 60000;
const HIDDEN_POLL_INTERVAL_MS = 5 * 60000;
const MAX_VISIBLE_PROMPTS = 3;

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const toDepartmentList = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => toText(entry)).filter(Boolean);
  }
  const normalized = toText(value);
  return normalized ? [normalized] : [];
};

const resolveClientName = (prompt) =>
  toText(prompt?.overrideClientName) ||
  toText(prompt?.project?.details?.client) ||
  toText(prompt?.project?.details?.clientName) ||
  toText(prompt?.project?.orderRef?.client) ||
  "";

const resolveClientPhone = (prompt) =>
  toText(prompt?.overrideClientPhone) ||
  toText(prompt?.project?.details?.clientPhone) ||
  toText(prompt?.project?.orderRef?.clientPhone) ||
  "";

const resolveOrderLabel = (prompt) =>
  toText(prompt?.project?.orderId) ||
  toText(prompt?.project?._id) ||
  "Project";

const resolveProjectName = (prompt) =>
  formatProjectDisplayName(prompt?.project?.details, null, "");

const updateGreeting = (message, clientName) => {
  const greeting = clientName ? `Dear ${clientName},` : "Hello,";
  if (!message) return greeting;
  if (/Dear\s+[^,]+,|Hello,/i.test(message)) {
    return message.replace(/Dear\s+[^,]+,|Hello,/i, greeting);
  }
  return message;
};

const buildDraftFromPrompt = (prompt) => ({
  clientName: resolveClientName(prompt),
  clientPhone: resolveClientPhone(prompt),
  message: toText(prompt?.message),
});

const GlobalSmsPrompt = ({ user }) => {
  const canManageSms = useMemo(() => {
    const departments = toDepartmentList(user?.department).map((dept) =>
      dept.toLowerCase(),
    );
    return departments.includes("front desk");
  }, [user]);
  const authSessionKey = useMemo(
    () => String(user?._id || user?.id || user?.email || ""),
    [user?._id, user?.email, user?.id],
  );

  const [prompts, setPrompts] = useState([]);
  const [expandedId, setExpandedId] = useState("");
  const [drafts, setDrafts] = useState({});
  const [sendingId, setSendingId] = useState("");
  const [skippingId, setSkippingId] = useState("");
  const [errorById, setErrorById] = useState({});
  const [loading, setLoading] = useState(false);
  const [authLost, setAuthLost] = useState(false);

  const clearPromptState = useCallback(() => {
    setPrompts([]);
    setExpandedId("");
    setDrafts({});
    setErrorById({});
    setSendingId("");
    setSkippingId("");
  }, []);

  useEffect(() => {
    setAuthLost(false);
    if (!canManageSms) {
      clearPromptState();
      setLoading(false);
    }
  }, [authSessionKey, canManageSms, clearPromptState]);

  const fetchPrompts = useCallback(async () => {
    if (!canManageSms || authLost) return;
    setLoading(true);
    try {
      const res = await fetch("/api/projects/sms-prompts/pending?source=frontdesk", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        setAuthLost(true);
        clearPromptState();
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load SMS prompts.");
      }
      const data = await res.json();
      setPrompts(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error("Failed to load global SMS prompts:", fetchError);
    } finally {
      setLoading(false);
    }
  }, [authLost, canManageSms, clearPromptState]);

  useAdaptivePolling(fetchPrompts, {
    enabled: canManageSms && !authLost,
    intervalMs: POLL_INTERVAL_MS,
    hiddenIntervalMs: HIDDEN_POLL_INTERVAL_MS,
  });

  useEffect(() => {
    setDrafts((prev) => {
      const updated = { ...prev };
      prompts.forEach((prompt) => {
        if (!updated[prompt._id]) {
          updated[prompt._id] = buildDraftFromPrompt(prompt);
        }
      });
      Object.keys(updated).forEach((key) => {
        if (!prompts.some((prompt) => prompt._id === key)) {
          delete updated[key];
        }
      });
      return updated;
    });
  }, [prompts]);

  useEffect(() => {
    if (!prompts.length) {
      if (expandedId) setExpandedId("");
      return;
    }
    if (!expandedId || !prompts.some((prompt) => prompt._id === expandedId)) {
      setExpandedId(prompts[0]._id);
    }
  }, [prompts, expandedId]);

  const updateDraft = (prompt, patch) => {
    setDrafts((prev) => {
      const base = prev[prompt._id] || buildDraftFromPrompt(prompt);
      return {
        ...prev,
        [prompt._id]: {
          ...base,
          ...patch,
        },
      };
    });
  };

  const handleNameChange = (prompt, value) => {
    const trimmed = value;
    const base = drafts[prompt._id] || buildDraftFromPrompt(prompt);
    updateDraft(prompt, {
      clientName: trimmed,
      message: updateGreeting(base.message, toText(trimmed)),
    });
  };

  const handleDraftSave = async (prompt) => {
    if (!prompt || sendingId || skippingId) return;
    const draft = drafts[prompt._id] || buildDraftFromPrompt(prompt);
    const smsMessage = toText(draft.message);
    if (!smsMessage) return;
    try {
      const res = await fetch(
        `/api/projects/${prompt.project._id}/sms-prompts/${prompt._id}?source=frontdesk`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: smsMessage,
            clientName: toText(draft.clientName),
            clientPhone: toText(draft.clientPhone),
          }),
        },
      );
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        if (updated?._id) {
          setPrompts((prev) =>
            prev.map((item) => (item._id === updated._id ? updated : item)),
          );
        }
      }
    } catch (saveError) {
      console.error("Failed to save SMS draft:", saveError);
    }
  };

  const handleSend = async (prompt) => {
    if (!prompt || sendingId) return;
    const draft = drafts[prompt._id] || buildDraftFromPrompt(prompt);
    const phone = toText(draft.clientPhone);
    const smsMessage = toText(draft.message);

    if (!phone) {
      setErrorById((prev) => ({
        ...prev,
        [prompt._id]: "Client phone number is required.",
      }));
      return;
    }
    if (!smsMessage) {
      setErrorById((prev) => ({
        ...prev,
        [prompt._id]: "SMS message cannot be empty.",
      }));
      return;
    }

    setSendingId(prompt._id);
    setErrorById((prev) => ({ ...prev, [prompt._id]: "" }));
    try {
      const res = await fetch(
        `/api/projects/${prompt.project._id}/sms-prompts/${prompt._id}/send?source=frontdesk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: smsMessage,
            to: phone,
            clientName: toText(draft.clientName),
            clientPhone: phone,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to send SMS.");
      }
      await fetchPrompts();
    } catch (sendError) {
      console.error("Failed to send SMS:", sendError);
      setErrorById((prev) => ({
        ...prev,
        [prompt._id]: sendError.message || "Failed to send SMS.",
      }));
    } finally {
      setSendingId("");
    }
  };

  const handleSkip = async (prompt) => {
    if (!prompt || skippingId) return;
    setSkippingId(prompt._id);
    setErrorById((prev) => ({ ...prev, [prompt._id]: "" }));
    try {
      const res = await fetch(
        `/api/projects/${prompt.project._id}/sms-prompts/${prompt._id}?source=frontdesk`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "skipped" }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to skip SMS.");
      }
      await fetchPrompts();
    } catch (skipError) {
      console.error("Failed to skip SMS:", skipError);
      setErrorById((prev) => ({
        ...prev,
        [prompt._id]: skipError.message || "Failed to skip SMS.",
      }));
    } finally {
      setSkippingId("");
    }
  };

  if (!canManageSms || (!prompts.length && !loading)) {
    return null;
  }

  if (!prompts.length && loading) {
    return (
      <div className="global-sms-prompt global-sms-prompt--loading">
        Checking for SMS prompts...
      </div>
    );
  }

  const visiblePrompts = prompts.slice(0, MAX_VISIBLE_PROMPTS);
  const remainingCount = Math.max(prompts.length - MAX_VISIBLE_PROMPTS, 0);

  return (
    <div className="global-sms-prompt" role="status" aria-live="polite">
      <div className="global-sms-prompt-top">
        <div>
          <h4 className="global-sms-prompt-title">SMS Prompt Queue</h4>
          <span className="global-sms-prompt-sub">
            {prompts.length} pending prompt{prompts.length === 1 ? "" : "s"}
          </span>
        </div>
        <span className="global-sms-prompt-badge">
          {prompts.length}
        </span>
      </div>

      <div className="global-sms-stack">
        {visiblePrompts.map((prompt) => {
          const draft = drafts[prompt._id] || buildDraftFromPrompt(prompt);
          const isExpanded = expandedId === prompt._id;
          const isSending = sendingId === prompt._id;
          const isSkipping = skippingId === prompt._id;
          const stateLabel = toText(prompt.state) || "pending";
          const titleLabel = toText(prompt.title) || "Client SMS Prompt";
          const projectName = resolveProjectName(prompt);
          const statusLabel = toText(prompt.projectStatus) || "Pending";
          const metaLabel = projectName
            ? `${resolveOrderLabel(prompt)} | ${projectName} | ${statusLabel}`
            : `${resolveOrderLabel(prompt)} | ${statusLabel}`;
          const error = errorById[prompt._id];

          return (
            <div
              key={prompt._id}
              className={`global-sms-card ${stateLabel} ${
                isExpanded ? "is-expanded" : "is-collapsed"
              }`}
            >
              <button
                type="button"
                className="global-sms-card-header"
                onClick={() => setExpandedId(prompt._id)}
              >
                <div>
                  <h5 className="global-sms-card-title">{titleLabel}</h5>
                  <span className="global-sms-card-sub">
                    {metaLabel}
                  </span>
                </div>
                <div className="global-sms-card-meta">
                  <span className={`global-sms-prompt-badge ${stateLabel}`}>
                    {stateLabel}
                  </span>
                  <span
                    className={`global-sms-chevron ${isExpanded ? "open" : ""}`}
                  >
                    v
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="global-sms-card-body">
                  <label>Client Name</label>
                  <input
                    type="text"
                    value={draft.clientName}
                    onChange={(event) =>
                      handleNameChange(prompt, event.target.value)
                    }
                    onBlur={() => handleDraftSave(prompt)}
                    placeholder="Client name"
                  />

                  <label>Client Phone</label>
                  <input
                    type="text"
                    value={draft.clientPhone}
                    onChange={(event) =>
                      updateDraft(prompt, { clientPhone: event.target.value })
                    }
                    onBlur={() => handleDraftSave(prompt)}
                    placeholder="Client phone"
                  />

                  <label>Message</label>
                  <textarea
                    rows="4"
                    value={draft.message}
                    onChange={(event) =>
                      updateDraft(prompt, { message: event.target.value })
                    }
                    onBlur={() => handleDraftSave(prompt)}
                  />

                  {error && (
                    <div className="global-sms-prompt-error">{error}</div>
                  )}

                  <div className="global-sms-prompt-actions">
                    <button
                      type="button"
                      className="global-sms-btn primary"
                      onClick={() => handleSend(prompt)}
                      disabled={isSending}
                    >
                      {isSending ? "Sending..." : "Send SMS"}
                    </button>
                    <button
                      type="button"
                      className="global-sms-btn muted"
                      onClick={() => handleSkip(prompt)}
                      disabled={isSkipping || isSending}
                    >
                      {isSkipping ? "Skipping..." : "Skip"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {remainingCount > 0 && (
        <div className="global-sms-more">
          +{remainingCount} more prompt{remainingCount === 1 ? "" : "s"} in
          queue
        </div>
      )}
    </div>
  );
};

export default GlobalSmsPrompt;
