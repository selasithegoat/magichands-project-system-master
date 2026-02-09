const isLikelyObjectId = (value) =>
  typeof value === "string" && /^[a-f0-9]{24}$/i.test(value.trim());

const getId = (value) => {
  if (!value || typeof value !== "object") return "";
  const candidate = value._id || value.id || value.value;
  return typeof candidate === "string" ? candidate : "";
};

export const getFirstName = (value) => {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || isLikelyObjectId(trimmed)) return "";
    return trimmed.split(/\s+/)[0];
  }

  if (typeof value === "object") {
    const candidate =
      value.firstName ||
      value.first ||
      value.givenName ||
      value.name ||
      value.fullName ||
      value.label ||
      value.displayName;

    if (candidate) return getFirstName(candidate);
  }

  return "";
};

export const getFullName = (value) => {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || isLikelyObjectId(trimmed)) return "";
    return trimmed;
  }

  if (typeof value === "object") {
    const first = value.firstName || "";
    const last = value.lastName || "";
    const full = `${first} ${last}`.trim();
    if (full) return full;

    const candidate =
      value.name || value.fullName || value.label || value.displayName;
    if (candidate) return getFullName(candidate);
  }

  return "";
};

export const getLeadNames = (project = {}) => {
  const leadSource = project?.projectLeadId || project?.details?.lead;
  const assistantSource =
    project?.assistantLeadId || project?.details?.assistantLead;

  const leadId = getId(leadSource);
  const assistantId = getId(assistantSource);

  const leadFirst = getFirstName(leadSource);
  const leadFull = getFullName(leadSource);
  let assistantFirst = getFirstName(assistantSource);
  let assistantFull = getFullName(assistantSource);

  const samePerson =
    (leadId && assistantId && leadId === assistantId) ||
    (!leadId &&
      !assistantId &&
      leadFull &&
      assistantFull &&
      leadFull === assistantFull);

  if (samePerson) {
    assistantFirst = "";
    assistantFull = "";
  }

  return { leadFirst, leadFull, assistantFirst, assistantFull };
};

export const getLeadDisplay = (project, fallback = "Unassigned") => {
  const { leadFirst, leadFull, assistantFirst, assistantFull } =
    getLeadNames(project);

  if (leadFirst && assistantFirst) return `${leadFirst} / ${assistantFirst}`;
  if (leadFull) return leadFull;
  if (assistantFull) return assistantFull;
  if (leadFirst) return leadFirst;
  if (assistantFirst) return assistantFirst;
  return fallback;
};

export const getLeadSearchText = (project = {}) => {
  const tokens = [];

  const addToken = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || isLikelyObjectId(trimmed)) return;
      tokens.push(trimmed);
      return;
    }
    if (typeof value === "object") {
      const full = getFullName(value);
      if (full) tokens.push(full);
      const first = getFirstName(value);
      if (first && first !== full) tokens.push(first);
    }
  };

  addToken(project?.projectLeadId);
  addToken(project?.details?.lead);
  addToken(project?.assistantLeadId);

  const display = getLeadDisplay(project, "");
  if (display) tokens.push(display);

  return tokens.join(" ").toLowerCase();
};
