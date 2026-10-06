import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import "./Dashboard.css";
import {
  CheckCircleIcon,
  DeadlineIcon,
  ProjectsIcon,
  ReportsIcon,
  RocketIcon,
} from "../../icons/Icons";
import { getLeadDisplay } from "../../utils/leadDisplay";
import { renderProjectName } from "../../utils/projectName";
import {
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
} from "@client/utils/quoteStatus";

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const AttentionIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <path d="M12 3v8" />
    <path d="M7.4 6.7a8 8 0 1 0 9.2 0" />
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const TruckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <path d="M3 5h11v11H3zM14 9h4l3 3v4h-7z" />
    <circle cx="7" cy="18" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const EMPTY_ADMIN_DASHBOARD_SUMMARY = {
  stats: {
    active: 0,
    pending: 0,
    completed: 0,
    overdue: 0,
    emergencies: 0,
    pendingDelivery: 0,
    quotes: 0,
    corporate: 0,
  },
  projects: { todayCreated: [], recentProjects: [] },
  workload: { leads: [] },
  deadlines: {
    todayProjects: 0,
    todayOrders: 0,
    overdueProjects: 0,
    overdueOrders: 0,
    urgentToday: 0,
    unassignedToday: 0,
    quoteProjectsToday: 0,
    preview: [],
  },
  statusOverview: {
    periods: [
      {
        label: "All Time",
        stats: {
          inProgress: 0,
          completed: 0,
          delayed: 0,
          total: 0,
          pIn: 0,
          pComp: 0,
          pDel: 0,
        },
      },
    ],
  },
  billingAttention: {
    counts: { total: 0, blocked: 0, override_active: 0, delivered_unresolved: 0 },
    projects: [],
  },
};

const PENDING_ACCEPTANCE_STATUSES = new Set([
  "Order Created",
  "Quote Created",
  "Pending Acceptance",
]);

const isQuoteProject = (project) => project?.projectType === "Quote";
const isCorporateProject = (project) => project?.projectType === "Corporate Job";
const isEmergencyProject = (project) =>
  project?.projectType === "Emergency" || project?.priority === "Urgent";

const getProjectStatusDisplay = (project) =>
  isQuoteProject(project)
    ? getQuoteStatusDisplay(
        project?.status || "",
        getQuoteRequirementMode(project?.quoteDetails?.checklist || {}),
      )
    : project?.status || "Unknown status";

const getStatusPillClass = (status) => {
  if (["Completed", "Finished", "Declined"].includes(status)) return "completed";
  if (
    PENDING_ACCEPTANCE_STATUSES.has(status) ||
    status === "Pending Scope Approval" ||
    status === "Pending Feedback"
  ) {
    return "pending";
  }
  return "active";
};

const getProjectTypeLabel = (project) => {
  if (isEmergencyProject(project)) return "Emergency";
  if (isCorporateProject(project)) return "Corporate";
  if (isQuoteProject(project)) return "Quote";
  return project?.projectType || "Standard";
};

const getProjectTypeClass = (project) => {
  if (isEmergencyProject(project)) return "emergency";
  if (isCorporateProject(project)) return "corporate";
  if (isQuoteProject(project)) return "quote";
  return "standard";
};

const getProjectName = (project) =>
  renderProjectName(project?.details, null, "Untitled Project");

const getBillingActionLabel = (project) => {
  if (project?.category === "delivered_unresolved") return "Verify billing";
  if (project?.category === "override_active") return "Review override";
  return "Resolve issue";
};

const getProjectClient = (project) =>
  project?.details?.client ||
  project?.orderRef?.client ||
  project?.details?.clientName ||
  "Unknown client";

const getOrderLabel = (project) => {
  const orderId =
    project?.orderId ||
    project?.orderRef?.orderNumber ||
    project?._id?.slice(-6)?.toUpperCase() ||
    "Order";
  return String(orderId).startsWith("#") ? orderId : `#${orderId}`;
};

const getInitials = (name) =>
  String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "--";

const formatShortDate = (value) => {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Africa/Accra",
  });
};

const formatDeadlineTime = (deadline) => deadline?.deliveryTime || "End of day";

const getGreeting = () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Africa/Accra",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const DashboardMetricCard = ({ metric, onOpen }) => (
  <button
    type="button"
    className={`dashboard-metric-card tone-${metric.tone}`}
    onClick={onOpen}
    aria-label={`${metric.label}: ${metric.value}. ${metric.actionLabel}`}
  >
    <div className="dashboard-metric-heading">
      <span className="dashboard-metric-icon">{metric.icon}</span>
      <span>
        <small>{metric.label}</small>
        <em>{metric.context}</em>
      </span>
      <ChevronRightIcon />
    </div>
    <div className="dashboard-metric-value">{metric.value}</div>
    <div className="dashboard-metric-detail">
      <span>{metric.detail}</span>
      <strong>{metric.actionLabel}</strong>
    </div>
    <div className="dashboard-metric-track" aria-hidden="true">
      <span style={{ width: `${metric.progress}%` }} />
    </div>
  </button>
);

const ProjectStatusOverview = ({ overview }) => {
  const periods = useMemo(() => {
    const available = Array.isArray(overview?.periods) ? overview.periods : [];
    return available.length
      ? available
      : EMPTY_ADMIN_DASHBOARD_SUMMARY.statusOverview.periods;
  }, [overview]);
  const [selectedPeriod, setSelectedPeriod] = useState("All Time");
  const selected =
    periods.find((period) => period.label === selectedPeriod) || periods[0];
  const stats =
    selected?.stats ||
    EMPTY_ADMIN_DASHBOARD_SUMMARY.statusOverview.periods[0].stats;
  const completeEnd = Math.max(0, Math.min(100, Number(stats.pComp) || 0));
  const progressEnd = Math.max(
    completeEnd,
    Math.min(100, completeEnd + (Number(stats.pIn) || 0)),
  );

  return (
    <section className="dashboard-panel dashboard-health-card">
      <div className="dashboard-panel-header">
        <div>
          <h2>Portfolio Health</h2>
          <p>Real project status distribution</p>
        </div>
        <label className="dashboard-period-select">
          <span className="sr-only">Status period</span>
          <select
            value={selected?.label || "All Time"}
            onChange={(event) => setSelectedPeriod(event.target.value)}
          >
            {periods.map((period) => (
              <option key={period.label} value={period.label}>
                {period.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="dashboard-health-body">
        <div
          className={`dashboard-health-ring ${stats.total ? "" : "is-empty"}`}
          style={{
            "--completion-end": `${completeEnd}%`,
            "--progress-end": `${progressEnd}%`,
          }}
        >
          <div>
            <strong>{stats.pComp || 0}%</strong>
            <span>completed</span>
            <small>{stats.total || 0} total</small>
          </div>
        </div>
      </div>

      <div className="dashboard-health-legend">
        <div><i className="completed" /><strong>{stats.completed || 0}</strong><span>Completed</span></div>
        <div><i className="progress" /><strong>{stats.inProgress || 0}</strong><span>In progress</span></div>
        <div><i className="delayed" /><strong>{stats.delayed || 0}</strong><span>Delayed</span></div>
      </div>
    </section>
  );
};

const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [projectView, setProjectView] = useState("recent");
  const {
    data: dashboardSummary = EMPTY_ADMIN_DASHBOARD_SUMMARY,
    isPending: isLoading,
  } = useQuery({
    queryKey: ["projects", "dashboard-summary", "admin"],
    queryFn: async () => {
      const response = await fetch("/api/projects/dashboard-summary?source=admin", {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to fetch admin dashboard summary.");
      const payload = await response.json();
      return {
        ...EMPTY_ADMIN_DASHBOARD_SUMMARY,
        ...(payload || {}),
        stats: { ...EMPTY_ADMIN_DASHBOARD_SUMMARY.stats, ...(payload?.stats || {}) },
        projects: {
          ...EMPTY_ADMIN_DASHBOARD_SUMMARY.projects,
          ...(payload?.projects || {}),
        },
        workload: {
          ...EMPTY_ADMIN_DASHBOARD_SUMMARY.workload,
          ...(payload?.workload || {}),
        },
        deadlines: {
          ...EMPTY_ADMIN_DASHBOARD_SUMMARY.deadlines,
          ...(payload?.deadlines || {}),
        },
        billingAttention: {
          ...EMPTY_ADMIN_DASHBOARD_SUMMARY.billingAttention,
          ...(payload?.billingAttention || {}),
          counts: {
            ...EMPTY_ADMIN_DASHBOARD_SUMMARY.billingAttention.counts,
            ...(payload?.billingAttention?.counts || {}),
          },
        },
      };
    },
    meta: { realtimePaths: ["/api/projects"] },
  });

  const stats = dashboardSummary.stats;
  const deadlineSummary = dashboardSummary.deadlines;
  const recentProjects = Array.isArray(dashboardSummary.projects?.recentProjects)
    ? dashboardSummary.projects.recentProjects
    : [];
  const todayProjects = Array.isArray(dashboardSummary.projects?.todayCreated)
    ? dashboardSummary.projects.todayCreated
    : [];
  const todayDeadlines = Array.isArray(deadlineSummary?.preview)
    ? deadlineSummary.preview
    : [];
  const leadWorkload = Array.isArray(dashboardSummary.workload?.leads)
    ? dashboardSummary.workload.leads
    : [];
  const billingCounts = dashboardSummary.billingAttention?.counts || {};
  const billingProjects = Array.isArray(dashboardSummary.billingAttention?.projects)
    ? dashboardSummary.billingAttention.projects
    : [];

  const portfolioTotal = Number(stats.active) + Number(stats.completed) || 0;
  const completedPercent = portfolioTotal
    ? Math.round((Number(stats.completed) / portfolioTotal) * 100)
    : 0;
  const activePercent = portfolioTotal
    ? Math.round((Number(stats.active) / portfolioTotal) * 100)
    : 0;
  const quoteShare = stats.active
    ? Math.min(100, Math.round((Number(stats.quotes) / Number(stats.active)) * 100))
    : 0;
  const deadlineLoad =
    Number(deadlineSummary.todayOrders) + Number(deadlineSummary.overdueOrders);
  const todayDeadlinePercent = deadlineLoad
    ? Math.round((Number(deadlineSummary.todayOrders) / deadlineLoad) * 100)
    : 0;

  const metrics = [
    {
      key: "active",
      label: "Active Projects",
      value: stats.active,
      context: `${stats.pending} pending acceptance`,
      detail: `${stats.overdue} critical or overdue`,
      actionLabel: "View projects",
      tone: "indigo",
      progress: activePercent,
      icon: <ProjectsIcon />,
      onOpen: () => navigate("/projects?status=active"),
    },
    {
      key: "quotes",
      label: "Quote Pipeline",
      value: stats.quotes,
      context: "Open quote projects",
      detail: `${stats.corporate} corporate projects`,
      actionLabel: "Open quotes",
      tone: "emerald",
      progress: quoteShare,
      icon: <ReportsIcon />,
      onOpen: () => navigate("/projects?status=quote"),
    },
    {
      key: "deliveries",
      label: "Deliveries Today",
      value: deadlineSummary.todayOrders,
      context: `${deadlineSummary.todayProjects} projects due`,
      detail: `${deadlineSummary.urgentToday} urgent today`,
      actionLabel: "View schedule",
      tone: "amber",
      progress: todayDeadlinePercent,
      icon: <TruckIcon />,
      onOpen: () => navigate("/deadlines?scope=today"),
    },
    {
      key: "completed",
      label: "Completed Projects",
      value: stats.completed,
      context: `${completedPercent}% of recorded portfolio`,
      detail: `${portfolioTotal} projects tracked`,
      actionLabel: "View archive",
      tone: "green",
      progress: completedPercent,
      icon: <CheckCircleIcon />,
      onOpen: () => navigate("/projects?status=completed"),
    },
  ];

  const attentionSignals = [
    {
      key: "overdue",
      value: Number(stats.overdue) || 0,
      label: "critical / overdue",
      onOpen: () => navigate("/projects?status=critical"),
    },
    {
      key: "emergencies",
      value: Number(stats.emergencies) || 0,
      label: "emergency projects",
      onOpen: () => navigate("/projects?status=emergency"),
    },
    {
      key: "billing",
      value: Number(billingCounts.total) || 0,
      label: "billing exceptions",
      onOpen: () =>
        billingProjects[0]
          ? navigate(`/projects/${billingProjects[0]._id}`)
          : navigate("/billing-documents"),
    },
    {
      key: "delivery",
      value: Number(stats.pendingDelivery) || 0,
      label: "pending delivery",
      onOpen: () => navigate("/projects?status=delivery"),
    },
  ];
  const attentionTotal = attentionSignals.reduce((sum, item) => sum + item.value, 0);
  const visibleProjects = projectView === "today" ? todayProjects : recentProjects;
  const firstName =
    user?.firstName || String(user?.name || "Admin").trim().split(/\s+/)[0] || "Admin";
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "Africa/Accra",
  });

  if (isLoading) {
    return (
      <div className="dashboard-loading" role="status">
        <span />
        <strong>Loading your operational overview...</strong>
      </div>
    );
  }

  return (
    <div className="admin-dashboard-container">
      <section className="dashboard-welcome">
        <div>
          <span className="dashboard-date-label">{todayLabel}</span>
          <h1>
            {getGreeting()}, {firstName} <span aria-hidden="true">✨</span>
          </h1>
          <p>
            Here is the current picture across {stats.active} active projects and{" "}
            {deadlineSummary.todayOrders} orders due today.
          </p>
        </div>
        <div className="dashboard-welcome-actions">
          <button type="button" onClick={() => navigate("/deadlines?scope=today")}>
            <DeadlineIcon /> Today&apos;s schedule
          </button>
          <button type="button" className="primary" onClick={() => navigate("/projects")}>
            View all projects <ChevronRightIcon />
          </button>
        </div>
      </section>

      <section
        className={`dashboard-attention ${attentionTotal ? "has-alerts" : "is-clear"}`}
        aria-label="Immediate attention"
      >
        <div className="dashboard-attention-title">
          <span className="dashboard-attention-icon">
            {attentionTotal ? <AttentionIcon /> : <CheckCircleIcon />}
          </span>
          <div>
            <div className="dashboard-attention-heading">
              <h2>{attentionTotal ? "Immediate Attention Required" : "No Immediate Exceptions"}</h2>
              <span>{attentionTotal} bottlenecks flagged</span>
            </div>
            <div className="dashboard-attention-signals">
              {attentionSignals.map((signal) => (
                <button type="button" key={signal.key} onClick={signal.onOpen}>
                  <strong>{signal.value}</strong>
                  <span>{signal.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {billingProjects.length > 0 && (
          <div className="dashboard-attention-projects">
            {billingProjects.slice(0, 2).map((project) => (
              <button
                type="button"
                key={project._id}
                onClick={() => navigate(`/projects/${project._id}`)}
              >
                <span className="dashboard-attention-project-copy">
                  <strong>
                    {getOrderLabel(project)} · {getProjectName(project)}
                  </strong>
                  <small>
                    {(project.missingLabels || []).join(", ") || "Billing review required"}
                  </small>
                </span>
                <span className="dashboard-attention-project-action">
                  {getBillingActionLabel(project)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-metrics" aria-label="Operational metrics">
        {metrics.map((metric) => (
          <DashboardMetricCard
            key={metric.key}
            metric={metric}
            onOpen={metric.onOpen}
          />
        ))}
      </section>

      <div className="dashboard-content-grid">
        <div className="dashboard-content-main">
          <section className="dashboard-panel dashboard-commitments">
            <div className="dashboard-panel-header">
              <div>
                <h2>Delivery &amp; Quote Commitments</h2>
                <p>Real commitments scheduled for today</p>
              </div>
              <button type="button" className="dashboard-text-action" onClick={() => navigate("/deadlines?scope=today")}>
                <span>{deadlineSummary.todayOrders} due</span> View schedule
              </button>
            </div>

            <div className="dashboard-commitment-list">
              {todayDeadlines.length > 0 ? (
                todayDeadlines.map((deadline) => (
                  <button
                    type="button"
                    key={deadline.projectId}
                    className={deadline.isOverdue ? "overdue" : deadline.isUrgent ? "urgent" : ""}
                    onClick={() => navigate(`/projects/${deadline.projectId}`)}
                  >
                    <span className="dashboard-commitment-time">
                      {formatDeadlineTime(deadline)}
                    </span>
                    <span className="dashboard-commitment-project">
                      <strong>{deadline.orderId || "Order"} / {deadline.projectName}</strong>
                      <small>{deadline.client}</small>
                    </span>
                    <span className={`dashboard-type-pill ${deadline.projectType === "Quote" ? "quote" : ""}`}>
                      {deadline.projectType || "Standard"}
                    </span>
                    <span className="dashboard-commitment-lead">
                      <i>{getInitials(deadline.projectLeadName)}</i>
                      <span>{deadline.projectLeadName || "Unassigned"}</span>
                    </span>
                    <ChevronRightIcon />
                  </button>
                ))
              ) : (
                <div className="dashboard-empty-state compact">
                  <DeadlineIcon />
                  <div>
                    <strong>No active commitments today</strong>
                    <span>Today&apos;s delivery and quote commitments will appear here.</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="dashboard-panel dashboard-projects-panel">
            <div className="dashboard-panel-header dashboard-projects-header">
              <div>
                <h2>Recent Projects &amp; Orders</h2>
                <p>Live project records from the Admin portfolio</p>
              </div>
              <div className="dashboard-project-tabs" role="group" aria-label="Project list view">
                <button
                  type="button"
                  className={projectView === "recent" ? "active" : ""}
                  onClick={() => setProjectView("recent")}
                >
                  Recent <span>{recentProjects.length}</span>
                </button>
                <button
                  type="button"
                  className={projectView === "today" ? "active" : ""}
                  onClick={() => setProjectView("today")}
                >
                  Created today <span>{todayProjects.length}</span>
                </button>
              </div>
            </div>

            <div className="dashboard-project-table">
              <div className="dashboard-project-table-head" aria-hidden="true">
                <span>Project details</span>
                <span>Status</span>
                <span>Type / created</span>
                <span>Lead</span>
                <span />
              </div>
              {visibleProjects.length > 0 ? (
                visibleProjects.map((project) => {
                  const status = getProjectStatusDisplay(project);
                  return (
                    <button
                      type="button"
                      key={project._id}
                      className="dashboard-project-row"
                      onClick={() => navigate(`/projects/${project._id}`)}
                    >
                      <span className="dashboard-project-primary">
                        <strong>{getProjectName(project)}</strong>
                        <small>{getOrderLabel(project)} / {getProjectClient(project)}</small>
                      </span>
                      <span className={`dashboard-status-pill ${getStatusPillClass(status)}`}>
                        {status}
                      </span>
                      <span className="dashboard-project-type-date">
                        <strong className={getProjectTypeClass(project)}>{getProjectTypeLabel(project)}</strong>
                        <small>{formatShortDate(project.createdAt || project.orderDate)}</small>
                      </span>
                      <span className="dashboard-project-lead">
                        {getLeadDisplay(project, "Unassigned")}
                      </span>
                      <ChevronRightIcon />
                    </button>
                  );
                })
              ) : (
                <div className="dashboard-empty-state">
                  <ProjectsIcon />
                  <div>
                    <strong>{projectView === "today" ? "No projects created today" : "No recent projects"}</strong>
                    <span>Project activity will appear here when records are available.</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="dashboard-content-side">
          <ProjectStatusOverview overview={dashboardSummary.statusOverview} />

          <section className="dashboard-panel dashboard-workload-card">
            <div className="dashboard-panel-header">
              <div>
                <h2>Team Workload</h2>
                <p>Share of active projects by lead</p>
              </div>
              <button type="button" className="dashboard-text-action" onClick={() => navigate("/teams")}>
                View team
              </button>
            </div>

            <div className="dashboard-workload-list">
              {leadWorkload.length > 0 ? (
                leadWorkload.map((row, index) => {
                  const leadName = row.leadName || "Unassigned";
                  const count = Number(row.count) || 0;
                  const percentage = Number(row.percentage) || 0;
                  return (
                    <div className="dashboard-workload-row" key={`${leadName}-${index}`}>
                      <div className="dashboard-workload-person">
                        <i>{getInitials(leadName)}</i>
                        <strong>{leadName}</strong>
                        <span>{count} {count === 1 ? "project" : "projects"}</span>
                        <em>{percentage}%</em>
                      </div>
                      <div className="dashboard-workload-track">
                        <span style={{ width: `${Math.max(2, percentage)}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="dashboard-empty-state compact">
                  <ProjectsIcon />
                  <div>
                    <strong>No active workload data</strong>
                    <span>Lead distribution will appear when projects are assigned.</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="dashboard-insight-card">
            <span><RocketIcon /></span>
            <div>
              <strong>Operational snapshot</strong>
              <p>
                {leadWorkload.length
                  ? `${leadWorkload[0]?.leadName || "The leading assignee"} currently holds the largest share of active work at ${leadWorkload[0]?.percentage || 0}%.`
                  : "Assign project leads to unlock workload distribution insights."}
              </p>
              <button type="button" onClick={() => navigate("/teams")}>Review assignments</button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default Dashboard;
