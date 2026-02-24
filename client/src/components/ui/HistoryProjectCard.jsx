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

const HistoryProjectCard = ({ project, onViewDetails }) => {
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
    .join(" • ");

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
    >
      {hasSpecialRequirementTag && (
        <div className="special-requirement-watermark" aria-hidden="true">
          {specialRequirementWatermark}
        </div>
      )}
      <div className="card-top-row">
        <div className="order-meta-tags">
          <span className={`project-type-tag ${projectTypeKey}`}>
            {projectTypeLabel}
          </span>
          <span className="order-id-tag">{project.orderId || "NO-ID"}</span>
          {showVersionTag && <span className="version-tag">v{projectVersion}</span>}
        </div>
        <span className="status-badge delivered">
          <CheckCircleIcon width="16" height="16" /> {project.status}
        </span>
      </div>

      <h3 className="card-title">
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

      <div className="card-info-grid">
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
            <span className="info-label">Delivered On</span>
            <span className="info-value">
              {formatDate(details.deliveryDate)}
            </span>
          </div>
        </div>
      </div>

      <div className="card-actions">
        <button
          className="action-btn btn-secondary"
          style={{ width: "100%" }}
          onClick={() => onViewDetails(project._id)}
        >
          <EyeIcon /> View Details
        </button>
      </div>
    </div>
  );
};

export default HistoryProjectCard;
