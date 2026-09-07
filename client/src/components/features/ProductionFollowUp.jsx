import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import useAdaptivePolling from "../../hooks/useAdaptivePolling";
import { readProductionFollowUpResponse } from "../../utils/productionFollowUpResponse";
import "./ProductionFollowUp.css";

const formatDate = (value) => value ? new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" }) : "Not set";
const inputDate = (value) => value ? new Date(value).toISOString().slice(0, 16) : "";
const isoDate = (value) => value ? new Date(`${value}:00Z`).toISOString() : "";
const titleCase = (value) => String(value || "").replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
const numberFields = ["remainingHours", "downstreamHours"];
const CATEGORY_ORDER = ["lead", "frontDesk", "production"];
const CATEGORY_META = {
  lead: { label: "Lead", short: "L", description: "Ownership and escalations" },
  frontDesk: { label: "Front Desk", short: "F", description: "Client delivery revisions" },
  production: { label: "Production", short: "P", description: "Department confirmations" },
};
const openTasks = (project) => project.tasks.filter((task) => task.status !== "completed");
const needsAttention = (project) => Boolean(project.request || openTasks(project).some((task) => task.overdue || task.escalated || !task.owner));
const projectCategories = (project) => Array.isArray(project.categories) && project.categories.length
  ? project.categories
  : [project.lead ? "lead" : project.reviewer ? "frontDesk" : "production"];
const promptKey = (project) => `${project?.id || ""}:${project?.request?.number || ""}:${project?.request?.deadlineAt || ""}`;

function ActionForm({ action, project, onAction, busy, children, title, department, onSuccess }) {
  return (
    <form className="pf-form" onSubmit={async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      for (const key of numberFields) if (key in values) values[key] = Number(values[key]);
      for (const key of ["proposedAt", "contactedAt", "estimateAt"]) if (values[key]) values[key] = isoDate(values[key]);
      if ("confirmed" in values) values.confirmed = values.confirmed === "on";
      if (await onAction(project, action, { ...values, department })) onSuccess?.();
    }}>
      <fieldset disabled={busy}>{children}<button className="pf-primary" type="submit">{busy ? "Saving..." : title}</button></fieldset>
    </form>
  );
}

function StatusPill({ status, escalated }) {
  return <span className={`pf-pill ${status}`}><span className="pf-pill-dot" aria-hidden="true" />{titleCase(status)}{escalated ? " · Lead action needed" : ""}</span>;
}

function TaskCard({ task, project, onAction, busy }) {
  const [mode, setMode] = useState("");
  const canManage = project.manager && project.status === "Pending Production" && !project.onHold;
  const scopes = String(task.scope || "No item scope recorded").split(";").map((scope) => scope.trim()).filter(Boolean);
  return (
    <article className={`pf-task ${task.overdue ? "pf-overdue" : ""}`}>
      <header className="pf-task-header">
        <div><span className="pf-eyebrow">Production assignment</span><h4>{titleCase(task.department)}</h4></div>
        <StatusPill status={task.status} escalated={task.escalated} />
      </header>
      <div className="pf-task-scope"><span className="pf-field-label">Assigned work</span><ul>{scopes.map((scope) => <li key={scope}>{scope}</li>)}</ul></div>
      <dl className="pf-task-meta">
        <div><dt>Accountable owner</dt><dd>{task.ownerName}</dd></div>
        <div><dt>Finish target</dt><dd>{formatDate(task.dueAt)}</dd></div>
        <div><dt>Latest estimate</dt><dd>{formatDate(task.estimateAt)}</dd></div>
      </dl>
      {task.status !== "completed" && task.estimateAt && task.dueAt && new Date(task.estimateAt) > new Date(task.dueAt) && <div className="pf-message danger"><strong>Delivery risk identified</strong><span>This estimate is later than the production target. The Lead should review it.</span></div>}
      {task.note && <div className="pf-message neutral"><strong>Latest update</strong><span>{task.note}</span></div>}
      {task.completedAt && <div className="pf-message success"><strong>Work confirmed complete</strong><span>{formatDate(task.completedAt)}{task.verifiedByLead ? " · Verified by the Lead" : ""}</span></div>}
      {task.legacyStageCompletion && <p className="pf-muted">This work was completed before follow-up tracking began.</p>}
      {task.status !== "completed" && <div className="pf-task-actions">
        {task.canAct && <><button className="pf-primary" type="button" onClick={() => setMode("complete")}>Complete my work</button><button type="button" onClick={() => setMode("working")}>Update finish estimate</button><button className="pf-danger-button" type="button" onClick={() => setMode("blocked")}>Report a blocker</button></>}
        {canManage && <><button type="button" onClick={() => setMode("assign")}>{task.owner ? "Reassign owner or timing" : "Assign an owner"}</button><button type="button" onClick={() => setMode("extend")}>Review extension</button><button type="button" onClick={() => setMode("verify")}>Verify completion</button></>}
      </div>}
      {mode && task.status !== "completed" && <div className="pf-action-panel">
        <div className="pf-action-panel-heading"><div><span className="pf-eyebrow">Update assignment</span><h5>{titleCase(mode)}</h5></div><button type="button" onClick={() => setMode("")} aria-label="Cancel update">Cancel</button></div>
        <ActionForm action={mode} project={project} department={task.department} onAction={onAction} busy={busy} title={{ assign: "Save assignment", complete: "Confirm completion", working: "Save finish estimate", blocked: "Send blocker to Lead", extend: "Approve estimate", verify: "Record verified completion" }[mode]} onSuccess={() => setMode("")}>
          {mode === "assign" && <><label>Accountable production owner<select name="owner" required defaultValue={task.owner || ""}><option value="">Select an owner</option>{task.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><label>Hours needed by subsequent production departments<input name="downstreamHours" type="number" min="0" max="1000" step="0.5" defaultValue={task.downstreamHours || 0} required /></label><small>Use 0 when this department can finish at the overall production target. Add hours to reserve time for sequential handoffs.</small></>}
          {["working", "extend"].includes(mode) && <label>Estimated finish (Accra time)<input type="datetime-local" name="estimateAt" defaultValue={inputDate(task.estimateAt)} required /></label>}
          <label>{mode === "verify" ? "How was the completed work verified?" : mode === "blocked" ? "What is blocking this work?" : "Completion note or reason"}<textarea name="reason" minLength="3" maxLength="2000" required /></label>
          {["complete", "verify"].includes(mode) && <label className="pf-check"><input type="checkbox" name="confirmed" required />I confirm the assigned production work is complete.</label>}
        </ActionForm>
      </div>}
    </article>
  );
}

function PlanForm({ project, onAction, busy }) {
  const titles = { qualityHours: "Quality control", photographyHours: "Photography", packagingHours: "Packaging", transportHours: "Dispatch / transport", bufferHours: "Contingency" };
  return <details className="pf-section pf-disclosure"><summary><span><span className="pf-eyebrow">Planning settings</span>Production schedule allowances</span><span className="pf-summary-action">View settings</span></summary><div className="pf-disclosure-content">
    <p className="pf-muted">Working times use Africa/Accra. These allowances reserve time after production; the delivery deadline stays unchanged.</p>
    <form className="pf-form" onSubmit={async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const plan = { ...project.plan };
      for (const key of [...Object.keys(titles), "startHour", "endHour"]) plan[key] = Number(data.get(key));
      plan.workingDays = data.getAll("workingDays").map(Number);
      plan.holidays = String(data.get("holidays") || "").split(/[\s,]+/).filter(Boolean);
      await onAction(project, "plan", { plan, reason: data.get("reason") });
    }}><fieldset disabled={busy || !project.manager}>
      <div className="pf-grid">{Object.entries(titles).map(([key, title]) => <label key={key}>{title} (working hours)<input name={key} type="number" min="0" max="240" step="0.5" defaultValue={project.plan[key]} required /></label>)}<label>Work starts (hour)<input name="startHour" type="number" min="0" max="23.5" step="0.5" defaultValue={project.plan.startHour} required /></label><label>Work ends (hour)<input name="endHour" type="number" min="0.5" max="24" step="0.5" defaultValue={project.plan.endHour} required /></label></div>
      <div className="pf-days">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => <label className="pf-check" key={day}><input type="checkbox" name="workingDays" value={index} defaultChecked={project.plan.workingDays.includes(index)} />{day}</label>)}</div>
      <label>Holidays (YYYY-MM-DD, separated by commas)<textarea name="holidays" defaultValue={project.plan.holidays.join(", ")} /></label>
      {project.manager && <><label>Reason for schedule adjustment<textarea name="reason" minLength="3" maxLength="2000" required /></label><button className="pf-primary">Save production plan</button></>}
    </fieldset></form>
  </div></details>;
}

function RevisionPanel({ project, onAction, busy }) {
  const request = project.request;
  const [requestOpen, setRequestOpen] = useState(false);
  if (!project.manager) return null;
  const needsRequest = request?.status === "required" || (!request && requestOpen);
  const canReview = project.reviewer && request && request.status !== "required";
  return <section className={`pf-section pf-revision ${request ? "active" : ""}`}>
    <div className="pf-section-heading"><div><span className="pf-eyebrow">Delivery governance</span><h3>{request?.status === "required" ? "Delivery deadline missed" : "Delivery deadline revision"}</h3></div>{request && <StatusPill status={request.status} />}</div>
    {request && <div className="pf-request-reference"><strong>Request #{request.number}</strong>{request.number > 1 && <span>Repeated delivery revision</span>}</div>}
    {request?.status === "required" && <div className="pf-message danger"><strong>A new delivery commitment is required</strong><span>The deadline has passed{project.productionIncomplete ? " and production remains incomplete" : " and delivery is still outstanding"}. Send a request to Front Desk and Admin. The client must be contacted before a new deadline can be applied.</span></div>}
    {!request && !requestOpen && <div className="pf-revision-intro"><p>Use a controlled revision when the current client delivery commitment cannot be met.</p><button type="button" onClick={() => setRequestOpen(true)}>Request a delivery revision</button></div>}
    {needsRequest && <div className="pf-action-panel"><ActionForm action="request" project={project} onAction={onAction} busy={busy} title="Send request to Front Desk and Admin" onSuccess={() => setRequestOpen(false)}>
      {request?.reviewNote && <div className="pf-message neutral"><strong>Reviewer feedback</strong><span>{request.reviewNote}</span></div>}
      <label>Reason for delay<textarea name="reason" minLength="3" maxLength="2000" defaultValue={request?.reason || ""} required /></label>
      <label>Estimated remaining production hours<input name="remainingHours" type="number" min="0" max="10000" step="0.5" defaultValue={request?.remainingHours ?? ""} required /></label>
      <small>Front Desk or Admin will review the remaining work, agree a proposed delivery date with the client, and record that communication.</small>
    </ActionForm></div>}
    {request && request.status !== "required" && <div className="pf-request-summary"><div><span>Reason for delay</span><strong>{request.reason}</strong></div><div><span>Remaining production</span><strong>{request.remainingHours} hours</strong></div><div><span>Proposed delivery</span><strong>{request.proposedAt ? formatDate(request.proposedAt) : "To be set by Front Desk / Admin"}</strong></div><div><span>Reviewer</span><strong>{request.reviewer ? request.reviewerName : "Awaiting Front Desk / Admin"}</strong></div></div>}
    {canReview && <div className="pf-review-workflow">
      {!project.ownsReview && <button className="pf-primary" disabled={busy} type="button" onClick={() => onAction(project, "claim", {})}>Take responsibility for review</button>}
      {project.ownsReview && <>
        <details className="pf-inner-disclosure" open={!request.proposedAt}><summary>{request.proposedAt ? "Revise the proposed date" : "Set the proposed delivery date"}</summary><ActionForm action="proposal" project={project} onAction={onAction} busy={busy} title={request.proposedAt ? "Update proposal" : "Set proposed delivery date"}><label>Proposed delivery (Accra)<input name="proposedAt" type="datetime-local" defaultValue={inputDate(request.proposedAt)} required /></label><small>{request.proposedAt ? "Changing this date clears the existing client communication confirmation." : "Front Desk or Admin owns this proposal and must communicate it to the client before applying it."}</small></ActionForm></details>
        <details className="pf-inner-disclosure" open={request.status === "reviewing" && Boolean(request.proposedAt)}><summary>Record client communication</summary>{request.proposedAt ? <ActionForm action="contact" project={project} onAction={onAction} busy={busy} title="Record client communication">
          <p>Confirm communication about <strong>{formatDate(request.proposedAt)}</strong>.</p><label>Client contact name<input name="contactName" minLength="3" maxLength="200" required /></label>
          <div className="pf-grid"><label>Contact method<select name="channel" required><option value="phone">Phone</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="in_person">In person</option></select></label><label>Contact time (Accra)<input name="contactedAt" type="datetime-local" defaultValue={inputDate(new Date())} required /></label></div>
          <label>Outcome<select name="outcome" required><option value="">Select the outcome</option><option value="informed">Client informed of this deadline</option><option value="accepted">Client accepted this deadline</option></select></label>
          <label>Conversation summary and client response<textarea name="summary" minLength="3" maxLength="2000" required /></label><label className="pf-check"><input type="checkbox" name="confirmed" required />I confirm the client was reached and this exact proposed delivery deadline was communicated.</label>
        </ActionForm> : <p className="pf-inner-guidance">Set the proposed delivery date before recording client communication.</p>}</details>
        {request.communication && <div className="pf-message success"><strong>Client communication recorded</strong><span>{request.communication.contactName} · {formatDate(request.communication.contactedAt)} · {titleCase(request.communication.channel)}</span><span>{request.communication.summary}</span><span>Communicated deadline: {formatDate(request.communication.deadlineAt)}</span></div>}
        <div className="pf-task-actions"><button className="pf-primary" type="button" disabled={busy || request.status !== "communicated"} onClick={() => onAction(project, "apply", {})}>Apply communicated delivery deadline</button></div>
        <details className="pf-inner-disclosure"><summary>Return request to Lead</summary><ActionForm action="return" project={project} onAction={onAction} busy={busy} title="Return for correction"><label>Reason<textarea name="reason" minLength="3" maxLength="2000" required /></label></ActionForm></details>
      </>}
    </div>}
    {!!project.history.length && <details className="pf-inner-disclosure"><summary>Delivery revision history ({project.history.length})</summary>{[...project.history].reverse().map((entry) => <article className="pf-history-entry" key={entry.number}><strong>Revision #{entry.number}</strong><p>{formatDate(entry.deadlineAt)} → {formatDate(entry.proposedAt)}</p><p>{entry.reason}</p><small>Client: {entry.communication?.contactName} · Contacted {formatDate(entry.communication?.contactedAt)} · Applied {formatDate(entry.appliedAt)}</small></article>)}</details>}
  </section>;
}

function ProjectQueue({ projects, selected, onSelect, search, setSearch, filter, setFilter, category, categories, counts, onCategoryChange }) {
  const categoryMeta = CATEGORY_META[category];
  return <aside className="pf-queue">
    <div className="pf-workstream-heading"><span className="pf-eyebrow">Responsibility</span><strong>Follow-up workstreams</strong></div>
    <div className="pf-category-tabs" role="tablist" aria-label="Production follow-up workstreams">
      {categories.map((key) => <button type="button" role="tab" aria-selected={category === key} className={category === key ? "active" : ""} key={key} onClick={() => onCategoryChange(key)}><span className="pf-category-mark" aria-hidden="true">{CATEGORY_META[key].short}</span><span>{CATEGORY_META[key].label}</span><b>{counts[key]}</b></button>)}
    </div>
    <div className="pf-queue-heading"><div><span className="pf-eyebrow">{categoryMeta.description}</span><h3>{categoryMeta.label} queue</h3></div><span className="pf-count">{projects.length}</span></div>
    <label className="pf-search"><span className="pf-sr-only">Search projects</span><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search order or project" /></label>
    <div className="pf-filter" aria-label="Filter projects"><button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button><button type="button" className={filter === "attention" ? "active" : ""} onClick={() => setFilter("attention")}>Needs attention</button></div>
    <nav aria-label="Projects requiring production follow-up" tabIndex="0">
      {projects.map((project) => { const remaining = openTasks(project).length; return <button type="button" key={project.id} className={project.id === selected?.id ? "selected" : ""} onClick={() => onSelect(project.id)}>
        <span className="pf-queue-card-top"><strong>{project.orderId || "No order number"}</strong>{needsAttention(project) && <span className="pf-attention-dot" title="Needs attention" />}</span>
        <span className="pf-project-name">{project.name}</span><span className="pf-queue-status">{project.request ? `Delivery revision · ${titleCase(project.request.status)}` : remaining ? `${remaining} confirmation${remaining === 1 ? "" : "s"} open` : "Production confirmed"}</span><span className="pf-queue-deadline">Delivery: {formatDate(project.deliveryAt)}</span>
      </button>; })}
      {!projects.length && <div className="pf-queue-empty">No {categoryMeta.label.toLowerCase()} projects match this view.</div>}
    </nav>
  </aside>;
}

function ProjectWorkspace({ project, onAction, busy }) {
  const complete = project.tasks.filter((task) => task.status === "completed").length;
  const total = project.tasks.length;
  const percentage = total ? Math.round((complete / total) * 100) : 0;
  return <div className="pf-project" key={project.id}>
    <section className="pf-project-hero"><div className="pf-project-title-row"><div><span className="pf-eyebrow">Order {project.orderId || "not assigned"}</span><h2>{project.name}</h2><div className="pf-project-context"><span>{project.status}</span><span>Project Lead: {project.leadName}</span></div></div><StatusPill status={project.productionIncomplete ? "in progress" : "completed"} /></div><div className="pf-progress-row"><span>{complete} of {total} production confirmations complete</span><strong>{percentage}%</strong></div><div className="pf-progress"><span style={{ width: `${percentage}%` }} /></div></section>
    <section className="pf-metrics" aria-label="Project timing summary"><div><span>Delivery deadline</span><strong>{formatDate(project.deliveryAt)}</strong><small>Client commitment</small></div><div><span>Production finish target</span><strong>{formatDate(project.targetAt)}</strong><small>Calculated from delivery</small></div><div><span>Production confirmations</span><strong>{complete} / {total}</strong><small>{openTasks(project).length} remaining</small></div></section>
    {project.onHold && <div className="pf-message warning"><strong>Project on hold</strong><span>Production reminders are paused. A missed delivery commitment still requires review.</span></div>}
    {!project.deliveryAt && <div className="pf-message danger"><strong>Delivery commitment missing</strong><span>Add a delivery date and time before the system can calculate the production finish target.</span></div>}
    {project.productionIncomplete && project.targetAt && new Date(project.targetAt) < new Date() && <div className="pf-message danger"><strong>Production target has passed</strong><span>Review the remaining work and delivery risk with the Project Lead.</span></div>}
    <RevisionPanel project={project} onAction={onAction} busy={busy} />
    <section className="pf-confirmations"><div className="pf-section-heading"><div><span className="pf-eyebrow">Department accountability</span><h3>Production confirmations</h3></div><span className="pf-count">{total}</span></div><p className="pf-section-description">Each engaged production department must confirm its assigned work before the project can move forward.</p><div className="pf-task-list">{project.tasks.map((task) => <TaskCard key={task.department} task={task} project={project} onAction={onAction} busy={busy} />)}</div>{!project.tasks.length && <div className="pf-empty-state"><strong>No production departments engaged</strong><span>Assignments will appear here when production departments are added to the project.</span></div>}</section>
    {project.stageBlockMessage && <div className="pf-message danger"><strong>Project cannot advance</strong><span>{project.stageBlockMessage}</span></div>}
    {project.manager && project.status === "Pending Production" && total > 0 && complete === total && <button className="pf-primary pf-advance" disabled={busy || project.onHold} type="button" onClick={() => onAction(project, "advance", {})}>Check requirements and advance production</button>}
    <PlanForm project={project} onAction={onAction} busy={busy} />
    {project.manager && !!project.events.length && <details className="pf-section pf-disclosure"><summary><span><span className="pf-eyebrow">Audit trail</span>Recent follow-up activity</span><span className="pf-summary-action">View activity</span></summary><div className="pf-disclosure-content pf-activity">{project.events.map((event, index) => <p key={`${event.at}-${index}`}><small>{formatDate(event.at)}</small><span>{event.message}</span></p>)}</div></details>}
  </div>;
}

export default function ProductionFollowUp({ user, requestSource = "client" }) {
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [category, setCategory] = useState("");
  const dialogRef = useRef(null);
  const dismissedPrompts = useRef(new Set());
  const queryClient = useQueryClient();
  const source = `?source=${encodeURIComponent(requestSource)}`;
  const userId = user?._id || user?.id;
  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch(`/api/production-follow-up${source}`, { credentials: "include" });
      const payload = await readProductionFollowUpResponse(response, "Could not load production follow-up.");
      if (!Array.isArray(payload?.projects)) throw new Error("The server returned an unexpected project list. Please try again shortly.");
      setProjects(payload.projects); setLoaded(true); setLoadError("");
    } catch (loadFailure) { setLoadError(loadFailure.message); }
  }, [source, userId]);
  useAdaptivePolling(load, { enabled: Boolean(userId), intervalMs: 60000, hiddenIntervalMs: 180000 });
  useEffect(() => {
    const show = (event) => { setSelectedId(event.detail?.projectId || ""); setOpen(true); void load(); };
    let refreshTimer;
    const refresh = (event) => { if (event.detail?.source !== "production_follow_up") return; window.clearTimeout(refreshTimer); refreshTimer = window.setTimeout(load, 300); };
    window.addEventListener("mh:open-production-follow-up", show); window.addEventListener("mh:data-changed", refresh);
    return () => { window.removeEventListener("mh:open-production-follow-up", show); window.removeEventListener("mh:data-changed", refresh); window.clearTimeout(refreshTimer); };
  }, [load]);
  useEffect(() => {
    if (requestSource !== "client") return;
    const due = projects.find((project) => project.promptDue && !dismissedPrompts.current.has(promptKey(project)));
    if (due && !open) { setSelectedId(due.id); setOpen(true); }
  }, [projects, open, requestSource]);
  useEffect(() => { const dialog = dialogRef.current; if (open && dialog && !dialog.open) dialog.showModal(); if (!open && dialog?.open) dialog.close(); }, [open]);
  const categoryCounts = useMemo(() => Object.fromEntries(CATEGORY_ORDER.map((key) => [key, projects.filter((project) => projectCategories(project).includes(key)).length])), [projects]);
  const availableCategories = useMemo(() => {
    if (requestSource === "admin") return CATEGORY_ORDER;
    if (user?.role === "admin") return ["lead", "frontDesk"];
    return CATEGORY_ORDER.filter((key) => categoryCounts[key] > 0);
  }, [categoryCounts, requestSource, user?.role]);
  const categoryOptions = availableCategories.length ? availableCategories : [category || "lead"];
  const activeCategory = category && categoryOptions.includes(category) ? category : categoryOptions.find((key) => categoryCounts[key] > 0) || categoryOptions[0];
  const filteredProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects.filter((project) => projectCategories(project).includes(activeCategory) && (filter !== "attention" || needsAttention(project)) && (!term || `${project.orderId || ""} ${project.name || ""}`.toLowerCase().includes(term)));
  }, [projects, search, filter, activeCategory]);
  const selected = filteredProjects.find((project) => project.id === selectedId) || filteredProjects[0];
  const action = async (project, actionName, values) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/production-follow-up/${project.id}/${actionName}${source}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, revision: project.revision }) });
      const payload = await readProductionFollowUpResponse(response, "Could not save this action.");
      setNotice(payload.stageBlockMessage ? `${payload.message} ${payload.stageBlockMessage}` : payload.message);
      await load(); await queryClient.invalidateQueries({ queryKey: ["projects"] }); return true;
    } catch (actionFailure) { setError(actionFailure.message); await load(); return false; } finally { setBusy(false); }
  };
  const close = () => {
    if (busy) return;
    if (requestSource === "client") {
      for (const project of projects) {
        if (project.promptDue) dismissedPrompts.current.add(promptKey(project));
      }
    }
    setOpen(false);
  };
  const snooze = async () => {
    if (busy) return;
    const dueProjects = projects.filter((project) => project.promptDue);
    if (!dueProjects.length) { setOpen(false); return; }
    for (const project of dueProjects) {
      if (!(await action(project, "snooze", {}))) return;
    }
    setOpen(false);
  };
  const selectProject = (projectId) => { setSelectedId(projectId); setError(""); setNotice(""); };
  const selectCategory = (nextCategory) => { setCategory(nextCategory); setSelectedId(""); setSearch(""); setFilter("all"); setError(""); setNotice(""); };
  const attention = projects.filter(needsAttention).length;
  if (!userId) return null;
  return <>
    <div className="pf-banner"><button type="button" onClick={() => { setOpen(true); void load(); }}><span className="pf-banner-icon" aria-hidden="true">✓</span><span>Production follow-up</span>{attention > 0 && <b>{attention} need attention</b>}</button>{loadError && <span role="status">{loadError}</span>}</div>
    <dialog ref={dialogRef} className="pf-dialog" aria-labelledby="pf-title" onCancel={(event) => { event.preventDefault(); close(); }}>
      <header className="pf-header"><div className="pf-header-title"><span className="pf-header-icon" aria-hidden="true">✓</span><div><h2 id="pf-title">Production follow-up</h2><p>Production accountability, delivery commitments and client communication · Accra time</p></div></div><div className="pf-header-actions">{requestSource === "client" && projects.some((project) => project.promptDue) && <button className="pf-snooze" disabled={busy} type="button" onClick={snooze}>Remind me in 30 working minutes</button>}<button className="pf-close" disabled={busy} type="button" onClick={close}>Close</button></div></header>
      <div className={`pf-feedback${error || loadError || notice ? " visible" : ""}`}>
        {(error || loadError) && <div className="pf-global-message error" role="alert">{error || loadError}</div>}
        {notice && <div className="pf-global-message notice" role="status">{notice}</div>}
      </div>
      <div className="pf-workspace"><ProjectQueue projects={filteredProjects} selected={selected} onSelect={selectProject} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} category={activeCategory} categories={categoryOptions} counts={categoryCounts} onCategoryChange={selectCategory} /><main className="pf-main" tabIndex="0" aria-label="Selected project production follow-up">{!loaded ? <div className="pf-empty-state"><strong>{loadError ? "Production follow-up is unavailable" : "Loading production follow-up..."}</strong><span>{loadError ? "Use the Production follow-up button to retry." : "Retrieving your assigned projects."}</span></div> : !selected ? <div className="pf-empty-state"><strong>The {CATEGORY_META[activeCategory].label} queue is clear</strong><span>No projects in this workstream currently require follow-up.</span></div> : <ProjectWorkspace project={selected} onAction={action} busy={busy} />}</main></div>
    </dialog>
  </>;
}
