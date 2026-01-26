import React, { useState, useEffect } from "react";
import "./Dashboard.css";
import {
  ProjectsIcon,
  CheckCircleIcon,
  DashboardIcon,
  BellIcon,
} from "../../icons/Icons";
import { useNavigate } from "react-router-dom";

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
  const pDel = (stats.delayed / total) * circumference;

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
        <span className="donut-label">Total Active</span>
        <span className="donut-value">
          {total === 1 && stats.inProgress === 0 ? 0 : total}
        </span>
      </div>
    </div>
  );
};

const ProjectStatusOverview = ({ projects }) => {
  const [period, setPeriod] = useState("This Month");

  // Calculate period-aware stats
  const stats = (() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let inProgress = 0;
    let completed = 0;
    let delayed = 0;

    projects.forEach((p) => {
      // For "This Month" filter logic (simplified: check if project was created or updated this month)
      // If we want exact period filtering, we'd add it here.

      if (p.status === "Completed" || p.status === "Delivered") {
        completed++;
      } else {
        const dDate = p.details?.deliveryDate
          ? new Date(p.details.deliveryDate)
          : null;
        if (dDate && dDate < now) {
          delayed++;
        } else {
          inProgress++;
        }
      }
    });

    const total = inProgress + completed + delayed || 1;
    return {
      inProgress,
      completed,
      delayed,
      total,
      pIn: Math.round((inProgress / total) * 100),
      pComp: Math.round((completed / total) * 100),
      pDel: Math.round((delayed / total) * 100),
    };
  })();

  return (
    <div className="status-overview-card">
      <div className="overview-header">
        <h3 className="section-title">Project Status Overview</h3>
        <div className="period-selector">
          {period} <span className="chevron-down">▾</span>
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
  });

  useEffect(() => {
    fetchGlobalProjects();
  }, []);

  const fetchGlobalProjects = async () => {
    try {
      const res = await fetch("/api/projects?source=admin", {
        headers: {
          "Content-Type": "application/json",
        },
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

    data.forEach((p) => {
      if (p.status === "Completed") {
        completed++;
      } else {
        active++;
        if (
          p.status === "Pending Scope Approval" ||
          p.status === "Pending Acceptance"
        ) {
          pending++;
        }
        if (p.details?.deliveryDate) {
          const dDate = new Date(p.details.deliveryDate);
          if (dDate < now && p.status !== "Delivered") {
            overdue++;
          }
        }
      }
    });

    setStats({ active, pending, completed, overdue });
  };

  const getStatusPillClass = (status) => {
    if (status === "Completed") return "completed";
    if (status === "Pending Scope Approval" || status === "Pending Acceptance")
      return "pending";
    if (status === "Delivered") return "completed";
    return "active";
  };

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
          <h1 className="admin-title">
            Overview <span style={{ fontSize: "1.5rem" }}>⚡</span>
          </h1>
          <p className="admin-subtitle">
            Welcome back, {user?.firstName || user?.name || "Admin"}. All
            systems operational.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="stat-icon-wrapper blue">
            <ProjectsIcon />
          </div>
          <div className="stat-value">{stats.active}</div>
          <div className="stat-label">Active Projects</div>
        </div>

        <div className="admin-stat-card">
          <div className="stat-icon-wrapper purple">
            <ClockIcon />
          </div>
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Pending Acceptance</div>
        </div>

        <div className="admin-stat-card">
          <div className="stat-icon-wrapper green">
            <CheckCircleIcon />
          </div>
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">Total Completed</div>
        </div>

        <div className="admin-stat-card">
          <div className="stat-icon-wrapper red">
            <AlertTriangleIcon />
          </div>
          <div className="stat-value">{stats.overdue}</div>
          <div className="stat-label">Critical / Overdue</div>
        </div>
      </div>

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
            {projects.slice(0, 10).map((project) => (
              <div
                key={project._id}
                className="project-row"
                onClick={() => navigate(`/projects/${project._id}`)}
              >
                <div className="project-info">
                  <h4>{project.details?.projectName}</h4>
                  <div className="project-meta">
                    {project.orderId} • {project.details?.lead || "No Lead"}
                  </div>
                </div>

                <div className="project-client">
                  {project.details?.client || "Unknown Client"}
                </div>

                <div className="project-status">
                  <span
                    className={`status-pill ${getStatusPillClass(
                      project.status,
                    )}`}
                  >
                    {project.status}
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
            <h3 className="section-title">Workload Distribution</h3>
          </div>

          <div className="chart-card">
            {(() => {
              const deptCounts = {};
              let totalWithDept = 0;
              const activeOnes = projects.filter(
                (p) => p.status !== "Completed",
              );

              activeOnes.forEach((p) => {
                if (p.departments?.length > 0) {
                  totalWithDept++;
                  p.departments.forEach((d) => {
                    deptCounts[d] = (deptCounts[d] || 0) + 1;
                  });
                }
              });

              const sortedDepts = Object.entries(deptCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5);

              if (sortedDepts.length === 0) {
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

              const colors = [
                "#3b82f6",
                "#8b5cf6",
                "#10b981",
                "#f59e0b",
                "#ef4444",
              ];

              return sortedDepts.map(([deptName, count], idx) => {
                const percent =
                  activeOnes.length > 0
                    ? Math.round((count / activeOnes.length) * 100)
                    : 0;
                return (
                  <div key={deptName} className="dept-bar-group">
                    <div className="dept-header">
                      <span>{deptName}</span>
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
              Showing top 5 departments by active project volume.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
