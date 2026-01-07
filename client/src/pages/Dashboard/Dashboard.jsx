import React from "react";
import "./Dashboard.css";

// --- Icons ---
const FolderIcon = () => (
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
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
);
const ClockIcon = () => (
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
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);
const CheckCircleIcon = () => (
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
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);
const AlertTriangleIcon = () => (
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
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);
const CalendarIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);
const ThreeDotsIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="1"></circle>
    <circle cx="19" cy="12" r="1"></circle>
    <circle cx="5" cy="12" r="1"></circle>
  </svg>
);
const PlusIcon = () => (
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
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);
const ChevronRightIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const Dashboard = ({ onNavigateProject, onCreateProject }) => {
  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-date">Thursday, Oct 24</div>
        <h1 className="dashboard-greeting">
          Hello, Alex <span className="wave-emoji">👋</span>
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
          <div className="stats-count">12</div>
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
          <div className="stats-count">4</div>
          <div className="stats-label">Pending</div>
        </div>
        <div className="stats-card">
          <div className="stats-header">
            <div className="stats-icon-wrapper green">
              <CheckCircleIcon />
            </div>
            <div className="trend-pill">~ 15%</div>
          </div>
          <div className="stats-count">8</div>
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
          <div className="stats-count">2</div>
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
            <button className="see-all-btn">See All</button>
          </div>

          <div className="projects-list">
            {/* Project 1 */}
            <div className="project-card" onClick={onNavigateProject}>
              <div className="project-card-header">
                <div>
                  <span className="project-id">#MH-2024-01</span>
                  <h4 className="project-title">Website Redesign</h4>
                </div>
                <span className="status-badge in-progress">In Progress</span>
              </div>
              <div className="project-lead-row">
                <div className="lead-avatar">SC</div>
                <span className="lead-name">Sarah Connor (Lead)</span>
              </div>
              <div className="progress-section">
                <div className="progress-label-row">
                  <span className="progress-label">Progress</span>
                  <span className="progress-pct">60%</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: "60%", backgroundColor: "#2563eb" }}
                  ></div>
                </div>
              </div>
              <div className="project-footer">
                <div className="footer-date">
                  <CalendarIcon /> Due Nov 15
                </div>
                <div className="more-dots">
                  <ThreeDotsIcon />
                </div>
              </div>
            </div>

            {/* Project 2 */}
            <div className="project-card">
              <div className="project-card-header">
                <div>
                  <span className="project-id">#MH-2024-02</span>
                  <h4 className="project-title">Q3 Marketing Asset</h4>
                </div>
                <span className="status-badge wait-approval">
                  Wait Approval
                </span>
              </div>
              <div className="project-lead-row">
                <div
                  className="lead-avatar"
                  style={{ backgroundColor: "#000" }}
                >
                  MR
                </div>
                <span className="lead-name">Mike Ross (Lead)</span>
              </div>
              <div className="progress-section">
                <div className="progress-label-row">
                  <span className="progress-label">Progress</span>
                  <span className="progress-pct">90%</span>
                </div>
                <div className="progress-track">
                  {/* Orange bar */}
                  <div
                    className="progress-fill"
                    style={{ width: "90%", backgroundColor: "#f97316" }}
                  ></div>
                </div>
              </div>
              <div className="project-footer">
                <div className="footer-date">
                  <CalendarIcon /> Due Oct 30
                </div>
                <div className="more-dots">
                  <ThreeDotsIcon />
                </div>
              </div>
            </div>

            {/* Project 3 */}
            <div className="project-card">
              <div className="project-card-header">
                <div>
                  <span className="project-id">#MH-2024-05</span>
                  <h4 className="project-title">Mobile App Fixes</h4>
                </div>
                <span className="status-badge blocked">Blocked</span>
              </div>
              <div className="project-lead-row">
                <div
                  className="lead-avatar"
                  style={{ backgroundColor: "#cbd5e1", color: "#475569" }}
                >
                  JD
                </div>
                <span className="lead-name">John Doe (Lead)</span>
              </div>
              <div className="progress-section">
                <div className="progress-label-row">
                  <span className="progress-label">Progress</span>
                  <span className="progress-pct">25%</span>
                </div>
                <div className="progress-track">
                  {/* Red bar */}
                  <div
                    className="progress-fill"
                    style={{ width: "25%", backgroundColor: "#ef4444" }}
                  ></div>
                </div>
              </div>
              <div className="project-footer">
                <div className="footer-date footer-warning">
                  <AlertTriangleIcon width="14" height="14" /> Dependencies
                  Missing
                </div>
                <div className="more-dots">
                  <ThreeDotsIcon />
                </div>
              </div>
            </div>
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

            <div className="deadline-card">
              <div className="date-box blue">
                <span className="date-month">OCT</span>
                <span className="date-day">26</span>
              </div>
              <div className="deadline-info">
                <h4>Team Sync - Sprint 42</h4>
                <span className="deadline-time">Saturday at 10:00 AM</span>
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
            <div className="workload-item">
              <div className="progress-label-row">
                <span
                  className="progress-label"
                  style={{ color: "#0f172a", fontWeight: 600 }}
                >
                  Development
                </span>
                <span className="progress-label">92% Capacity</span>
              </div>
              <div className="progress-track" style={{ height: "8px" }}>
                <div
                  className="progress-fill"
                  style={{ width: "92%", backgroundColor: "#2563eb" }}
                ></div>
              </div>
            </div>
            <div className="workload-item">
              <div className="progress-label-row">
                <span
                  className="progress-label"
                  style={{ color: "#0f172a", fontWeight: 600 }}
                >
                  Marketing
                </span>
                <span className="progress-label">45% Capacity</span>
              </div>
              <div className="progress-track" style={{ height: "8px" }}>
                <div
                  className="progress-fill"
                  style={{ width: "45%", backgroundColor: "#22c55e" }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAB */}
      <button className="fab-btn" onClick={onCreateProject}>
        <PlusIcon />
      </button>
    </div>
  );
};

export default Dashboard;
