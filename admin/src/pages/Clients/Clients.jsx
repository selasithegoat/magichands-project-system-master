import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import ProjectHealthBadge from "@client/components/ui/ProjectHealthBadge";
import usePersistedState from "@client/hooks/usePersistedState";
import { renderProjectName } from "../../utils/projectName";
import "./Clients.css";

const formatDate = (value) => {
  if (!value) return "No project date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No project date" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const metricValue = (value, suffix = "") => value === null || value === undefined ? "Not enough data" : `${value}${suffix}`;

const Clients = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = usePersistedState("admin-client-intelligence-search", "");
  const [risk, setRisk] = usePersistedState("admin-client-intelligence-risk", "all", {
    sanitize: (value) => ["all", "high", "medium", "low"].includes(value) ? value : "all",
  });

  const { data, isPending, error } = useQuery({
    queryKey: ["projects", "client-intelligence", "admin"],
    queryFn: async () => {
      const response = await fetch("/api/projects/client-intelligence?source=admin", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load client account intelligence.");
      return response.json();
    },
    meta: { realtimePaths: ["/api/projects"] },
  });

  const accounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (Array.isArray(data?.accounts) ? data.accounts : []).filter((account) => {
      if (risk !== "all" && account.retentionRisk !== risk) return false;
      if (!query) return true;
      return [account.name, account.email, account.phone, account.primaryLead?.name].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [data, risk, search]);

  const toggle = (name) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  if (isPending) return <div className="client-intelligence-state">Loading client intelligence...</div>;
  if (error) return <div className="client-intelligence-state error">{error.message}</div>;

  return (
    <div className="client-intelligence-page">
      <header className="client-intelligence-hero">
        <div><span>Portfolio intelligence</span><h1>Client Account Intelligence</h1><p>Relationship health, delivery reliability, billing behavior, feedback, and portfolio risk in one view.</p></div>
        <div className="client-intelligence-hero-note"><strong>Retention risk</strong><span>Calculated from active project health, delivery reliability, billing exceptions, and negative feedback.</span></div>
      </header>

      <section className="client-intelligence-summary">
        <div><strong>{data?.summary?.accounts || 0}</strong><span>Client accounts</span></div>
        <div><strong>{data?.summary?.activeAccounts || 0}</strong><span>Active accounts</span></div>
        <div className="danger"><strong>{data?.summary?.highRiskAccounts || 0}</strong><span>High retention risk</span></div>
        <div><strong>{data?.summary?.totalActiveProjects || 0}</strong><span>Active projects</span></div>
      </section>

      <div className="client-intelligence-controls">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search client, contact, or lead..." />
        <select value={risk} onChange={(event) => setRisk(event.target.value)}><option value="all">All risk levels</option><option value="high">High risk</option><option value="medium">Medium risk</option><option value="low">Low risk</option></select>
        <span>{accounts.length} account{accounts.length === 1 ? "" : "s"}</span>
      </div>

      <div className="client-intelligence-list">
        {accounts.map((account) => {
          const accountKey = `${account.name}|${account.email}`;
          const isOpen = expanded.has(accountKey);
          return <article key={`${account.name}-${account.email}`} className={`client-intelligence-card risk-${account.retentionRisk} ${isOpen ? "is-expanded" : ""}`}>
            <button type="button" className="client-intelligence-card-header" onClick={() => toggle(accountKey)} aria-expanded={isOpen}>
              <div className="client-account-name"><span className={`client-risk-badge ${account.retentionRisk}`}>{account.retentionRisk} risk</span><h2>{account.name}</h2><small>{account.email || account.phone || "No contact details recorded"}</small></div>
              <div className="client-account-primary"><strong>{account.activeProjectCount}</strong><span>active of {account.projectCount}</span></div>
              <div className="client-account-primary"><strong>{account.averageHealth}</strong><span>average health</span></div>
              <div className="client-account-lead"><span>Primary lead</span><strong>{account.primaryLead?.name || "Unassigned"}</strong></div>
              <span className="client-account-toggle">{isOpen ? "−" : "+"}</span>
            </button>

            <div className="client-account-metrics">
              <div><strong>{metricValue(account.onTimeDeliveryRate, "%")}</strong><span>On-time delivery</span></div>
              <div><strong>{account.billingClearanceRate}%</strong><span>Billing clearance</span></div>
              <div><strong>{account.revisions}</strong><span>Total revisions</span></div>
              <div><strong>{account.feedback?.positive || 0} / {account.feedback?.negative || 0}</strong><span>Positive / negative feedback</span></div>
              <div><strong>{account.atRiskProjectCount}</strong><span>Projects at risk</span></div>
              <div><strong>{formatDate(account.lastProjectAt)}</strong><span>Latest project</span></div>
            </div>

            {account.riskReasons?.length > 0 && <div className="client-risk-reasons"><strong>Why this account needs attention</strong>{account.riskReasons.map((reason) => <span key={reason}>{reason}</span>)}</div>}

            {isOpen && <div className="client-account-projects">
              <div className="client-account-projects-heading"><strong>Project portfolio</strong><span>{account.completedProjectCount} completed</span></div>
              {account.projects.map((project) => <button key={project._id} type="button" className="client-account-project-row" onClick={() => navigate(`/projects/${project._id}`)}>
                <span><strong>{project.orderId || "Order"} · {renderProjectName(project.details, null, "Untitled Project")}</strong><small>{project.status} · {project.lead?.firstName || project.lead?.name || "Unassigned"} {project.lead?.lastName || ""}</small></span>
                <ProjectHealthBadge health={project.health} />
                <b>View</b>
              </button>)}
            </div>}
          </article>;
        })}
        {accounts.length === 0 && <div className="client-intelligence-empty">No client accounts match these filters.</div>}
      </div>
    </div>
  );
};

export default Clients;
