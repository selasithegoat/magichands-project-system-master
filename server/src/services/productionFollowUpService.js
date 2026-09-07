const Project = require("../models/Project");
const User = require("../models/User");
const { createNotification } = require("../utils/notificationService");
const { logActivity } = require("../utils/activityLogger");
const { broadcastDataChange } = require("../utils/realtimeHub");
const { captureProjectRevisionState, recordProjectRevisionSafely } = require("./projectRevisionService");
const {
  getExplicitProductionSubDepartmentTokens,
  hasProductionDepartmentOverlap,
  normalizeProductionDepartmentToken,
  resolveProductionSubDepartmentTokens,
} = require("../utils/productionDepartmentAccess");
const W = require("../utils/productionFollowUp");

const ACTIVE_QUERY = { projectType: { $ne: "Quote" }, status: { $nin: [...W.CLOSED] }, "cancellation.isCancelled": { $ne: true }, isLatestVersion: { $ne: false }, versionState: { $nin: ["superseded", "archived"] } };
const FIELDS = "+productionFollowUp orderId details.projectName details.deliveryDate details.deliveryTime projectType status statusChangedAt statusHistory hold cancellation departments items acknowledgements projectLeadId assistantLeadId createdBy isLatestVersion versionState batches sampleApproval sampleRequirement departmentalMeeting";
const trainee = (u) => u?.productionAccess === "Production Trainee";
const canOwn = (u, department) => !trainee(u) && hasProductionDepartmentOverlap(u.department, [department]);

const portalSource = (value) => value === "admin" ? "admin" : "client";
const normalizedDepartments = (user) => (Array.isArray(user?.department) ? user.department : [user?.department])
  .map(normalizeProductionDepartmentToken)
  .filter(Boolean);
const isFrontDeskUser = (user) => normalizedDepartments(user).some((department) => department === "front desk" || department === "front-desk");

function isProductionUser(user) {
  const departments = normalizedDepartments(user);
  return departments.includes("production") || getExplicitProductionSubDepartmentTokens(departments).length > 0;
}

function isEngagedInTask(user, task) {
  if (trainee(user)) return false;
  if (W.id(task.owner) === W.id(user)) return true;
  const departments = normalizedDepartments(user);
  const explicit = getExplicitProductionSubDepartmentTokens(departments);
  const taskDepartment = normalizeProductionDepartmentToken(task.department);
  if (explicit.length) return explicit.includes(taskDepartment);
  return departments.includes("production");
}

function categoriesForProject(user, project, state, source, now = new Date()) {
  const categories = [];
  const adminView = portalSource(source) === "admin" && W.isReviewer(user);
  if (adminView) {
    const leadAction = state.request?.status === "required"
      || Boolean(state.stageBlockMessage)
      || state.tasks.some((task) => task.status === "blocked" || !task.owner
        || (task.status !== "completed" && task.dueAt && W.shiftWorkingHours(task.dueAt, 1, state.plan) <= now));
    if (leadAction) categories.push("lead");
    if (state.request && state.request.status !== "required") categories.push("frontDesk");
    if (project.status === "Pending Production" && state.tasks.some((task) => task.status !== "completed")) categories.push("production");
    return categories;
  }

  // Admin responsibilities belong in the Admin portal. A source value alone
  // never grants Admin access to another account.
  if (user?.role === "admin") return categories;
  if (W.id(project.projectLeadId) === W.id(user)) categories.push("lead");
  if (isFrontDeskUser(user) && state.request && state.request.status !== "required") categories.push("frontDesk");
  if (isProductionUser(user) && !trainee(user) && state.tasks.some((task) => isEngagedInTask(user, task))) categories.push("production");
  return categories;
}

function presentationAccess(categories, user, project, source) {
  if (portalSource(source) === "admin" && W.isReviewer(user)) return "reviewer";
  if (categories.includes("lead")) return "lead";
  if (categories.includes("frontDesk")) return "reviewer";
  if (categories.includes("production")) return "production";
  return W.isManager(user, project) ? "standard" : "none";
}

function snapshotFilter(project) {
  const revision = project.productionFollowUp?.revision;
  return {
    _id: project._id, status: project.status,
    "cancellation.isCancelled": { $ne: true }, isLatestVersion: { $ne: false }, versionState: { $nin: ["superseded", "archived"] },
    "hold.isOnHold": project.hold?.isOnHold ?? null,
    sampleApproval: project.sampleApproval ?? null, sampleRequirement: project.sampleRequirement ?? null,
    "details.deliveryDate": project.details?.deliveryDate ?? null,
    "details.deliveryTime": project.details?.deliveryTime ?? null,
    // Prevent completing work after its scope was concurrently revised.
    items: project.items || [], departments: project.departments || [],
    batches: project.batches || [],
    "productionFollowUp.revision": revision === undefined ? { $exists: false } : revision,
  };
}

async function commit(project, state, extra = {}) {
  state.revision = (project.productionFollowUp?.revision || 0) + 1;
  const query = Project.findOneAndUpdate(snapshotFilter(project), { $set: { productionFollowUp: state, ...extra } }, { new: true, runValidators: true });
  if (Object.hasOwn(extra, "details.deliveryDate")) query[W.AUTHORIZED_DEADLINE_REVISION] = true;
  const saved = await query.select("+productionFollowUp").lean();
  if (!saved) W.fail("This project changed while you were working. Refresh and try again.", 409);
  broadcastDataChange({ path: `/api/projects/${project._id}`, projectId: W.id(project), method: "PATCH", source: "production_follow_up" });
  return saved;
}

function present(project, user, users, now = new Date(), access = "standard") {
  const state = W.prepareWorkflow(project, now);
  W.ensureDeadlineRequest(project, state, now);
  const manager = W.isManager(user, project);
  const reviewer = W.isReviewer(user) && !W.isLead(user, project);
  const name = (value) => { const u = users.find((entry) => W.id(entry) === W.id(value)); return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "Unassigned"; };
  const canSeeEveryTask = access === "reviewer" || access === "lead" || access === "assistant" || (access === "standard" && manager);
  const tasks = state.tasks.filter((t) => canSeeEveryTask || (access === "production" ? isEngagedInTask(user, t) : W.id(t.owner) === W.id(user) || canOwn(user, t.department))).map((t) => ({
    ...t, ownerName: name(t.owner), canAct: project.status === "Pending Production" && !project.hold?.isOnHold && W.id(t.owner) === W.id(user) && canOwn(user, t.department) && !W.isLead(user, project),
    overdue: t.status !== "completed" && t.dueAt && new Date(t.dueAt) <= now,
    escalated: t.status !== "completed" && (t.status === "blocked" || !t.owner || (t.dueAt && W.shiftWorkingHours(t.dueAt, 1, state.plan) <= now)),
    candidates: manager ? users.filter((u) => canOwn(u, t.department) && W.id(u) !== W.id(project.projectLeadId)).map((u) => ({ id: W.id(u), name: name(u) })) : [],
  }));
  const request = manager && state.request ? { ...state.request, reviewerName: name(state.request.reviewer) } : null;
  const promptDue = Boolean(W.isLead(user, project) && request?.status === "required" && (!request.nextLeadPromptAt || new Date(request.nextLeadPromptAt) <= now));
  return {
    id: W.id(project), orderId: project.orderId, name: project.details?.projectName || "Unnamed project", status: project.status,
    deliveryAt: require("../utils/projectDeadline").parseProjectDeliveryDeadline(project),
    targetAt: state.targetAt, plan: state.plan, revision: project.productionFollowUp?.revision || 0,
    manager, reviewer, ownsReview: reviewer && W.id(state.request?.reviewer) === W.id(user), lead: W.isLead(user, project), leadName: name(project.projectLeadId), onHold: Boolean(project.hold?.isOnHold),
    productionIncomplete: W.productionIncomplete(project), tasks, request, promptDue,
    history: manager ? state.history : [], events: manager ? state.events.slice(-30).reverse() : [],
    stageBlockMessage: state.stageBlockMessage || "", ownerMissing: state.tasks.some((t) => t.status !== "completed" && !t.owner),
  };
}

async function listForUser(user, { source = "client" } = {}) {
  const users = await User.find({}).select("firstName lastName department role productionAccess").lean();
  const adminView = portalSource(source) === "admin" && W.isReviewer(user);
  let query = {};
  if (!adminView && user?.role === "admin") query = { _id: null };
  else if (!adminView) {
    const options = [{ projectLeadId: W.id(user) }];
    if (isFrontDeskUser(user)) options.push({ "productionFollowUp.request.status": { $in: ["submitted", "reviewing", "communicated"] } });
    if (isProductionUser(user) && !trainee(user)) {
      const explicit = getExplicitProductionSubDepartmentTokens(user.department);
      const assigned = Array.isArray(user.department) ? user.department : [user.department].filter(Boolean);
      const departments = explicit.length ? [...new Set([...assigned, ...explicit])] : resolveProductionSubDepartmentTokens(user.department);
      options.push(
        { departments: { $in: departments } },
        { "items.productionAssignments.department": { $in: departments } },
        { "productionFollowUp.tasks.owner": W.id(user) },
      );
    }
    query = { $or: options };
  }
  const projects = await Project.find({ ...ACTIVE_QUERY, ...query }).select(FIELDS).sort({ "details.deliveryDate": 1 }).lean();
  const now = new Date();
  return projects.flatMap((project) => {
    const state = W.prepareWorkflow(project, now);
    W.ensureDeadlineRequest(project, state, now);
    const categories = categoriesForProject(user, project, state, source, now);
    if (!categories.length) return [];
    return [{ ...present(project, user, users, now, presentationAccess(categories, user, project, source)), categories }];
  });
}

async function notify(project, recipients, title, message, actor) {
  for (const recipient of new Set(recipients.map(W.id).filter(Boolean))) {
    await createNotification(recipient, W.id(actor) || W.id(project.projectLeadId) || recipient, project._id, "UPDATE", title, `${project.orderId || "Project"}: ${message}`, { allowSelf: true, source: "production_follow_up" });
  }
}

async function act(projectId, user, action, input = {}, { source = "client" } = {}) {
  const project = await Project.findById(projectId).select("+productionFollowUp").lean();
  if (!project || !W.isActive(project)) W.fail("This active order could not be found.", 404);
  const now = new Date();
  const state = W.prepareWorkflow(project, now);
  W.ensureDeadlineRequest(project, state, now);
  const categories = categoriesForProject(user, project, state, source, now);
  if (!categories.length) W.fail("You do not have access to this production workflow.", 403);
  if (!Number.isInteger(input.revision) || input.revision !== (project.productionFollowUp?.revision || 0)) W.fail("This workflow has changed. Refresh and try again.", 409);
  const manager = W.isManager(user, project), lead = W.isLead(user, project), reviewer = W.isReviewer(user) && !lead;
  const reviewerUsers = await User.find({ $or: [{ role: "admin" }, { department: "Front Desk" }] }).select("_id role").lean();
  const leads = [project.projectLeadId, project.assistantLeadId];
  let recipients = leads, message = "Production follow-up updated.", extra = {}, changedDeadline = false;
  const request = state.request;
  if (["assign", "complete", "working", "blocked", "extend", "verify", "advance"].includes(action) && (project.status !== "Pending Production" || project.hold?.isOnHold)) W.fail("Production actions are available while the project is in Pending Production and not on hold.");
  if (action === "plan") {
    if (!manager) W.fail("Only the project leads, Front Desk or Admin can change the production plan.", 403);
    W.requireText(input.reason, "Adjustment reason");
    state.plan = W.normalizePlan(input.plan);
    state.targetAt = W.productionTarget(project, state.plan)?.toISOString() || null;
    for (const task of state.tasks) task.dueAt = state.targetAt ? W.shiftWorkingHours(state.targetAt, -(task.downstreamHours || 0), state.plan).toISOString() : null;
    recipients = [...leads, ...state.tasks.map((t) => t.owner)];
    message = `Production schedule adjusted: ${input.reason}`;
  } else if (["assign", "complete", "working", "blocked", "extend", "verify"].includes(action)) {
    const task = state.tasks.find((t) => t.department === input.department);
    if (!task) W.fail("Production assignment not found.", 404);
    if (["assign", "extend", "verify"].includes(action)) {
      if (!manager) W.fail("Only the project leads, Front Desk or Admin can manage this assignment.", 403);
    } else if (W.id(task.owner) !== W.id(user) || !canOwn(user, task.department) || lead) W.fail("Only the assigned production owner can update this work.", 403);
    if (task.status === "completed") W.fail("This assignment is already complete.", 409);
    const reason = W.requireText(input.reason, action === "verify" ? "How you verified the completed work" : "Update reason");
    if (action === "assign") {
      const owner = await User.findById(input.owner).lean();
      if (!owner || !canOwn(owner, task.department) || W.isLead(owner, project)) W.fail("Choose an eligible production owner from this department.");
      if (!Number.isFinite(input.downstreamHours) || input.downstreamHours < 0 || input.downstreamHours > 1000) W.fail("Invalid allowance for subsequent production work.");
      task.owner = W.id(owner); task.downstreamHours = input.downstreamHours;
      task.dueAt = state.targetAt ? W.shiftWorkingHours(state.targetAt, -task.downstreamHours, state.plan).toISOString() : null;
    } else if (["complete", "verify"].includes(action)) {
      if (input.confirmed !== true) W.fail("Confirm that the assigned production work is complete.");
      task.status = "completed"; task.completedAt = now.toISOString(); task.completedBy = W.id(user); task.verifiedByLead = action === "verify";
    } else {
      task.status = action === "blocked" ? "blocked" : "working";
      if (action !== "blocked") task.estimateAt = W.futureDate(input.estimateAt, now);
      if (action === "extend") { task.extensionApprovedBy = W.id(user); task.extensionApprovedAt = now.toISOString(); }
      task.nextReminderAt = W.shiftWorkingHours(now, action === "blocked" ? 1 : 0.5, state.plan).toISOString();
    }
    task.note = reason; task.updatedAt = now.toISOString(); task.updatedBy = W.id(user);
    recipients = [...leads, task.owner];
    message = `${task.department}: ${action === "verify" ? "completed and verified on behalf of the owner" : action}. ${reason}`;
  } else if (action === "advance") {
    if (!manager) W.fail("Only project management can retry production advancement.", 403);
  } else if (action === "snooze") {
    if (!lead || request?.status !== "required") W.fail("Only the assigned Lead can snooze a required request.", 403);
    request.nextLeadPromptAt = W.shiftWorkingHours(now, 0.5, state.plan).toISOString();
    recipients = []; message = "Lead deferred the delivery revision prompt for 30 working minutes.";
  } else if (action === "request") {
    if (!manager) W.fail("Only project management can request a revised delivery deadline.", 403);
    if (request && request.status !== "required") W.fail("A deadline revision request is already open.", 409);
    state.request = { ...(request || { number: state.history.length + 1, createdAt: now.toISOString(), deadlineAt: require("../utils/projectDeadline").parseProjectDeliveryDeadline(project)?.toISOString() || null }), status: "submitted", reason: W.requireText(input.reason, "Delay reason"), remainingHours: Number(input.remainingHours), proposedAt: W.futureDate(input.proposedAt, now), proposalChangedAt: now.toISOString(), requestedBy: W.id(user), submittedAt: now.toISOString() };
    if (!Number.isFinite(state.request.remainingHours) || state.request.remainingHours < 0 || state.request.remainingHours > 10000) W.fail("Enter a valid estimate of remaining production hours.");
    recipients = reviewerUsers; message = "Delivery revision requested. Review the remaining work and contact the client before setting a new deadline.";
  } else if (["claim", "proposal", "contact", "apply", "return"].includes(action)) {
    if (!reviewer) W.fail("Only Front Desk or Admin, other than the requesting project Lead, can review and apply deadlines.", 403);
    if (!request || !["submitted", "reviewing", "communicated"].includes(request.status)) W.fail("No submitted delivery revision request is available.", 409);
    if (action === "claim") {
      if (request.reviewer && W.id(request.reviewer) !== W.id(user) && user.role !== "admin") W.fail("Another reviewer is handling this request. An Admin can reassign it.", 409);
      request.reviewer = W.id(user); request.status = request.communication ? "communicated" : "reviewing";
      message = "Delivery revision assigned to a reviewer.";
    } else {
      if (W.id(request.reviewer) !== W.id(user)) W.fail("Take responsibility for this request before changing it.", 403);
      if (action === "proposal") {
        request.proposedAt = W.futureDate(input.proposedAt, now); request.proposalChangedAt = now.toISOString(); request.communication = null; request.status = "reviewing";
        message = "Delivery proposal changed; the revised date must be communicated to the client.";
      } else if (action === "contact") {
        W.futureDate(request.proposedAt, now);
        request.communication = { ...W.validateCommunication(input, request, now), recordedBy: W.id(user) };
        request.status = "communicated"; message = "Client communication recorded for the proposed delivery deadline.";
      } else if (action === "return") {
        request.reviewNote = W.requireText(input.reason, "Reason for returning the request");
        request.status = "required"; request.communication = null; request.reviewer = null; request.nextLeadPromptAt = now.toISOString();
        message = `Delivery request returned to the Lead: ${request.reviewNote}`;
      } else {
        if (request.status !== "communicated" || !request.communication || request.communication.deadlineAt !== request.proposedAt) W.fail("Record successful client communication for this exact proposed date before applying it.");
        const proposed = W.futureDate(request.proposedAt, now);
        const date = new Date(proposed);
        extra["details.deliveryDate"] = new Date(`${proposed.slice(0, 10)}T00:00:00.000Z`);
        extra["details.deliveryTime"] = date.toISOString().slice(11, 16);
        request.status = "applied"; request.appliedAt = now.toISOString(); request.appliedBy = W.id(user);
        state.history.push(structuredClone(request)); state.request = null;
        state.nextReviewReminderAt = null; state.nextLeadReminderAt = null;
        const projected = { ...project, details: { ...project.details, deliveryDate: extra["details.deliveryDate"], deliveryTime: extra["details.deliveryTime"] } };
        state.targetAt = W.productionTarget(projected, state.plan)?.toISOString() || null;
        for (const task of state.tasks) { task.dueAt = state.targetAt ? W.shiftWorkingHours(state.targetAt, -(task.downstreamHours || 0), state.plan).toISOString() : null; task.nextReminderAt = null; task.managementEscalatedAt = null; }
        changedDeadline = true; recipients = [...leads, ...state.tasks.map((t) => t.owner)];
        message = `New delivery deadline applied after client communication: ${proposed}.`;
      }
    }
  } else W.fail("Unknown production follow-up action.");

  if (["complete", "verify", "advance"].includes(action) && state.tasks.length && state.tasks.every((t) => t.status === "completed")) {
    const transition = await require("../controllers/projectController").getProductionFollowUpTransition(project);
    state.stageBlockMessage = transition.message || "";
    if (transition.status) { extra.status = transition.status; recipients = [...recipients, ...reviewerUsers.filter((u) => u.role === "admin")]; message += ` Production advanced to ${transition.status}.`; }
  }
  const audit = { action, at: now.toISOString(), actor: W.id(user), message, department: input.department || null };
  state.events.push(audit);
  // The full audit lives in ActivityLog; keep the embedded UI preview bounded.
  state.events = state.events.slice(-100);
  const before = changedDeadline ? captureProjectRevisionState(project) : null;
  const saved = await commit(project, state, extra);
  await logActivity(project._id, W.id(user), "update", message, { productionFollowUp: audit, ...(changedDeadline ? { deliveryRevision: state.history.at(-1) } : {}) });
  if (changedDeadline) await recordProjectRevisionSafely({ projectId: project._id, before, after: saved, actor: user, reason: state.history.at(-1).reason, source: "delivery_revision_after_client_contact" });
  await notify(saved, recipients, changedDeadline ? "Delivery deadline revised" : "Production follow-up", message, user);
  return { message, stageBlockMessage: state.stageBlockMessage || "" };
}

let timer;
let running = false;
async function sweep(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const reviewers = await User.find({ $or: [{ role: "admin" }, { department: "Front Desk" }] }).select("_id role").lean();
    for await (const project of Project.find(ACTIVE_QUERY).select(FIELDS).lean().cursor()) {
      try {
        const state = W.prepareWorkflow(project, now);
        W.ensureDeadlineRequest(project, state, now);
        const alerts = [];
        const leads = [project.projectLeadId, project.assistantLeadId];
        const workTime = W.isWorkingTime(now, state.plan);
        if (state.request?.status === "required" && workTime && (!state.nextLeadReminderAt || new Date(state.nextLeadReminderAt) <= now)) {
          alerts.push([project.projectLeadId ? leads : reviewers, "Delivery deadline missed", "The delivery commitment is overdue. The project Lead must request a new delivery deadline from Front Desk and Admin."]);
          state.nextLeadReminderAt = W.shiftWorkingHours(now, 0.5, state.plan).toISOString();
        }
        if (state.request && state.request.status !== "required" && workTime && (!state.nextReviewReminderAt || new Date(state.nextReviewReminderAt) <= now)) {
          alerts.push([state.request.reviewer ? [state.request.reviewer] : reviewers, "Delivery revision awaiting action", "Review the pending delivery revision and record client communication before applying the new deadline."]);
          state.nextReviewReminderAt = W.shiftWorkingHours(now, 1, state.plan).toISOString();
        }
        if (project.status === "Pending Production" && !project.hold?.isOnHold && workTime) {
          if (state.stageBlockMessage && state.tasks.length && state.tasks.every((t) => t.status === "completed") && (!state.nextStageReminderAt || new Date(state.nextStageReminderAt) <= now)) {
            alerts.push([leads, "Production advancement needs Lead action", state.stageBlockMessage]);
            state.nextStageReminderAt = W.shiftWorkingHours(now, 1, state.plan).toISOString();
          }
          for (const task of state.tasks) {
            if (task.status === "completed") continue;
            const due = task.dueAt ? new Date(task.dueAt) : null;
            const dueSoon = due && W.shiftWorkingHours(due, -0.5, state.plan) <= now;
            const endOfShift = now.getUTCHours() + now.getUTCMinutes() / 60 >= state.plan.endHour - 0.5;
            if ((dueSoon || endOfShift || task.status === "blocked" || !task.owner) && (!task.nextReminderAt || new Date(task.nextReminderAt) <= now)) {
              if (task.owner) alerts.push([[task.owner], endOfShift ? "End-of-shift production check" : "Production completion required", `${task.department}: complete your work, provide a finish estimate, or report a blocker in Production follow-up.`]);
              const escalationAt = due ? W.shiftWorkingHours(due, 1, state.plan) : null;
              if (!task.owner || task.status === "blocked" || (escalationAt && escalationAt <= now)) {
                alerts.push([leads, "Production needs Lead intervention", `${task.department}: ${!task.owner ? "assign an accountable owner" : task.status === "blocked" ? "resolve the reported blocker" : "verify completion, approve an estimate or reassign the work"}.`]);
                if (due && W.shiftWorkingHours(due, 2, state.plan) <= now && !task.managementEscalatedAt) {
                  alerts.push([reviewers.filter((u) => u.role === "admin"), "Unresolved production escalation", `${task.department} remains unresolved after Lead escalation.`]);
                  task.managementEscalatedAt = now.toISOString();
                }
              }
              task.nextReminderAt = W.shiftWorkingHours(now, 0.5, state.plan).toISOString();
            }
          }
        }
        if (JSON.stringify(state) !== JSON.stringify(project.productionFollowUp || {})) {
          await commit(project, state);
          // Only the process which wins the atomic update sends the notifications.
          const grouped = new Map();
          for (const [recipients, title, message] of alerts) {
            for (const recipient of new Set(recipients.map(W.id).filter(Boolean))) {
              const key = `${recipient}:${title}`;
              if (!grouped.has(key)) grouped.set(key, { recipient, title, messages: [] });
              grouped.get(key).messages.push(message);
            }
          }
          for (const alert of grouped.values()) await notify(project, [alert.recipient], alert.title, [...new Set(alert.messages)].join("\n"));
        }
      } catch (error) { if (error.status !== 409) console.error("Production follow-up project sweep failed:", project._id, error.message); }
    }
  } finally { running = false; }
}
function startProductionFollowUpScheduler() {
  if (timer) return;
  const run = () => sweep().catch((error) => console.error("Production follow-up scheduler:", error.message));
  void run(); timer = setInterval(run, 60000); timer.unref();
}
module.exports = { listForUser, act, sweep, startProductionFollowUpScheduler, present, snapshotFilter, commit };
