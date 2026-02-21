import React, { useState, useEffect, useMemo } from "react";
import "./Dashboard.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ProjectCard from "../../components/ui/ProjectCard";
import { getDepartmentLabel } from "../../constants/departments";
import { useNavigate } from "react-router-dom";
// Icons
import FolderIcon from "../../components/icons/FolderIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import AlertTriangleIcon from "../../components/icons/AlertTriangleIcon";
import ChevronRightIcon from "../../components/icons/ChevronRightIcon";
import FabButton from "../../components/ui/FabButton";
import Toast from "../../components/ui/Toast";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";

const HISTORY_PROJECT_STATUSES = new Set(["Finished"]);

const OVERDUE_EXCLUDED_STATUSES = new Set([
  "Delivered",
  "Pending Feedback",
  "Pending Delivery/Pickup",
  "Feedback Completed",
  "Completed",
  "Finished",
]);

const isPendingAcceptanceProject = (project) => project.status === "Order Confirmed";

const isEmergencyProject = (project) =>
  project?.projectType === "Emergency" || project?.priority === "Urgent";

const Dashboard = ({
  onNavigateProject,
  onCreateProject,
  user,
  onProjectChange, // New prop
}) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [digest, setDigest] = useState(null);
  const [digestLoading, setDigestLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
    fetchDigest();
  }, []);

  useRealtimeRefresh(() => fetchProjects());

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects", {
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        // Sort by createdAt desc (newest first)
        const sortedProjects = data.sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
        );
        setProjects(sortedProjects);
      } else {
        console.error("Failed to fetch projects");
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDigest = async () => {
    try {
      const res = await fetch("/api/digests/latest");
      if (res.ok) {
        const data = await res.json();
        setDigest(data.digest || null);
      }
    } catch (error) {
      console.error("Error fetching digest:", error);
    } finally {
      setDigestLoading(false);
    }
  };

  // Toast State
  const [toast, setToast] = useState(null);

  const handleDetailsClick = (projectId) => {
    onNavigateProject(projectId);
  };

  const handleUpdateStatusClick = async (projectId, currentStatus) => {
    if (currentStatus !== "Completed") {
      setToast({
        message: "Project must be 'Completed' before marking as finished.",
        type: "error",
      });
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Finished" }),
      });

      if (res.ok) {
        setToast({ message: "Project marked as Completed!", type: "success" });
        fetchProjects(); // Refresh list
        if (onProjectChange) onProjectChange(); // Refresh global count
      } else {
        setToast({ message: "Failed to update status", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: "Server error", type: "error" });
    }
  };

  const formatDigestRange = (start, end) => {
    if (!start || !end) return "";
    const from = new Date(start).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const to = new Date(end).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${from} - ${to}`;
  };

  const formatDigestDate = (value, time) => {
    if (!value) return "No date";
    const dateLabel = new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return time ? `${dateLabel} (${time})` : dateLabel;
  };

  const pendingAcceptanceProjects = useMemo(
    () => projects.filter((project) => isPendingAcceptanceProject(project)),
    [projects],
  );

  const activeProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          !isPendingAcceptanceProject(project) &&
          !HISTORY_PROJECT_STATUSES.has(project.status),
      ),
    [projects],
  );

  const completedProjects = useMemo(
    () =>
      projects.filter((project) =>
        HISTORY_PROJECT_STATUSES.has(project.status || ""),
      ),
    [projects],
  );

  const overdueProjects = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projects.filter((project) => {
      if (!project?.details?.deliveryDate) return false;
      const deliveryDate = new Date(project.details.deliveryDate);
      return (
        deliveryDate < today &&
        !OVERDUE_EXCLUDED_STATUSES.has(project.status || "")
      );
    });
  }, [projects]);

  const emergencyProjects = useMemo(
    () => projects.filter((project) => isEmergencyProject(project)),
    [projects],
  );

  const handleStatsNavigate = (targetPath) => {
    navigate(targetPath);
  };

  const handleStatsCardKeyDown = (event, targetPath) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleStatsNavigate(targetPath);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Page Content Header */}
      <div className="dashboard-page-header">
        <div className="dashboard-date">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </div>
        <h1 className="dashboard-greeting">
          Hello, {user ? user.firstName : "User"}{" "}
          <span className="wave-emoji">👋</span>
        </h1>
        <p className="dashboard-subtitle">Here's your project overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div
          className="stats-card clickable emergency-card"
          role="button"
          tabIndex={0}
          onClick={() => handleStatsNavigate("/projects?view=emergencies")}
          onKeyDown={(event) =>
            handleStatsCardKeyDown(event, "/projects?view=emergencies")
          }
          aria-label="View emergency projects"
        >
          <div className="stats-header">
            <div className="stats-icon-wrapper emergency">
              <AlertTriangleIcon />
            </div>
            <div className="more-dots"></div>
          </div>
          <div className="stats-count">{emergencyProjects.length}</div>
          <div className="stats-label">Emergencies</div>
        </div>

        <div
          className="stats-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleStatsNavigate("/projects?view=active")}
          onKeyDown={(event) =>
            handleStatsCardKeyDown(event, "/projects?view=active")
          }
          aria-label="View active projects"
        >
          <div className="stats-header">
            <div className="stats-icon-wrapper blue">
              <FolderIcon />
            </div>
            <div className="more-dots"></div>
          </div>
          <div className="stats-count">{activeProjects.length}</div>
          <div className="stats-label">Active Projects</div>
        </div>

        <div
          className="stats-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleStatsNavigate("/create")}
          onKeyDown={(event) => handleStatsCardKeyDown(event, "/create")}
          aria-label="View pending acceptance projects"
        >
          <div className="stats-header">
            <div className="stats-icon-wrapper orange">
              <ClockIcon />
            </div>
            <div className="more-dots"></div>
          </div>
          <div className="stats-count">{pendingAcceptanceProjects.length}</div>
          <div className="stats-label">Pending Acceptance</div>
        </div>

        <div
          className="stats-card clickable overdue-card"
          role="button"
          tabIndex={0}
          onClick={() => handleStatsNavigate("/projects?view=overdue")}
          onKeyDown={(event) =>
            handleStatsCardKeyDown(event, "/projects?view=overdue")
          }
          aria-label="View overdue projects"
        >
          <div className="stats-header">
            <div className="stats-icon-wrapper red">
              <AlertTriangleIcon />
            </div>
            <div className="more-dots"></div>
          </div>
          <div className="stats-count">{overdueProjects.length}</div>
          <div className="stats-label">Overdue Projects</div>
        </div>

        <div
          className="stats-card clickable"
          role="button"
          tabIndex={0}
          onClick={() => handleStatsNavigate("/history")}
          onKeyDown={(event) => handleStatsCardKeyDown(event, "/history")}
          aria-label="View finished projects in history"
        >
          <div className="stats-header">
            <div className="stats-icon-wrapper green">
              <CheckCircleIcon />
            </div>
          </div>
          <div className="stats-count">{completedProjects.length}</div>
          <div className="stats-label">Completed</div>
        </div>
      </div>

      {/* Dashboard Content Grid */}
      <div className="dashboard-body">
        {/* Main Column: Projects */}
        <div className="dashboard-main">
          {/* Recent Projects */}
          <div className="section-header">
            <h3 className="section-title">Recent Projects</h3>
            <button
              className="see-all-btn"
              onClick={() => handleStatsNavigate("/projects?view=active")}
            >
              See All
            </button>
          </div>

          <div
            className="projects-list-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "20px",
            }}
          >
            {isLoading ? (
              <LoadingSpinner />
            ) : activeProjects.length > 0 ? (
              activeProjects
                .slice(0, 4)
                .map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    onDetails={handleDetailsClick}
                    onUpdateStatus={handleUpdateStatusClick}
                  />
                ))
            ) : (
              <div className="no-projects">
                <p>No projects found. Create one to get started!</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Column: Widgets */}
        <div className="dashboard-sidebar">
          {/* Upcoming Deadlines */}
          <div className="section-header">
            <h3 className="section-title">Upcoming Deadlines</h3>
          </div>
          <div className="deadlines-list">
            {(() => {
              const threeDaysFromNow = new Date();
              threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
              const now = new Date();
              now.setHours(0, 0, 0, 0); // Start of today

              const upcomingDeadlines = projects
                .filter(
                  (project) =>
                    !isPendingAcceptanceProject(project) &&
                    !HISTORY_PROJECT_STATUSES.has(project.status),
                )
                .filter((p) => {
                  if (!p.details?.deliveryDate) return false;
                  const dDate = new Date(p.details.deliveryDate);
                  return dDate >= now && dDate <= threeDaysFromNow;
                })
                .sort(
                  (a, b) =>
                    new Date(a.details.deliveryDate) -
                    new Date(b.details.deliveryDate),
                );

              if (upcomingDeadlines.length === 0) {
                return (
                  <div
                    style={{
                      color: "#94a3b8",
                      fontSize: "0.875rem",
                      fontStyle: "italic",
                      padding: "0.5rem",
                    }}
                  >
                    No upcoming deadlines in the next 3 days.
                  </div>
                );
              }

              return upcomingDeadlines.map((p) => {
                const dateObj = new Date(p.details.deliveryDate);
                const month = dateObj.toLocaleString("en-US", {
                  month: "short",
                });
                const day = dateObj.getDate();
                const timeStr = p.details.deliveryTime || "All Day";

                return (
                  <div
                    key={p._id}
                    className="deadline-card"
                    onClick={() => handleDetailsClick(p._id)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className="date-box">
                      <span className="date-month">{month.toUpperCase()}</span>
                      <span className="date-day">{day}</span>
                    </div>
                    <div className="deadline-info">
                      <h4>{p.details.projectName}</h4>
                      <span className="deadline-time">{timeStr}</span>
                    </div>
                    <div style={{ marginLeft: "auto", color: "#cbd5e1" }}>
                      <ChevronRightIcon />
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          <div className="section-header" style={{ marginTop: "2rem" }}>
            <h3 className="section-title">Weekly Digest</h3>
            {digest?.periodStart && digest?.periodEnd && (
              <span className="digest-period">
                {formatDigestRange(digest.periodStart, digest.periodEnd)}
              </span>
            )}
          </div>
          <div className="digest-card">
            {digestLoading ? (
              <div className="digest-empty">Loading weekly digest...</div>
            ) : !digest ? (
              <div className="digest-empty">
                Your weekly digest will appear here once it's generated.
              </div>
            ) : (
              <div className="digest-section">
                <div className="digest-section-header">
                  <span>Who needs to act</span>
                  <span className="digest-count">
                    {digest.summary?.actionCount ??
                      digest.actionRequired?.length ??
                      0}
                  </span>
                </div>
                {digest.actionRequired?.length ? (
                  <ul className="digest-list">
                    {digest.actionRequired.map((item) => (
                      <li key={item.project || item.orderId}>
                        <span className="digest-item-title">
                          {item.projectName || item.orderId || "Project"}
                        </span>
                        <span className="digest-item-meta">
                          {item.owner || "Team"} • {item.status} •{" "}
                          <span className="digest-due">
                            Due {formatDigestDate(item.deliveryDate, item.deliveryTime)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="digest-empty">No actions required.</div>
                )}
                {(digest.summary?.actionCount || 0) >
                  (digest.actionRequired?.length || 0) && (
                  <div className="digest-more">
                    +
                    {(digest.summary?.actionCount || 0) -
                      (digest.actionRequired?.length || 0)}{" "}
                    more
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Department Workload */}
          <div className="section-header" style={{ marginTop: "2rem" }}>
            <h3 className="section-title">Department Workload</h3>
          </div>
          <div className="workload-card">
            {(() => {
              // Calculate stats
              const deptCounts = {};
              const workloadProjects = activeProjects;
              let totalProjectsWithDepts = 0;

              workloadProjects.forEach((p) => {
                if (p.departments && p.departments.length > 0) {
                  totalProjectsWithDepts++;
                  p.departments.forEach((deptId) => {
                    deptCounts[deptId] = (deptCounts[deptId] || 0) + 1;
                  });
                }
              });

              if (Object.keys(deptCounts).length === 0) {
                return (
                  <div
                    style={{
                      padding: "1rem",
                      color: "#94a3b8",
                      fontSize: "0.875rem",
                      textAlign: "center",
                      fontStyle: "italic",
                    }}
                  >
                    No department data available.
                  </div>
                );
              }

              // Sort by count desc
              const topDepts = Object.entries(deptCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5); // Start with top 5

              return topDepts.map(([deptId, count]) => {
                const percentage = Math.round(
                  (count / workloadProjects.length) * 100, // % of TOTAL active projects
                );
                // Color palette for bars
                const colors = [
                  "#a855f7",
                  "#3b82f6",
                  "#f97316",
                  "#14b8a6",
                  "#ef4444",
                ];
                // quick hash for consistent color
                const colorIndex = deptId.length % colors.length;
                const barColor = colors[colorIndex];

                return (
                  <div
                    className="workload-item"
                    key={deptId}
                    style={{ marginBottom: "1rem" }}
                  >
                    <div className="progress-label-row">
                      <span
                        className="progress-label"
                        style={{ color: "#0f172a", fontWeight: 600 }}
                      >
                        {getDepartmentLabel(deptId)}
                      </span>
                      <span className="progress-label">
                        {percentage}% ({count} Projects)
                      </span>
                    </div>
                    <div
                      className="progress-track"
                      style={{
                        height: "8px",
                        backgroundColor: "#f1f5f9",
                        borderRadius: "999px",
                      }}
                    >
                      <div
                        className="progress-fill"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: barColor,
                          height: "100%",
                          borderRadius: "999px",
                          transition: "width 0.5s ease-out",
                        }}
                      ></div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>

      {/* FAB */}
      <FabButton onClick={onCreateProject} />

      {/* Toast */}
      {toast && (
        <div className="ui-toast-container">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        </div>
      )}
    </div>
  );
};

export default Dashboard;
