import {
  DEPARTMENTS,
  PRODUCTION_SUB_DEPARTMENTS,
} from "../constants/departments";

const EXTRA_PRODUCTION_DEPARTMENTS = [
  "outside-production",
  "in-house-production",
  "local-outsourcing",
];

const PRODUCTION_DEPARTMENT_SET = new Set([
  "graphics",
  ...PRODUCTION_SUB_DEPARTMENTS,
  ...EXTRA_PRODUCTION_DEPARTMENTS,
]);

const ENGAGEMENT_FIELD_KEYS = [
  "departments",
  "selectedDepartments",
  "engagements",
  "selectedEngagements",
  "engagedDepartments",
];

const PRODUCTION_CHECKLIST_MAP = {
  inHouse: "in-house-production",
  outside: "outside-production",
  localOutsourcing: "local-outsourcing",
  overseasOutsourcing: "overseas",
};

const normalizeText = (value) => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === "string" && entry.trim())
      .map((entry) => entry.trim())
      .join(", ");
  }
  return "";
};

const toSafeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeLookupKey = (value) =>
  normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const RISK_STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "that",
  "this",
  "project",
  "production",
  "risk",
  "risks",
  "issue",
  "issues",
  "general",
  "generic",
]);

const buildRiskDescriptionTokenSet = (value) =>
  new Set(
    normalizeLookupKey(value)
      .split(" ")
      .filter(
        (token) =>
          token && token.length >= 4 && !RISK_STOP_WORDS.has(token),
      ),
  );

const hasNearDuplicateDescription = (
  description,
  existingTokenSets = [],
  threshold = 0.78,
) => {
  const candidateSet = buildRiskDescriptionTokenSet(description);
  if (candidateSet.size === 0) return false;

  return existingTokenSets.some((tokenSet) => {
    if (!tokenSet || tokenSet.size === 0) return false;
    let overlap = 0;
    candidateSet.forEach((token) => {
      if (tokenSet.has(token)) overlap += 1;
    });
    return overlap / Math.min(candidateSet.size, tokenSet.size) >= threshold;
  });
};

const buildDepartmentLookup = () => {
  const lookup = new Map();

  DEPARTMENTS.forEach((dept) => {
    if (!dept?.id) return;
    lookup.set(normalizeLookupKey(dept.id), dept.id);
    lookup.set(normalizeLookupKey(dept.label), dept.id);
  });

  EXTRA_PRODUCTION_DEPARTMENTS.forEach((deptId) => {
    lookup.set(normalizeLookupKey(deptId), deptId);
  });

  lookup.set("uv dtf", "uv-dtf");
  lookup.set("dtf", "dtf");
  lookup.set("large format printing", "large-format");
  lookup.set("screen print", "screen-printing");
  lookup.set("digital cutting", "digital-cutting");
  lookup.set("business card", "business-cards");
  lookup.set("business cards", "business-cards");
  lookup.set("pvc id", "pvc-id");
  lookup.set("pvc id cards", "pvc-id");
  lookup.set("outside production", "outside-production");
  lookup.set("in house production", "in-house-production");
  lookup.set("local outsourcing", "local-outsourcing");
  lookup.set("production", "in-house-production");
  lookup.set("production department", "in-house-production");
  lookup.set("design", "graphics");
  lookup.set("graphics design", "graphics");
  lookup.set("graphics/design", "graphics");
  lookup.set("mockup", "graphics");
  lookup.set("mock up", "graphics");
  lookup.set("mockup design", "graphics");

  return lookup;
};

const DEPARTMENT_LOOKUP = buildDepartmentLookup();

const normalizeDepartmentId = (value) => {
  if (!value) return "";

  const raw =
    typeof value === "object"
      ? value.id || value.value || value.label || value.name || ""
      : value;
  const key = normalizeLookupKey(raw);
  if (!key) return "";

  if (DEPARTMENT_LOOKUP.has(key)) {
    return DEPARTMENT_LOOKUP.get(key);
  }

  const hyphenKey = key.replace(/\s+/g, "-");
  if (DEPARTMENT_LOOKUP.has(hyphenKey)) {
    return DEPARTMENT_LOOKUP.get(hyphenKey);
  }

  return "";
};

const normalizeSuggestions = (value) =>
  toSafeArray(value)
    .map((item) => ({
      description: normalizeText(item?.description),
      preventive: normalizeText(item?.preventive),
    }))
    .filter((item) => item.description && item.preventive);

const toNumberOrNull = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const dedupe = (items = []) => Array.from(new Set(items.filter(Boolean)));

const flattenDepartmentCandidates = (entry) => {
  if (!entry) return [];
  if (typeof entry === "string") return [entry];

  if (typeof entry === "object") {
    const directCandidates = [
      entry.id,
      entry.value,
      entry.label,
      entry.name,
      entry.department,
      entry.parent,
      entry.parentId,
    ];

    const nestedKeys = [
      "subDepartments",
      "subdepartments",
      "children",
      "departments",
      "selectedDepartments",
    ];

    const nestedCandidates = nestedKeys.flatMap((key) =>
      toSafeArray(entry[key]).flatMap(flattenDepartmentCandidates),
    );

    return [...directCandidates, ...nestedCandidates].filter(Boolean);
  }

  return [];
};

const collectEngagementCandidates = (formData = {}, nestedDetails = {}) => {
  const values = [];

  ENGAGEMENT_FIELD_KEYS.forEach((key) => {
    values.push(...toSafeArray(formData?.[key]));
    values.push(...toSafeArray(nestedDetails?.[key]));
  });

  return values.flatMap(flattenDepartmentCandidates);
};

const collectChecklistProductionDepartments = (
  formData = {},
  nestedDetails = {},
) => {
  const checklist =
    formData?.quoteDetails?.productionChecklist ||
    nestedDetails?.quoteDetails?.productionChecklist ||
    {};

  return Object.entries(PRODUCTION_CHECKLIST_MAP)
    .filter(([key]) => Boolean(checklist[key]))
    .map(([, departmentId]) => departmentId);
};

const buildProjectPayload = (formData = {}) => {
  const nestedDetails =
    formData?.details && typeof formData.details === "object"
      ? formData.details
      : {};
  const engagementCandidates = collectEngagementCandidates(
    formData,
    nestedDetails,
  );
  const departments = dedupe(engagementCandidates.map(normalizeDepartmentId));

  const items = toSafeArray(formData?.items)
    .map((item) => {
      const department = normalizeDepartmentId(item?.department);
      return {
        description: normalizeText(item?.description),
        breakdown: normalizeText(item?.breakdown),
        quantity: toNumberOrNull(item?.qty ?? item?.quantity),
        department,
        departmentRaw: normalizeText(item?.department),
      };
    })
    .filter(
      (item) =>
        item.description ||
        item.breakdown ||
        item.department ||
        item.departmentRaw ||
        item.quantity !== null,
    );

  const checklistProductionDepartments = collectChecklistProductionDepartments(
    formData,
    nestedDetails,
  );

  const productionDepartments = dedupe([
    ...departments.filter((dept) => PRODUCTION_DEPARTMENT_SET.has(dept)),
    ...items
      .map((item) => item.department)
      .filter((dept) => PRODUCTION_DEPARTMENT_SET.has(dept)),
    ...checklistProductionDepartments,
  ]);

  return {
    projectType: normalizeText(formData?.projectType),
    priority: normalizeText(formData?.priority),
    details: {
      projectName: normalizeText(formData?.projectName || nestedDetails?.projectName),
      briefOverview: normalizeText(
        formData?.briefOverview || nestedDetails?.briefOverview,
      ),
      client: normalizeText(formData?.client || nestedDetails?.client),
      contactType: normalizeText(
        formData?.contactType || nestedDetails?.contactType,
      ),
      supplySource: normalizeText(
        formData?.supplySource || nestedDetails?.supplySource,
      ),
      deliveryDate: normalizeText(
        formData?.deliveryDate || nestedDetails?.deliveryDate,
      ),
      deliveryTime: normalizeText(
        formData?.deliveryTime || nestedDetails?.deliveryTime,
      ),
      deliveryLocation: normalizeText(
        formData?.deliveryLocation || nestedDetails?.deliveryLocation,
      ),
    },
    departments,
    productionDepartments,
    items,
    uncontrollableFactors: toSafeArray(formData?.uncontrollableFactors)
      .map((item) => ({
        description: normalizeText(item?.description),
        responsible: normalizeText(item?.responsible?.value || item?.responsible),
        status: normalizeText(item?.status?.value || item?.status),
      }))
      .filter((item) => item.description),
    productionRisks: toSafeArray(formData?.productionRisks)
      .map((item) => ({
        description: normalizeText(item?.description),
        preventive: normalizeText(item?.preventive),
      }))
      .filter((item) => item.description || item.preventive),
  };
};

export const requestProductionRiskSuggestions = async (formData = {}) => {
  const response = await fetch("/api/projects/ai/production-risk-suggestions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      projectData: buildProjectPayload(formData),
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.message || "Unable to generate production risk suggestions.",
    );
  }

  return normalizeSuggestions(payload?.suggestions);
};

export const mergeProductionRiskSuggestions = (
  currentRisks = [],
  suggestions = [],
) => {
  const existing = toSafeArray(currentRisks);
  const existingDescriptions = new Set(
    existing
      .map((item) => normalizeText(item?.description).toLowerCase())
      .filter(Boolean),
  );
  const existingDescriptionTokenSets = existing
    .map((item) => buildRiskDescriptionTokenSet(item?.description))
    .filter((tokenSet) => tokenSet.size > 0);

  const timestampSeed = Date.now();
  const mergedRisks = [...existing];
  const addedSuggestions = [];
  let addedCount = 0;

  normalizeSuggestions(suggestions).forEach((item) => {
    const key = item.description.toLowerCase();
    if (existingDescriptions.has(key)) return;
    if (hasNearDuplicateDescription(item.description, existingDescriptionTokenSets))
      return;
    existingDescriptions.add(key);
    const tokenSet = buildRiskDescriptionTokenSet(item.description);
    if (tokenSet.size > 0) {
      existingDescriptionTokenSets.push(tokenSet);
    }

    mergedRisks.push({
      id: `ai-risk-${timestampSeed}-${addedCount}`,
      description: item.description,
      preventive: item.preventive,
    });
    addedSuggestions.push({
      description: item.description,
      preventive: item.preventive,
    });
    addedCount += 1;
  });

  return { mergedRisks, addedCount, addedSuggestions };
};
