const SCRUM_LEAD_TAG = "scrum_lead";

const normalizeAccessTags = (value) =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);

const isScrumLead = (user) =>
  normalizeAccessTags(user?.accessTags).includes(SCRUM_LEAD_TAG);

const canAccessDisciplinaryReports = (user) =>
  Boolean(user && (user.role === "admin" || isScrumLead(user)));

const requireDisciplinaryAccess = (req, res, next) => {
  if (canAccessDisciplinaryReports(req.user)) return next();
  return res.status(403).json({
    message: "Disciplinary Committee reports are restricted to Scrum Leads and administrators.",
  });
};

const requireDisciplinaryAdmin = (req, res, next) => {
  if (req.user?.role === "admin") return next();
  return res.status(403).json({
    message: "Only an administrator can complete this report action.",
  });
};

module.exports = {
  SCRUM_LEAD_TAG,
  normalizeAccessTags,
  isScrumLead,
  canAccessDisciplinaryReports,
  requireDisciplinaryAccess,
  requireDisciplinaryAdmin,
};
