import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import useAdaptivePolling from "../../hooks/useAdaptivePolling";
import { readProductionFollowUpResponse } from "../../utils/productionFollowUpResponse";
import "./ProductionFollowUp.css";

const formatDate = (value) => value ? new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Accra", dateStyle: "medium", timeStyle: "short" }) : "Not set";
const inputDate = (value) => value ? new Date(value).toISOString().slice(0, 16) : "";
const isoDate = (value) => value ? new Date(`${value}:00Z`).toISOString() : "";
const label = (value) => String(value || "").replaceAll("-", " ");
const numberFields = ["remainingHours", "downstreamHours"];

function ActionForm({ action, project, onAction, busy, children, title, department, onSuccess }) {
  return <form className="pf-form" onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    for (const key of numberFields) if (key in values) values[key] = Number(values[key]);
    for (const key of ["proposedAt", "contactedAt", "estimateAt"]) if (values[key]) values[key] = isoDate(values[key]);
    if ("confirmed" in values) values.confirmed = values.confirmed === "on";
    if (await onAction(project, action, { ...values, department })) onSuccess?.();
  }}>
    <fieldset disabled={busy}>{children}<button className="pf-primary" type="submit">{busy ? "Saving…" : title}</button></fieldset>
  </form>;
}

function TaskCard({ task, project, onAction, busy }) {
  const [mode, setMode] = useState("");
  const canManage = project.manager && project.status === "Pending Production" && !project.onHold;
  return <article className={`pf-task ${task.overdue ? "pf-overdue" : ""}`}>
    <div className="pf-row"><strong>{label(task.department)}</strong><span className={`pf-pill ${task.status}`}>{label(task.status)}{task.escalated ? " · Lead action needed" : ""}</span></div>
    <p>{task.scope}</p>
    <p><b>{task.ownerName}</b> · Finish target: {formatDate(task.dueAt)}</p>
    {task.estimateAt && <p>Latest estimate: {formatDate(task.estimateAt)}{task.extensionApprovedAt ? " · Extension reviewed" : ""}</p>}
    {task.status !== "completed" && task.estimateAt && task.dueAt && new Date(task.estimateAt) > new Date(task.dueAt) && <p className="pf-error">This estimate exceeds the production target. The Lead needs to review the delivery risk.</p>}
    {task.note && <p className="pf-note">{task.note}</p>}
    {task.completedAt && <p>Completed {formatDate(task.completedAt)}{task.verifiedByLead ? " · Verified on behalf of owner" : ""}</p>}
    {task.legacyStageCompletion && <p>Production was already completed before follow-up tracking began.</p>}
    {task.status !== "completed" && <div className="pf-actions">
      {task.canAct && <><button onClick={() => setMode("complete")}>Complete my work</button><button onClick={() => setMode("working")}>Still working</button><button onClick={() => setMode("blocked")}>Blocked / need help</button></>}
      {canManage && <><button onClick={() => setMode("assign")}>{task.owner ? "Reassign / timing" : "Assign owner"}</button><button onClick={() => setMode("extend")}>Review extension</button><button onClick={() => setMode("verify")}>Verify and close on behalf</button></>}
    </div>}
    {mode && task.status !== "completed" && <ActionForm action={mode} project={project} department={task.department} onAction={onAction} busy={busy} title={{ assign: "Save assignment", complete: "Confirm completion", working: "Save estimate", blocked: "Send blocker to Lead", extend: "Approve estimate", verify: "Record verified completion" }[mode]} onSuccess={() => setMode("")}>
      {mode === "assign" && <><label>Accountable production owner<select name="owner" required defaultValue={task.owner || ""}><option value="">Select an owner</option>{task.candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Hours needed by subsequent production departments<input name="downstreamHours" type="number" min="0" max="1000" step="0.5" defaultValue={task.downstreamHours || 0} required /></label><small>Use 0 for departments that can finish at the overall production target. Reserve additional hours for sequential handoffs.</small></>}
      {["working", "extend"].includes(mode) && <label>Estimated finish (Accra time)<input type="datetime-local" name="estimateAt" defaultValue={inputDate(task.estimateAt)} required /></label>}
      <label>{mode === "verify" ? "How did you verify the completed work?" : mode === "blocked" ? "What is blocking this work?" : "Completion note / reason"}<textarea name="reason" minLength="3" maxLength="2000" required /></label>
      {["complete", "verify"].includes(mode) && <label className="pf-check"><input type="checkbox" name="confirmed" required />I confirm the assigned production work is complete.</label>}
      <button type="button" onClick={() => setMode("")}>Cancel</button>
    </ActionForm>}
  </article>;
}

function PlanForm({ project, onAction, busy }) {
  const titles = { qualityHours: "Quality control", photographyHours: "Photography", packagingHours: "Packaging", transportHours: "Dispatch / transport", bufferHours: "Contingency" };
  return <details className="pf-section"><summary>Production schedule allowances</summary><p>Working times use Africa/Accra. Set an allowance to 0 when that activity is not required. These allowances reserve time after production; the delivery deadline stays unchanged.</p>
    <form className="pf-form" onSubmit={async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const plan = { ...project.plan };
      for (const key of [...Object.keys(titles), "startHour", "endHour"]) plan[key] = Number(data.get(key));
      plan.workingDays = data.getAll("workingDays").map(Number);
      plan.holidays = String(data.get("holidays") || "").split(/[\s,]+/).filter(Boolean);
      await onAction(project, "plan", { plan, reason: data.get("reason") });
    }}><fieldset disabled={busy || !project.manager}><div className="pf-grid">{Object.entries(titles).map(([key, title]) => <label key={key}>{title} (working hours)<input name={key} type="number" min="0" max="240" step="0.5" defaultValue={project.plan[key]} required /></label>)}<label>Work starts (hour)<input name="startHour" type="number" min="0" max="23.5" step="0.5" defaultValue={project.plan.startHour} required /></label><label>Work ends (hour)<input name="endHour" type="number" min="0.5" max="24" step="0.5" defaultValue={project.plan.endHour} required /></label></div>
      <div className="pf-actions">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => <label className="pf-check" key={day}><input type="checkbox" name="workingDays" value={i} defaultChecked={project.plan.workingDays.includes(i)} />{day}</label>)}</div>
      <label>Holidays (YYYY-MM-DD, separated by commas)<textarea name="holidays" defaultValue={project.plan.holidays.join(", ")} /></label>
      {project.manager && <><label>Reason for schedule adjustment<textarea name="reason" minLength="3" maxLength="2000" required /></label><button className="pf-primary">Save production plan</button></>}
    </fieldset></form></details>;
}

function RevisionPanel({ project, onAction, busy }) {
  const request = project.request;
  const [requestOpen, setRequestOpen] = useState(false);
  if (!project.manager) return null;
  const needsRequest = request?.status === "required" || (!request && requestOpen);
  const canReview = project.reviewer && request && request.status !== "required";
  return <section className={`pf-section ${request ? "pf-deadline-alert" : ""}`}>
    <h3>{request?.status === "required" ? "Delivery deadline missed" : "Delivery deadline revision"}</h3>
    {request && <p><b>Request #{request.number}</b> · {label(request.status)}{request.number > 1 ? " · Repeated deadline miss / revision" : ""}</p>}
    {request?.status === "required" && <p>The delivery deadline has passed{project.productionIncomplete ? " and production remains incomplete" : " and delivery is still outstanding"}. Submit a request to Front Desk and Admin. The client must be contacted before a new deadline is applied.</p>}
    {!request && !requestOpen && <button onClick={() => setRequestOpen(true)}>Request a delivery revision</button>}
    {needsRequest && <ActionForm action="request" project={project} onAction={onAction} busy={busy} title="Send request to Front Desk and Admin" onSuccess={() => setRequestOpen(false)}>
      {request?.reviewNote && <p className="pf-note">Reviewer feedback: {request.reviewNote}</p>}
      <label>Reason for delay<textarea name="reason" minLength="3" maxLength="2000" defaultValue={request?.reason || ""} required /></label>
      <label>Estimated remaining production hours<input name="remainingHours" type="number" min="0" max="10000" step="0.5" defaultValue={request?.remainingHours ?? ""} required /></label>
      <label>Suggested delivery date and time (Accra)<input name="proposedAt" type="datetime-local" defaultValue={inputDate(request?.proposedAt)} required /></label>
      <small>This is a proposal. It does not change the current delivery deadline.</small>
    </ActionForm>}
    {request && request.status !== "required" && <><p>{request.reason}</p><p>Remaining production: {request.remainingHours} hours · Proposed delivery: <b>{formatDate(request.proposedAt)}</b></p><p>{request.reviewer ? `Reviewer: ${request.reviewerName}` : "Awaiting Front Desk / Admin review."}</p></>}
    {canReview && <>
      {!project.ownsReview && <button disabled={busy} onClick={() => onAction(project, "claim", {})}>Take responsibility for review</button>}
      {project.ownsReview && <>
      <details><summary>Revise the proposed date</summary><ActionForm action="proposal" project={project} onAction={onAction} busy={busy} title="Update proposal"><label>Proposed delivery (Accra)<input name="proposedAt" type="datetime-local" defaultValue={inputDate(request.proposedAt)} required /></label><small>Changing the proposal clears its client communication confirmation.</small></ActionForm></details>
      <details open={request.status === "reviewing"}><summary>Record client communication</summary><ActionForm action="contact" project={project} onAction={onAction} busy={busy} title="Record communication">
        <p>Record communication about <b>{formatDate(request.proposedAt)}</b>.</p>
        <label>Client contact name<input name="contactName" minLength="3" maxLength="200" required /></label>
        <div className="pf-grid"><label>Contact method<select name="channel" required><option value="phone">Phone</option><option value="email">Email</option><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="in_person">In person</option></select></label><label>Contact time (Accra)<input name="contactedAt" type="datetime-local" defaultValue={inputDate(new Date())} required /></label></div>
        <label>Outcome<select name="outcome" required><option value="">Select the outcome</option><option value="informed">Client informed of this deadline</option><option value="accepted">Client accepted this deadline</option></select></label>
        <label>Conversation summary and client response<textarea name="summary" minLength="3" maxLength="2000" required /></label>
        <label className="pf-check"><input type="checkbox" name="confirmed" required />I confirm the client was reached and this exact proposed delivery deadline was communicated.</label>
        <small>If the client could not be reached or rejected this date, continue follow-up or revise the proposal.</small>
      </ActionForm></details>
      {request.communication && <div className="pf-note"><p>Client: {request.communication.contactName} · {formatDate(request.communication.contactedAt)} · {request.communication.channel}</p><p>{request.communication.summary}</p><p>Communicated deadline: {formatDate(request.communication.deadlineAt)}</p></div>}
      <button className="pf-primary" disabled={busy || request.status !== "communicated"} onClick={() => onAction(project, "apply", {})}>Apply communicated delivery deadline</button>
      <details><summary>Return request to Lead</summary><ActionForm action="return" project={project} onAction={onAction} busy={busy} title="Return for correction"><label>Reason<textarea name="reason" minLength="3" maxLength="2000" required /></label></ActionForm></details>
      </>}
    </>}
    {!!project.history.length && <details><summary>Delivery revision history ({project.history.length})</summary>{[...project.history].reverse().map((entry) => <article className="pf-note" key={entry.number}><b>Revision #{entry.number}</b><p>{formatDate(entry.deadlineAt)} → {formatDate(entry.proposedAt)}</p><p>{entry.reason}</p><p>Client contacted: {entry.communication?.contactName} · {formatDate(entry.communication?.contactedAt)}</p><p>{entry.communication?.summary}</p><p>Applied: {formatDate(entry.appliedAt)}</p></article>)}</details>}
  </section>;
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
  const dialogRef = useRef(null);
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
    } catch (err) { setLoadError(err.message); }
  }, [source, userId]);
  useAdaptivePolling(load, { enabled: Boolean(userId), intervalMs: 60000, hiddenIntervalMs: 180000 });
  useEffect(() => {
    const show = (event) => { setSelectedId(event.detail?.projectId || ""); setOpen(true); void load(); };
    let refreshTimer;
    const refresh = (event) => {
      if (event.detail?.source !== "production_follow_up") return;
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(load, 300);
    };
    window.addEventListener("mh:open-production-follow-up", show);
    window.addEventListener("mh:data-changed", refresh);
    return () => { window.removeEventListener("mh:open-production-follow-up", show); window.removeEventListener("mh:data-changed", refresh); window.clearTimeout(refreshTimer); };
  }, [load]);
  useEffect(() => {
    const due = projects.find((p) => p.promptDue);
    if (due && !open) { setSelectedId(due.id); setOpen(true); }
  }, [projects, open]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  const selected = projects.find((p) => p.id === selectedId) || projects[0];
  const action = async (project, actionName, values) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/production-follow-up/${project.id}/${actionName}${source}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...values, revision: project.revision }) });
      const payload = await readProductionFollowUpResponse(response, "Could not save this action.");
      setNotice(payload.stageBlockMessage ? `${payload.message} ${payload.stageBlockMessage}` : payload.message);
      await load();
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      return true;
    } catch (err) { setError(err.message); await load(); return false; }
    finally { setBusy(false); }
  };
  const close = async () => {
    if (busy) return;
    const due = projects.find((p) => p.promptDue);
    if (due && !(await action(due, "snooze", {}))) return;
    setOpen(false);
  };
  const attention = projects.filter((p) => p.request || p.tasks.some((t) => t.status !== "completed" && (t.overdue || !t.owner))).length;
  if (!userId) return null;
  return <>
    <div className="pf-banner"><button onClick={() => { setOpen(true); void load(); }}>Production follow-up {attention > 0 && <b>{attention} need attention</b>}</button>{loadError && <span role="status">{loadError}</span>}</div>
    <dialog ref={dialogRef} className="pf-dialog" aria-labelledby="pf-title" onCancel={(event) => { event.preventDefault(); void close(); }}>
      <header className="pf-header"><div><h2 id="pf-title">Production follow-up</h2><p>Completion, delivery commitments and client communication · Accra time</p></div><button disabled={busy} onClick={close}>{projects.some((p) => p.promptDue) ? "Remind me in 30 working minutes" : "Close"}</button></header>
      {(error || loadError) && <div className="pf-error" role="alert">{error || loadError}</div>}{notice && <div className="pf-notice" role="status">{notice}</div>}
      <div className="pf-workspace"><nav aria-label="Projects requiring follow-up">{projects.map((p) => <button key={p.id} className={p.id === selected?.id ? "selected" : ""} onClick={() => { setSelectedId(p.id); setError(""); setNotice(""); }}><b>{p.orderId || p.name}</b><span>{p.name}</span><small>{p.request ? `Delivery request · ${label(p.request.status)}` : `${p.tasks.filter((t) => t.status !== "completed").length} production confirmations open`}</small></button>)}</nav>
        <main>{!loaded ? <p>{loadError ? "Use the Production follow-up button to retry." : "Loading production follow-up…"}</p> : !selected ? <p>No active production assignments or delivery requests.</p> : <div key={selected.id}>
          <h3>{selected.orderId} · {selected.name}</h3><p>Project Lead: {selected.leadName} · {selected.status}</p>
          <div className="pf-dates"><div>Delivery deadline<strong>{formatDate(selected.deliveryAt)}</strong></div><div>Production finish target<strong>{formatDate(selected.targetAt)}</strong></div></div>
          {selected.onHold && <p className="pf-note">Production follow-ups are paused while this project is on hold. A missed delivery commitment still requires review.</p>}
          {!selected.deliveryAt && <p className="pf-error">A delivery date and time is needed to calculate a production target.</p>}
          {selected.productionIncomplete && selected.targetAt && new Date(selected.targetAt) < new Date() && <p className="pf-error">Production target has passed. Review the remaining work and delivery risk with the Lead.</p>}
          <RevisionPanel project={selected} onAction={action} busy={busy} />
          <h3>Production confirmations</h3>{selected.tasks.map((task) => <TaskCard key={task.department} task={task} project={selected} onAction={action} busy={busy} />)}
          {!selected.tasks.length && <p>No production departments have been engaged yet.</p>}
          {selected.stageBlockMessage && <p className="pf-error">{selected.stageBlockMessage}</p>}
          {selected.manager && selected.status === "Pending Production" && selected.tasks.length > 0 && selected.tasks.every((t) => t.status === "completed") && <button disabled={busy || selected.onHold} onClick={() => action(selected, "advance", {})}>Check requirements and advance production</button>}
          <PlanForm project={selected} onAction={action} busy={busy} />
          {selected.manager && !!selected.events.length && <details className="pf-section"><summary>Recent follow-up activity</summary>{selected.events.map((event, index) => <p key={`${event.at}-${index}`}><small>{formatDate(event.at)}</small> · {event.message}</p>)}</details>}
        </div>}</main></div>
    </dialog>
  </>;
}
