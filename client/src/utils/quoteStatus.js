export const QUOTE_STATUS_ALIASES = {
  "Pending Quote Request": "Pending Cost Verification",
  "Quote Request Completed": "Cost Verification Completed",
  "Pending Cost": "Pending Cost Verification",
  "Cost Completed": "Cost Verification Completed",
  "Pending Send Response": "Pending Quote Submission",
  "Response Sent": "Pending Client Decision",
  "Pending Bid Submission / Documents": "Pending Quote Submission",
  "Pending Feedback": "Pending Client Decision",
  "Feedback Completed": "Completed",
  "Decision Completed": "Completed",
  Declined: "Completed",
};

export const QUOTE_REQUIREMENT_KEYS = [
  "cost",
  "mockup",
  "previousSamples",
  "sampleProduction",
  "bidSubmission",
];

export const QUOTE_REQUIREMENT_LABELS = {
  cost: "Cost",
  mockup: "Mockup",
  previousSamples: "Previous Sample / Work done",
  sampleProduction: "Sample Production",
  bidSubmission: "Bid Submission / Documents",
};

const QUOTE_MULTI_REQUIREMENT_PENDING_STATUSES = new Set([
  "Scope Approval Completed",
  "Pending Cost",
  "Pending Cost Verification",
  "Cost Verification Completed",
  "Pending Mockup",
  "Mockup Completed",
  "Pending Sample Retrieval",
  "Pending Sample / Work done Retrieval",
  "Pending Production",
  "Pending Sample Production",
  "Production Completed",
  "Pending Bid Submission / Documents",
  "Pending Quote Requirements",
]);

export const normalizeQuoteStatus = (status = "") =>
  QUOTE_STATUS_ALIASES[status] || status;

export const normalizeQuoteChecklist = (checklist = {}) =>
  QUOTE_REQUIREMENT_KEYS.reduce((accumulator, key) => {
    accumulator[key] = Boolean(checklist?.[key]);
    return accumulator;
  }, {});

export const getEffectiveQuoteRequirementKeys = (checklist = {}) => {
  const normalized = normalizeQuoteChecklist(checklist);
  const enabledKeys = QUOTE_REQUIREMENT_KEYS.filter((key) => normalized[key]);
  return normalized.sampleProduction
    ? enabledKeys.filter((key) => key !== "mockup")
    : enabledKeys;
};

export const getQuoteRequirementMode = (checklist = {}) => {
  const effectiveKeys = getEffectiveQuoteRequirementKeys(checklist);
  if (effectiveKeys.length === 0) return "none";
  if (effectiveKeys.length > 1) return "multi";
  return effectiveKeys[0];
};

export const getQuoteRequirementSummary = (checklist = {}) => {
  const normalizedChecklist = normalizeQuoteChecklist(checklist);
  const enabledKeys = QUOTE_REQUIREMENT_KEYS.filter(
    (key) => normalizedChecklist[key],
  );
  const effectiveEnabledKeys = getEffectiveQuoteRequirementKeys(normalizedChecklist);
  const mode = getQuoteRequirementMode(normalizedChecklist);

  return {
    checklist: normalizedChecklist,
    enabledKeys,
    effectiveEnabledKeys,
    hasRequirements: effectiveEnabledKeys.length > 0,
    hasMultipleRequirements: effectiveEnabledKeys.length > 1,
    mode,
    includesCost: effectiveEnabledKeys.includes("cost"),
    includesMockup:
      effectiveEnabledKeys.includes("mockup") ||
      effectiveEnabledKeys.includes("sampleProduction"),
    includesPreviousSamples: effectiveEnabledKeys.includes("previousSamples"),
    includesSampleProduction: effectiveEnabledKeys.includes("sampleProduction"),
    includesBidSubmission: effectiveEnabledKeys.includes("bidSubmission"),
  };
};

const QUOTE_STATUS_DISPLAY_OVERRIDES = {
  cost: {
    "Scope Approval Completed": "Pending Cost",
    "Pending Cost Verification": "Pending Cost",
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
  multi: {
    "Scope Approval Completed": "Pending Quote Requirements",
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
  if (normalizedStatus.includes("quote requirements")) return "multi";
  if (normalizedStatus.includes("bid")) return "bidSubmission";
  if (normalizedStatus.includes("document")) return "bidSubmission";
  if (normalizedStatus.includes("sample production")) return "sampleProduction";
  if (normalizedStatus.includes("production")) return "sampleProduction";
  if (normalizedStatus.includes("mockup")) return "mockup";
  if (normalizedStatus.includes("cost")) return "cost";
  if (normalizedStatus.includes("sample")) return "previousSamples";
  return "cost";
};

export const getQuoteStatusDisplay = (status = "", modeOrChecklist) => {
  const normalized = normalizeQuoteStatus(status);
  const requirementMode = resolveQuoteRequirementMode(
    modeOrChecklist,
    normalized,
  );

  if (
    requirementMode === "multi" &&
    QUOTE_MULTI_REQUIREMENT_PENDING_STATUSES.has(normalized)
  ) {
    return normalized === "Pending Quote Submission"
      ? "Pending Quote Submission"
      : "Pending Quote Requirements";
  }

  const overrides =
    QUOTE_STATUS_DISPLAY_OVERRIDES[requirementMode] ||
    QUOTE_STATUS_DISPLAY_OVERRIDES.cost;
  return overrides[normalized] || normalized;
};

export const getQuoteWorkflowJourneySteps = (modeOrChecklist) => {
  const requirementMode = resolveQuoteRequirementMode(modeOrChecklist);
  if (requirementMode === "multi") {
    return [
      {
        key: "scope",
        label: "Scope",
        statuses: [
          "Quote Created",
          "Pending Scope Approval",
          "Scope Approval Completed",
        ],
      },
      {
        key: "requirements",
        label: "Requirements",
        statuses: ["Pending Quote Requirements"],
      },
      {
        key: "submission",
        label: "Quote Submission",
        statuses: ["Pending Quote Submission", "Quote Submission Completed"],
      },
      {
        key: "decision",
        label: "Client Decision",
        statuses: ["Pending Client Decision", "Completed", "Finished"],
      },
    ];
  }

  const stepsByMode = {
    cost: [
      {
        key: "scope",
        label: "Scope",
        statuses: [
          "Quote Created",
          "Pending Scope Approval",
          "Scope Approval Completed",
        ],
      },
      {
        key: "cost",
        label: "Cost",
        statuses: [
          "Pending Cost",
          "Pending Cost Verification",
          "Cost Verification Completed",
          "Cost Completed",
        ],
      },
      {
        key: "submission",
        label: "Quote Submission",
        statuses: ["Pending Quote Submission", "Quote Submission Completed"],
      },
      {
        key: "decision",
        label: "Client Decision",
        statuses: ["Pending Client Decision", "Completed", "Finished"],
      },
    ],
    mockup: [
      {
        key: "scope",
        label: "Scope",
        statuses: [
          "Quote Created",
          "Pending Scope Approval",
          "Scope Approval Completed",
        ],
      },
      {
        key: "mockup",
        label: "Mockup",
        statuses: ["Pending Mockup", "Mockup Completed"],
      },
      {
        key: "submission",
        label: "Quote Submission",
        statuses: ["Pending Quote Submission", "Quote Submission Completed"],
      },
      {
        key: "decision",
        label: "Client Decision",
        statuses: ["Pending Client Decision", "Completed", "Finished"],
      },
    ],
    previousSamples: [
      {
        key: "scope",
        label: "Scope",
        statuses: [
          "Quote Created",
          "Pending Scope Approval",
          "Scope Approval Completed",
        ],
      },
      {
        key: "retrieval",
        label: "Sample Retrieval",
        statuses: [
          "Pending Sample Retrieval",
          "Pending Sample / Work done Retrieval",
        ],
      },
      {
        key: "submission",
        label: "Sample / Work done Sent",
        statuses: [
          "Pending Quote Submission",
          "Pending Sample / Work done Sent",
          "Quote Submission Completed",
        ],
      },
      {
        key: "decision",
        label: "Client Decision",
        statuses: ["Pending Client Decision", "Completed", "Finished"],
      },
    ],
    sampleProduction: [
      {
        key: "scope",
        label: "Scope",
        statuses: [
          "Quote Created",
          "Pending Scope Approval",
          "Scope Approval Completed",
        ],
      },
      {
        key: "mockup",
        label: "Mockup",
        statuses: ["Pending Mockup", "Mockup Completed"],
      },
      {
        key: "production",
        label: "Sample Production",
        statuses: ["Pending Production", "Pending Sample Production"],
      },
      {
        key: "submission",
        label: "Quote Submission",
        statuses: ["Pending Quote Submission", "Quote Submission Completed"],
      },
      {
        key: "decision",
        label: "Client Decision",
        statuses: ["Pending Client Decision", "Completed", "Finished"],
      },
    ],
    bidSubmission: [
      {
        key: "scope",
        label: "Scope",
        statuses: [
          "Quote Created",
          "Pending Scope Approval",
          "Scope Approval Completed",
        ],
      },
      {
        key: "documents",
        label: "Bid Documents",
        statuses: [
          "Pending Quote Submission",
          "Pending Bid Submission / Documents",
        ],
      },
      {
        key: "submission",
        label: "Quote Submission",
        statuses: ["Quote Submission Completed"],
      },
      {
        key: "decision",
        label: "Client Decision",
        statuses: ["Pending Client Decision", "Completed", "Finished"],
      },
    ],
  };

  return stepsByMode[requirementMode] || stepsByMode.cost;
};

export const QUOTE_PROGRESS_MAP_BY_MODE = {
  cost: {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Cost": 45,
    "Pending Cost Verification": 45,
    "Cost Completed": 55,
    "Cost Verification Completed": 55,
    "Pending Quote Submission": 70,
    "Quote Submission Completed": 80,
    "Pending Client Decision": 90,
    Completed: 100,
    Finished: 100,
    Declined: 100,
  },
  mockup: {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Mockup": 45,
    "Mockup Completed": 55,
    "Pending Quote Submission": 70,
    "Quote Submission Completed": 80,
    "Pending Client Decision": 90,
    Completed: 100,
    Finished: 100,
    Declined: 100,
  },
  previousSamples: {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Sample Retrieval": 45,
    "Pending Sample / Work done Retrieval": 45,
    "Pending Quote Submission": 70,
    "Pending Sample / Work done Sent": 70,
    "Quote Submission Completed": 80,
    "Pending Client Decision": 90,
    Completed: 100,
    Finished: 100,
    Declined: 100,
  },
  sampleProduction: {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Mockup": 40,
    "Mockup Completed": 45,
    "Pending Production": 55,
    "Pending Sample Production": 55,
    "Pending Quote Submission": 70,
    "Quote Submission Completed": 80,
    "Pending Client Decision": 90,
    Completed: 100,
    Finished: 100,
    Declined: 100,
  },
  bidSubmission: {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Quote Submission": 60,
    "Pending Bid Submission / Documents": 60,
    "Quote Submission Completed": 80,
    "Pending Client Decision": 90,
    Completed: 100,
    Finished: 100,
    Declined: 100,
  },
  multi: {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Quote Requirements": 55,
    "Pending Quote Submission": 75,
    "Quote Submission Completed": 85,
    "Pending Client Decision": 92,
    Completed: 100,
    Finished: 100,
    Declined: 100,
  },
};

export const getQuoteProgressPercent = (status = "", modeOrChecklist) => {
  const requirementMode = resolveQuoteRequirementMode(modeOrChecklist, status);
  const displayStatus = getQuoteStatusDisplay(status, requirementMode);
  const progressMap =
    QUOTE_PROGRESS_MAP_BY_MODE[requirementMode] || QUOTE_PROGRESS_MAP_BY_MODE.cost;
  return progressMap[displayStatus] ?? progressMap[normalizeQuoteStatus(status)] ?? 5;
};

export const isQuoteCostCompleted = (project = {}) => {
  const costVerification = project?.quoteDetails?.costVerification || {};
  if (costVerification?.completedAt || costVerification?.completedBy) {
    return true;
  }

  const amount = Number.parseFloat(costVerification?.amount);
  return Number.isFinite(amount) && amount > 0;
};

export const isQuoteMockupCompletionConfirmed = (
  project = {},
  modeOrChecklist,
) => {
  const requirementMode = resolveQuoteRequirementMode(
    modeOrChecklist || project?.quoteDetails?.checklist || {},
    project?.status || "",
  );
  const requirementItem = project?.quoteDetails?.requirementItems?.mockup || {};

  if (requirementItem?.completionConfirmedAt || requirementItem?.completionConfirmedBy) {
    return true;
  }

  const normalizedStatus = normalizeQuoteStatus(project?.status || "");
  if (normalizedStatus === "Mockup Completed") {
    return true;
  }

  if (requirementMode === "mockup") {
    return [
      "Pending Quote Submission",
      "Quote Submission Completed",
      "Pending Client Decision",
      "Completed",
      "Finished",
      "Declined",
    ].includes(normalizedStatus);
  }

  if (requirementMode === "sampleProduction") {
    return [
      "Pending Production",
      "Pending Sample Production",
      "Production Completed",
      "Pending Quote Submission",
      "Quote Submission Completed",
      "Pending Client Decision",
      "Completed",
      "Finished",
      "Declined",
    ].includes(normalizedStatus);
  }

  return false;
};

export const QUOTE_STATUS_ALIAS_MAP = QUOTE_STATUS_ALIASES;
