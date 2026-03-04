const QUOTE_STATUS_LABEL_ALIASES = {
  "Pending Feedback": "Pending Decision",
  "Feedback Completed": "Decision Complete",
};

const QUOTE_REQUIREMENT_ORDER = [
  "cost",
  "mockup",
  "previousSamples",
  "sampleProduction",
  "bidSubmission",
];

const QUOTE_REQUIREMENT_STAGE_ALIASES = {
  mockup: {
    "Pending Quote Request": "Pending Quote Mockup",
    "Quote Request Completed": "Quote Mockup Complete",
    "Pending Send Response": "Pending Send Mockup",
    "Response Sent": "Mockup Sent",
  },
  previousSamples: {
    "Pending Quote Request": "Pending Previous Samples",
    "Quote Request Completed": "Previous Samples Complete",
    "Pending Send Response": "Pending Send Samples",
    "Response Sent": "Samples Sent",
  },
  sampleProduction: {
    "Pending Quote Request": "Pending Sample Production",
    "Quote Request Completed": "Sample Production Complete",
    "Pending Send Response": "Pending Send Sample",
    "Response Sent": "Sample Sent",
  },
  bidSubmission: {
    "Pending Quote Request": "Pending Bid Submission",
    "Quote Request Completed": "Bid Submission Complete",
    "Pending Send Response": "Pending Send Bid",
    "Response Sent": "Bid Submitted",
  },
};

const resolveProjectType = (projectOrType) => {
  if (!projectOrType) return "";
  if (typeof projectOrType === "string") return projectOrType.trim();
  if (typeof projectOrType === "object") {
    return String(projectOrType.projectType || "").trim();
  }
  return "";
};

const normalizeRequirementStatus = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    [
      "pending",
      "in_progress",
      "completed",
      "blocked",
      "waived",
      "not_required",
    ].includes(normalized)
  ) {
    return normalized;
  }
  return "pending";
};

const isSatisfiedRequirementStatus = (status) =>
  status === "completed" || status === "waived";

const getQuoteActiveRequirementKey = (projectOrType) => {
  if (!projectOrType || typeof projectOrType !== "object") return "";
  if (resolveProjectType(projectOrType) !== "Quote") return "";

  const checklist =
    projectOrType?.quoteDetails?.checklist &&
    typeof projectOrType.quoteDetails.checklist === "object"
      ? projectOrType.quoteDetails.checklist
      : {};
  const progress =
    projectOrType?.quoteDetails?.requirementProgress &&
    typeof projectOrType.quoteDetails.requirementProgress === "object"
      ? projectOrType.quoteDetails.requirementProgress
      : {};

  const requiredKeys = QUOTE_REQUIREMENT_ORDER.filter((key) =>
    Boolean(checklist?.[key]),
  );
  if (requiredKeys.length === 0) return "";

  const persistedActive = String(
    projectOrType?.quoteDetails?.activeRequirementKey || "",
  ).trim();
  if (requiredKeys.includes(persistedActive)) {
    return persistedActive;
  }

  const firstIncomplete = requiredKeys.find((key) => {
    const status = normalizeRequirementStatus(progress?.[key]?.status);
    return !isSatisfiedRequirementStatus(status);
  });

  return firstIncomplete || requiredKeys[0];
};

export const getQuoteAwareStatusLabel = (status, projectOrType) => {
  const normalizedStatus = String(status || "").trim();
  if (!normalizedStatus) return "";

  const projectType = resolveProjectType(projectOrType);
  if (projectType !== "Quote") return normalizedStatus;

  const baseAlias = QUOTE_STATUS_LABEL_ALIASES[normalizedStatus] || normalizedStatus;
  const requirementKey = getQuoteActiveRequirementKey(projectOrType);
  const requirementAliases = QUOTE_REQUIREMENT_STAGE_ALIASES[requirementKey] || {};

  return requirementAliases[baseAlias] || requirementAliases[normalizedStatus] || baseAlias;
};
