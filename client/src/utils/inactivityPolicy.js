const AUTO_LOGOUT_EXEMPT_DEPARTMENTS = new Set([
  "front desk",
  "graphics/design",
  "graphics",
]);

export const isDefaultInactivityLogoutExempt = (user) => {
  if (String(user?.role || "").trim().toLowerCase() === "admin") return true;
  const departments = Array.isArray(user?.department)
    ? user.department
    : user?.department
      ? [user.department]
      : [];
  return departments.some((department) =>
    AUTO_LOGOUT_EXEMPT_DEPARTMENTS.has(
      String(department || "").trim().toLowerCase(),
    ),
  );
};

export const isInactivityLogoutEnabled = (user) => {
  const preference = user?.sessionSettings?.inactivityLogoutEnabled;
  if (typeof preference === "boolean") return preference;
  return !isDefaultInactivityLogoutExempt(user);
};
