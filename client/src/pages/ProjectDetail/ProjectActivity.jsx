import React, { useState, useEffect } from "react";
import "./ProjectActivity.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
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

const ProjectActivity = ({ project }) => {
  const [filter, setFilter] = useState("All Activity");
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (project?._id) {
      fetchActivities();
    }
  }, [project?._id]);

  const fetchActivities = async () => {
    try {
      const res = await fetch(`/api/projects/${project._id}/activity`);
      const data = await res.json();
      setActivities(data);
    } catch (err) {
      console.error("Failed to fetch activity log", err);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredActivities = () => {
    if (filter === "All Activity") return activities;
    // Simple mapping for filters
    // "Status Changes" -> status_change
    // "Approvals" -> approval
    // "Edits" -> update, challenge_update, risk_update, item_update, departments_update, factor_update
    // "Risks" -> risk_add, challenge_add, factor_add
    // "System" -> system
    return activities.filter((act) => {
      if (filter === "Status Changes") return act.action === "status_change";
      if (filter === "Approvals") return act.action === "approval";
      if (filter === "Edits")
        return [
          "update",
          "challenge_update",
          "challenge_delete",
          "item_add",
          "item_delete",
          "item_update",
          "departments_update",
          "factor_update",
          "risk_update",
        ].includes(act.action);
      if (filter === "Risks")
        return ["risk_add", "challenge_add", "factor_add"].includes(act.action);
      return true;
    });
  };

  // Helper to format item date
  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatDateHeader = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "TODAY";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  // Group by date
  const groupedActivities = () => {
    const groups = [];
    const filtered = getFilteredActivities();
    let lastDate = "";

    filtered.forEach((item) => {
      const dateHeader = formatDateHeader(item.createdAt);
      if (dateHeader !== lastDate) {
        groups.push({ type: "separator", date: dateHeader });
        lastDate = dateHeader;
      }
      groups.push({ ...item, type: "activity" });
    });
    return groups;
  };

  const renderIcon = (type) => {
    switch (type) {
      case "create":
        return <CreateIcon />;
      case "status_change":
        return <SystemIcon />; // Using system icon for status flow
      case "challenge_add":
      case "risk_add":
      case "factor_add":
        return <AlertTriangleIcon />;
      case "approval":
        return <CheckCircleIcon />;
      case "update":
      case "challenge_update":
      case "item_add":
      case "item_delete":
      case "item_update":
      case "departments_update":
      case "factor_update":
      case "risk_update":
      case "challenge_delete":
        return <EditIcon />;
      default:
        return <SystemIcon />;
    }
  };

  const getCardClass = (action) => {
    switch (action) {
      case "create":
        return "card-create";
      case "status_change":
      case "system":
        return "card-system";
      case "risk_add":
      case "challenge_add":
      case "factor_add":
        return "card-risk";
      case "approval":
        return "card-approval";
      case "update":
      case "challenge_update":
      case "item_add":
      case "item_delete":
      case "item_update":
      case "departments_update":
      case "factor_update":
      case "risk_update":
      case "challenge_delete":
        return "card-update";
      default:
        return "card-system";
    }
  };

  if (loading) return <LoadingSpinner />;

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
        {groupedActivities().map((item, index) => {
          if (item.type === "separator") {
            return (
              <div key={`sep-${index}`} className="date-separator">
                <span className="date-badge">{item.date}</span>
              </div>
            );
          }

          return (
            <div key={item._id} className="timeline-item">
              <div
                className={`history-icon-wrapper ${
                  item.action.includes("create")
                    ? "blue"
                    : item.action.includes("approval")
                    ? "green"
                    : item.action.includes("delete")
                    ? "red"
                    : item.action.includes("risk") ||
                      item.action.includes("fact") ||
                      item.action.includes("chall")
                    ? "orange" // Risks/Challenges/Factors are orange warning style or red
                    : "orange" // Updates are orange/yellow
                  // Refine colors:
                  // Create: Blue
                  // Approval: Green
                  // Add: Green
                  // Delete: Red
                  // Risk/Challenge/Factor Add: Red (Alert)
                  // Update: Orange
                } ${
                  // Override specific complex logic if needed, simpler to just map classes in a helper,
                  // but for now verifying against MyActivities styles:
                  // blue, green, orange, purple, red, gray
                  ""
                }`}
              >
                {/* Specific logic for helper function to clean this up */}
                {(() => {
                  if (item.action.includes("create"))
                    return (
                      <div className="activity-icon-large blue">
                        {renderIcon(item.action)}
                      </div>
                    );
                  if (item.action.includes("approval"))
                    return (
                      <div className="activity-icon-large green">
                        {renderIcon(item.action)}
                      </div>
                    );
                  if (item.action.includes("delete"))
                    return (
                      <div className="activity-icon-large red">
                        {renderIcon(item.action)}
                      </div>
                    );
                  if (
                    item.action.includes("risk") ||
                    item.action.includes("challenge_add") ||
                    item.action.includes("factor_add")
                  )
                    return (
                      <div className="activity-icon-large red">
                        {renderIcon(item.action)}
                      </div>
                    );
                  if (item.action.includes("add"))
                    // Item add
                    return (
                      <div className="activity-icon-large green">
                        {renderIcon(item.action)}
                      </div>
                    );
                  return (
                    // Default Update/Edit
                    <div className="activity-icon-large orange">
                      {renderIcon(item.action)}
                    </div>
                  );
                })()}
              </div>

              {/* Card */}
              <div
                className={`history-content-card ${getCardClass(item.action)}`}
              >
                <div className="card-header">
                  <div className="user-row">
                    <div
                      className={`history-user-initials`}
                      style={{ backgroundColor: "#e2e8f0", color: "#64748b" }}
                    >
                      {item.user?.firstName?.[0]}
                      {item.user?.lastName?.[0]}
                    </div>
                    <span className="history-username">
                      {item.user?.firstName} {item.user?.lastName}
                    </span>
                  </div>
                  <span className="history-time">
                    {formatTime(item.createdAt)}
                  </span>
                </div>
                <div className="card-body">
                  <p className="history-description">{item.description}</p>

                  {/* Dynamic Details Rendering based on keys in item.details */}
                  {item.details && item.details.statusChange && (
                    <div className="status-change-row">
                      <div className="status-pill-hist">
                        {item.details.statusChange.from}
                      </div>
                      <span className="val-arrow">→</span>
                      <div className="status-pill-hist in-progress">
                        {item.details.statusChange.to}
                      </div>
                    </div>
                  )}

                  {item.details && item.details.newStatus && (
                    <div className="change-box">
                      <span className="change-label">STATUS UPDATE</span>
                      <span
                        className="val-new"
                        style={{ fontWeight: 600, color: "#0f172a" }}
                      >
                        {item.details.newStatus}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {activities.length === 0 && (
          <div
            style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}
          >
            No activity recorded yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectActivity;
