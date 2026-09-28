const normalizeDepartment = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

const getDepartmentTokens = (user) =>
  (Array.isArray(user?.department)
    ? user.department
    : user?.department
      ? [user.department]
      : []
  )
    .map(normalizeDepartment)
    .filter(Boolean);

const isFrontDeskSampleMovementUser = (user) =>
  getDepartmentTokens(user).includes("front-desk");

const isAdminSampleMovementUser = (user) =>
  user?.role === "admin" &&
  getDepartmentTokens(user).includes("administration");

const canAccessSampleMovements = (user) =>
  isFrontDeskSampleMovementUser(user) || isAdminSampleMovementUser(user);

const canOperateSampleMovements = (user) =>
  isFrontDeskSampleMovementUser(user);

const canAuthorizeSampleMovements = (user) =>
  isAdminSampleMovementUser(user);

const requireSampleMovementAccess = (req, res, next) => {
  if (canAccessSampleMovements(req.user)) return next();
  return res.status(403).json({
    message:
      "Access denied: sample custody is restricted to Front Desk and Administration admins.",
  });
};

module.exports = {
  canAccessSampleMovements,
  canAuthorizeSampleMovements,
  canOperateSampleMovements,
  getDepartmentTokens,
  isAdminSampleMovementUser,
  isFrontDeskSampleMovementUser,
  requireSampleMovementAccess,
};
