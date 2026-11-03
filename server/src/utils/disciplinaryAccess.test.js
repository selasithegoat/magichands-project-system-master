const test = require("node:test");
const assert = require("node:assert/strict");
const {
  canAccessDisciplinaryReports,
  isScrumLead,
  normalizeAccessTags,
} = require("./disciplinaryAccess");

test("normalizes Scrum Lead access tags", () => {
  assert.deepEqual(normalizeAccessTags([" Scrum_Lead ", ""]), ["scrum_lead"]);
  assert.equal(isScrumLead({ accessTags: ["scrum_lead"] }), true);
});

test("allows only administrators and assigned Scrum Leads", () => {
  assert.equal(canAccessDisciplinaryReports({ role: "admin" }), true);
  assert.equal(canAccessDisciplinaryReports({ role: "user", accessTags: ["scrum_lead"] }), true);
  assert.equal(canAccessDisciplinaryReports({ role: "user", accessTags: [] }), false);
  assert.equal(canAccessDisciplinaryReports(null), false);
});
