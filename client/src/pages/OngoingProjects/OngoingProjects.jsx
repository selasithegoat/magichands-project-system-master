import React from "react";
import "./OngoingProjects.css";
// Icons
import ArrowLeftIcon from "../../components/icons/ArrowLeftIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import ThreeDotsIcon from "../../components/icons/ThreeDotsIcon";
import CalendarIcon from "../../components/icons/CalendarIcon";
import AlertTriangleIcon from "../../components/icons/AlertTriangleIcon";
import ClockIcon from "../../components/icons/ClockIcon";

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
          <ArrowLeftIcon />
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
                <button className="card-menu-btn">
                  <ThreeDotsIcon />
                </button>
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
                  <ClockIcon />
                ) : p.urgent ? (
                  <AlertTriangleIcon />
                ) : (
                  <CalendarIcon />
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
