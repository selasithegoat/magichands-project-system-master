const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AT_RISK_CADENCE_MS,
  OVERDUE_CADENCE_MS,
  buildProductionAlert,
  buildProductionNotificationKey,
  getLatestProductionStartAt,
  resolveProductionAlertStage,
  shouldCloseProductionNotifications,
  shouldSendProductionAlert,
} = require("./productionNotificationService");

const NOW = new Date("2026-09-22T10:00:00.000Z");

const buildProject = (overrides = {}) => ({
  _id: "66f000000000000000000001",
  orderId: "MH-2401",
  status: "Pending Production",
  productionOwnerId: "66f000000000000000000002",
  details: { projectName: "Conference Shirts" },
  productionTracking: {
    productionDueAt: new Date("2026-09-22T13:00:00.000Z"),
    estimatedProductionMinutes: 120,
    riskLevel: "on_track",
  },
  ...overrides,
});

test("latest production start is deadline minus the estimated duration", () => {
  const latestStartAt = getLatestProductionStartAt(buildProject());
  assert.equal(latestStartAt.toISOString(), "2026-09-22T11:00:00.000Z");
});

test("attention, start-now, at-risk, and overdue stages escalate in order", () => {
  const attentionProject = buildProject({
    productionTracking: {
      productionDueAt: new Date("2026-09-22T13:00:00.000Z"),
      estimatedProductionMinutes: 120,
      riskLevel: "attention",
    },
  });
  assert.equal(
    resolveProductionAlertStage(attentionProject, NOW),
    "attention",
  );
  assert.equal(
    resolveProductionAlertStage(
      attentionProject,
      new Date("2026-09-22T11:00:00.000Z"),
    ),
    "time_to_begin",
  );

  const atRiskProject = buildProject({
    productionTracking: {
      ...attentionProject.productionTracking,
      riskLevel: "at_risk",
    },
  });
  assert.equal(resolveProductionAlertStage(atRiskProject, NOW), "at_risk");

  const overdueProject = buildProject({
    productionTracking: {
      ...attentionProject.productionTracking,
      riskLevel: "overdue",
    },
  });
  assert.equal(resolveProductionAlertStage(overdueProject, NOW), "overdue");
});

test("one-time stages do not repeat for the same production plan", () => {
  assert.equal(shouldSendProductionAlert("attention", {}, NOW), true);
  assert.equal(
    shouldSendProductionAlert(
      "attention",
      { attentionSentAt: new Date("2026-09-22T09:00:00.000Z") },
      NOW,
    ),
    false,
  );
  assert.equal(shouldSendProductionAlert("time_to_begin", {}, NOW), true);
  assert.equal(
    shouldSendProductionAlert(
      "time_to_begin",
      { timeToBeginSentAt: new Date("2026-09-22T09:59:00.000Z") },
      NOW,
    ),
    false,
  );
});

test("at-risk repeats every 30 minutes and overdue every 15 minutes", () => {
  assert.equal(AT_RISK_CADENCE_MS, 30 * 60 * 1000);
  assert.equal(OVERDUE_CADENCE_MS, 15 * 60 * 1000);

  assert.equal(
    shouldSendProductionAlert(
      "at_risk",
      { atRiskLastSentAt: new Date("2026-09-22T09:31:00.000Z") },
      NOW,
    ),
    false,
  );
  assert.equal(
    shouldSendProductionAlert(
      "at_risk",
      { atRiskLastSentAt: new Date("2026-09-22T09:30:00.000Z") },
      NOW,
    ),
    true,
  );
  assert.equal(
    shouldSendProductionAlert(
      "overdue",
      { overdueLastSentAt: new Date("2026-09-22T09:46:00.000Z") },
      NOW,
    ),
    false,
  );
  assert.equal(
    shouldSendProductionAlert(
      "overdue",
      { overdueLastSentAt: new Date("2026-09-22T09:45:00.000Z") },
      NOW,
    ),
    true,
  );
});

test("deduplication keys are stable inside a reminder cadence window", () => {
  const project = buildProject();
  const ownerId = project.productionOwnerId;
  const first = buildProductionNotificationKey(
    project,
    ownerId,
    "at_risk",
    new Date("2026-09-22T10:01:00.000Z"),
  );
  const second = buildProductionNotificationKey(
    project,
    ownerId,
    "at_risk",
    new Date("2026-09-22T10:20:00.000Z"),
  );
  const later = buildProductionNotificationKey(
    project,
    ownerId,
    "at_risk",
    new Date("2026-09-22T10:31:00.000Z"),
  );
  const revisedEstimate = buildProductionNotificationKey(
    {
      ...project,
      productionTracking: {
        ...project.productionTracking,
        estimatedProductionMinutes: 180,
      },
    },
    ownerId,
    "at_risk",
    new Date("2026-09-22T10:01:00.000Z"),
  );
  assert.equal(first, second);
  assert.notEqual(first, later);
  assert.notEqual(first, revisedEstimate);
});

test("production alert content identifies the project and escalation", () => {
  const alert = buildProductionAlert(buildProject(), "overdue", NOW);
  assert.equal(alert.type, "REMINDER");
  assert.equal(alert.source, "production_follow_up:overdue");
  assert.match(alert.title, /overdue/i);
  assert.match(alert.message, /MH-2401/);
  assert.match(alert.message, /Conference Shirts/);
});

test("pre-production ownership stays visible but completed work resolves alerts", () => {
  const preProductionProject = buildProject({
    status: "Pending Departmental Engagement",
  });
  assert.equal(
    shouldCloseProductionNotifications({
      project: preProductionProject,
      previousStatus: "Pending Departmental Engagement",
      state: { assignmentSentAt: NOW },
    }),
    false,
  );
  assert.equal(
    shouldCloseProductionNotifications({
      project: { ...preProductionProject, status: "Production Completed" },
      previousStatus: "Pending Production",
      state: { attentionSentAt: NOW },
    }),
    true,
  );
  assert.equal(
    shouldCloseProductionNotifications({
      project: { ...preProductionProject, cancellation: { isCancelled: true } },
      previousStatus: "Pending Departmental Engagement",
      state: {},
    }),
    true,
  );
});
