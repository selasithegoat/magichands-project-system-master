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
            if (project.status === "Delivered") {
              onUpdateStatus(project._id, "Completed");
            } else {
              // Show toast or alert. Since we don't have a toast prop, we can simple use alert for now or try to use a passed in Toast handler?
              // The user said "give a toast message".
              // ProjectDetail uses a portal toast. Dashboard likely needs one too.
              // For now, I will assume onUpdateStatus can handle the "error" case if I pass null?
              // Or better, I'll let the parent handle the toast if I just pass a specific signal?
              // No, "if clicked while inactive".
              // I will use `window.alert` temporary or better, since I can't easily add a Toast component here without rendering it,
              // I will add a prop `onShowToast` or similar.
              // actually strict requirement: "give a toast message".
              // I'll assume the parent passes a toast handler. Or I create a formatted console log?
              // Wait, I can't leave it as console log.
              // I will trigger `onUpdateStatus` with a special error flag? No.

              // Let's implement a simple logic: The button calls onUpdateStatus.
              // Parent checks status. If invalid, parent shows toast.
              // BUT user said "button should only be active if...".
              // If I handle it in parent, the button behavior is effectively "always active" visually but logic is in parent.

              // Actually, I can import the Toast component into Dashboard and pass a `showToast` function to ProjectCard.
              // Let's modify ProjectCard signature to accept showToast or similar.
              // OR easier: just emit the event 'onMarkFinishedAttempt'.

              // Let's try: `onUpdateStatus(project._id, project.status)` and let Dashboard decide.
              onUpdateStatus(project._id, project.status);
            }
          }}
          style={{
            opacity: project.status === "Delivered" ? 1 : 0.6,
            cursor: "pointer", // Always pointer to allow clicking for toast
          }}
        >
          Mark as Finished
        </button>
      </div>
    </div>
  );
};

export default ProjectCard;
