const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("./productionFollowUp");
const project = (extra = {}) => ({ projectType: "Standard", status: "Pending Production", departments: ["dtf", "embroidery"], details: { deliveryDate: "2026-09-11", deliveryTime: "17:00" }, ...extra });

test("reserves all downstream work before the delivery commitment", () => {
  assert.equal(W.productionTarget(project(), W.DEFAULT_PLAN).toISOString(), "2026-09-10T17:00:00.000Z");
});
test("skips weekends, holidays and closed shift hours", () => {
  assert.equal(W.shiftWorkingHours("2026-09-07T09:00:00Z", -2).toISOString(), "2026-09-04T16:00:00.000Z");
  assert.equal(W.shiftWorkingHours("2026-09-07T09:00:00Z", -2, { holidays: ["2026-09-04"] }).toISOString(), "2026-09-03T16:00:00.000Z");
  assert.equal(W.shiftWorkingHours("2026-09-04T16:45:00Z", 0.5).toISOString(), "2026-09-07T08:15:00.000Z");
});
test("supports custom shifts and a seven-day schedule", () => {
  assert.equal(W.shiftWorkingHours("2026-09-07T10:00:00Z", -3, { startHour: 9, endHour: 15, workingDays: [0, 1, 2, 3, 4, 5, 6] }).toISOString(), "2026-09-06T13:00:00.000Z");
  assert.throws(() => W.normalizePlan({ workingDays: [] }), /working day/);
  assert.throws(() => W.normalizePlan({ startHour: 17, endHour: 8 }), /end after/);
});
test("a missing delivery deadline never fabricates a production target", () => {
  const p = project({ details: {} });
  const first = W.prepareWorkflow(p);
  assert.equal(first.targetAt, null);
  assert.ok(W.prepareWorkflow({ ...p, productionFollowUp: first }).tasks.every((t) => t.dueAt === null));
});
test("creates one accountable confirmation per department, including item scope", () => {
  const state = W.prepareWorkflow(project({ items: [{ description: "Shirts", qty: 100, productionAssignments: [{ department: "dtf", scope: "Front prints" }, { department: "dtf", scope: "Back prints" }] }], acknowledgements: [{ department: "dtf", user: "owner" }] }));
  assert.equal(state.tasks.length, 2);
  assert.equal(state.tasks[0].owner, "owner");
  assert.match(state.tasks[0].scope, /Front prints.*Back prints/);
});
test("legacy generic Production creates one assignment instead of every subdepartment", () => {
  assert.equal(W.prepareWorkflow(project({ departments: ["Production"] })).tasks.length, 1);
});
test("does not invent unfinished work or completion timestamps for existing later stages", () => {
  const state = W.prepareWorkflow(project({ status: "Pending Quality Control" }));
  assert.ok(state.tasks.every((t) => t.status === "completed" && t.legacyStageCompletion));
  assert.ok(state.tasks.every((t) => !t.completedAt && !t.completedBy));
});
test("an acknowledgement after initialization fills an unassigned owner", () => {
  const p = project(); p.productionFollowUp = W.prepareWorkflow(p);
  p.acknowledgements = [{ department: "dtf", user: "new-owner" }];
  assert.equal(W.prepareWorkflow(p).tasks[0].owner, "new-owner");
});
test("scope revisions and re-entering production invalidate old confirmations", () => {
  const p = project({ statusChangedAt: "2026-09-01T08:00:00Z" });
  p.productionFollowUp = W.prepareWorkflow(p);
  p.productionFollowUp.tasks[0].status = "completed";
  assert.equal(W.prepareWorkflow(p).tasks[0].status, "completed");
  assert.equal(W.prepareWorkflow({ ...p, statusChangedAt: "2026-09-02T08:00:00Z" }).tasks[0].status, "pending");
  assert.equal(W.prepareWorkflow({ ...p, items: [{ description: "New scope", productionAssignments: [{ department: "dtf" }] }] }).tasks[0].status, "pending");
});
test("missed deadline is detected once, remains pending, and repeats after revision", () => {
  const p = project(); const state = W.prepareWorkflow(p);
  assert.equal(W.ensureDeadlineRequest(p, state, new Date("2026-09-11T16:59:59Z")), false);
  assert.equal(W.ensureDeadlineRequest(p, state, new Date("2026-09-11T17:00:00Z")), true);
  assert.equal(W.ensureDeadlineRequest(p, state, new Date("2026-09-12T17:00:00Z")), false);
  state.history.push({ ...state.request, status: "applied" }); state.request = null;
  assert.equal(W.ensureDeadlineRequest(p, state, new Date("2026-09-12T17:00:00Z")), true);
  assert.equal(state.request.number, 2);
});
test("production targets do not trigger delivery revision prompts", () => {
  const p = project(); const state = W.prepareWorkflow(p);
  assert.equal(W.ensureDeadlineRequest(p, state, new Date("2026-09-11T10:00:00Z")), false);
});
test("after a missed commitment, revised deadlines continue recurring until delivery", () => {
  const p = project({ status: "Pending Delivery/Pickup" });
  const state = W.prepareWorkflow(p); state.history.push({ status: "applied" });
  assert.equal(W.ensureDeadlineRequest(p, state, new Date("2026-09-12T18:00:00Z")), true);
});
test("delivered, cancelled, superseded, and quote projects do not recur", () => {
  for (const extra of [{ status: "Delivered" }, { status: "Pending Quality Control" }, { cancellation: { isCancelled: true } }, { isLatestVersion: false }, { projectType: "Quote" }]) {
    const p = project(extra);
    assert.equal(W.ensureDeadlineRequest(p, W.prepareWorkflow(p), new Date("2026-09-12T18:00:00Z")), false);
  }
});
test("a project on hold still has a delivery commitment", () => {
  const p = project({ status: "On Hold", hold: { isOnHold: true, previousStatus: "Pending Production" } });
  assert.equal(W.ensureDeadlineRequest(p, W.prepareWorkflow(p), new Date("2026-09-12T18:00:00Z")), true);
});
test("requires actual contact about the exact proposal before authorizing a date", () => {
  const request = { createdAt: "2026-09-07T08:00:00Z", proposedAt: "2026-09-09T17:00:00Z" };
  const communication = { confirmed: true, contactedAt: "2026-09-07T10:00:00Z", channel: "phone", outcome: "informed", contactName: "Client contact", summary: "Discussed the revised delivery date." };
  const now = new Date("2026-09-07T11:00:00Z");
  assert.equal(W.validateCommunication(communication, request, now).deadlineAt, request.proposedAt);
  for (const invalid of [{ confirmed: false }, { outcome: "unreachable" }, { outcome: "rejected" }, { contactedAt: "2026-09-07T12:00:00Z" }, { contactedAt: "2026-09-06T12:00:00Z" }]) assert.throws(() => W.validateCommunication({ ...communication, ...invalid }, request, now));
});
test("existing editors may save unchanged deadlines, but cannot revise them", () => {
  const p = project();
  assert.equal(W.deadlineEditGuard(p, "2026-09-11", "5:00 PM"), null);
  assert.match(W.deadlineEditGuard(p, "2026-09-12", "17:00"), /client communication/);
  assert.equal(W.deadlineEditGuard({ ...p, projectType: "Quote" }, "2026-09-12", "17:00"), null);
});
test("neither a dismissed notification nor a stage shortcut completes pending work", () => {
  const p = project();
  assert.match(W.completionGuard(p, { ...p, status: "Pending Quality Control" }), /individual assignments/);
  p.productionFollowUp = W.prepareWorkflow(p);
  p.productionFollowUp.tasks.forEach((t) => t.status = "completed");
  assert.equal(W.completionGuard(p, { ...p, status: "Pending Quality Control" }), null);
});
