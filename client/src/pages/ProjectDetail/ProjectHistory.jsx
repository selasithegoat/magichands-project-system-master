import React, { useState } from "react";
import "./ProjectHistory.css";

// Simple Inline Icons
const SearchIcon = () => (
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
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);
// Edit (Pencil)
const EditIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
  </svg>
);
// Approval (Check Circle)
const CheckCircleIcon = () => (
  <svg
    width="18"
    height="18"
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
// Risk (Triangle Alert)
const AlertTriangleIcon = () => (
  <svg
    width="18"
    height="18"
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
// System (Bot/Cog)
const SystemIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);
// Create (Plus Circle)
const CreateIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="8" x2="12" y2="16"></line>
    <line x1="8" y1="12" x2="16" y2="12"></line>
  </svg>
);
const FlagIconSmall = () => (
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
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
    <line x1="4" y1="22" x2="4" y2="15"></line>
  </svg>
);

const historyData = [
  { type: "separator", date: "TODAY" },
  {
    id: 1,
    type: "edit",
    user: {
      name: "Sarah Jenkins",
      avatar: "https://i.pravatar.cc/150?u=sarah",
    },
    time: "10:42 AM",
    description: "Updated delivery schedule details.",
    change: {
      label: "CHANGED: DELIVERY START TIME",
      oldVal: "09:00 AM",
      newVal: "08:00 AM",
    },
  },
  {
    id: 2,
    type: "approval",
    user: { name: "Mike Thompson", initials: "MT" },
    time: "09:15 AM",
    description: "Marked **Scope Approval** as complete.",
  },
  { type: "separator", date: "OCT 23, 2023" },
  {
    id: 3,
    type: "risk",
    user: { name: "Logistics Team", initials: "LG", color: "yellow" },
    time: "4:30 PM",
    description: "Flagged new Uncontrollable Factor",
    alert: "Union Strike Alert",
  },
  {
    id: 4,
    type: "system",
    user: { name: "System", initials: "sys", color: "gray" },
    time: "2:00 PM",
    description:
      "Project status automatically updated based on Department Engagement.",
    statusChange: {
      from: "New Order",
      to: "In Progress",
    },
  },
  { type: "separator", date: "OCT 20, 2023" },
  {
    id: 5,
    type: "create",
    user: {
      name: "Sarah Jenkins",
      avatar: "https://i.pravatar.cc/150?u=sarah",
    },
    time: "11:00 AM",
    description: "Created project #MH-2023-88.",
  },
];

const ProjectHistory = () => {
  const [filter, setFilter] = useState("All Activity");

  return (
    <div className="history-container">
      {/* Search and Filters */}
      <div className="history-controls">
        <div className="search-bar-wrapper">
          <span className="search-icon-ph">
            <SearchIcon />
          </span>
          <input
            type="text"
            className="history-search-input"
            placeholder="Search activity log..."
          />
        </div>
        <div className="history-filters">
          {[
            "All Activity",
            "Status Changes",
            "Approvals",
            "Edits",
            "Risks",
          ].map((f) => (
            <div
              key={f}
              className={`filter-pill ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="history-timeline">
        {historyData.map((item, index) => {
          if (item.type === "separator") {
            return (
              <div key={`sep-${index}`} className="date-separator">
                <span className="date-badge">{item.date}</span>
              </div>
            );
          }

          return (
            <div key={item.id} className="timeline-item">
              {/* Icon */}
              <div className={`history-icon-wrapper ${item.type}`}>
                {item.type === "edit" && <EditIcon />}
                {item.type === "approval" && <CheckCircleIcon />}
                {item.type === "risk" && <AlertTriangleIcon />}
                {item.type === "system" && <SystemIcon />}
                {item.type === "create" && <CreateIcon />}
              </div>

              {/* Card */}
              <div className="history-content-card">
                <div className="card-header">
                  <div className="user-row">
                    {item.user.avatar ? (
                      <img
                        src={item.user.avatar}
                        alt={item.user.name}
                        className="history-avatar"
                      />
                    ) : item.user.img ? /* Fallback if needed */ null : (
                      <div
                        className={`history-user-initials ${
                          item.user.color || ""
                        }`}
                      >
                        {item.user.initials || item.user.name[0]}
                      </div>
                    )}
                    <span className="history-username">{item.user.name}</span>
                  </div>
                  <span className="history-time">{item.time}</span>
                </div>
                <div className="card-body">
                  <p
                    className="history-description"
                    dangerouslySetInnerHTML={{
                      __html: item.description.replace(
                        /\*\*(.*?)\*\*/g,
                        "<strong>$1</strong>"
                      ),
                    }}
                  />

                  {/* Edit Change Box */}
                  {item.change && (
                    <div className="change-box">
                      <span className="change-label">{item.change.label}</span>
                      <div className="change-values">
                        <span className="val-old">{item.change.oldVal}</span>
                        <span className="val-arrow">→</span>
                        <span className="val-new">{item.change.newVal}</span>
                      </div>
                    </div>
                  )}

                  {/* Alert Box */}
                  {item.alert && (
                    <div className="alert-box">
                      <FlagIconSmall /> {item.alert}
                    </div>
                  )}

                  {/* Status Change */}
                  {item.statusChange && (
                    <div className="status-change-row">
                      <div className="status-pill-hist new-order">
                        {item.statusChange.from}
                      </div>
                      <span className="val-arrow">→</span>
                      <div className="status-pill-hist in-progress">
                        {item.statusChange.to}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="history-footer-loader">Load older activity</p>
    </div>
  );
};

export default ProjectHistory;
