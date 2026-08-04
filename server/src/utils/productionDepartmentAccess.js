const PRODUCTION_SUB_DEPARTMENT_TOKENS = new Set([
  "dtf",
  "uv-dtf",
  "uv-printing",
  "engraving",
  "large-format",
  "digital-press",
  "digital-heat-press",
  "offset-press",
  "screen-printing",
  "embroidery",
  "sublimation",
  "digital-cutting",
  "pvc-id",
  "business-cards",
  "installation",
  "overseas",
  "woodme",
  "fabrication",
  "signage",
  "local-outsourcing",
]);

const toDepartmentArray = (value) =>
  Array.isArray(value) ? value : value ? [value] : [];

const normalizeProductionDepartmentToken = (value) => {
  const raw =
    value && typeof value === "object"
      ? value.value || value.label || value.name || ""
      : value;
  const normalized = String(raw || "").trim().toLowerCase();
  return normalized.replace(/\s+/g, "-") === "outside-production"
    ? "local-outsourcing"
    : normalized;
};

const normalizeDepartments = (departments, normalize) =>
  toDepartmentArray(departments)
    .map((department) => normalize(department))
    .filter(Boolean);

const getExplicitProductionSubDepartmentTokens = (
  departments,
  normalize = normalizeProductionDepartmentToken,
) =>
  Array.from(
    new Set(
      normalizeDepartments(departments, normalize).filter((token) =>
        PRODUCTION_SUB_DEPARTMENT_TOKENS.has(token),
      ),
    ),
  );

const resolveProductionSubDepartmentTokens = (
  departments,
  normalize = normalizeProductionDepartmentToken,
) => {
  const normalizedDepartments = normalizeDepartments(departments, normalize);
  const explicitTokens = getExplicitProductionSubDepartmentTokens(
    normalizedDepartments,
    (value) => value,
  );

  // Admin assignment stores both "Production" and the selected production
  // subdepartments. Explicit selections must win over the parent marker.
  if (explicitTokens.length > 0) return explicitTokens;
  return normalizedDepartments.includes("production")
    ? Array.from(PRODUCTION_SUB_DEPARTMENT_TOKENS)
    : [];
};

const hasProductionDepartmentOverlap = (
  userDepartments,
  projectDepartments,
  normalize = normalizeProductionDepartmentToken,
) => {
  const userTokens = normalizeDepartments(userDepartments, normalize);
  const projectTokens = normalizeDepartments(projectDepartments, normalize);
  const userSubDepartments = new Set(
    getExplicitProductionSubDepartmentTokens(userTokens, (value) => value),
  );
  const projectSubDepartments = new Set(
    getExplicitProductionSubDepartmentTokens(projectTokens, (value) => value),
  );
  const userHasProduction =
    userTokens.includes("production") || userSubDepartments.size > 0;
  const projectHasProduction =
    projectTokens.includes("production") || projectSubDepartments.size > 0;

  if (!userHasProduction || !projectHasProduction) return false;

  // A project with only the legacy parent marker remains visible to production
  // users because it has not been assigned to a specific subdepartment.
  if (projectSubDepartments.size === 0) return true;

  // A legacy user with only the parent marker retains broad production access.
  if (userSubDepartments.size === 0) return userTokens.includes("production");

  return Array.from(userSubDepartments).some((token) =>
    projectSubDepartments.has(token),
  );
};

module.exports = {
  PRODUCTION_SUB_DEPARTMENT_TOKENS,
  getExplicitProductionSubDepartmentTokens,
  hasProductionDepartmentOverlap,
  normalizeProductionDepartmentToken,
  resolveProductionSubDepartmentTokens,
};
