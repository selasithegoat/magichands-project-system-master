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

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    const candidate = value._id || value.id || value.value;
    if (typeof candidate === "string" || typeof candidate === "number") {
      return String(candidate).trim();
    }
  }
  return "";
};

const toPersonRecord = (source) => {
  const name = (getFullName(source) || getFirstName(source) || "").trim();
  const id = toEntityId(source);
  return { id, name };
};

const getPersonKey = (person = {}) => {
  const name = String(person?.name || "").trim();
  if (!name) return "";
  if (person?.id) return `id:${person.id}`;
  return `name:${name.toLowerCase()}`;
};

const hasSameIdentity = (left = {}, right = {}) => {
  if (!left?.name || !right?.name) return false;
  if (left.id && right.id) return left.id === right.id;
  return left.name.toLowerCase() === right.name.toLowerCase();
};

export const getGroupedLeadDisplayRows = (
  projects = [],
  {
    currentUserId = "",
    currentProject = null,
    prioritizeViewer = false,
    prioritizeCurrentLead = false,
  } = {},
) => {
  const groupedProjects = Array.isArray(projects) ? projects : [];
  const entries = new Map();
  let insertionIndex = 0;

  const ensureEntry = (person = {}) => {
    const key = getPersonKey(person);
    if (!key) return null;

    if (!entries.has(key)) {
      entries.set(key, {
        key,
        id: person.id || "",
        name: person.name,
        isLead: false,
        isAssistant: false,
        assistantTo: new Set(),
        isViewer: false,
        isCurrentLead: false,
        firstSeen: insertionIndex++,
      });
    }

    const entry = entries.get(key);
    if (!entry.id && person.id) entry.id = person.id;
    if (!entry.name && person.name) entry.name = person.name;
    return entry;
  };

  groupedProjects.forEach((project) => {
    const lead = toPersonRecord(project?.projectLeadId || project?.details?.lead);
    const assistant = toPersonRecord(
      project?.assistantLeadId || project?.details?.assistantLead,
    );

    const leadEntry = ensureEntry(lead);
    if (leadEntry) {
      leadEntry.isLead = true;
    }

    if (assistant.name && !hasSameIdentity(lead, assistant)) {
      const assistantEntry = ensureEntry(assistant);
      if (assistantEntry) {
        assistantEntry.isAssistant = true;
        if (lead.name) {
          assistantEntry.assistantTo.add(lead.name);
        }
      }
    }
  });

  const viewerId = toEntityId(currentUserId);
  if (viewerId) {
    entries.forEach((entry) => {
      if (entry.id && entry.id === viewerId) {
        entry.isViewer = true;
      }
    });
  }

  if (currentProject) {
    const currentLead = toPersonRecord(
      currentProject?.projectLeadId || currentProject?.details?.lead,
    );
    const currentLeadKey = getPersonKey(currentLead);
    if (currentLeadKey && entries.has(currentLeadKey)) {
      entries.get(currentLeadKey).isCurrentLead = true;
    }
  }

  return Array.from(entries.values())
    .sort((a, b) => {
      if (prioritizeViewer && a.isViewer !== b.isViewer) {
        return a.isViewer ? -1 : 1;
      }
      if (prioritizeCurrentLead && a.isCurrentLead !== b.isCurrentLead) {
        return a.isCurrentLead ? -1 : 1;
      }

      const aRoleRank = a.isLead ? 0 : 1;
      const bRoleRank = b.isLead ? 0 : 1;
      if (aRoleRank !== bRoleRank) return aRoleRank - bRoleRank;

      const nameCompare = a.name.localeCompare(b.name, "en", {
        sensitivity: "base",
      });
      if (nameCompare !== 0) return nameCompare;
      return a.firstSeen - b.firstSeen;
    })
    .map((entry) => {
      const roleParts = [];

      if (entry.isLead) roleParts.push("Lead");
      if (entry.isAssistant) {
        const assists = Array.from(entry.assistantTo).sort((a, b) =>
          a.localeCompare(b, "en", { sensitivity: "base" }),
        );
        roleParts.push(
          assists.length > 0
            ? `Assistant to ${assists.join(", ")}`
            : "Assistant",
        );
      }

      const roleLabel = roleParts.join("; ");
      return {
        key: entry.key,
        id: entry.id,
        name: entry.name,
        roleLabel,
        display: roleLabel ? `${entry.name} (${roleLabel})` : entry.name,
        isViewer: entry.isViewer,
        isLead: entry.isLead,
      };
    });
};
