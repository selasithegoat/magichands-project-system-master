const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getSampleRetrievalReminderStage,
  getStageMessage,
} = require("./sampleRetrievalReminderService");

const NOW = new Date("2026-09-29T12:00:00.000Z");
const movement = (overrides = {}) => ({
  reference: "SM-2026-0002",
  status: "in_client_custody",
  disposition: "returnable",
  expectedReturnAt: new Date("2026-10-04T12:00:00.000Z"),
  client: { name: "Example Client" },
  projectSnapshot: { orderId: "MH-1024" },
  ...overrides,
});

test("retrieval reminders begin within seven days", () => {
  assert.equal(
    getSampleRetrievalReminderStage(movement(), { now: NOW }),
    "due_soon",
  );
});

test("retrievals inside 24 hours are due today", () => {
  assert.equal(
    getSampleRetrievalReminderStage(
      movement({ expectedReturnAt: new Date("2026-09-30T10:00:00.000Z") }),
      { now: NOW },
    ),
    "due_today",
  );
});

test("past retrieval dates are overdue", () => {
  assert.equal(
    getSampleRetrievalReminderStage(
      movement({ expectedReturnAt: new Date("2026-09-29T11:59:59.000Z") }),
      { now: NOW },
    ),
    "overdue",
  );
});

test("terminal and client-owned movements do not produce reminders", () => {
  assert.equal(
    getSampleRetrievalReminderStage(movement({ status: "returned" }), {
      now: NOW,
    }),
    "none",
  );
  assert.equal(
    getSampleRetrievalReminderStage(
      movement({ disposition: "client_owned" }),
      { now: NOW },
    ),
    "none",
  );
});

test("reminder messages identify the custody record and client", () => {
  const content = getStageMessage(movement(), "overdue");
  assert.match(content.title, /SM-2026-0002/);
  assert.match(content.message, /Example Client/);
  assert.equal(content.priority, "urgent");
});
