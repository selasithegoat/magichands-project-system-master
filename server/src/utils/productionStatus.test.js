const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ACTIVE_PRODUCTION_STATUSES,
  isActiveProductionStatus,
} = require("./productionStatus");

test("pending and in-progress statuses both remain in the active Production queue", () => {
  assert.deepEqual(ACTIVE_PRODUCTION_STATUSES, [
    "Pending Production",
    "Production In Progress",
  ]);
  assert.equal(isActiveProductionStatus("Pending Production"), true);
  assert.equal(isActiveProductionStatus("Production In Progress"), true);
  assert.equal(isActiveProductionStatus("Production Completed"), false);
});
