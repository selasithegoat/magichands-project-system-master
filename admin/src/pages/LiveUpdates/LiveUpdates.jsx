import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import "./LiveUpdates.css";

const CLOSED_REQUEST_STATUSES = new Set(["Fulfilled", "Declined"]);

const formatDate = (value) => {
  if (!value) return "No date recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No date recorded"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
      }).format(date);
};

const formatAge = (value) => {
  if (!value) return "No activity recorded";
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed)) return "No activity recorded";
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const initials = (name) =>
  String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join("") || "?";

const cleanDemoText = (value) =>
  String(value || "").replace(/^\[STAGING LIVE UPDATES DEMO\]\s*/, "");

const getProjectSignal = (project) => {
  if (!project?.isActive) return { level: "closed", label: "Closed project", reason: "" };
  if (project.isOnHold) return { level: "critical", label: "Needs attention", reason: "Project is on hold" };
  const openRequests = (project.requests || []).filter((request) => !CLOSED_REQUEST_STATUSES.has(request.status));
  const urgent = openRequests.find((request) => request.priority === "Urgent");
  if (urgent) return { level: "critical", label: "Needs attention", reason: `Urgent request: ${urgent.materialName}` };
  const high = openRequests.find((request) => request.priority === "High");
  if (high) return { level: "warning", label: "Needs attention", reason: `High priority request: ${high.materialName}` };
  return { level: "normal", label: "No priority flag", reason: "" };
};

const requestTone = (status) => {
  if (status === "Fulfilled") return "success";
  if (status === "Declined") return "critical";
  if (["Pending", "In Review", "Partially Fulfilled"].includes(status)) return "warning";
  return "info";
};

const getJson = async (path) => {
  const response = await fetch(path, { credentials: "include", cache: "no-store" });
  if (!response.ok) throw new Error("Could not load live updates. Please try again.");
  return response.json();
};

const LoadingCards = () => (
  <div className="live-updates-loading" role="status" aria-label="Loading live updates">
    {[0, 1, 2].map((item) => <div className="live-updates-skeleton" key={item} />)}
  </div>
);

const LiveUpdates = () => {
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedProjectId, setExpandedProjectId] = useState("");

  const leadsQuery = useQuery({
    queryKey: ["admin", "live-updates", "leads"],
    queryFn: () => getJson("/api/admin/live-updates/leads"),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    meta: { realtimePaths: ["/api/projects", "/api/material-requests", "/api/admin/employees"] },
  });
  const projectsQuery = useQuery({
    queryKey: ["admin", "live-updates", "projects", selectedLeadId],
    queryFn: () => getJson(`/api/admin/live-updates/leads/${selectedLeadId}/projects`),
    enabled: Boolean(selectedLeadId),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    meta: { realtimePaths: ["/api/projects", "/api/updates", "/api/material-requests"] },
  });

  const allLeads = leadsQuery.data?.leads || [];
  const leads = allLeads.filter((lead) =>
    `${lead.name} ${lead.employeeId || ""} ${(lead.department || []).join(" ")}`
      .toLowerCase().includes(leadSearch.trim().toLowerCase()),
  );
  const selectedLead = allLeads.find((lead) => lead.id === selectedLeadId);
  const allProjects = projectsQuery.data?.projects || [];
  const projects = allProjects.filter((project) => {
    if (filter === "attention" && !["critical", "warning"].includes(getProjectSignal(project).level)) return false;
    if (filter === "active" && (!project.isActive || project.isOnHold)) return false;
    if (filter === "hold" && !project.isOnHold) return false;
    return `${project.name} ${project.orderId} ${project.client} ${project.assistantLead?.name || ""}`
      .toLowerCase().includes(projectSearch.trim().toLowerCase());
  }).sort((left, right) => {
    const rank = { critical: 0, warning: 1, normal: 2, closed: 3 };
    const priority = rank[getProjectSignal(left).level] - rank[getProjectSignal(right).level];
    return priority || new Date(right.lastActivityAt || 0) - new Date(left.lastActivityAt || 0);
  });
  const attentionCount = allProjects.filter((project) => ["critical", "warning"].includes(getProjectSignal(project).level)).length;
  const overview = leadsQuery.data?.summary || {};
  const asOf = selectedLeadId ? projectsQuery.data?.asOf : leadsQuery.data?.asOf;
  const refreshing = selectedLeadId ? projectsQuery.isFetching : leadsQuery.isFetching;

  const openLead = (leadId) => {
    setSelectedLeadId(leadId);
    setProjectSearch("");
    setFilter("all");
    setExpandedProjectId("");
  };

  return (
    <div className="live-updates-page">
      <header className="live-updates-header">
        <div className="live-updates-header-copy">
          <div className="live-updates-kicker"><span className="live-updates-live-dot" /> Operations overview</div>
          {selectedLeadId && <button className="live-updates-back" type="button" onClick={() => setSelectedLeadId("")}>← All project leads</button>}
          <h1>{selectedLeadId ? selectedLead?.name || projectsQuery.data?.lead?.name || "Lead projects" : "Live updates"}</h1>
          <p>{selectedLeadId ? "See the latest situation on every project led by this person." : "See who needs attention, what changed, and what Inventory is waiting on."}</p>
        </div>
        <div className="live-updates-refresh">
          <span><span className="live-updates-live-dot" /> Live view</span>
          <strong>Updated {formatAge(asOf)}</strong>
          <button type="button" onClick={() => selectedLeadId ? projectsQuery.refetch() : leadsQuery.refetch()} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </header>

      {!selectedLeadId ? (
        <>
          <section className="live-updates-overview" aria-label="Project overview">
            <div className="live-updates-metric live-updates-metric-primary"><span>Projects needing attention</span><strong>{overview.attentionProjects ?? "—"}</strong><small>On hold or priority requests</small></div>
            <div className="live-updates-metric"><span>Current projects</span><strong>{overview.activeProjects ?? "—"}</strong><small>Active and on hold</small></div>
            <div className="live-updates-metric"><span>Open Inventory requests</span><strong>{overview.openRequests ?? "—"}</strong><small>Awaiting completion</small></div>
            <div className="live-updates-metric"><span>Project leads</span><strong>{overview.leadCount ?? "—"}</strong><small>With assigned projects</small></div>
          </section>
          <section className="live-updates-section" aria-labelledby="live-leads-heading">
            <div className="live-updates-section-head">
              <div>
                <h2 id="live-leads-heading">Project leads</h2>
                <p>Leads with priority projects appear first. Select a profile to see its projects.</p>
              </div>
              <label className="live-updates-search"><span className="sr-only">Search project leads</span><input value={leadSearch} onChange={(event) => setLeadSearch(event.target.value)} placeholder="Search leads" /></label>
            </div>
            {leadsQuery.isPending ? <LoadingCards /> : leadsQuery.isError ? (
              <div className="live-updates-state" role="alert"><p>{leadsQuery.error.message}</p><button type="button" onClick={() => leadsQuery.refetch()}>Try again</button></div>
            ) : leads.length ? (
              <div className="live-updates-lead-grid">
                {leads.map((lead) => (
                  <button className={`live-updates-lead ${lead.attentionProjects ? "has-attention" : ""}`} key={lead.id} type="button" onClick={() => openLead(lead.id)}>
                    <span className="live-updates-lead-top">
                      <span className="live-updates-avatar" aria-hidden="true">{lead.avatarUrl ? <img src={lead.avatarUrl} alt="" /> : initials(lead.name)}</span>
                      <span className="live-updates-lead-identity"><strong>{lead.name}</strong><small>{(lead.department || []).join(", ") || lead.employeeId || "Project lead"}</small></span>
                      <span className="live-updates-chevron" aria-hidden="true">›</span>
                    </span>
                    <span className="live-updates-lead-metrics">
                      <span><strong>{lead.activeProjects}</strong><small>current projects</small></span>
                      <span><strong>{lead.openRequests || 0}</strong><small>open requests</small></span>
                    </span>
                    <span className={`live-updates-lead-signal ${lead.attentionProjects ? "attention" : "clear"}`}>
                      <span className="live-updates-signal-dot" />
                      {lead.attentionProjects ? `${lead.attentionProjects} project${lead.attentionProjects === 1 ? "" : "s"} need attention` : "No flagged request or hold"}
                    </span>
                  </button>
                ))}
              </div>
            ) : <div className="live-updates-state"><p>{leadSearch ? "No leads match your search." : "No projects have a main lead assigned yet."}</p></div>}
          </section>
        </>
      ) : (
        <section className="live-updates-section" aria-labelledby="live-projects-heading">
          <div className="live-updates-section-head">
            <div>
              <h2 id="live-projects-heading">Project situation</h2>
              <p>{allProjects.length} projects led by {selectedLead?.name || projectsQuery.data?.lead?.name || "this lead"}. Priority projects appear first.</p>
            </div>
            <label className="live-updates-search"><span className="sr-only">Search projects</span><input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" /></label>
          </div>
          <div className="live-updates-toolbar">
            <div className="live-updates-filters" role="group" aria-label="Filter projects">
              {[["all", "All current", allProjects.length], ["attention", "Needs attention", attentionCount], ["active", "Active", allProjects.filter((project) => project.isActive && !project.isOnHold).length], ["hold", "On hold", allProjects.filter((project) => project.isOnHold).length]].map(([key, label, count]) => (
                <button key={key} type="button" className={filter === key ? "selected" : ""} onClick={() => setFilter(key)} aria-pressed={filter === key}>{label}<span>{count}</span></button>
              ))}
            </div>
            <span className="live-updates-sort-note">Priority first · newest activity next</span>
          </div>
          {projectsQuery.isPending ? <LoadingCards /> : projectsQuery.isError ? (
            <div className="live-updates-state" role="alert"><p>{projectsQuery.error.message}</p><button type="button" onClick={() => projectsQuery.refetch()}>Try again</button></div>
          ) : projects.length ? (
            <div className="live-updates-project-list">
              {projects.map((project) => {
                const expanded = expandedProjectId === project.id;
                const signal = getProjectSignal(project);
                const stage = project.isCancelled ? "Cancelled" : project.isOnHold ? "On hold" : project.status;
                const openRequests = project.requests.filter((request) => !CLOSED_REQUEST_STATUSES.has(request.status));
                const featuredRequest = openRequests.find((request) => request.priority === "Urgent") || openRequests.find((request) => request.priority === "High") || openRequests[0] || project.requests[0];
                return (
                  <article className={`live-updates-project tone-${signal.level}`} key={project.id}>
                    <div className="live-updates-project-head">
                      <div className="live-updates-project-identity">
                        <div className="live-updates-project-eyebrow"><span>{project.orderId || "Project"}</span>{project.indicator && <span className="live-updates-demo-tag">{project.indicator}</span>}</div>
                        <h3>{project.name}</h3>
                        <p>{project.client || "No client recorded"}{project.assistantLead && <span> · Assistant lead: {project.assistantLead.name}</span>}</p>
                      </div>
                      <div className="live-updates-project-head-right"><span className={`live-updates-signal signal-${signal.level}`}><span className="live-updates-signal-dot" />{signal.label}</span><small>Activity {formatAge(project.lastActivityAt)}</small></div>
                    </div>
                    {signal.reason && <div className={`live-updates-attention-note attention-${signal.level}`}><strong>Action to watch</strong><span>{signal.reason}</span></div>}
                    <div className="live-updates-project-snapshot">
                      <div className="live-updates-snapshot-stage">
                        <span className="live-updates-snapshot-label">Current stage</span>
                        <strong>{stage}</strong>
                        <small>Since {formatAge(project.statusChangedAt)}</small>
                      </div>
                      <div className="live-updates-snapshot-note">
                        <span className="live-updates-snapshot-label">Latest project update</span>
                        {project.latestUpdate ? <><p>{cleanDemoText(project.latestUpdate.content)}</p><small>{project.latestUpdate.author} · {formatAge(project.latestUpdate.createdAt)}</small></> : <p className="live-updates-missing-note">No update posted yet</p>}
                      </div>
                      <div className="live-updates-snapshot-inventory">
                        <span className="live-updates-snapshot-label">Inventory requests</span>
                        {featuredRequest ? <><strong>{openRequests.length} open · {project.requests.length} total</strong><p>{featuredRequest.materialName}</p><span className={`live-updates-request-status status-${requestTone(featuredRequest.status)}`}>{featuredRequest.status}</span></> : <p>No project requests</p>}
                      </div>
                    </div>
                    <div className="live-updates-project-footer">
                      <span>{project.latestUpdate ? `Lead update ${formatDate(project.latestUpdate.createdAt)}` : "Awaiting first project update"}</span>
                      <button type="button" aria-expanded={expanded} aria-controls={`live-project-${project.id}`} onClick={() => setExpandedProjectId(expanded ? "" : project.id)}>{expanded ? "Hide details" : "View requests and details"}<span aria-hidden="true">{expanded ? "↑" : "↓"}</span></button>
                    </div>
                    {expanded && (
                      <div className="live-updates-project-detail" id={`live-project-${project.id}`}>
                        <div className="live-updates-detail-grid">
                          <section><h4>Current stage</h4><strong>{stage}</strong><p>Changed {formatDate(project.statusChangedAt)}</p></section>
                          <section><h4>Latest project update</h4>{project.latestUpdate ? <><p className="live-updates-full-note">{cleanDemoText(project.latestUpdate.content)}</p><small>{project.latestUpdate.author} · {formatDate(project.latestUpdate.createdAt)}</small></> : <p>No project update has been posted yet.</p>}</section>
                        </div>
                        <div className="live-updates-requests"><h4>Inventory requests <span>{openRequests.length} open</span></h4>{project.requests.length ? <ul>{project.requests.map((request) => <li key={request.id}><div><strong>{request.materialName}</strong><small>Status changed {formatDate(request.statusAt)}</small>{request.statusNote && <p>{request.statusNote}</p>}{request.items?.length > 0 && <ul className="live-updates-request-items">{request.items.map((item) => <li key={item.id}>{item.materialName}: {item.fulfillmentStatus || "Pending"}{item.purchaseStatus && item.purchaseStatus !== "Not Started" ? ` · Purchase ${item.purchaseStatus}` : ""}</li>)}</ul>}</div><span className={`live-updates-request-status status-${requestTone(request.status)}`}>{request.status}</span></li>)}</ul> : <p>No project requests yet.</p>}</div>
                        <Link className="live-updates-project-link" to={`/projects/${project.id}`}>Open project details →</Link>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : <div className="live-updates-state"><p>{projectSearch || filter !== "all" ? "No projects match these filters." : "This lead has no current projects."}</p></div>}
        </section>
      )}
    </div>
  );
};

export default LiveUpdates;
