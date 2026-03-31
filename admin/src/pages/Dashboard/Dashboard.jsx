import React, { useState, useEffect, useMemo } from "react";
import "./Dashboard.css";
import {
  ProjectsIcon,
  CheckCircleIcon,
  RocketIcon,
  ReportsIcon,
} from "../../icons/Icons";
import { useNavigate } from "react-router-dom";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay } from "../../utils/leadDisplay";
import { renderProjectName } from "../../utils/projectName";
import { getQuoteStatusDisplay } from "@client/utils/quoteStatus";

// Inline Icons for those not in Icons.jsx
const ClockIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const AlertTriangleIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

const TruckIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="1" y="3" width="15" height="13"></rect>
    <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
    <circle cx="5.5" cy="18.5" r="2.5"></circle>
    <circle cx="18.5" cy="18.5" r="2.5"></circle>
  </svg>
);

const ChevronRightIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 18l6-6-6-6"></path>
  </svg>
);

const CLOSED_PROJECT_STATUSES = new Set(["Completed", "Finished", "Declined"]);
const OVERDUE_EXCLUDED_STATUSES = new Set([
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
  "Declined",
]);
const PENDING_ACCEPTANCE_STATUSES = new Set([
  "Order Created",
  "Quote Created",
  "Pending Acceptance",
]);

const isEmergencyProject = (project) =>
  project?.projectType === "Emergency" || project?.priority === "Urgent";
const isPendingDeliveryProject = (project) =>
  project?.status === "Pending Delivery/Pickup";
const isQuoteProject = (project) => project?.projectType === "Quote";
const isCorporateProject = (project) => project?.projectType === "Corporate Job";
const getProjectStatusDisplay = (project) =>
  isQuoteProject(project)
    ? getQuoteStatusDisplay(project?.status || "")
    : project?.status || "";
const normalizeDepartmentList = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (!entry) return "";
        if (typeof entry === "string") return entry.trim();
        if (typeof entry === "object") {
          const candidate =
            entry.name || entry.label || entry.department || entry.title || entry.value;
          return candidate ? String(candidate).trim() : "";
        }
        return String(entry).trim();
      })
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }
  if (value && typeof value === "object") {
    const candidate =
      value.name || value.label || value.department || value.title || value.value;
    return candidate ? [String(candidate).trim()] : [];
  }
  return [];
};
const formatDepartmentLabel = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/_/g, " ").replace(/\s*\/\s*/g, " / ");
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

// SVG Donut Chart Component
const StatusDonut = ({ stats }) => {
  const size = 180;
  const strokeWidth = 18;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  const total = stats.inProgress + stats.completed + stats.delayed || 1;
  const pIn = (stats.inProgress / total) * circumference;
  const pComp = (stats.completed / total) * circumference;

  return (
    <div className="donut-wrapper">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="status-donut"
      >
        {/* Delayed Segment (Orange) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="#f59e0b"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={0}
        />
        {/* Completed Segment (Green) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="#10b981"
          strokeWidth={strokeWidth}
          strokeDasharray={`${pComp + pIn} ${circumference}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${center} ${center})`}
        />
        {/* In Progress Segment (Blue) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="#3b82f6"
          strokeWidth={strokeWidth}
          strokeDasharray={`${pIn} ${circumference}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <div className="donut-content">
        <span className="donut-label">Total Projects</span>
        <span className="donut-value">
          {total === 1 && stats.inProgress === 0 ? 0 : total}
        </span>
      </div>
    </div>
  );
};

const ProjectStatusOverview = ({ projects }) => {
  const [selectedPeriod, setSelectedPeriod] = useState("All Time");

  // Extract unique months from projects data for the selector
  const periods = useMemo(() => {
    const months = new Set();
    projects.forEach((p) => {
      const date = new Date(p.createdAt || p.orderDate);
      if (!isNaN(date.getTime())) {
        const monthYear = date.toLocaleString("en-US", {
          month: "long",
          year: "numeric",
        });
        months.add(monthYear);
      }
    });

    // Sort months chronologically descending
    return [
      "All Time",
      ...Array.from(months).sort((a, b) => new Date(b) - new Date(a)),
    ];
  }, [projects]);

  // Filter projects by selected period and calculate stats
  const stats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const filtered = projects.filter((p) => {
      if (selectedPeriod === "All Time") return true;
      const date = new Date(p.createdAt || p.orderDate);
      const monthYear = date.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      });
      return monthYear === selectedPeriod;
    });

    let inProgress = 0;
    let completed = 0;
    let delayed = 0;

    filtered.forEach((p) => {
      // Logic:
      // 1. If status is Completed or Finished -> Completed
      // 2. If deliveryDate is in the past (overdue) and not delivered -> Delayed
      // 3. Otherwise -> In Progress (except for 'Completed')

      if (["Completed", "Finished", "Declined"].includes(p.status)) {
        completed++;
      } else {
        const dDate = p.details?.deliveryDate
          ? new Date(p.details.deliveryDate)
          : null;

        const postDeliveryStatuses = new Set([
          "Delivered",
          "Pending Feedback",
          "Feedback Completed",
          "Completed",
          "Finished",
          "Declined",
        ]);
        // Count as delayed if overdue OR within 3 days (72 hours) of delivery
        const isUrgent = dDate && dDate - now <= 3 * 24 * 60 * 60 * 1000;

        if (isUrgent && !postDeliveryStatuses.has(p.status)) {
          delayed++;
        } else {
          inProgress++;
        }
      }
    });

    const totalCount = inProgress + completed + delayed;
    const calcTotal = totalCount || 1; // Avoid division by zero for display

    return {
      inProgress,
      completed,
      delayed,
      total: totalCount,
      pIn: Math.round((inProgress / calcTotal) * 100),
      pComp: Math.round((completed / calcTotal) * 100),
      pDel: Math.round((delayed / calcTotal) * 100),
    };
  }, [projects, selectedPeriod]);

  return (
    <div className="status-overview-card">
      <div className="overview-header">
        <h3 className="section-title">Project Status Overview</h3>
        <div className="period-selector-wrapper">
          <select
            className="period-select"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            {periods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span className="chevron-down">v</span>
        </div>
      </div>

      <div className="overview-body">
        <StatusDonut stats={stats} />

        <div className="status-list">
          <div className="status-item">
            <div className="status-label-group">
              <span className="status-dot in-progress"></span>
              <span className="status-text">In Progress</span>
            </div>
            <div className="status-metrics">
              <span className="status-percent">{stats.pIn}%</span>
              <span className="status-count">{stats.inProgress} Projects</span>
            </div>
          </div>

          <div className="status-item">
            <div className="status-label-group">
              <span className="status-dot completed"></span>
              <span className="status-text">Completed</span>
            </div>
            <div className="status-metrics">
              <span className="status-percent">{stats.pComp}%</span>
              <span className="status-count">{stats.completed} Projects</span>
            </div>
          </div>

          <div className="status-item">
            <div className="status-label-group">
              <span className="status-dot delayed"></span>
              <span className="status-text">Delayed</span>
            </div>
            <div className="status-metrics">
              <span className="status-percent">{stats.pDel}%</span>
              <span className="status-count">{stats.delayed} Projects</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ user }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    active: 0,
    pending: 0,
    completed: 0,
    overdue: 0,
    emergencies: 0,
    pendingDelivery: 0,
    quotes: 0,
    corporate: 0,
  });

  useEffect(() => {
    fetchGlobalProjects();
  }, []);

  useRealtimeRefresh(() => fetchGlobalProjects());

  const fetchGlobalProjects = async () => {
    try {
      const res = await fetch("/api/projects?source=admin", {
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        calculateStats(data);
        const sorted = data.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        );
        setProjects(sorted);
      } else {
        console.error("Failed to fetch admin projects");
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateStats = (data) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    let active = 0;
    let pending = 0;
    let completed = 0;
    let overdue = 0;
    let emergencies = 0;
    let pendingDelivery = 0;
    let quotes = 0;
    let corporate = 0;

    data.forEach((p) => {
      if (isEmergencyProject(p)) {
        emergencies++;
      }

      if (isPendingDeliveryProject(p)) {
        pendingDelivery++;
      }

      if (isQuoteProject(p) && !CLOSED_PROJECT_STATUSES.has(p.status)) {
        quotes++;
      }
      if (isCorporateProject(p) && !CLOSED_PROJECT_STATUSES.has(p.status)) {
        corporate++;
      }

      if (CLOSED_PROJECT_STATUSES.has(p.status)) {
        completed++;
      } else {
        active++;
        if (PENDING_ACCEPTANCE_STATUSES.has(p.status)) {
          pending++;
        }
        if (p.details?.deliveryDate) {
          const dDate = new Date(p.details.deliveryDate);
          // Count as overdue if already passed OR within 3 days (72 hours)
          const isUrgent = dDate - now <= 3 * 24 * 60 * 60 * 1000;
          if (isUrgent && !OVERDUE_EXCLUDED_STATUSES.has(p.status)) {
            overdue++;
          }
        }
      }
    });

    setStats({
      active,
      pending,
      completed,
      overdue,
      emergencies,
      pendingDelivery,
      quotes,
      corporate,
    });
  };

  const getStatusPillClass = (status) => {
    if (["Completed", "Finished", "Declined"].includes(status)) return "completed";
    if (
      PENDING_ACCEPTANCE_STATUSES.has(status) ||
      status === "Pending Scope Approval" ||
      status === "Pending Acceptance"
    )
      return "pending";
    if (status === "Pending Feedback") return "pending";
    return "active";
  };

  const statCards = [
    {
      key: "emergencies",
      value: stats.emergencies,
      label: "Emergencies",
      tone: "rose",
      hint: "Urgent project queue",
      cta: "Open queue",
      icon: <RocketIcon />,
      statusFilter: "emergency",
      group: "priority",
    },
    {
      key: "critical",
      value: stats.overdue,
      label: "Critical / Overdue",
      tone: "red",
      hint: "Needs attention",
      cta: "See urgent",
      icon: <AlertTriangleIcon />,
      statusFilter: "critical",
      group: "priority",
    },
    {
      key: "active",
      value: stats.active,
      label: "Active Projects",
      tone: "blue",
      hint: "Open projects",
      cta: "View list",
      icon: <ProjectsIcon />,
      statusFilter: "active",
      group: "overview",
    },
    {
      key: "pending",
      value: stats.pending,
      label: "Pending Acceptance",
      tone: "purple",
      hint: "Unaccepted orders from leads",
      cta: "Review now",
      icon: <ClockIcon />,
      statusFilter: "pending",
      group: "priority",
    },
    {
      key: "pending-delivery",
      value: stats.pendingDelivery,
      label: "Pending Delivery",
      tone: "teal",
      hint: "Ready to dispatch",
      cta: "Dispatch list",
      icon: <TruckIcon />,
      statusFilter: "delivery",
      group: "priority",
    },
    {
      key: "quotes",
      value: stats.quotes,
      label: "Quotes",
      tone: "orange",
      hint: "Quote pipeline",
      cta: "Open quotes",
      icon: <ReportsIcon />,
      statusFilter: "quote",
      group: "overview",
    },
    {
      key: "corporate",
      value: stats.corporate,
      label: "Corporate Projects",
      tone: "indigo",
      hint: "Corporate job queue",
      cta: "Corporate queue",
      icon: <ProjectsIcon />,
      statusFilter: "corporate",
      group: "overview",
    },
    {
      key: "completed",
      value: stats.completed,
      label: "Total Completed",
      tone: "green",
      hint: "Finished projects",
      cta: "View archive",
      icon: <CheckCircleIcon />,
      statusFilter: "completed",
      group: "overview",
    },
  ];

  const openProjectsWithFilter = (statusFilter) => {
    const params = new URLSearchParams({ status: statusFilter });
    navigate(`/projects?${params.toString()}`);
  };

  const priorityCards = statCards.filter((card) => card.group === "priority");
  const overviewCards = statCards.filter((card) => card.group === "overview");

  const todayProjects = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    return projects
      .filter((project) => {
        const dateValue = project?.createdAt || project?.orderDate;
        if (!dateValue) return false;
        const createdAt = new Date(dateValue);
        if (Number.isNaN(createdAt.getTime())) return false;
        return createdAt >= start && createdAt <= end;
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt || b.orderDate) - new Date(a.createdAt || a.orderDate),
      );
  }, [projects]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [],
  );

  if (isLoading) {
    return (
      <div
        style={{
          height: "400px",
          display: "grid",
          placeItems: "center",
          color: "#64748b",
        }}
      >
        Loading Overview...
      </div>
    );
  }

  return (
    <div className="admin-dashboard-container">
      {/* Header */}
      <div className="admin-header">
        <div>
          <div className="admin-date">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </div>
          <h1 className="admin-title">Overview</h1>
          <p className="admin-subtitle">
            Welcome back, {user?.firstName || user?.name || "Admin"}. All
            systems operational.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="admin-stats-panel">
        <div className="admin-stats-section">
          <div className="admin-stats-section-header">
            <div>
              <div className="admin-stats-eyebrow">Priority Alerts</div>
              <h3 className="admin-stats-title">Action Center</h3>
            </div>
            <div className="admin-stats-note">
              Items that need immediate attention
            </div>
          </div>
          <div className="admin-stats-grid priority">
            {priorityCards.map((card) => (
              <button
                key={card.key}
                type="button"
                className={`admin-stat-card stat-card-action stat-card-${card.key} ${
                  card.key === "emergencies" || card.key === "critical"
                    ? "stat-card-priority"
                    : ""
                }`}
                onClick={() => openProjectsWithFilter(card.statusFilter)}
                aria-label={`${card.label} - open filtered projects`}
              >
                <div className="stat-card-top">
                  <div className={`stat-icon-wrapper ${card.tone}`}>
                    {card.icon}
                  </div>
                  <div className="stat-card-title">
                    <div className="stat-label">{card.label}</div>
                    <div className="stat-hint">{card.hint}</div>
                  </div>
                </div>
                <div className="stat-card-middle">
                  <div className="stat-value">{card.value}</div>
                </div>
                <div className="stat-card-footer">
                  <span>{card.cta || "Open queue"}</span>
                  <ChevronRightIcon />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="admin-stats-section">
          <div className="admin-stats-section-header">
            <div>
              <div className="admin-stats-eyebrow">Operations</div>
              <h3 className="admin-stats-title">Production Overview</h3>
            </div>
            <div className="admin-stats-note">
              Snapshot of active workload
            </div>
          </div>
          <div className="admin-stats-grid">
            {overviewCards.map((card) => (
              <button
                key={card.key}
                type="button"
                className={`admin-stat-card stat-card-action stat-card-${card.key}`}
                onClick={() => openProjectsWithFilter(card.statusFilter)}
                aria-label={`${card.label} - open filtered projects`}
              >
                <div className="stat-card-top">
                  <div className={`stat-icon-wrapper ${card.tone}`}>
                    {card.icon}
                  </div>
                  <div className="stat-card-title">
                    <div className="stat-label">{card.label}</div>
                    <div className="stat-hint">{card.hint}</div>
                  </div>
                </div>
                <div className="stat-card-middle">
                  <div className="stat-value">{card.value}</div>
                </div>
                <div className="stat-card-footer">
                  <span>{card.cta || "Open list"}</span>
                  <ChevronRightIcon />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Projects Created Today */}
      <section className="today-projects-card">
        <div className="today-projects-header">
          <div>
            <div className="today-projects-eyebrow">Projects Created Today</div>
            <h3 className="section-title">Today's New Projects</h3>
            <p className="today-projects-subtitle">{todayLabel}</p>
          </div>
          <div className="today-projects-count">
            <span className="today-count-number">{todayProjects.length}</span>
            <span className="today-count-label">Created</span>
          </div>
        </div>

        <div className="today-projects-list">
          {todayProjects.length > 0 ? (
            todayProjects.map((project) => {
              const rawOrderId =
                project.orderId ||
                project.orderRef?.orderNumber ||
                project?._id?.slice(-6)?.toUpperCase() ||
                "";
              const orderLabel = rawOrderId
                ? rawOrderId.startsWith("#")
                  ? rawOrderId
                  : `#${rawOrderId}`
                : "Order";
              const projectName = renderProjectName(
                project.details,
                null,
                "Untitled Project",
              );
              const leadLabel = getLeadDisplay(project, "Unassigned");
              const clientLabel =
                project.details?.client ||
                project.orderRef?.client ||
                project.details?.clientName ||
                "Unknown Client";
              const displayStatus = getProjectStatusDisplay(project);
              const createdTime = project?.createdAt
                ? new Date(project.createdAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "";
              const departments = normalizeDepartmentList(project?.departments || []);
              return (
                <button
                  key={project._id}
                  type="button"
                  className="today-project-row"
                  onClick={() => navigate(`/projects/${project._id}`)}
                >
                  <div className="today-project-primary">
                    <div className="today-project-order">{orderLabel}</div>
                    <div className="today-project-name">{projectName}</div>
                    <div className="today-project-meta">
                      <span>{leadLabel}</span>
                      <span>Client: {clientLabel}</span>
                      {createdTime && <span>Created {createdTime}</span>}
                    </div>
                  </div>

                  <div className="today-project-status">
                    <span
                      className={`status-pill ${getStatusPillClass(displayStatus)}`}
                    >
                      {displayStatus}
                    </span>
                    <span
                      className={`today-type-pill ${getProjectTypeClass(project)}`}
                    >
                      {getProjectTypeLabel(project)}
                    </span>
                  </div>

                  <div className="today-project-depts">
                    {departments.length > 0 ? (
                      departments.map((dept) => (
                        <span
                          key={`${project._id}-${dept}`}
                          className="today-dept-chip"
                        >
                          {formatDepartmentLabel(dept)}
                        </span>
                      ))
                    ) : (
                      <span className="today-project-depts-empty">
                        No departments engaged yet
                      </span>
                    )}
                  </div>

                  <span className="today-project-chevron">
                    <ChevronRightIcon />
                  </span>
                </button>
              );
            })
          ) : (
            <div className="today-projects-empty">
              No projects created today yet.
            </div>
          )}
        </div>
      </section>

      {/* NEW: Project Status Overview Component */}
      <ProjectStatusOverview projects={projects} />

      {/* Main Content Body */}
      <div className="admin-dashboard-body">
        {/* Left Column: Recent Projects */}
        <div className="dashboard-main-col">
          <div className="section-header">
            <h3 className="section-title">Recent Projects</h3>
          </div>

          <div className="recent-projects-card">
            {projects.slice(0, 5).map((project) => (
              <div
                key={project._id}
                className="project-row"
                onClick={() => navigate(`/projects/${project._id}`)}
              >
                <div className="project-info">
                  <h4>
                    {renderProjectName(
                      project.details,
                      null,
                      "Untitled Project",
                    )}
                  </h4>
                  <div className="project-meta">
                    {project.orderId} |{" "}
                    {getLeadDisplay(project, "No Lead")}
                  </div>
                </div>

                <div className="project-client">
                  {project.details?.client || "Unknown Client"}
                </div>

                <div className="project-status">
                  <span
                    className={`status-pill ${getStatusPillClass(
                      getProjectStatusDisplay(project),
                    )}`}
                  >
                    {getProjectStatusDisplay(project)}
                  </span>
                </div>

                <div style={{ color: "#cbd5e1" }}>
                  <ChevronRightIcon />
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <div
                style={{
                  padding: "3rem",
                  textAlign: "center",
                  color: "#94a3b8",
                }}
              >
                No active projects found.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Insights / Workload */}
        <div className="dashboard-side-col">
          <div className="section-header">
            <h3 className="section-title">Team Workload Distribution</h3>
          </div>

          <div className="chart-card">
            {(() => {
              const leadCounts = {};
              const activeOnes = projects.filter(
                (p) =>
                  p.status !== "Completed" &&
                  p.status !== "Finished" &&
                  p.status !== "Declined" &&
                  p.status !== "Delivered" &&
                  p.status !== "Pending Feedback" &&
                  p.status !== "Feedback Completed",
              );

              // Calculate counts per lead
              activeOnes.forEach((p) => {
                const leadName = getLeadDisplay(p, "Unassigned");
                leadCounts[leadName] = (leadCounts[leadName] || 0) + 1;
              });

              // Sort by count descending
              const sortedLeads = Object.entries(leadCounts).sort(
                ([, a], [, b]) => b - a,
              );

              if (sortedLeads.length === 0) {
                return (
                  <div
                    style={{
                      padding: "1rem",
                      color: "#94a3b8",
                      textAlign: "center",
                      fontStyle: "italic",
                    }}
                  >
                    No active workload data.
                  </div>
                );
              }

              // Predefined colors for variety
              const colors = [
                "#3b82f6", // Blue
                "#8b5cf6", // Purple
                "#10b981", // Green
                "#f59e0b", // Amber
                "#ef4444", // Red
                "#ec4899", // Pink
                "#6366f1", // Indigo
                "#14b8a6", // Teal
              ];

              return sortedLeads.map(([leadName, count], idx) => {
                // Calculate percentage relative to Total Active Projects
                const percent =
                  activeOnes.length > 0
                    ? Math.round((count / activeOnes.length) * 100)
                    : 0;

                return (
                  <div key={leadName} className="dept-bar-group">
                    <div className="dept-header">
                      <span>{leadName}</span>
                      <span style={{ color: "#64748b" }}>{count} Projects</span>
                    </div>
                    <div className="dept-track">
                      <div
                        className="dept-fill"
                        style={{
                          width: `${percent}%`,
                          backgroundColor: colors[idx % colors.length],
                        }}
                      />
                    </div>
                  </div>
                );
              });
            })()}
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.75rem",
                color: "#94a3b8",
                textAlign: "center",
              }}
            >
              Tracking active project distribution across team members.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
