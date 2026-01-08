import React from "react";
import "./OngoingProjects.css";

// Icons
const ArrowLeft = () => (
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
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12 19 5 12 12 5"></polyline>
  </svg>
);

const SearchIcon = () => (
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
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const MoreHorizontal = () => (
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
    <circle cx="12" cy="12" r="1"></circle>
    <circle cx="19" cy="12" r="1"></circle>
    <circle cx="5" cy="12" r="1"></circle>
  </svg>
);

const Calendar = () => (
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

const AlertTriangle = () => (
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
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

const Clock = () => (
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
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);

const OngoingProjects = ({ onNavigateDetail, onBack }) => {
  const projects = [
    {
      id: 1,
      title: "Office Reno - Phase 2",
      orderId: "#ORD-8921",
      status: "In Progress",
      statusClass: "blue",
      progress: 65,
      progressColor: "#2563eb",
      assignee: "Sarah J.",
      date: "Oct 24",
      urgent: false,
    },
    {
      id: 2,
      title: "Q4 Marketing Blast",
      orderId: "#ORD-8922",
      status: "In Progress",
      statusClass: "blue",
      progress: 30,
      progressColor: "#2563eb",
      assignee: "Mike T.",
      date: "Nov 01",
      urgent: true,
    },
    {
      id: 3,
      title: "Website Redesign",
      orderId: "#ORD-9001",
      status: "Review",
      statusClass: "purple",
      progress: 85,
      progressColor: "#a855f7",
      assignee: "Jessica L.",
      date: "Nov 15",
      urgent: false,
    },
    {
      id: 4,
      title: "Mobile App V2",
      orderId: "#ORD-8810",
      status: "On Hold",
      statusClass: "orange",
      progress: 15,
      progressColor: "#ea580c",
      assignee: "David K.",
      date: "Pending",
      urgent: false,
      isPending: true,
    },
    {
      id: 5,
      title: "New Hire Training",
      orderId: "#ORD-9022",
      status: "In Progress",
      statusClass: "blue",
      progress: 90,
      progressColor: "#2563eb",
      assignee: "Amanda R.",
      date: "Dec 05",
      urgent: false,
    },
    {
      id: 6,
      title: "Annual Report",
      orderId: "#ORD-9100",
      status: "In Progress",
      statusClass: "blue",
      progress: 45,
      progressColor: "#2563eb",
      assignee: "Tom H.",
      date: "Jan 10",
      urgent: false,
    },
  ];

  return (
    <div className="ongoing-container">
      {/* Header */}
      <div className="ongoing-header">
        <button className="ongoing-back-btn" onClick={onBack}>
          <ArrowLeft />
        </button>
        <span className="ongoing-title">Ongoing Projects</span>
      </div>

      {/* Stats */}
      <div className="ongoing-stats-row">
        <div>
          <h1 className="stats-main-text">12 Active Orders</h1>
          <span className="stats-sub-text">Updates synced 2m ago</span>
        </div>
        <a className="view-all-link">View All</a>
      </div>

      {/* Search */}
      <div className="ongoing-search-wrapper">
        <SearchIcon style={{ color: "#94a3b8" }} />
        <input
          type="text"
          className="ongoing-search-input"
          placeholder="Search by project or order #..."
        />
      </div>

      {/* Grid */}
      <div className="projects-grid">
        {projects.map((p) => (
          <div className="ongoing-card" key={p.id}>
            {/* Header Row */}
            <div className="card-header-row">
              <span className={`status-pill ${p.statusClass}`}>{p.status}</span>
              <button className="card-menu-btn">
                <MoreHorizontal />
              </button>
            </div>

            {/* Title */}
            <h3 className="project-name">{p.title}</h3>
            <span className="project-code">{p.orderId}</span>

            {/* Progress */}
            <div className="progress-container">
              <div className="progress-info">
                <span>Progress</span>
                <span className={`progress-percent ${p.statusClass}`}>
                  {p.progress}%
                </span>
              </div>
              <div className="track">
                <div
                  className="fill"
                  style={{
                    width: `${p.progress}%`,
                    backgroundColor: p.progressColor,
                  }}
                ></div>
              </div>
            </div>

            {/* Footer Meta */}
            <div className="card-meta-row">
              <div className="user-info">
                {/* Avatar placeholder */}
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    backgroundColor: "#cbd5e1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "10px",
                    fontWeight: "bold",
                    color: "#475569",
                  }}
                >
                  {p.assignee.charAt(0)}
                </div>
                <span className="user-name">{p.assignee}</span>
              </div>

              <div className={`date-info ${p.urgent ? "urgent" : ""}`}>
                {p.isPending ? (
                  <Clock />
                ) : p.urgent ? (
                  <AlertTriangle />
                ) : (
                  <Calendar />
                )}
                {p.date}
              </div>
            </div>

            {/* Actions */}
            <div className="card-actions-row">
              <button className="btn-details" onClick={onNavigateDetail}>
                Details
              </button>
              <button className="btn-update">Update Status</button>
            </div>
          </div>
        ))}
      </div>

      {/* FAB */}
      <button className="fab-btn-blue">+</button>
    </div>
  );
};

export default OngoingProjects;
