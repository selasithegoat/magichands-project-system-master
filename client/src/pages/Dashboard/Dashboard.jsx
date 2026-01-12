import React, { useState, useEffect } from "react";
import "./Dashboard.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ProjectCard from "../../components/ui/ProjectCard";
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
        // Filter out "Completed" projects
        const activeProjects = data.filter((p) => p.status !== "Completed");
        // Reverse to show newest first
        setProjects(activeProjects.reverse());
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
            {projects.filter((p) => p.status === "Draft").length}
          </div>
          <div className="stats-label">Pending</div>
        </div>
        {/* ... keep other stats or make dynamic later ... */}
        <div className="stats-card">
          <div className="stats-header">
            <div className="stats-icon-wrapper green">
              <CheckCircleIcon />
            </div>
            <div className="trend-pill">~ 15%</div>
          </div>
          <div className="stats-count">0</div>
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
          <div className="stats-count">0</div>
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
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "20px",
            }}
          >
            {isLoading ? (
              <LoadingSpinner />
            ) : projects.length > 0 ? (
              projects.map((project) => (
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
            <div className="deadline-card">
              <div className="date-box">
                <span className="date-month">OCT</span>
                <span className="date-day">24</span>
              </div>
              <div className="deadline-info">
                <h4>Final Review for Client X</h4>
                <span className="deadline-time">Today at 5:00 PM</span>
              </div>
              <div style={{ marginLeft: "auto", color: "#cbd5e1" }}>
                <ChevronRightIcon />
              </div>
            </div>
          </div>

          {/* Department Workload */}
          <div className="section-header" style={{ marginTop: "2rem" }}>
            <h3 className="section-title">Department Workload</h3>
          </div>
          <div className="workload-card">
            <div className="workload-item">
              <div className="progress-label-row">
                <span
                  className="progress-label"
                  style={{ color: "#0f172a", fontWeight: 600 }}
                >
                  Design Team
                </span>
                <span className="progress-label">85% Capacity</span>
              </div>
              <div className="progress-track" style={{ height: "8px" }}>
                <div
                  className="progress-fill"
                  style={{ width: "85%", backgroundColor: "#a855f7" }}
                ></div>
              </div>
            </div>
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
