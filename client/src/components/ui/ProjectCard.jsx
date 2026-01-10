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
      case "In Progress":
        return { class: "in-progress", color: "#3b82f6", textClass: "blue" };
      case "Pending Approval":
        return {
          class: "pending-approval",
          color: "#f97316",
          textClass: "orange",
        };
      case "Completed":
        return { class: "completed", color: "#22c55e", textClass: "green" };
      case "On Hold":
        return { class: "on-hold", color: "#ea580c", textClass: "orange" };
      case "Blocked":
        return { class: "blocked", color: "#ef4444", textClass: "red" };
      default:
        return { class: "draft", color: "#cbd5e1", textClass: "blue" };
    }
  };

  const statusInfo = getStatusColor(project.status);

  // Calculate Progress if not provided
  let progress = project.progress;
  if (progress === undefined) {
    if (project.status === "Completed") progress = 100;
    else if (project.status === "Pending Approval") progress = 10;
    else if (project.status === "In Progress") progress = 50;
    else progress = 0;
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
