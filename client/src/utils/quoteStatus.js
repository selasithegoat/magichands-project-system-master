const QUOTE_STATUS_ALIASES = {
  "Pending Quote Request": "Pending Cost Verification",
  "Quote Request Completed": "Cost Verification Completed",
  "Pending Send Response": "Pending Quote Submission",
  "Response Sent": "Pending Client Decision",
  "Pending Bid Submission / Documents": "Pending Quote Submission",
  "Pending Feedback": "Pending Client Decision",
  "Feedback Completed": "Completed",
  "Decision Completed": "Completed",
  Declined: "Completed",
};

const QUOTE_REQUIREMENT_KEYS = [
  "cost",
  "mockup",
  "previousSamples",
  "sampleProduction",
  "bidSubmission",
];

export const normalizeQuoteStatus = (status = "") =>
  QUOTE_STATUS_ALIASES[status] || status;

export const normalizeQuoteChecklist = (checklist = {}) =>
  QUOTE_REQUIREMENT_KEYS.reduce((accumulator, key) => {
    accumulator[key] = Boolean(checklist?.[key]);
    return accumulator;
  }, {});

export const getQuoteRequirementMode = (checklist = {}) => {
  const normalized = normalizeQuoteChecklist(checklist);
  const hasCost = Boolean(normalized.cost);
  const hasMockup = Boolean(normalized.mockup);
  const hasPreviousSamples = Boolean(normalized.previousSamples);
  const hasSampleProduction = Boolean(normalized.sampleProduction);
  const hasBidSubmission = Boolean(normalized.bidSubmission);
  const hasOther = QUOTE_REQUIREMENT_KEYS.some(
    (key) =>
      ![
        "cost",
        "mockup",
        "previousSamples",
        "sampleProduction",
        "bidSubmission",
      ].includes(key) &&
      normalized[key],
  );

  if (hasCost && !hasMockup && !hasPreviousSamples && !hasOther) return "cost";
  if (hasMockup && !hasCost && !hasPreviousSamples && !hasOther) return "mockup";
  if (hasPreviousSamples && !hasCost && !hasMockup && !hasOther)
    return "previousSamples";
  if (
    hasSampleProduction &&
    !hasCost &&
    !hasPreviousSamples &&
    !hasBidSubmission &&
    !hasOther
  )
    return "sampleProduction";
  if (
    hasBidSubmission &&
    !hasCost &&
    !hasMockup &&
    !hasPreviousSamples &&
    !hasSampleProduction &&
    !hasOther
  )
    return "bidSubmission";
  if (
    !hasCost &&
    !hasMockup &&
    !hasPreviousSamples &&
    !hasSampleProduction &&
    !hasBidSubmission &&
    !hasOther
  )
    return "none";
  return "unsupported";
};

const QUOTE_STATUS_DISPLAY_OVERRIDES = {
  cost: {
    "Scope Approval Completed": "Pending Cost Verification",
    "Cost Verification Completed": "Pending Quote Submission",
    "Quote Submission Completed": "Pending Client Decision",
  },
  mockup: {
    "Scope Approval Completed": "Pending Mockup",
    "Mockup Completed": "Pending Quote Submission",
    "Quote Submission Completed": "Pending Client Decision",
  },
  previousSamples: {
    "Scope Approval Completed": "Pending Sample / Work done Retrieval",
    "Pending Sample Retrieval": "Pending Sample / Work done Retrieval",
    "Pending Quote Submission": "Pending Sample / Work done Sent",
    "Quote Submission Completed": "Pending Client Decision",
  },
  sampleProduction: {
    "Scope Approval Completed": "Pending Mockup",
    "Mockup Completed": "Pending Sample Production",
    "Pending Production": "Pending Sample Production",
    "Production Completed": "Pending Quote Submission",
    "Quote Submission Completed": "Pending Client Decision",
  },
  bidSubmission: {
    "Scope Approval Completed": "Pending Bid Submission / Documents",
    "Pending Quote Submission": "Pending Bid Submission / Documents",
    "Quote Submission Completed": "Pending Client Decision",
  },
};

const resolveQuoteRequirementMode = (modeOrChecklist, status = "") => {
  if (
    modeOrChecklist &&
    typeof modeOrChecklist === "object" &&
    !Array.isArray(modeOrChecklist)
  ) {
    return getQuoteRequirementMode(modeOrChecklist);
  }
  if (typeof modeOrChecklist === "string" && modeOrChecklist.trim()) {
    return modeOrChecklist.trim();
  }
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus.includes("bid")) return "bidSubmission";
  if (normalizedStatus.includes("document")) return "bidSubmission";
  if (normalizedStatus.includes("sample production")) return "sampleProduction";
  if (normalizedStatus.includes("production")) return "sampleProduction";
  if (normalizedStatus.includes("mockup")) return "mockup";
  if (normalizedStatus.includes("sample")) return "previousSamples";
  return "cost";
};

export const getQuoteStatusDisplay = (status = "", modeOrChecklist) => {
  const normalized = normalizeQuoteStatus(status);
  const requirementMode = resolveQuoteRequirementMode(
    modeOrChecklist,
    normalized,
  );
  const overrides =
    QUOTE_STATUS_DISPLAY_OVERRIDES[requirementMode] ||
    QUOTE_STATUS_DISPLAY_OVERRIDES.cost;
  return overrides[normalized] || normalized;
};

export const QUOTE_STATUS_ALIAS_MAP = QUOTE_STATUS_ALIASES;
