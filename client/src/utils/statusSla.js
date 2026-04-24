const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;

const CLOSED_SLA_STATUSES = new Set(["Completed", "Finished", "Declined"]);

const STATUS_SLA_RULES = {
  "Order Created": { yellowHours: 8, redHours: 24 },
  "Quote Created": { yellowHours: 8, redHours: 24 },
  "Pending Acceptance": { yellowHours: 8, redHours: 24 },
  "Pending Scope Approval": { yellowHours: 8, redHours: 24 },
  "Scope Approval Completed": { yellowHours: 12, redHours: 24 },
  "Pending Departmental Meeting": { yellowHours: 24, redHours: 48 },
  "Pending Departmental Engagement": { yellowHours: 24, redHours: 48 },
  "Departmental Engagement Completed": { yellowHours: 12, redHours: 24 },
  "Pending Mockup": { yellowHours: 24, redHours: 48 },
  "Mockup Completed": { yellowHours: 12, redHours: 24 },
  "Pending Master Approval": { yellowHours: 8, redHours: 24 },
  "Master Approval Completed": { yellowHours: 12, redHours: 24 },
  "Pending Production": { yellowHours: 48, redHours: 96 },
  "Pending Sample Production": { yellowHours: 24, redHours: 48 },
  "Production Completed": { yellowHours: 12, redHours: 24 },
  "Pending Quality Control": { yellowHours: 12, redHours: 24 },
  "Quality Control Completed": { yellowHours: 12, redHours: 24 },
  "Pending Photography": { yellowHours: 24, redHours: 48 },
  "Photography Completed": { yellowHours: 12, redHours: 24 },
  "Pending Packaging": { yellowHours: 24, redHours: 48 },
  "Packaging Completed": { yellowHours: 12, redHours: 24 },
  "Pending Delivery/Pickup": { yellowHours: 24, redHours: 48 },
  Delivered: { yellowHours: 48, redHours: 72 },
  "Pending Feedback": { yellowHours: 48, redHours: 96 },
  "Feedback Completed": { yellowHours: 24, redHours: 48 },
  "Pending Cost Verification": { yellowHours: 24, redHours: 48 },
  "Cost Verification Completed": { yellowHours: 12, redHours: 24 },
  "Pending Quote Submission": { yellowHours: 24, redHours: 48 },
  "Quote Submission Completed": { yellowHours: 12, redHours: 24 },
  "Pending Client Decision": { yellowHours: 72, redHours: 120 },
  "Pending Quote Request": { yellowHours: 24, redHours: 48 },
  "Quote Request Completed": { yellowHours: 12, redHours: 24 },
  "Pending Send Response": { yellowHours: 24, redHours: 48 },
  "Response Sent": { yellowHours: 24, redHours: 48 },
  "On Hold": { yellowHours: 72, redHours: 168 },
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatStatusElapsed = (elapsedMs) => {
  const safeElapsed = Math.max(0, Number(elapsedMs) || 0);
  const days = Math.floor(safeElapsed / DAY_IN_MS);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`;

  const hours = Math.floor(safeElapsed / HOUR_IN_MS);
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;

  const minutes = Math.floor(safeElapsed / (60 * 1000));
  if (minutes >= 1) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  return "less than 1 minute";
};

export const getProjectStatusSla = (project) => {
  if (!project) return null;
  if (project.sla?.label && project.sla?.since) return project.sla;

  const status = project.status || "";
  if (!status || CLOSED_SLA_STATUSES.has(status)) return null;

  const sinceDate =
    toDateOrNull(project.statusChangedAt) ||
    toDateOrNull(project.updatedAt) ||
    toDateOrNull(project.createdAt) ||
    toDateOrNull(project.orderDate);
  if (!sinceDate) return null;

  const elapsedMs = Math.max(0, Date.now() - sinceDate.getTime());
  const rule = STATUS_SLA_RULES[status] || null;
  const isEmergency =
    project.priority === "Urgent" || project.projectType === "Emergency";
  const multiplier = isEmergency ? 0.5 : 1;
  const yellowAfterMs = rule
    ? Math.max(HOUR_IN_MS, rule.yellowHours * multiplier * HOUR_IN_MS)
    : null;
  const redAfterMs = rule
    ? Math.max(HOUR_IN_MS, rule.redHours * multiplier * HOUR_IN_MS)
    : null;
  let severity = "normal";

  if (redAfterMs && elapsedMs >= redAfterMs) {
    severity = "red";
  } else if (yellowAfterMs && elapsedMs >= yellowAfterMs) {
    severity = "yellow";
  }

  const elapsedLabel = formatStatusElapsed(elapsedMs);
  return {
    status,
    since: sinceDate.toISOString(),
    elapsedMs,
    elapsedLabel,
    label: `${status} for ${elapsedLabel}`,
    severity,
    yellowAfterMs,
    redAfterMs,
    tracked: Boolean(rule),
  };
};
