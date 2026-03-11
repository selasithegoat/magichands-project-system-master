import React from "react";
import "./HistoryProjectCard.css";
// Icons
import BuildingIcon from "../icons/BuildingIcon";
import CalendarIcon from "../icons/CalendarIcon";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import EyeIcon from "../icons/EyeIcon";

const resolveProjectTypeKey = (project) => {
  if (project?.projectType === "Emergency" || project?.priority === "Urgent") {
    return "emergency";
  }
  if (project?.projectType === "Corporate Job") return "corporate";
  if (project?.projectType === "Quote") return "quote";
  return "standard";
};

const getProjectTypeLabel = (typeKey) => {
  switch (typeKey) {
    case "emergency":
      return "EMERGENCY";
    case "corporate":
      return "CORPORATE";
    case "quote":
      return "QUOTE";
    default:
      return "STANDARD";
  }
};

const HistoryProjectCard = ({ project, onViewDetails, animationDelay = 0 }) => {
  const details = project.details || {};
  const projectTypeKey = resolveProjectTypeKey(project);
  const projectTypeLabel = getProjectTypeLabel(projectTypeKey);
  const parsedVersion = Number(project.versionNumber);
  const projectVersion =
    Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
  const showVersionTag = projectVersion > 1;
  const sampleRequirementEnabled =
    project?.projectType !== "Quote" &&
    Boolean(project?.sampleRequirement?.isRequired);
  const corporateEmergencyEnabled =
    project?.projectType === "Corporate Job" &&
    Boolean(project?.corporateEmergency?.isEnabled);
  const hasSpecialRequirementTag =
    sampleRequirementEnabled || corporateEmergencyEnabled;
  const specialRequirementWatermark = [
    corporateEmergencyEnabled ? "Corporate Emergency" : "",
    sampleRequirementEnabled ? "Sample Approval Required" : "",
  ]
    .filter(Boolean)
    .join(" | ");

  // Format Date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div
      className={`history-card history-card-${projectTypeKey} ${
        hasSpecialRequirementTag ? "has-special-awareness" : ""
      }`}
      style={{ "--delay": `${animationDelay}ms` }}
    >
      {hasSpecialRequirementTag && (
        <div className="special-requirement-watermark" aria-hidden="true">
          {specialRequirementWatermark}
        </div>
      )}
      <div className="history-card-header">
        <div className="history-card-tags">
          <span className={`project-type-pill ${projectTypeKey}`}>
            {projectTypeLabel}
          </span>
          <span className="order-id-pill">{project.orderId || "NO-ID"}</span>
          {showVersionTag && <span className="version-tag">v{projectVersion}</span>}
        </div>
        <span className="status-pill delivered">
          <CheckCircleIcon width="16" height="16" /> {project.status}
        </span>
      </div>

      <div className="history-card-title-row">
        <h3 className="history-card-title">
          {details.projectName || "Untitled Project"}
        </h3>
        {hasSpecialRequirementTag && (
          <div className="special-requirements-row">
            {corporateEmergencyEnabled && (
              <span className="special-requirement-tag corporate">
                Corporate Emergency
              </span>
            )}
            {sampleRequirementEnabled && (
              <span className="special-requirement-tag sample">
                Sample Approval Required
              </span>
            )}
          </div>
        )}
      </div>

      <div className="history-card-info">
        <div className="info-item">
          <div className="info-icon">
            <BuildingIcon />
          </div>
          <div className="info-content">
            <span className="info-label">Client</span>
            <span className="info-value">
              {details.client ||
                details.clientName ||
                details.department ||
                "Internal"}
            </span>
          </div>
        </div>
        <div className="info-item">
          <div className="info-icon">
            <CalendarIcon />
          </div>
          <div className="info-content">
            <span className="info-label">Delivered</span>
            <span className="info-value">
              {formatDate(details.deliveryDate)}
            </span>
          </div>
        </div>
      </div>

      <div className="history-card-footer">
        <button
          className="history-card-button"
          onClick={() => onViewDetails(project._id)}
        >
          <EyeIcon /> View Details
        </button>
      </div>
    </div>
  );
};

export default HistoryProjectCard;
