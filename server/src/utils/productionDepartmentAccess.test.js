const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasProductionDepartmentOverlap,
  resolveProductionSubDepartmentTokens,
} = require("./productionDepartmentAccess");

test("explicit production subdepartments override the parent marker", () => {
  assert.deepEqual(
    resolveProductionSubDepartmentTokens(["Production", "embroidery"]),
    ["embroidery"],
  );
});

test("a scoped production user only overlaps the selected subdepartment", () => {
  const userDepartments = ["Production", "embroidery"];

  assert.equal(
    hasProductionDepartmentOverlap(userDepartments, ["embroidery"]),
    true,
  );
  assert.equal(
    hasProductionDepartmentOverlap(userDepartments, ["large-format"]),
    false,
  );
});

test("a legacy parent-only production account retains broad access", () => {
  assert.equal(
    hasProductionDepartmentOverlap(["Production"], ["large-format"]),
    true,
  );
  assert.equal(resolveProductionSubDepartmentTokens(["Production"]).length, 20);
});

test("generic legacy projects remain available to scoped production users", () => {
  assert.equal(
    hasProductionDepartmentOverlap(
      ["Production", "digital-press"],
      ["Production"],
    ),
    true,
  );
});
