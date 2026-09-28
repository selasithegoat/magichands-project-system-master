const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canAccessSampleMovements,
  canAuthorizeSampleMovements,
  canOperateSampleMovements,
} = require("./sampleMovementAccess");

test("Front Desk can operate sample custody but cannot authorize", () => {
  const user = { role: "user", department: ["Front Desk"] };
  assert.equal(canAccessSampleMovements(user), true);
  assert.equal(canOperateSampleMovements(user), true);
  assert.equal(canAuthorizeSampleMovements(user), false);
});

test("Administration admin can authorize but is not a Front Desk operator", () => {
  const user = { role: "admin", department: ["Administration"] };
  assert.equal(canAccessSampleMovements(user), true);
  assert.equal(canOperateSampleMovements(user), false);
  assert.equal(canAuthorizeSampleMovements(user), true);
});

test("admin role without Administration department cannot authorize", () => {
  const user = { role: "admin", department: ["IT Department"] };
  assert.equal(canAccessSampleMovements(user), false);
  assert.equal(canAuthorizeSampleMovements(user), false);
});
