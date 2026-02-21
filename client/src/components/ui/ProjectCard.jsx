import "./ProjectCard.css";
import CalendarIcon from "../icons/CalendarIcon";
import UserAvatar from "../ui/UserAvatar";
import FolderIcon from "../icons/FolderIcon";
import { getLeadDisplay } from "../../utils/leadDisplay";

const resolveProjectTypeKey = (project) => {
  if (project?.projectType === "Emergency" || project?.priority === "Urgent") {
    return "emergency";
  }
  if (project?.projectType === "Corporate Job") return "corporate";
  if (project?.projectType === "Quote") return "quote";
  return "standard";
};

const ProjectCard = ({ project, onDetails, onUpdateStatus }) => {
  // Helpers
  const formatDate = (dateString) => {
    if (!dateString) return "Pending";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Order Confirmed":
        return { class: "draft", color: "#94a3b8", textClass: "gray" };
      case "Pending Scope Approval":
        return {
          class: "pending-approval",
          color: "#f97316",
          textClass: "orange",
        };
      case "Pending Departmental Engagement":
        return {
          class: "pending-approval",
          color: "#f59e0b",
          textClass: "orange",
        };
      case "Departmental Engagement Completed":
        return {
          class: "in-progress",
          color: "#d97706",
          textClass: "orange",
        };
      case "Pending Mockup":
        return {
          class: "pending-mockup",
          color: "#a855f7",
          textClass: "purple",
        }; // Custom class needed?
      case "Pending Production":
        return { class: "in-progress", color: "#3b82f6", textClass: "blue" };
      case "Pending Packaging":
        return {
          class: "pending-packaging",
          color: "#6366f1",
          textClass: "indigo",
        };
      case "Pending Delivery/Pickup":
        return {
          class: "pending-delivery",
          color: "#14b8a6",
          textClass: "teal",
        };
      case "Pending Feedback":
        return {
          class: "pending-feedback",
          color: "#06b6d4",
          textClass: "teal",
        };
      case "Completed":
        return { class: "completed", color: "#22c55e", textClass: "green" };
      case "Finished":
        return { class: "completed", color: "#22c55e", textClass: "green" };
      case "Delivered":
        return {
          class: "pending-delivery",
          color: "#14b8a6",
          textClass: "teal",
        };
      case "Feedback Completed":
        return { class: "feedback-completed", color: "#06b6d4", textClass: "teal" };
      default:
        return { class: "draft", color: "#cbd5e1", textClass: "gray" };
    }
  };

  const isCompletedStatus =
    project.status === "Completed" || project.status === "Finished";
  const statusInfo = getStatusColor(project.status);

  const getProjectTypeInfo = (typeKey) => {
    switch (typeKey) {
      case "emergency":
        return { label: "EMERGENCY", color: "#e74c3c", bg: "#fef2f2" };
      case "corporate":
        return { label: "CORPORATE", color: "#42a165", bg: "#f0fdf4" };
      case "quote":
        return { label: "QUOTE", color: "#f39c12", bg: "#fffbeb" };
      default:
        return { label: "STANDARD", color: "#3498db", bg: "#eff6ff" };
    }
  };

  const projectTypeKey = resolveProjectTypeKey(project);
  const projectTypeInfo = getProjectTypeInfo(projectTypeKey);

  const standardProgressMap = {
    "Order Confirmed": 5,
    "Pending Scope Approval": 15,
    "Scope Approval Completed": 22,
    "Pending Departmental Engagement": 27,
    "Departmental Engagement Completed": 32,
    "Pending Mockup": 38,
    "Mockup Completed": 46,
    "Pending Production": 56,
    "Production Completed": 68,
    "Pending Packaging": 78,
    "Packaging Completed": 85,
    "Pending Delivery/Pickup": 92,
    Delivered: 95,
    "Pending Feedback": 97,
    "Feedback Completed": 99,
    Completed: 100,
    Finished: 100,
  };

  const quoteProgressMap = {
    "Order Confirmed": 5,
    "Pending Scope Approval": 25,
    "Scope Approval Completed": 35,
    "Pending Departmental Engagement": 42,
    "Departmental Engagement Completed": 48,
    "Pending Quote Request": 50,
    "Quote Request Completed": 60,
    "Pending Send Response": 75,
    "Response Sent": 90,
    Delivered: 95,
    "Pending Feedback": 97,
    "Feedback Completed": 99,
    Completed: 100,
    Finished: 100,
  };

  const progressMap =
    project.projectType === "Quote" ? quoteProgressMap : standardProgressMap;
  const progress = progressMap[project.status] ?? 5;
  const leadDisplay = getLeadDisplay(project, "Unassigned");
  const avatarName = getLeadDisplay(project, "U");
  const parsedVersion = Number(project.versionNumber);
  const projectVersion =
    Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
  const showVersionTag = projectVersion > 1;

  return (
    <div
      className={`project-card-new project-type-${projectTypeKey}`}
    >
      <div className="card-header">
        {/* Project Thumbnail / Avatar */}
        <div className="project-thumbnail-wrapper">
          {project.sampleImage || project.details?.sampleImage ? (
            <img
              src={`${project.sampleImage || project.details.sampleImage}`}
              alt="Project"
              className="project-card-image"
            />
          ) : (
            <div className="project-card-placeholder">
              <FolderIcon width="32" height="32" color="#94a3b8" />
            </div>
          )}
        </div>
        <div className="card-badge-container">
          <span
            className="type-badge"
            style={{
              backgroundColor: projectTypeInfo.bg,
              color: projectTypeInfo.color,
              border: `1px solid ${projectTypeInfo.color}40`,
            }}
          >
            {projectTypeInfo.label}
          </span>
          <span className={`status-badge ${statusInfo.class}`}>
            {project.status === "Order Confirmed"
              ? "WAITING ACCEPTANCE"
              : project.status || "Draft"}
          </span>
        </div>
        {/* <button className="card-menu-btn">
          <ThreeDotsIcon />
        </button> */}
      </div>

      <div className="card-body">
        <h3 className="project-title-new">
          {project.details?.projectName || "Untitled Project"}
        </h3>
        <div className="project-id-row">
          <span className="project-id">{project.orderId || "#ORD-PENDING"}</span>
          {showVersionTag && (
            <span className="version-badge">v{projectVersion}</span>
          )}
        </div>
        {project.details?.client && (
          <span className="project-client">
            {project.details.client}
          </span>
        )}

        <div className="progress-section-new">
          <div className="progress-labels">
            <span>Progress</span>
            <span className={`progress-val ${statusInfo.textClass}`}>
              {progress}%
            </span>
          </div>
          <div
            className={`progress-track-new ${
              isCompletedStatus ? "completed-glow" : ""
            }`}
          >
            <div
              className={`progress-fill-new ${
                isCompletedStatus ? "completed-glow-fill" : ""
              }`}
              style={{
                width: `${progress}%`,
                backgroundColor: statusInfo.color,
              }}
            ></div>
          </div>
        </div>

        <div className="card-meta-row">
          <div className="lead-row">
            <UserAvatar
              width="24px"
              height="24px"
              name={avatarName}
            />
            <span className="lead-name">{leadDisplay}</span>
          </div>
          <div className="card-date" title="Delivery Date">
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
          className={`btn-update ${
            project.status === "Completed"
              ? "active-finished"
              : "disabled-finished"
          }`}
          onClick={() => {
            // Always pass the current status. The parent handler validates if it is "Delivered"
            // and then handles the update to "Completed".
            onUpdateStatus(project._id, project.status);
          }}
          style={{
            opacity: project.status === "Completed" ? 1 : 0.6,
            cursor: project.status === "Completed" ? "pointer" : "not-allowed",
          }}
        >
          Mark as Finished
        </button>
      </div>
    </div>
  );
};

export default ProjectCard;
