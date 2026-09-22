const {
  PENDING_PRODUCTION_STATUS,
  PRODUCTION_IN_PROGRESS_STATUS,
} = require("./productionStatus");

const PRODUCTION_RISK_ORDER = Object.freeze({
  overdue: 0,
  at_risk: 1,
  deadline_required: 2,
  attention: 3,
  on_track: 4,
  not_started: 5,
});

const getProductionExecutionState = (project = {}) =>
  project.status === PRODUCTION_IN_PROGRESS_STATUS
    ? "in_progress"
    : "queued";

const buildProductionOversightSummary = (projects = []) =>
  projects.reduce(
    (summary, project) => {
      const executionState = getProductionExecutionState(project);
      const riskLevel = String(
        project?.productionTracking?.riskLevel || "not_started",
      ).trim();

      summary.total += 1;
      if (executionState === "in_progress") summary.inProgress += 1;
      if (project?.status === PENDING_PRODUCTION_STATUS) summary.queued += 1;
      if (riskLevel === "at_risk") summary.atRisk += 1;
      if (riskLevel === "overdue") summary.overdue += 1;
      if (!project?.productionOwnerId) summary.unassigned += 1;
      return summary;
    },
    {
      total: 0,
      queued: 0,
      inProgress: 0,
      atRisk: 0,
      overdue: 0,
      unassigned: 0,
    },
  );

const compareProductionOversightProjects = (left = {}, right = {}) => {
  const leftRisk =
    PRODUCTION_RISK_ORDER[left?.productionTracking?.riskLevel] ?? 99;
  const rightRisk =
    PRODUCTION_RISK_ORDER[right?.productionTracking?.riskLevel] ?? 99;
  if (leftRisk !== rightRisk) return leftRisk - rightRisk;

  const leftDue = left?.productionTracking?.productionDueAt
    ? new Date(left.productionTracking.productionDueAt).getTime()
    : Number.MAX_SAFE_INTEGER;
  const rightDue = right?.productionTracking?.productionDueAt
    ? new Date(right.productionTracking.productionDueAt).getTime()
    : Number.MAX_SAFE_INTEGER;
  if (leftDue !== rightDue) return leftDue - rightDue;

  return String(left?.orderId || "").localeCompare(String(right?.orderId || ""));
};

module.exports = {
  PRODUCTION_RISK_ORDER,
  buildProductionOversightSummary,
  compareProductionOversightProjects,
  getProductionExecutionState,
};
