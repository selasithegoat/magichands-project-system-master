import {
  PRODUCTION_SUB_DEPARTMENTS,
  GRAPHICS_SUB_DEPARTMENTS,
  STORES_SUB_DEPARTMENTS,
  PHOTOGRAPHY_SUB_DEPARTMENTS,
  normalizeDepartmentId,
} from "../constants/departments";

export const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "object") {
    if (value._id) return toEntityId(value._id);
    if (value.id) return String(value.id).trim();
    if (value.value) return String(value.value).trim();
  }
  return "";
};

export const toArray = (value) =>
  Array.isArray(value) ? value : value ? [value] : [];

export const isFrontDeskUser = (user) =>
  toArray(user?.department).includes("Front Desk");

export const resolveEngagedSubDepartments = (user) => {
  const userDepts = toArray(user?.department).map(normalizeDepartmentId);
  const hasProductionParent = userDepts.includes("Production");
  const hasGraphicsParent = userDepts.includes("Graphics/Design");
  const hasStoresParent = userDepts.includes("Stores");
  const hasPhotographyParent = userDepts.includes("Photography");

  const productionSubDepts = hasProductionParent
    ? PRODUCTION_SUB_DEPARTMENTS
    : userDepts.filter((dept) => PRODUCTION_SUB_DEPARTMENTS.includes(dept));

  const hasGraphics =
    hasGraphicsParent ||
    userDepts.some((dept) => GRAPHICS_SUB_DEPARTMENTS.includes(dept));
  const hasStores =
    hasStoresParent ||
    userDepts.some((dept) => STORES_SUB_DEPARTMENTS.includes(dept));
  const hasPhotography =
    hasPhotographyParent ||
    userDepts.some((dept) => PHOTOGRAPHY_SUB_DEPARTMENTS.includes(dept));

  let subDepartments = [...productionSubDepts];
  if (hasGraphics) subDepartments = subDepartments.concat(GRAPHICS_SUB_DEPARTMENTS);
  if (hasStores) subDepartments = subDepartments.concat(STORES_SUB_DEPARTMENTS);
  if (hasPhotography) {
    subDepartments = subDepartments.concat(PHOTOGRAPHY_SUB_DEPARTMENTS);
  }

  return Array.from(new Set(subDepartments));
};

export const hasAnyEngagedProjectAccess = (user) =>
  resolveEngagedSubDepartments(user).length > 0;

export const hasEngagedDepartmentOverlap = (user, projectDepartments) => {
  if (!Array.isArray(projectDepartments) || projectDepartments.length === 0) {
    return false;
  }
  const engagedSubDepartments = resolveEngagedSubDepartments(user);
  if (engagedSubDepartments.length === 0) return false;
  const departmentSet = new Set(engagedSubDepartments);
  return projectDepartments.some((dept) =>
    departmentSet.has(normalizeDepartmentId(dept)),
  );
};

const normalizeSearchSuffix = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("?")) return normalized;
  return `?${normalized}`;
};

export const canAccessProjectDetails = (user, project) => {
  const userId = toEntityId(user?._id || user?.id);
  if (!userId) return false;

  const leadId = toEntityId(project?.projectLeadId || project?.details?.lead);
  const assistantLeadId = toEntityId(
    project?.assistantLeadId || project?.details?.assistantLead,
  );

  return Boolean(
    userId &&
      (userId === leadId || (assistantLeadId && userId === assistantLeadId)),
  );
};

export const buildAuthorizedProjectDestinations = ({
  user,
  project,
  detailSearch = "",
  fallbackPath = "/client",
  allowGenericEngaged = false,
} = {}) => {
  const projectId = toEntityId(project?._id || project?.id || project);
  if (!projectId) {
    return fallbackPath ? [{ key: "fallback", path: fallbackPath }] : [];
  }

  const destinations = [];
  const detailPath = `/detail/${projectId}${normalizeSearchSuffix(detailSearch)}`;
  const projectDepartments = Array.isArray(project?.departments)
    ? project.departments
    : [];

  if (canAccessProjectDetails(user, project)) {
    destinations.push({
      key: "detail",
      label: "Project Details",
      description: "Open the full project details view.",
      path: detailPath,
    });
  }

  if (isFrontDeskUser(user)) {
    destinations.push({
      key: "frontdesk",
      label: "Order Actions",
      description: "Open the Front Desk order workflow for this project.",
      path: `/new-orders/actions/${projectId}`,
    });
  }

  if (
    hasEngagedDepartmentOverlap(user, projectDepartments) ||
    (allowGenericEngaged && hasAnyEngagedProjectAccess(user))
  ) {
    destinations.push({
      key: "engaged",
      label: "Engaged Actions",
      description: "Open the department engagement action page.",
      path: `/engaged-projects/actions/${projectId}`,
    });
  }

  const uniqueDestinations = [];
  const seenPaths = new Set();
  destinations.forEach((destination) => {
    if (!destination?.path || seenPaths.has(destination.path)) return;
    seenPaths.add(destination.path);
    uniqueDestinations.push(destination);
  });

  if (uniqueDestinations.length > 0) {
    return uniqueDestinations;
  }

  return fallbackPath ? [{ key: "fallback", path: fallbackPath }] : [];
};

export const resolveProjectNavigation = ({
  user,
  project,
  detailSearch = "",
  fallbackPath = "/client",
  allowGenericEngaged = false,
} = {}) => {
  const destinations = buildAuthorizedProjectDestinations({
    user,
    project,
    detailSearch,
    fallbackPath,
    allowGenericEngaged,
  });

  if (destinations.length === 1) {
    return {
      mode: "single",
      option: destinations[0],
      options: destinations,
    };
  }

  if (destinations.length > 1) {
    return {
      mode: "choice",
      options: destinations,
    };
  }

  return {
    mode: "none",
    option: fallbackPath
      ? {
          key: "fallback",
          label: "Dashboard",
          description: "Return to the client dashboard.",
          path: fallbackPath,
        }
      : null,
    options: [],
  };
};
