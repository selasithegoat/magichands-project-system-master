const { parseProjectDeliveryDeadline } = require("./projectDeadline");
const { getExplicitProductionSubDepartmentTokens, normalizeProductionDepartmentToken } = require("./productionDepartmentAccess");

const HOUR = 3600000;
const AUTHORIZED_DEADLINE_REVISION = Symbol("authorizedDeliveryRevision");
const DEFAULT_PLAN = Object.freeze({
  startHour: 8, endHour: 17, workingDays: [1, 2, 3, 4, 5], holidays: [],
  qualityHours: 2, photographyHours: 1, packagingHours: 2, transportHours: 2,
  bufferHours: 2,
});
const AFTER_PRODUCTION = new Set(["Production Completed", "Pending Quality Control", "Quality Control Completed", "Pending Photography", "Photography Completed", "Pending Packaging", "Packaging Completed", "Pending Delivery/Pickup", "Delivered", "Pending Feedback", "Feedback Completed", "Completed", "Finished"]);
const CLOSED = new Set(["Delivered", "Pending Feedback", "Feedback Completed", "Completed", "Finished", "Declined"]);
const id = (value) => {
  if (!value) return "";
  if (typeof value.toHexString === "function") return value.toHexString();
  if (value._id && value._id !== value) return id(value._id);
  return String(value.id || value);
};
const text = (value) => String(value || "").trim();
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const isLead = (user, project) => Boolean(id(user) && id(user) === id(project.projectLeadId));
const isReviewer = (user) => user?.role === "admin" || (user?.department || []).some((d) => text(d).toLowerCase() === "front desk");
const isManager = (user, project) => isLead(user, project) || isReviewer(user) || (id(user) && id(user) === id(project.assistantLeadId));
const isActive = (p) => p.projectType !== "Quote" && !p.cancellation?.isCancelled && p.isLatestVersion !== false && !["superseded", "archived"].includes(p.versionState) && !CLOSED.has(p.status);
const productionIncomplete = (p) => !AFTER_PRODUCTION.has(p.status === "On Hold" ? p.hold?.previousStatus : p.status);

function normalizePlan(input = {}) {
  const plan = { ...DEFAULT_PLAN, ...input };
  for (const key of ["startHour", "endHour", "qualityHours", "photographyHours", "packagingHours", "transportHours", "bufferHours"]) {
    if (!Number.isFinite(plan[key]) || plan[key] < 0 || plan[key] > (key.endsWith("Hour") ? 24 : 240)) fail(`Invalid ${key}.`);
  }
  if (plan.endHour <= plan.startHour) fail("The working day must end after it starts.");
  if (!Array.isArray(plan.workingDays) || !plan.workingDays.length || plan.workingDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) fail("Select at least one valid working day.");
  if (!Array.isArray(plan.holidays) || plan.holidays.length > 366 || plan.holidays.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) fail("Enter holidays as YYYY-MM-DD dates.");
  return Object.fromEntries(Object.keys(DEFAULT_PLAN).map((key) => [key, plan[key]]));
}
const dayKey = (date) => date.toISOString().slice(0, 10);
const workDay = (date, plan) => plan.workingDays.includes(date.getUTCDay()) && !plan.holidays.includes(dayKey(date));
const atHour = (date, hour) => { const d = new Date(date); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() + hour * HOUR); };
const isWorkingTime = (date, plan) => workDay(date, plan) && date >= atHour(date, plan.startHour) && date < atHour(date, plan.endHour);

// Africa/Accra has no DST. All configured working times are in that business zone.
function shiftWorkingHours(value, hours, input = DEFAULT_PLAN) {
  const plan = normalizePlan(input);
  let date = new Date(value);
  if (Number.isNaN(date.getTime()) || !Number.isFinite(hours)) fail("Invalid scheduling date or duration.");
  const forward = hours >= 0;
  let remaining = Math.abs(hours) * HOUR;
  for (let days = 0; days < 4000; days += 1) {
    const start = atHour(date, plan.startHour), end = atHour(date, plan.endHour);
    if (workDay(date, plan)) {
      date = forward ? new Date(Math.max(date, start)) : new Date(Math.min(date, end));
      const available = forward ? end - date : date - start;
      if (available >= 0 && remaining <= available) {
        if (!forward && hours !== 0 && remaining === available) {
          remaining = 0; date = new Date(atHour(date, 0).getTime() - 1); continue;
        }
        return new Date(date.getTime() + (forward ? remaining : -remaining));
      }
      if (available > 0) remaining -= available;
    }
    date = atHour(date, forward ? 24 : 0);
    if (!forward) date = new Date(date.getTime() - 1);
  }
  fail("The calendar cannot accommodate this schedule.");
}

function productionTarget(project, planInput) {
  const deadline = parseProjectDeliveryDeadline(project);
  if (!deadline) return null;
  const plan = normalizePlan(planInput);
  return shiftWorkingHours(deadline, -(plan.qualityHours + plan.photographyHours + plan.packagingHours + plan.transportHours + plan.bufferHours), plan);
}

function scopes(project) {
  const grouped = new Map();
  for (const item of project.items || []) {
    for (const assignment of item.productionAssignments || []) {
      const department = normalizeProductionDepartmentToken(assignment.department);
      if (!department) continue;
      if (!grouped.has(department)) grouped.set(department, []);
      grouped.get(department).push(`${item.description || "Item"} (${item.qty || 0}): ${assignment.scope || "Assigned production"}`);
    }
  }
  for (const department of getExplicitProductionSubDepartmentTokens(project.departments)) {
    if (!grouped.has(department)) grouped.set(department, ["Engaged production work"]);
  }
  if (!grouped.size && (project.departments || []).some((d) => text(d).toLowerCase() === "production")) grouped.set("production", ["Engaged production work"]);
  return Array.from(grouped, ([department, lines]) => ({ department, scope: lines.join("; ") }));
}

function prepareWorkflow(project, now = new Date()) {
  const state = structuredClone(project.productionFollowUp || {});
  state.revision = state.revision || 0;
  state.plan = normalizePlan(state.plan || {
    ...DEFAULT_PLAN,
    photographyHours: (project.departments || []).some((d) => /photography/i.test(d)) ? 1 : 0,
  });
  state.history = state.history || [];
  state.events = state.events || [];
  state.tasks = state.tasks || [];
  const target = productionTarget(project, state.plan);
  state.targetAt = target?.toISOString() || null;
  const cycle = project.status === "Pending Production" ? String(project.statusChangedAt || "") : state.productionCycle;
  const reentered = state.productionCycle && cycle && state.productionCycle !== cycle;
  state.productionCycle = cycle;
  const existing = new Map(state.tasks.map((t) => [t.department, t]));
  state.tasks = scopes(project).map((scope) => {
    const previous = existing.get(scope.department);
    const ack = (project.acknowledgements || []).find((a) => normalizeProductionDepartmentToken(a.department) === scope.department);
    if (previous && previous.scope === scope.scope && !reentered) return { ...previous, owner: previous.owner || id(ack?.user) || null, dueAt: target ? shiftWorkingHours(target, -(previous.downstreamHours || 0), state.plan).toISOString() : null };
    const legacyStageCompletion = !productionIncomplete(project) && !previous;
    return { ...scope, owner: id(ack?.user) || null, status: legacyStageCompletion ? "completed" : "pending", legacyStageCompletion, downstreamHours: 0, dueAt: target?.toISOString() || null, createdAt: now.toISOString() };
  });
  return state;
}

function ensureDeadlineRequest(project, state, now = new Date()) {
  const deadline = parseProjectDeliveryDeadline(project);
  if (!isActive(project) || (!productionIncomplete(project) && !state.history.length) || !deadline || deadline > now || state.request) return false;
  state.request = { number: state.history.length + 1, status: "required", deadlineAt: deadline.toISOString(), createdAt: now.toISOString(), nextLeadPromptAt: now.toISOString() };
  return true;
}

function requireText(value, label, max = 2000) {
  const result = text(value);
  if (result.length < 3 || result.length > max) fail(`${label} must contain 3–${max} characters.`);
  return result;
}
function futureDate(value, now = new Date()) {
  // An explicit offset prevents browser/server timezone differences.
  if (!/(Z|[+-]\d\d:\d\d)$/.test(text(value))) fail("Provide a date and time with a timezone.");
  const date = new Date(value);
  date.setUTCSeconds(0, 0);
  if (Number.isNaN(date.getTime()) || date <= now) fail("The proposed deadline must be in the future.");
  return date.toISOString();
}
function validateCommunication(input, request, now = new Date()) {
  if (input.confirmed !== true) fail("Confirm that the revised delivery deadline was communicated to the client.");
  const contactedAt = new Date(input.contactedAt);
  const earliestContact = new Date(request.proposalChangedAt || request.createdAt);
  earliestContact.setUTCSeconds(0, 0); // The form records contact time to the minute.
  if (!input.contactedAt || Number.isNaN(contactedAt.getTime()) || contactedAt > now || contactedAt < earliestContact) fail("The contact time must be after this proposal was made and no later than now.");
  if (!["phone", "email", "sms", "whatsapp", "in_person"].includes(input.channel)) fail("Select a contact method.");
  if (!["informed", "accepted"].includes(input.outcome)) fail("An unsuccessful contact attempt or rejected proposal cannot authorize a new deadline.");
  return { contactName: requireText(input.contactName, "Client contact", 200), channel: input.channel, contactedAt: contactedAt.toISOString(), summary: requireText(input.summary, "Communication summary"), outcome: input.outcome, deadlineAt: request.proposedAt, recordedAt: now.toISOString() };
}

function deadlineChanged(project, date, time) {
  const next = parseProjectDeliveryDeadline({ details: { deliveryDate: date, deliveryTime: time } });
  const current = parseProjectDeliveryDeadline(project);
  return (next?.getTime() || null) !== (current?.getTime() || null);
}
function deadlineEditGuard(project, date, time) {
  return project.projectType !== "Quote" && deadlineChanged(project, date, time)
    ? "Use Production follow-up → Request delivery revision. Only Front Desk or Admin can apply a new deadline after recording client communication."
    : null;
}

function completionGuard(previous, next) {
  if (previous.projectType === "Quote" || !productionIncomplete(previous) || !AFTER_PRODUCTION.has(next.status)) return null;
  const tasks = prepareWorkflow({ ...previous, ...next, status: previous.status, statusChangedAt: previous.statusChangedAt, productionFollowUp: next.productionFollowUp || previous.productionFollowUp }).tasks;
  return tasks.some((task) => task.status !== "completed") ? "Complete the individual assignments in Production follow-up before advancing beyond production." : null;
}

module.exports = { HOUR, AUTHORIZED_DEADLINE_REVISION, DEFAULT_PLAN, AFTER_PRODUCTION, CLOSED, id, fail, isLead, isReviewer, isManager, isActive, productionIncomplete, normalizePlan, isWorkingTime, shiftWorkingHours, productionTarget, scopes, prepareWorkflow, ensureDeadlineRequest, requireText, futureDate, validateCommunication, deadlineChanged, deadlineEditGuard, completionGuard };
