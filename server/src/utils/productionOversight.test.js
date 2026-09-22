const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildProductionOversightSummary,
  compareProductionOversightProjects,
  getProductionExecutionState,
} = require("./productionOversight");

test("production oversight summarizes official statuses and risk levels", () => {
  const projects = [
    {
      status: "Pending Production",
      productionOwnerId: null,
      productionTracking: { riskLevel: "at_risk" },
    },
    {
      status: "Production In Progress",
      productionOwnerId: "owner-1",
      productionTracking: { riskLevel: "overdue" },
    },
  ];

  assert.deepEqual(buildProductionOversightSummary(projects), {
    total: 2,
    queued: 1,
    inProgress: 1,
    atRisk: 1,
    overdue: 1,
    unassigned: 1,
  });
  assert.equal(getProductionExecutionState(projects[0]), "queued");
  assert.equal(getProductionExecutionState(projects[1]), "in_progress");
});

test("production oversight puts higher risks and earlier deadlines first", () => {
  const onTrack = {
    orderId: "MH-2",
    productionTracking: {
      riskLevel: "on_track",
      productionDueAt: "2026-09-22T10:00:00.000Z",
    },
  };
  const overdue = {
    orderId: "MH-1",
    productionTracking: {
      riskLevel: "overdue",
      productionDueAt: "2026-09-22T12:00:00.000Z",
    },
  };

  assert.deepEqual(
    [onTrack, overdue].sort(compareProductionOversightProjects),
    [overdue, onTrack],
  );
});
