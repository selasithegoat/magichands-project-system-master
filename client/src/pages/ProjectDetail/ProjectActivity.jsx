import React, { useState } from "react";
import "./ProjectActivity.css";
// Icons
import SearchIcon from "../../components/icons/SearchIcon";
import EditIcon from "../../components/icons/EditIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import AlertTriangleIcon from "../../components/icons/AlertTriangleIcon";
import SystemIcon from "../../components/icons/SystemIcon";
import CreateIcon from "../../components/icons/CreateIcon";
import FlagIcon from "../../components/icons/FlagIcon";

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

const ProjectActivity = () => {
  const [filter, setFilter] = useState("All Activity");

  return (
    <div className="activity-container">
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
                      <FlagIcon /> {item.alert}
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

export default ProjectActivity;
