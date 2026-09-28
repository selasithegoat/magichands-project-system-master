const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatSampleMovementReference,
  getSampleMovementCounterKey,
  parseSampleMovementReference,
} = require("./sampleMovementReference");

test("sample movement references are stable and year-scoped", () => {
  assert.equal(
    formatSampleMovementReference({ year: 2026, sequence: 17 }),
    "SM-2026-0017",
  );
  assert.equal(getSampleMovementCounterKey(2026), "sample-movement:2026");
  assert.deepEqual(parseSampleMovementReference("sm-2026-0017"), {
    reference: "SM-2026-0017",
    year: 2026,
    sequence: 17,
  });
});

test("invalid sample movement references are rejected", () => {
  assert.equal(parseSampleMovementReference("SM-26-17"), null);
  assert.throws(
    () => formatSampleMovementReference({ year: 2026, sequence: 0 }),
    /positive integer/,
  );
});
