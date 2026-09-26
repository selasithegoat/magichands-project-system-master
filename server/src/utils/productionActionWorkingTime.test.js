const test = require("node:test");
const assert = require("node:assert/strict");
const { addProductionWorkingHours } = require("./productionActionWorkingTime");

test("working-hour deadlines stay within Monday-Saturday 9 AM-6 PM Accra", () => {
  const cases = [
    ["2026-09-21T10:00:00Z", 2, "2026-09-21T12:00:00.000Z"],
    ["2026-09-26T17:00:00Z", 2, "2026-09-28T10:00:00.000Z"],
    ["2026-09-27T10:00:00Z", 2, "2026-09-28T11:00:00.000Z"],
    ["2026-09-21T17:00:00Z", 8, "2026-09-22T16:00:00.000Z"],
    ["2026-09-21T10:00:00Z", 8, "2026-09-22T09:00:00.000Z"],
    ["2026-09-26T18:00:00Z", 2, "2026-09-28T11:00:00.000Z"],
  ];
  for (const [start, hours, expected] of cases) {
    assert.equal(addProductionWorkingHours(start, hours).toISOString(), expected);
  }
});
