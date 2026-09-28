const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertSampleMovementReadyForSubmission,
  assertSampleMovementTransition,
  canTransitionSampleMovement,
  getSampleMovementAttentionState,
  getSampleMovementSubmissionErrors,
  isTerminalSampleMovementStatus,
  resolvePostReleaseStatus,
} = require("./sampleMovementLifecycle");

const completeMovement = (overrides = {}) => ({
  project: "project-id",
  client: { name: "Example Client" },
  purpose: "Client assessment before main production",
  handoverMethod: "pickup",
  disposition: "returnable",
  expectedReturnAt: "2026-10-20T12:00:00.000Z",
  items: [{ description: "Branded sample", quantity: 2 }],
  ...overrides,
});

test("sample movement lifecycle permits only explicit transitions", () => {
  assert.equal(canTransitionSampleMovement("draft", "awaiting_authorization"), true);
  assert.equal(canTransitionSampleMovement("draft", "authorized"), false);
  assert.equal(
    canTransitionSampleMovement("in_client_custody", "ownership_transfer_pending"),
    true,
  );
  assert.equal(canTransitionSampleMovement("returned", "in_client_custody"), false);
  assert.equal(assertSampleMovementTransition("authorized", "dispatched"), "dispatched");
  assert.throws(
    () => assertSampleMovementTransition("draft", "client_owned"),
    (error) => error.code === "INVALID_SAMPLE_MOVEMENT_TRANSITION",
  );
});

test("returned and client-owned are distinct terminal outcomes", () => {
  assert.equal(isTerminalSampleMovementStatus("returned"), true);
  assert.equal(isTerminalSampleMovementStatus("client_owned"), true);
  assert.equal(isTerminalSampleMovementStatus("in_client_custody"), false);
});

test("release outcome respects handover method and ownership", () => {
  assert.equal(
    resolvePostReleaseStatus({ disposition: "returnable", handoverMethod: "dispatch" }),
    "dispatched",
  );
  assert.equal(
    resolvePostReleaseStatus({
      disposition: "returnable",
      handoverMethod: "dispatch",
      recipientConfirmed: true,
    }),
    "in_client_custody",
  );
  assert.equal(
    resolvePostReleaseStatus({ disposition: "client_owned", handoverMethod: "pickup" }),
    "client_owned",
  );
});

test("due attention is calculated without replacing custody status", () => {
  const now = new Date("2026-09-28T12:00:00.000Z");
  assert.equal(
    getSampleMovementAttentionState(
      completeMovement({
        status: "in_client_custody",
        expectedReturnAt: "2026-10-02T12:00:00.000Z",
      }),
      { now },
    ),
    "due_soon",
  );
  assert.equal(
    getSampleMovementAttentionState(
      completeMovement({
        status: "partially_returned",
        expectedReturnAt: "2026-09-27T12:00:00.000Z",
      }),
      { now },
    ),
    "overdue",
  );
  assert.equal(
    getSampleMovementAttentionState(
      completeMovement({
        status: "client_owned",
        disposition: "client_owned",
        expectedReturnAt: null,
      }),
      { now },
    ),
    "none",
  );
});

test("returnable samples require a future return date before submission", () => {
  const now = new Date("2026-09-28T12:00:00.000Z");
  assert.equal(
    getSampleMovementSubmissionErrors(completeMovement(), { now }).length,
    0,
  );
  assert.equal(
    getSampleMovementSubmissionErrors(
      completeMovement({ expectedReturnAt: "2026-09-20T12:00:00.000Z" }),
      { now },
    ).some((error) => error.field === "expectedReturnAt"),
    true,
  );
  assert.equal(
    assertSampleMovementReadyForSubmission(
      completeMovement({ disposition: "client_owned", expectedReturnAt: null }),
      { now },
    ),
    true,
  );
});
