import {
  PRODUCTION_SUB_DEPARTMENTS,
  getDepartmentLabel,
  normalizeDepartmentId,
  resolveProductionSubDepartmentAccess,
} from "../constants/departments";

export const getUserProductionDepartmentIds = (user) => {
  const departments = Array.isArray(user?.department)
    ? user.department
    : user?.department
      ? [user.department]
      : [];
  return Array.from(
    new Set(
      departments
        .map(normalizeDepartmentId)
        .filter((department) =>
          PRODUCTION_SUB_DEPARTMENTS.includes(department),
        ),
    ),
  );
};

export const hasUnrestrictedProductionAccess = (user) => {
  const departments = Array.isArray(user?.department)
    ? user.department
    : user?.department
      ? [user.department]
      : [];
  const hasProductionParent = departments.some(
    (department) =>
      String(department || "").trim().toLowerCase() === "production",
  );
  return hasProductionParent && getUserProductionDepartmentIds(user).length === 0;
};

export const getProductionWorkForDepartments = (
  items = [],
  departmentIds = [],
  includeAllProduction = false,
) => {
  const allowedDepartments = new Set(
    (Array.isArray(departmentIds) ? departmentIds : [])
      .map(normalizeDepartmentId)
      .filter(Boolean),
  );
  const work = [];

  (Array.isArray(items) ? items : []).forEach((item, itemIndex) => {
    (Array.isArray(item?.productionAssignments)
      ? item.productionAssignments
      : []
    ).forEach((assignment) => {
      const department = normalizeDepartmentId(assignment?.department);
      if (
        !department ||
        (!includeAllProduction && !allowedDepartments.has(department))
      ) {
        return;
      }
      work.push({
        itemId: String(item?._id || item?.id || itemIndex),
        description: String(item?.description || "Item").trim() || "Item",
        breakdown: String(item?.breakdown || "").trim(),
        qty: Number(item?.qty) || 0,
        department,
        departmentLabel: getDepartmentLabel(department),
        scope: String(assignment?.scope || "").trim(),
      });
    });
  });

  return work;
};

export const getUserProductionWork = (project, user) =>
  project?.projectType === "Quote"
    ? []
    : getProductionWorkForDepartments(
        project?.items,
        resolveProductionSubDepartmentAccess(user?.department),
        false,
      );

export const hasItemLevelProductionAssignments = (items = []) =>
  (Array.isArray(items) ? items : []).some(
    (item) =>
      Array.isArray(item?.productionAssignments) &&
      item.productionAssignments.length > 0,
  );

export const formatProductionWorkSummary = (work = [], limit = 2) => {
  const labels = Array.from(
    new Set(
      (Array.isArray(work) ? work : []).map((entry) => entry.description),
    ),
  );
  if (!labels.length) return "";
  const visible = labels.slice(0, limit);
  const remaining = labels.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? ` +${remaining} more` : ""}`;
};
