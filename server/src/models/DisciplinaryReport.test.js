const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const DisciplinaryReport = require("./DisciplinaryReport");

const id = () => new mongoose.Types.ObjectId();
const person = () => ({
  user: id(),
  name: "Staging Employee",
  employeeId: "STG-EMP",
  department: ["Production"],
  role: "Member",
});

test("validates a complete disciplinary report record", () => {
  const actor = id();
  const report = new DisciplinaryReport({
    reportNumber: "DCMR-2026-0001",
    project: id(),
    projectSnapshot: { orderId: "STG-260003", projectName: "Test production" },
    challengeTitle: "Placement variation",
    moderator: person(),
    meeting: { startedAt: new Date() },
    attendees: [{ ...person(), attendanceStatus: "present" }],
    challengeBrief: "The approved placement was not followed.",
    findings: [{ title: "First piece", conclusion: "The first piece was not checked." }],
    accountability: [{ ...person(), summary: "Required check was missed.", severity: "major" }],
    createdBy: actor,
    auditTrail: [{ action: "created", actor, actorName: "Staging Moderator" }],
  });
  assert.equal(report.validateSync(), undefined);
});

test("rejects unknown accountability severity", () => {
  const actor = id();
  const report = new DisciplinaryReport({
    reportNumber: "DCMR-2026-0002",
    project: id(),
    projectSnapshot: { orderId: "STG-260004", projectName: "Test production" },
    challengeTitle: "Incorrect setup",
    moderator: person(),
    meeting: { startedAt: new Date() },
    challengeBrief: "The setup differed from the approved brief.",
    accountability: [{ ...person(), summary: "Setup was not checked.", severity: "extreme" }],
    createdBy: actor,
  });
  assert.match(report.validateSync().message, /severity/i);
});
