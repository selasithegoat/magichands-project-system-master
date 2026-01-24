import React, { useState, useEffect } from "react";
import "./Dashboard.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ProjectCard from "../../components/ui/ProjectCard";
import { getDepartmentLabel } from "../../constants/departments";
// Icons
import FolderIcon from "../../components/icons/FolderIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import AlertTriangleIcon from "../../components/icons/AlertTriangleIcon";
import ThreeDotsIcon from "../../components/icons/ThreeDotsIcon";
import PlusIcon from "../../components/icons/PlusIcon";
import ChevronRightIcon from "../../components/icons/ChevronRightIcon";
import FabButton from "../../components/ui/FabButton";
import Toast from "../../components/ui/Toast";

const Dashboard = ({
  onNavigateProject,
  onCreateProject,
  onSeeAllProjects,
  user,
  onProjectChange, // New prop
}) => {
  const [projects, setProjects] = useState([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects", {
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        // Calculate completed count
        const completed = data.filter((p) => p.status === "Completed").length;
        setCompletedCount(completed);

        // Filter out "Completed" projects (Pending Scope Approval is ACTIVE for Lead)
        const activeProjects = data.filter((p) => p.status !== "Completed");
        // Sort by createdAt desc (newest first)
        const sortedProjects = activeProjects.sort(
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

  // Toast State
  const [toast, setToast] = useState(null);

  const handleDetailsClick = (projectId) => {
    onNavigateProject(projectId);
  };

  const handleUpdateStatusClick = async (projectId, currentStatus) => {
    if (currentStatus !== "Delivered") {
      setToast({
        message: "Project must be 'Delivered' before marking as finished.",
        type: "error",
      });
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" }),
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
        <div className="stats-card">
          <div className="stats-header">
            <div className="stats-icon-wrapper blue">
              <FolderIcon />
            </div>
            <div className="more-dots">
              <ThreeDotsIcon />
            </div>
          </div>
          <div className="stats-count">{projects.length}</div>
          <div className="stats-label">Active Projects</div>
        </div>
        <div className="stats-card">
          <div className="stats-header">
            <div className="stats-icon-wrapper orange">
              <ClockIcon />
            </div>
            <div className="more-dots">
              <ThreeDotsIcon />
            </div>
          </div>
          <div className="stats-count">
            {
              projects.filter((p) => p.status === "Pending Scope Approval")
                .length
            }
          </div>
          <div className="stats-label">Pending Acceptance</div>
        </div>
        {/* ... keep other stats or make dynamic later ... */}
        <div className="stats-card">
          <div className="stats-header">
            <div className="stats-icon-wrapper green">
              <CheckCircleIcon />
            </div>
          </div>
          <div className="stats-count">{completedCount}</div>
          <div className="stats-label">Completed</div>
        </div>
        <div className="stats-card">
          <div className="stats-header">
            <div className="stats-icon-wrapper red">
              <AlertTriangleIcon />
            </div>
            <div className="more-dots">
              <ThreeDotsIcon />
            </div>
          </div>
          <div className="stats-count">
            {
              projects.filter((p) => {
                if (!p.details?.deliveryDate) return false;
                const dDate = new Date(p.details.deliveryDate);
                const now = new Date();
                now.setHours(0, 0, 0, 0); // Start of today
                return dDate < now && p.status !== "Delivered";
              }).length
            }
          </div>
          <div className="stats-label">Overdue Items</div>
        </div>
      </div>

      {/* Dashboard Content Grid */}
      <div className="dashboard-body">
        {/* Main Column: Projects */}
        <div className="dashboard-main">
          {/* Recent Projects */}
          <div className="section-header">
            <h3 className="section-title">Recent Projects</h3>
            <button className="see-all-btn" onClick={onSeeAllProjects}>
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
            ) : projects.length > 0 ? (
              projects
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

          {/* Department Workload */}
          <div className="section-header" style={{ marginTop: "2rem" }}>
            <h3 className="section-title">Department Workload</h3>
          </div>
          <div className="workload-card">
            {(() => {
              // Calculate stats
              const deptCounts = {};
              let totalProjectsWithDepts = 0;

              projects.forEach((p) => {
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
                  (count / projects.length) * 100, // % of TOTAL active projects
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
