export const QUOTE_DECISION_STATUS_LABELS = {
  pending: "Pending Decision",
  go_ahead: "Go Ahead",
  declined: "Declined",
  no_response: "No Response",
};

const FINAL_QUOTE_DECISION_STATUSES = new Set([
  "go_ahead",
  "declined",
  "no_response",
]);

export const normalizeQuoteDecisionStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    [
      "go_ahead",
      "go-ahead",
      "goahead",
      "proceed",
      "accepted",
      "approved",
      "yes",
    ].includes(normalized)
  ) {
    return "go_ahead";
  }
  if (
    ["declined", "rejected", "cancelled", "cancel", "no"].includes(
      normalized,
    )
  ) {
    return "declined";
  }
  if (
    [
      "no_response",
      "no-response",
      "noresponse",
      "no response",
      "no_reply",
      "no-reply",
      "noreply",
      "unresponsive",
    ].includes(normalized)
  ) {
    return "no_response";
  }
  return "pending";
};

export const getQuoteDecisionState = (project = {}) => {
  const decision = project?.quoteDetails?.decision || {};
  return {
    status: normalizeQuoteDecisionStatus(decision?.status),
    note: String(decision?.note || "").trim(),
    validatedAt: decision?.validatedAt || null,
    convertedAt: decision?.convertedAt || null,
    convertedToType: String(decision?.convertedToType || "").trim(),
  };
};

export const formatQuoteDecisionStatus = (value) =>
  QUOTE_DECISION_STATUS_LABELS[normalizeQuoteDecisionStatus(value)] ||
  QUOTE_DECISION_STATUS_LABELS.pending;

export const hasFinalQuoteDecision = (value) =>
  FINAL_QUOTE_DECISION_STATUSES.has(normalizeQuoteDecisionStatus(value));
