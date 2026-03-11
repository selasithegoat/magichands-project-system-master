export const normalizeDepartments = (value) => {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
};

export const hasInventoryPortalAccess = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  const departments = normalizeDepartments(user.department).map((dept) =>
    String(dept || "").trim().toLowerCase(),
  );
  return departments.some((dept) =>
    ["front desk", "stores", "stock", "packaging"].includes(dept),
  );
};
