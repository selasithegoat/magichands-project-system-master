const assert = require("node:assert/strict");
const test = require("node:test");

const {
  AT_RISK_CADENCE_MS,
  LEAD_OVERDUE_CADENCE_MS,
  LEAD_REGULAR_CADENCE_MS,
  OVERDUE_CADENCE_MS,
  buildProductionAlert,
  buildProductionLeadNotificationKey,
  buildProductionLeadReminder,
  buildProductionNotificationKey,
  getLatestProductionStartAt,
  getProductionCompletionLeadIds,
  resolveProductionAlertStage,
  resolveProductionLeadReminderStage,
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

test("an in-progress job no longer receives a start-now alert", () => {
  const project = buildProject({
    status: "Production In Progress",
    productionTracking: {
      productionDueAt: new Date("2026-09-22T12:00:00.000Z"),
      estimatedProductionMinutes: 120,
      executionState: "in_progress",
      workStartedAt: new Date("2026-09-22T09:30:00.000Z"),
      riskLevel: "on_track",
    },
  });
  assert.equal(resolveProductionAlertStage(project, NOW), "");
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

test("lead reminders follow queued production from awareness to start follow-up", () => {
  const project = buildProject({
    productionTracking: {
      productionDueAt: new Date("2026-09-22T13:00:00.000Z"),
      estimatedProductionMinutes: 120,
      queuedAt: new Date("2026-09-22T09:00:00.000Z"),
      riskLevel: "on_track",
    },
  });

  assert.equal(
    resolveProductionLeadReminderStage(
      project,
      new Date("2026-09-22T10:00:00.000Z"),
    ),
    "awareness",
  );
  assert.equal(
    resolveProductionLeadReminderStage(
      project,
      new Date("2026-09-22T11:00:00.000Z"),
    ),
    "start_due",
  );
  assert.equal(
    resolveProductionLeadReminderStage(
      project,
      new Date("2026-09-22T11:30:00.000Z"),
    ),
    "start_follow_up",
  );
});

test("lead reminders use production progress and completion checkpoints", () => {
  const project = buildProject({
    status: "Production In Progress",
    productionTracking: {
      productionDueAt: new Date("2026-09-22T13:00:00.000Z"),
      estimatedProductionMinutes: 120,
      workStartedAt: new Date("2026-09-22T08:00:00.000Z"),
      riskLevel: "on_track",
    },
  });

  assert.equal(
    resolveProductionLeadReminderStage(
      project,
      new Date("2026-09-22T08:30:00.000Z"),
    ),
    "awareness",
  );
  assert.equal(
    resolveProductionLeadReminderStage(
      project,
      new Date("2026-09-22T09:00:00.000Z"),
    ),
    "progress_checkpoint",
  );
  assert.equal(
    resolveProductionLeadReminderStage(
      project,
      new Date("2026-09-22T10:00:00.000Z"),
    ),
    "completion_due",
  );
});

test("predicted completion drives the Lead completion check", () => {
  const project = buildProject({
    status: "Production In Progress",
    productionTracking: {
      productionDueAt: new Date("2026-09-22T15:00:00.000Z"),
      predictedCompletionAt: new Date("2026-09-22T10:00:00.000Z"),
      estimatedProductionMinutes: 240,
      workStartedAt: new Date("2026-09-22T08:00:00.000Z"),
      riskLevel: "on_track",
    },
  });

  assert.equal(resolveProductionLeadReminderStage(project, NOW), "completion_due");
});

test("completion checks target the primary Lead with Assistant Lead fallback", () => {
  const project = buildProject({
    projectLeadId: "66f000000000000000000003",
    assistantLeadId: "66f000000000000000000004",
  });
  assert.deepEqual(getProductionCompletionLeadIds(project), [project.projectLeadId]);

  const fallbackProject = {
    ...project,
    projectLeadId: project.productionOwnerId,
  };
  assert.deepEqual(getProductionCompletionLeadIds(fallbackProject), [
    project.assistantLeadId,
  ]);
});

test("an unanswered completion check does not generate repeated Lead prompts", () => {
  const project = buildProject({
    status: "Production In Progress",
    productionTracking: {
      predictedCompletionAt: new Date("2026-09-22T09:30:00.000Z"),
      estimatedProductionMinutes: 120,
      workStartedAt: new Date("2026-09-22T08:00:00.000Z"),
      riskLevel: "overdue",
      completionReview: { status: "awaiting_lead" },
    },
  });

  assert.equal(
    resolveProductionLeadReminderStage(project, NOW),
    "awaiting_completion_response",
  );
});

test("not-ready feedback defers the next completion check until its revised time", () => {
  const project = buildProject({
    status: "Production In Progress",
    productionTracking: {
      predictedCompletionAt: new Date("2026-09-22T09:00:00.000Z"),
      estimatedProductionMinutes: 120,
      workStartedAt: new Date("2026-09-22T07:00:00.000Z"),
      riskLevel: "on_track",
      completionReview: {
        status: "not_ready",
        nextCheckAt: new Date("2026-09-22T10:30:00.000Z"),
      },
    },
  });

  assert.equal(
    resolveProductionLeadReminderStage(project, NOW),
    "awaiting_completion_response",
  );
  assert.equal(
    resolveProductionLeadReminderStage(
      project,
      new Date("2026-09-22T10:30:00.000Z"),
    ),
    "completion_due",
  );
});

test("lead production risk stages override ordinary progress checkpoints", () => {
  const atRiskProject = buildProject({
    productionTracking: {
      ...buildProject().productionTracking,
      riskLevel: "at_risk",
    },
  });
  const overdueProject = buildProject({
    productionTracking: {
      ...buildProject().productionTracking,
      riskLevel: "overdue",
    },
  });

  assert.equal(
    resolveProductionLeadReminderStage(atRiskProject, NOW),
    "at_risk",
  );
  assert.equal(
    resolveProductionLeadReminderStage(overdueProject, NOW),
    "overdue",
  );
  assert.equal(LEAD_REGULAR_CADENCE_MS, 60 * 60 * 1000);
  assert.equal(LEAD_OVERDUE_CADENCE_MS, 30 * 60 * 1000);
});

test("lead reminder keys repeat only when their cadence window advances", () => {
  const project = buildProject({
    projectLeadId: "66f000000000000000000003",
    productionTracking: {
      productionDueAt: new Date("2026-09-22T13:00:00.000Z"),
      estimatedProductionMinutes: 120,
      queuedAt: new Date("2026-09-22T09:00:00.000Z"),
      riskLevel: "on_track",
    },
  });
  const leadId = project.projectLeadId;
  const first = buildProductionLeadNotificationKey(
    project,
    leadId,
    "start_follow_up",
    new Date("2026-09-22T11:31:00.000Z"),
  );
  const sameWindow = buildProductionLeadNotificationKey(
    project,
    leadId,
    "start_follow_up",
    new Date("2026-09-22T12:20:00.000Z"),
  );
  const nextWindow = buildProductionLeadNotificationKey(
    project,
    leadId,
    "start_follow_up",
    new Date("2026-09-22T12:31:00.000Z"),
  );

  assert.equal(first, sameWindow);
  assert.notEqual(first, nextWindow);
});

test("lead reminder content tells the lead what action to prompt", () => {
  const reminder = buildProductionLeadReminder(
    buildProject({
      productionOwnerId: {
        _id: "66f000000000000000000002",
        firstName: "Ama",
        lastName: "Mensah",
      },
    }),
    "start_follow_up",
    NOW,
  );

  assert.equal(reminder.type, "REMINDER");
  assert.equal(reminder.source, "production_lead_follow_up:start_follow_up");
  assert.match(reminder.message, /MH-2401/);
  assert.match(reminder.message, /Ama Mensah/);
  assert.match(reminder.message, /start/i);
});
