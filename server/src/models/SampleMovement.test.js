const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const SampleMovement = require("./SampleMovement");

const objectId = () => new mongoose.Types.ObjectId();

const buildMovement = (overrides = {}) => {
  const userId = objectId();
  return new SampleMovement({
    reference: "SM-2026-0001",
    referenceYear: 2026,
    referenceNumber: 1,
    project: objectId(),
    projectSnapshot: { orderId: "MH-100", projectName: "Sample Project" },
    client: { name: "Example Client", contactPerson: "Ama Mensah" },
    purpose: "Assessment before main production",
    handoverMethod: "pickup",
    disposition: "returnable",
    expectedReturnAt: new Date("2026-10-20T12:00:00.000Z"),
    items: [{ description: "Printed sample", quantity: 2 }],
    frontDeskOwner: userId,
    createdBy: userId,
    updatedBy: userId,
    ...overrides,
  });
};

test("sample movement model accepts a complete draft", () => {
  const movement = buildMovement();
  assert.equal(movement.validateSync(), undefined);
  assert.equal(movement.reference, "SM-2026-0001");
  assert.equal(movement.status, "draft");
});

test("submitted returnable movement requires an expected return date", async () => {
  const movement = buildMovement({
    status: "awaiting_authorization",
    expectedReturnAt: null,
  });
  await assert.rejects(
    movement.validate(),
    (error) => Boolean(error.errors.expectedReturnAt),
  );
});

test("client-owned closure requires client-owned disposition", async () => {
  const movement = buildMovement({
    status: "client_owned",
    disposition: "decision_pending",
  });
  await assert.rejects(
    movement.validate(),
    (error) => Boolean(error.errors.disposition),
  );
});

test("item return and production quantities cannot exceed released quantity", () => {
  const movement = buildMovement({
    items: [
      {
        description: "Printed sample",
        quantity: 2,
        quantityReturned: 3,
        productionQuantityApplied: 4,
      },
    ],
  });
  const error = movement.validateSync();
  assert.ok(error.errors["items.0.quantityReturned"]);
  assert.ok(error.errors["items.0.productionQuantityApplied"]);
});
