import React from "react";
import "./ProjectCard.css";
import CalendarIcon from "../icons/CalendarIcon";
import UserAvatar from "../ui/UserAvatar";

const ProjectCard = ({ project, onDetails, onUpdateStatus }) => {
  // Helpers
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getStatusClass = (status) => {
    switch (status?.toLowerCase()) {
      case "in progress":
        return "in-progress";
      case "pending approval":
        return "pending-approval";
      case "completed":
        return "completed";
      case "on hold":
      case "blocked":
        return "blocked";
      case "draft":
        return "draft";
      default:
        return "draft";
    }
  };

  const statusClass = getStatusClass(project.status);
  const progress = project.progress || 0;

  return (
    <div className="project-card-new">
      <div className="card-header">
        <span className={`status-badge ${statusClass}`}>
          {project.status || "Draft"}
        </span>
        <div className="more-menu">...</div>
      </div>

      <div className="card-body">
        <h3 className="project-title-new">
          {project.details?.projectName || "Untitled Project"}
        </h3>
        <span className="project-id">{project.orderId || "#ORD-PENDING"}</span>

        <div className="progress-section-new">
          <div className="progress-labels">
            <span>Progress</span>
            <span className="progress-val">{progress}%</span>
          </div>
          <div className="progress-track-new">
            <div
              className="progress-fill-new"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        <div className="lead-row">
          <UserAvatar name={project.details?.lead || "Unassigned"} />
          <span className="lead-name">
            {project.details?.lead || "Unassigned"}
          </span>
          <div className="card-date">
            <CalendarIcon />
            <span>{formatDate(project.details?.deliveryDate)}</span>
          </div>
        </div>
      </div>

      <div className="card-footer">
        <button className="btn-details" onClick={() => onDetails(project._id)}>
          Details
        </button>
        <button
          className="btn-update"
          onClick={() => onUpdateStatus(project._id)}
        >
          Update Status
        </button>
      </div>
    </div>
  );
};

export default ProjectCard;
