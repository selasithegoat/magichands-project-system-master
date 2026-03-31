const QUOTE_STATUS_ALIASES = {
  "Pending Quote Request": "Pending Cost Verification",
  "Quote Request Completed": "Cost Verification Completed",
  "Pending Send Response": "Pending Quote Submission",
  "Response Sent": "Pending Client Decision",
  "Pending Feedback": "Pending Client Decision",
  "Feedback Completed": "Completed",
  "Decision Completed": "Completed",
  Declined: "Completed",
};

export const normalizeQuoteStatus = (status = "") =>
  QUOTE_STATUS_ALIASES[status] || status;

const QUOTE_STATUS_DISPLAY_OVERRIDES = {
  "Scope Approval Completed": "Pending Cost Verification",
  "Cost Verification Completed": "Pending Quote Submission",
  "Quote Submission Completed": "Pending Client Decision",
};

export const getQuoteStatusDisplay = (status = "") => {
  const normalized = normalizeQuoteStatus(status);
  return QUOTE_STATUS_DISPLAY_OVERRIDES[normalized] || normalized;
};

export const QUOTE_STATUS_ALIAS_MAP = QUOTE_STATUS_ALIASES;
