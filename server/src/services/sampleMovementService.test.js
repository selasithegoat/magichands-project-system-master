const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const SampleMovement = require("../models/SampleMovement");
const {
  appendCustodyEvent,
  getUserDisplayName,
  transitionSampleMovement,
} = require("./sampleMovementService");

const objectId = () => new mongoose.Types.ObjectId();

const buildDraft = () => {
  const userId = objectId();
  return new SampleMovement({
    reference: "SM-2026-0099",
    referenceYear: 2026,
    referenceNumber: 99,
    project: objectId(),
    client: { name: "Example Client" },
    purpose: "Client assessment",
    handoverMethod: "pickup",
    disposition: "returnable",
    expectedReturnAt: new Date("2026-12-01T12:00:00.000Z"),
    items: [{ description: "Printed sample", quantity: 1 }],
    frontDeskOwner: userId,
    createdBy: userId,
    updatedBy: userId,
  });
};

test("transition service changes status and appends an attributed custody event", () => {
  const movement = buildDraft();
  const actor = {
    _id: objectId(),
    firstName: "Ama",
    lastName: "Mensah",
  };

  transitionSampleMovement(movement, "awaiting_authorization", {
    type: "submitted",
    actor,
    note: "Ready for review",
  });

  assert.equal(movement.status, "awaiting_authorization");
  assert.equal(movement.custodyEvents.length, 1);
  assert.equal(movement.custodyEvents[0].fromStatus, "draft");
  assert.equal(movement.custodyEvents[0].toStatus, "awaiting_authorization");
  assert.equal(movement.custodyEvents[0].actorName, "Ama Mensah");
});

test("invalid transition leaves the record unchanged", () => {
  const movement = buildDraft();
  assert.throws(
    () =>
      transitionSampleMovement(movement, "client_owned", {
        type: "ownership_transfer_approved",
        actor: { _id: objectId(), name: "Admin" },
      }),
    (error) => error.code === "INVALID_SAMPLE_MOVEMENT_TRANSITION",
  );
  assert.equal(movement.status, "draft");
  assert.equal(movement.custodyEvents.length, 0);
});

test("manual events retain a readable actor snapshot", () => {
  const movement = buildDraft();
  const actor = { _id: objectId(), employeeId: "FD-001" };
  appendCustodyEvent(movement, {
    type: "updated",
    actor,
    fromStatus: "draft",
    toStatus: "draft",
  });
  assert.equal(getUserDisplayName(actor), "FD-001");
  assert.equal(movement.custodyEvents[0].actorName, "FD-001");
});
