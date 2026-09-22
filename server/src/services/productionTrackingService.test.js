const assert = require("node:assert/strict");
const test = require("node:test");

const {
  calculateActualProductionMinutes,
} = require("./productionTrackingService");

test("actual production duration is measured from the explicit work start", () => {
  assert.equal(
    calculateActualProductionMinutes(
      "2026-09-22T08:15:00.000Z",
      "2026-09-22T10:00:00.000Z",
    ),
    105,
  );
});

test("actual production duration stays unavailable until work has started", () => {
  assert.equal(
    calculateActualProductionMinutes(null, "2026-09-22T10:00:00.000Z"),
    null,
  );
  assert.equal(calculateActualProductionMinutes("invalid", new Date()), null);
});
