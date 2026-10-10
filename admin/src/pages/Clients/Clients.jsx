import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import ProjectHealthBadge from "@client/components/ui/ProjectHealthBadge";
import usePersistedState from "@client/hooks/usePersistedState";
import { renderProjectName } from "../../utils/projectName";
import "./Clients.css";

const PAGE_SIZE = 8;
const RISK_ORDER = { high: 0, medium: 1, low: 2 };

const formatDate = (value) => {
  if (!value) return "No project date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No project date"
    : date.toLocaleDateString("en-GB", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

const metricValue = (value, suffix = "") =>
  value === null || value === undefined ? "Not enough data" : `${value}${suffix}`;

const getInitials = (value) =>
  String(value || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

const getRiskProject = (account) => {
  const projects = Array.isArray(account?.projects) ? account.projects : [];
  return (
    projects.find((project) => project?.health?.level === "critical") ||
    projects.find((project) => project?.health?.level === "at_risk") ||
    projects[0] ||
    null
  );
};

const PortfolioIcon = ({ type }) => {
  const paths = {
    accounts: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    active: <><path d="M6 20v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3" /><circle cx="12" cy="7" r="3" /></>,
    risk: <><path d="M12 3 3.8 18h16.4L12 3Z" /><path d="M12 9v4m0 3h.01" /></>,
    projects: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 3h6v3H9zM9 10h6M9 14h6" /></>,
    health: <><path d="M4 12h4l2-5 4 10 2-5h4" /><path d="M5 5h14v14H5z" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      {paths[type] || paths.accounts}
    </svg>
  );
};

const Clients = () => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(new Set());
  const [search, setSearch] = usePersistedState(
    "admin-client-intelligence-search",
    "",
  );
  const [risk, setRisk] = usePersistedState(
    "admin-client-intelligence-risk",
    "all",
    {
      sanitize: (value) =>
        ["all", "high", "medium", "low"].includes(value) ? value : "all",
    },
  );
  const [leadFilter, setLeadFilter] = usePersistedState(
    "admin-client-intelligence-lead",
    "all",
  );
  const [sortMode, setSortMode] = usePersistedState(
    "admin-client-intelligence-sort",
    "risk",
  );
  const [viewMode, setViewMode] = useState("grid");
  const [page, setPage] = useState(1);

  const { data, isPending, error, isFetching, refetch } = useQuery({
    queryKey: ["projects", "client-intelligence", "admin"],
    queryFn: async () => {
      const response = await fetch(
        "/api/projects/client-intelligence?source=admin",
        { credentials: "include", cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error("Failed to load client account intelligence.");
      }
      return response.json();
    },
    meta: { realtimePaths: ["/api/projects"] },
  });

  const allAccounts = useMemo(
    () => (Array.isArray(data?.accounts) ? data.accounts : []),
    [data],
  );

  const riskCounts = useMemo(
    () =>
      allAccounts.reduce(
        (counts, account) => {
          const key = account?.retentionRisk || "low";
          counts[key] = (counts[key] || 0) + 1;
          return counts;
        },
        { high: 0, medium: 0, low: 0 },
      ),
    [allAccounts],
  );

  const leadOptions = useMemo(() => {
    const leads = new Map();
    allAccounts.forEach((account) => {
      const lead = account?.primaryLead;
      if (!lead?._id) return;
      leads.set(String(lead._id), lead.name || "Unknown lead");
    });
    return Array.from(leads.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [allAccounts]);

  const accounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allAccounts
      .filter((account) => {
        if (risk !== "all" && account.retentionRisk !== risk) return false;
        if (
          leadFilter !== "all" &&
          String(account?.primaryLead?._id || "") !== leadFilter
        ) {
          return false;
        }
        if (!query) return true;
        return [
          account.name,
          account.email,
          account.phone,
          account.primaryLead?.name,
          ...(account.riskReasons || []),
        ].some((value) => String(value || "").toLowerCase().includes(query));
      })
      .sort((left, right) => {
        if (sortMode === "health") {
          return left.averageHealth - right.averageHealth;
        }
        if (sortMode === "activity") {
          return right.activeProjectCount - left.activeProjectCount;
        }
        if (sortMode === "name") return left.name.localeCompare(right.name);
        return (
          RISK_ORDER[left.retentionRisk] - RISK_ORDER[right.retentionRisk] ||
          right.atRiskProjectCount - left.atRiskProjectCount ||
          right.activeProjectCount - left.activeProjectCount
        );
      });
  }, [allAccounts, leadFilter, risk, search, sortMode]);

  const activeHealthAccounts = allAccounts.filter(
    (account) => account.activeProjectCount > 0,
  );
  const portfolioHealth = activeHealthAccounts.length
    ? Math.round(
        activeHealthAccounts.reduce(
          (sum, account) => sum + (Number(account.averageHealth) || 0),
          0,
        ) / activeHealthAccounts.length,
      )
    : 100;
  const riskLoad = allAccounts.length
    ? Math.round(
        ((riskCounts.high + riskCounts.medium) / allAccounts.length) * 100,
      )
    : 0;
  const utilization = allAccounts.length
    ? Math.round(
        ((data?.summary?.activeAccounts || 0) / allAccounts.length) * 100,
      )
    : 0;

  const riskDrivers = useMemo(() => {
    const drivers = [
      {
        label: "Project health",
        count: allAccounts.filter((account) => account.atRiskProjectCount > 0)
          .length,
        tone: "danger",
      },
      {
        label: "Billing overrides",
        count: allAccounts.filter((account) => account.billingExceptions > 0)
          .length,
        tone: "warning",
      },
      {
        label: "Delivery reliability",
        count: allAccounts.filter(
          (account) =>
            account.onTimeDeliveryRate !== null &&
            account.onTimeDeliveryRate < 70,
        ).length,
        tone: "primary",
      },
      {
        label: "Negative feedback",
        count: allAccounts.filter((account) => account.feedback?.negative > 0)
          .length,
        tone: "neutral",
      },
    ];
    const total = drivers.reduce((sum, driver) => sum + driver.count, 0);
    return drivers.map((driver) => ({
      ...driver,
      percentage: total ? Math.round((driver.count / total) * 100) : 0,
    }));
  }, [allAccounts]);

  const leadLoad = useMemo(() => {
    const leads = new Map();
    allAccounts.forEach((account) => {
      const lead = account?.primaryLead;
      if (!lead?._id) return;
      const key = String(lead._id);
      const bucket = leads.get(key) || {
        id: key,
        name: lead.name || "Unknown lead",
        accounts: 0,
        highRisk: 0,
        healthTotal: 0,
      };
      bucket.accounts += 1;
      bucket.healthTotal += Number(account.averageHealth) || 0;
      if (account.retentionRisk === "high") bucket.highRisk += 1;
      leads.set(key, bucket);
    });
    return Array.from(leads.values())
      .map((lead) => ({
        ...lead,
        averageHealth: lead.accounts
          ? Math.round(lead.healthTotal / lead.accounts)
          : 0,
      }))
      .sort(
        (left, right) =>
          right.highRisk - left.highRisk || right.accounts - left.accounts,
      );
  }, [allAccounts]);

  const totalPages = Math.max(1, Math.ceil(accounts.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleAccounts = accounts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const toggle = (name) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const exportRiskDossier = () => {
    const rows = accounts.map((account) => [
      account.name,
      account.email || "",
      account.phone || "",
      account.retentionRisk,
      account.averageHealth,
      account.projectCount,
      account.activeProjectCount,
      account.atRiskProjectCount,
      account.onTimeDeliveryRate ?? "",
      account.billingClearanceRate,
      account.billingExceptions,
      account.revisions,
      account.feedback?.positive || 0,
      account.feedback?.negative || 0,
      account.primaryLead?.name || "Unassigned",
      (account.riskReasons || []).join("; "),
    ]);
    const csv = [
      [
        "Client", "Email", "Phone", "Retention Risk", "Average Health",
        "Total Projects", "Active Projects", "Projects At Risk",
        "On-Time Delivery", "Billing Clearance", "Billing Overrides",
        "Revisions", "Positive Feedback", "Negative Feedback", "Primary Lead",
        "Risk Reasons",
      ],
      ...rows,
    ]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `client-risk-dossier-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (isPending) {
    return <div className="client-intelligence-state">Loading client intelligence…</div>;
  }
  if (error) {
    return <div className="client-intelligence-state error">{error.message}</div>;
  }

  const summaryCards = [
    {
      icon: "accounts",
      tone: "indigo",
      label: "Total accounts",
      value: data?.summary?.accounts || 0,
      meta: `${riskCounts.low} stable`,
      detail: "Unique client portfolios",
      progress: 100,
    },
    {
      icon: "active",
      tone: "violet",
      label: "Active accounts",
      value: data?.summary?.activeAccounts || 0,
      meta: `${utilization}% active`,
      detail: "Accounts with live projects",
      progress: utilization,
    },
    {
      icon: "risk",
      tone: "danger",
      label: "High retention risk",
      value: data?.summary?.highRiskAccounts || 0,
      meta: `${riskLoad}% risk load`,
      detail: `${riskCounts.medium} additional ${riskCounts.medium === 1 ? "account" : "accounts"} to watch`,
      progress: allAccounts.length
        ? (riskCounts.high / allAccounts.length) * 100
        : 0,
    },
    {
      icon: "projects",
      tone: "blue",
      label: "Active projects",
      value: data?.summary?.totalActiveProjects || 0,
      meta: `${allAccounts.reduce((sum, account) => sum + account.atRiskProjectCount, 0)} at risk`,
      detail: "Across current client accounts",
      progress: data?.summary?.totalActiveProjects
        ? (allAccounts.reduce((sum, account) => sum + account.atRiskProjectCount, 0) /
            data.summary.totalActiveProjects) *
          100
        : 0,
    },
    {
      icon: "health",
      tone: "green",
      label: "Portfolio health",
      value: `${portfolioHealth}/100`,
      meta: portfolioHealth >= 70 ? "Stable" : "Needs attention",
      detail: "Average active-account health",
      progress: portfolioHealth,
    },
  ];

  return (
    <div className="client-intelligence-page">
      <header className="client-intelligence-hero">
        <div>
          <span>Operations Core / Portfolio Intelligence</span>
          <h1>Client Account Intelligence</h1>
          <p>Portfolio relationship health, delivery reliability, billing behavior, feedback velocity, and retention exposure in real time.</p>
        </div>
        <div className="client-intelligence-hero-actions">
          <button type="button" onClick={exportRiskDossier} disabled={!accounts.length}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg>
            Export risk dossier
          </button>
          <button type="button" className="primary" onClick={() => navigate("/projects")}>Review project portfolio</button>
        </div>
      </header>

      <section className="client-methodology-banner">
        <span><PortfolioIcon type="health" /></span>
        <p><strong>Dynamic retention-risk model:</strong> calculated from active project health, delivery reliability below 70%, billing overrides, and negative client feedback.</p>
        <em>Updated {formatDate(data?.generatedAt)}</em>
      </section>

      <section className="client-intelligence-summary" aria-label="Portfolio summary">
        {summaryCards.map((card) => (
          <article className={`client-summary-card ${card.tone}`} key={card.label}>
            <span className="client-summary-icon"><PortfolioIcon type={card.icon} /></span>
            <span className="client-summary-meta">{card.meta}</span>
            <small>{card.label}</small>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
            <div><span style={{ width: `${Math.max(0, Math.min(100, card.progress))}%` }} /></div>
          </article>
        ))}
      </section>

      <section className="client-intelligence-controls">
        <div className="client-control-row">
          <label className="client-search-field"><span>Search</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Client account, contact, telephone, lead…" /></label>
          <label><span>Account lead</span><select value={leadFilter} onChange={(event) => { setLeadFilter(event.target.value); setPage(1); }}><option value="all">All account leads</option>{leadOptions.map((lead) => <option value={lead.id} key={lead.id}>{lead.name}</option>)}</select></label>
          <label><span>Sort</span><select value={sortMode} onChange={(event) => { setSortMode(event.target.value); setPage(1); }}><option value="risk">Highest risk first</option><option value="health">Lowest health first</option><option value="activity">Most active projects</option><option value="name">Account name</option></select></label>
          <div className="client-view-toggle" aria-label="View style"><button type="button" className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")} aria-label="Grid view">▦</button><button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} aria-label="List view">☰</button></div>
          <button type="button" className="client-refresh-button" onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Refreshing…" : "Refresh"}</button>
        </div>
        <nav className="client-risk-tabs" aria-label="Retention risk filters">
          <button type="button" className={risk === "all" ? "active" : ""} onClick={() => { setRisk("all"); setPage(1); }}>All risk levels <span>{allAccounts.length}</span></button>
          <button type="button" className={`high ${risk === "high" ? "active" : ""}`} onClick={() => { setRisk("high"); setPage(1); }}>High risk <span>{riskCounts.high}</span></button>
          <button type="button" className={risk === "medium" ? "active" : ""} onClick={() => { setRisk("medium"); setPage(1); }}>Medium risk <span>{riskCounts.medium}</span></button>
          <button type="button" className={risk === "low" ? "active" : ""} onClick={() => { setRisk("low"); setPage(1); }}>Healthy stability <span>{riskCounts.low}</span></button>
          <em>Showing {visibleAccounts.length} of {accounts.length} matching accounts</em>
        </nav>
      </section>

      <div className={`client-intelligence-list ${viewMode}`}>
        {visibleAccounts.map((account) => {
          const accountKey = `${account.name}|${account.email}`;
          const isOpen = expanded.has(accountKey);
          const riskProject = getRiskProject(account);
          const activeRiskImpact = account.activeProjectCount
            ? Math.round((account.atRiskProjectCount / account.activeProjectCount) * 100)
            : 0;
          return (
            <article key={accountKey} className={`client-intelligence-card risk-${account.retentionRisk} ${isOpen ? "is-expanded" : ""}`}>
              <header className="client-intelligence-card-header">
                <div className="client-account-name">
                  <span className={`client-risk-badge ${account.retentionRisk}`}>{account.retentionRisk} retention risk</span>
                  <h2>{account.name}</h2>
                  <small>{account.email || account.phone || "No contact details recorded"}</small>
                </div>
                <button type="button" onClick={() => toggle(accountKey)} aria-expanded={isOpen} aria-label={`${isOpen ? "Collapse" : "Expand"} ${account.name}`}>{isOpen ? "−" : "+"}</button>
              </header>

              <section className="client-account-signal">
                <div className={`client-health-score ${account.retentionRisk}`}><strong>{account.averageHealth}</strong><span>/100</span></div>
                <div><strong>{account.riskReasons?.[0] || "Stable account signals"}</strong><span>{account.activeProjectCount} active of {account.projectCount} lifetime projects</span></div>
                <div className="client-account-lead"><span className="client-lead-avatar">{getInitials(account.primaryLead?.name)}</span><span><strong>{account.primaryLead?.name || "Unassigned"}</strong><small>Primary account lead</small></span></div>
              </section>

              <section className="client-account-metrics">
                <div className={account.onTimeDeliveryRate !== null && account.onTimeDeliveryRate < 70 ? "danger" : ""}><span>On-time delivery</span><strong>{metricValue(account.onTimeDeliveryRate, "%")}</strong><small>{account.onTimeDeliveryRate === null ? "No completed delivery data" : "Measured completed deliveries"}</small></div>
                <div className={account.billingClearanceRate < 50 ? "danger" : "success"}><span>Billing clearance</span><strong>{account.billingClearanceRate}%</strong><small>{account.billingExceptions} override{account.billingExceptions === 1 ? "" : "s"} recorded</small></div>
                <div><span>Total revisions</span><strong>{account.revisions}</strong><small>Across the account portfolio</small></div>
                <div><span>Feedback velocity</span><strong>{account.feedback?.positive || 0} / {account.feedback?.negative || 0}</strong><small>Positive / negative records</small></div>
                <div className={account.atRiskProjectCount ? "danger" : "success"}><span>Projects at risk</span><strong>{account.atRiskProjectCount}</strong><small>{activeRiskImpact}% of active projects</small></div>
                <div><span>Latest project</span><strong>{formatDate(account.lastProjectAt)}</strong><small>{account.activeProjectCount ? "Active account cycle" : "No active projects"}</small></div>
              </section>

              <footer className="client-card-footer">
                <div>{account.riskReasons?.length ? account.riskReasons.map((reason) => <span key={reason}>{reason}</span>) : <span className="healthy">No current retention warnings</span>}</div>
                <div><button type="button" onClick={() => toggle(accountKey)}>{isOpen ? "Hide projects" : "Review projects"}</button>{riskProject && <button type="button" className="primary" onClick={() => navigate(`/projects/${riskProject._id}`)}>Open priority project</button>}</div>
              </footer>

              {isOpen && (
                <section className="client-account-projects">
                  <div className="client-account-projects-heading"><strong>Project portfolio</strong><span>{account.completedProjectCount} completed · {account.activeProjectCount} active</span></div>
                  {account.projects.map((project) => (
                    <button key={project._id} type="button" className="client-account-project-row" onClick={() => navigate(`/projects/${project._id}`)}>
                      <span><strong>{project.orderId || "Order"} · {renderProjectName(project.details, null, "Untitled Project")}</strong><small>{project.status} · {project.lead?.firstName || project.lead?.name || "Unassigned"} {project.lead?.lastName || ""}</small></span>
                      <ProjectHealthBadge health={project.health} />
                      <b>View</b>
                    </button>
                  ))}
                </section>
              )}
            </article>
          );
        })}
        {!accounts.length && <div className="client-intelligence-empty"><strong>No client accounts match these filters.</strong><span>Try another lead, risk level, or search term.</span></div>}
      </div>

      {accounts.length > PAGE_SIZE && (
        <nav className="client-pagination" aria-label="Client account pages"><button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>Previous</button><span>Page {currentPage} of {totalPages}</span><button type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>Next</button></nav>
      )}

      <section className="client-insights-grid">
        <article className="client-risk-driver-panel">
          <header><div><span>Portfolio diagnostics</span><h2>Retention Risk Drivers</h2></div><small>{riskCounts.high + riskCounts.medium} exposed accounts</small></header>
          <p>Current account exposure grouped by the real signals used by the retention-risk model.</p>
          <div className="client-driver-track">{riskDrivers.map((driver) => <span className={driver.tone} style={{ width: `${driver.percentage}%` }} key={driver.label} />)}</div>
          <div className="client-driver-legend">{riskDrivers.map((driver) => <button type="button" key={driver.label} onClick={() => { setSearch(driver.label === "Project health" ? "at risk" : driver.label.split(" ")[0]); setPage(1); }}><i className={driver.tone} /><span><strong>{driver.percentage}%</strong>{driver.label}<small>{driver.count} account{driver.count === 1 ? "" : "s"}</small></span></button>)}</div>
        </article>

        <article className="client-lead-load-panel">
          <header><div><span>Relationship ownership</span><h2>Account Lead Risk Load</h2></div><small>{leadLoad.length} leads</small></header>
          <div>{leadLoad.slice(0, 6).map((lead) => <button type="button" key={lead.id} onClick={() => { setLeadFilter(lead.id); setPage(1); }}><span className="client-lead-avatar">{getInitials(lead.name)}</span><span><strong>{lead.name}</strong><small>{lead.accounts} account{lead.accounts === 1 ? "" : "s"} · {lead.highRisk} high risk</small></span><em className={lead.averageHealth < 50 ? "danger" : lead.averageHealth < 70 ? "warning" : "success"}>{lead.averageHealth}/100</em></button>)}{!leadLoad.length && <p>No assigned account leads.</p>}</div>
        </article>
      </section>
    </div>
  );
};

export default Clients;
