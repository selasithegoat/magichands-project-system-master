import "./ProjectCard.css";
import CalendarIcon from "../icons/CalendarIcon";
import UserAvatar from "../ui/UserAvatar";
import ThreeDotsIcon from "../icons/ThreeDotsIcon";

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
      case "Delivered":
        return { class: "completed", color: "#22c55e", textClass: "green" };
      default:
        return { class: "draft", color: "#cbd5e1", textClass: "gray" };
    }
  };

  const statusInfo = getStatusColor(project.status);

  // Calculate Progress if not provided
  let progress = project.progress;
  if (progress === undefined) {
    if (project.status === "Delivered") progress = 100;
    else if (project.status === "Pending Delivery/Pickup") progress = 90;
    else if (project.status === "Pending Packaging") progress = 75;
    else if (project.status === "Pending Production") progress = 50;
    else if (project.status === "Pending Mockup") progress = 30;
    else if (project.status === "Pending Scope Approval") progress = 15;
    else progress = 5;
  }

  return (
    <div className="project-card-new">
      <div className="card-header">
        <span className={`status-badge ${statusInfo.class}`}>
          {project.status || "Draft"}
        </span>
        {/* <button className="card-menu-btn">
          <ThreeDotsIcon />
        </button> */}
      </div>

      <div className="card-body">
        <h3 className="project-title-new">
          {project.details?.projectName || "Untitled Project"}
        </h3>
        <span className="project-id">{project.orderId || "#ORD-PENDING"}</span>
        {project.details?.client && (
          <span
            className="project-client"
            style={{
              display: "block",
              fontSize: "0.85rem",
              color: "#64748b",
              marginTop: "4px",
            }}
          >
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
          <div className="progress-track-new">
            <div
              className="progress-fill-new"
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
              name={
                project.createdBy
                  ? `${project.createdBy.firstName} ${project.createdBy.lastName}`
                  : "U"
              }
            />
            <span className="lead-name">
              {project.createdBy
                ? `${project.createdBy.firstName} ${project.createdBy.lastName}`
                : "Unassigned"}
            </span>
          </div>
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
          className={`btn-update ${
            project.status === "Delivered"
              ? "active-finished"
              : "disabled-finished"
          }`}
          onClick={() => {
            // Always pass the current status. The parent handler validates if it is "Delivered"
            // and then handles the update to "Completed".
            onUpdateStatus(project._id, project.status);
          }}
          style={{
            opacity: project.status === "Delivered" ? 1 : 0.6,
            cursor: "pointer",
          }}
        >
          Mark as Finished
        </button>
      </div>
    </div>
  );
};

export default ProjectCard;
