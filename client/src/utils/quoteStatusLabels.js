const QUOTE_STATUS_LABEL_ALIASES = {
  "Pending Feedback": "Pending Decision",
  "Feedback Completed": "Decision Complete",
};

const resolveProjectType = (projectOrType) => {
  if (!projectOrType) return "";
  if (typeof projectOrType === "string") return projectOrType.trim();
  if (typeof projectOrType === "object") {
    return String(projectOrType.projectType || "").trim();
  }
  return "";
};

export const getQuoteAwareStatusLabel = (status, projectOrType) => {
  const normalizedStatus = String(status || "").trim();
  if (!normalizedStatus) return "";
  const projectType = resolveProjectType(projectOrType);
  if (projectType !== "Quote") return normalizedStatus;
  return QUOTE_STATUS_LABEL_ALIASES[normalizedStatus] || normalizedStatus;
};

