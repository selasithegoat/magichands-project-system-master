import "./ProjectCard.css";
import CalendarIcon from "../icons/CalendarIcon";
import UserAvatar from "../ui/UserAvatar";
import FolderIcon from "../icons/FolderIcon";
import { getLeadAvatarUrl, getLeadDisplay } from "../../utils/leadDisplay";
import { getReferenceFileUrl } from "../../utils/referenceAttachments";
import { renderProjectName } from "../../utils/projectName";
import {
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
  normalizeQuoteStatus,
} from "../../utils/quoteStatus";

const IMAGE_FILE_EXTENSIONS = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i;

const resolveProjectTypeKey = (project) => {
  const typeValue = String(project?.projectType || "").trim().toLowerCase();
  const priorityValue = String(project?.priority || "").trim().toLowerCase();
  if (priorityValue === "urgent" || typeValue.includes("emergency")) {
    return "emergency";
  }
  if (typeValue.includes("corporate")) return "corporate";
  if (typeValue.includes("quote")) return "quote";
  return "standard";
};

const getMockupApprovalStatus = (approval = {}) => {
  const explicit = String(approval?.status || "")
    .trim()
    .toLowerCase();
  if (explicit === "pending" || explicit === "approved" || explicit === "rejected") {
    return explicit;
  }
  if (approval?.isApproved) return "approved";
  if (approval?.rejectedAt || approval?.rejectedBy || approval?.rejectionReason) {
    return "rejected";
  }
  return "pending";
};

const getSampleApprovalStatus = (sampleApproval = {}) => {
  const explicit = String(sampleApproval?.status || "")
    .trim()
    .toLowerCase();
  if (explicit === "pending" || explicit === "approved") {
    return explicit;
  }
  if (sampleApproval?.approvedAt || sampleApproval?.approvedBy) {
    return "approved";
  }
  return "pending";
};

const getProjectReferenceImage = (project) => {
  const sampleImage = getReferenceFileUrl(
    project?.sampleImage || project?.details?.sampleImage,
  );
  if (sampleImage) return sampleImage;

  const attachments = [
    ...(Array.isArray(project?.attachments) ? project.attachments : []),
    ...(Array.isArray(project?.details?.attachments) ? project.details.attachments : []),
  ];

  const firstImage = attachments
    .map((attachment) => getReferenceFileUrl(attachment))
    .find((path) => IMAGE_FILE_EXTENSIONS.test(path.split("?")[0].trim()));

  return firstImage || "";
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
      case "Order Created":
      case "Quote Created":
        return { class: "draft", color: "#94a3b8", textClass: "gray" };
      case "Pending Scope Approval":
        return {
          class: "pending-approval",
          color: "#f97316",
          textClass: "orange",
        };
      case "Pending Departmental Meeting":
        return {
          class: "pending-approval",
          color: "#fb923c",
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
      case "Pending Master Approval":
      case "Master Approval Completed":
        return { class: "in-progress", color: "#ec4899", textClass: "purple" };
      case "Pending Production":
      case "Pending Sample Production":
      case "Production Completed":
        return { class: "in-progress", color: "#3b82f6", textClass: "blue" };
      case "Pending Quality Control":
      case "Quality Control Completed":
        return { class: "in-progress", color: "#10b981", textClass: "green" };
      case "Pending Photography":
      case "Photography Completed":
        return { class: "in-progress", color: "#0ea5e9", textClass: "blue" };
      case "Pending Packaging":
      case "Packaging Completed":
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
      case "Pending Cost Verification":
      case "Pending Sample Retrieval":
      case "Pending Sample / Work done Retrieval":
      case "Pending Quote Submission":
      case "Pending Sample / Work done Sent":
      case "Pending Client Decision":
        return {
          class: "pending-approval",
          color: "#f97316",
          textClass: "orange",
        };
      case "Cost Verification Completed":
      case "Quote Submission Completed":
        return {
          class: "in-progress",
          color: "#d97706",
          textClass: "orange",
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

  const quoteRequirementMode =
    project?.projectType === "Quote"
      ? getQuoteRequirementMode(project?.quoteDetails?.checklist || {})
      : "none";
  const resolvedStatus =
    project?.projectType === "Quote"
      ? normalizeQuoteStatus(project.status)
      : project.status;
  const displayStatus =
    project?.projectType === "Quote"
      ? getQuoteStatusDisplay(project.status, quoteRequirementMode)
      : project.status;
  const isCompletedStatus =
    resolvedStatus === "Completed" ||
    resolvedStatus === "Finished";
  const statusToneTarget =
    project?.projectType === "Quote" ? displayStatus : resolvedStatus;
  const statusInfo = getStatusColor(statusToneTarget);

  const getProjectTypeInfo = (typeKey) => {
    switch (typeKey) {
      case "emergency":
        return { label: "EMERGENCY" };
      case "corporate":
        return { label: "CORPORATE" };
      case "quote":
        return { label: "QUOTE" };
      default:
        return { label: "STANDARD" };
    }
  };

  const projectTypeKey = resolveProjectTypeKey(project);
  const projectTypeInfo = getProjectTypeInfo(projectTypeKey);

  const standardProgressMap = {
    "Order Created": 5,
    "Pending Scope Approval": 15,
    "Scope Approval Completed": 22,
    "Pending Departmental Meeting": 25,
    "Pending Departmental Engagement": 27,
    "Departmental Engagement Completed": 32,
    "Pending Mockup": 38,
    "Mockup Completed": 44,
    "Pending Master Approval": 48,
    "Master Approval Completed": 52,
    "Pending Production": 58,
    "Production Completed": 66,
    "Pending Quality Control": 72,
    "Quality Control Completed": 76,
    "Pending Photography": 80,
    "Photography Completed": 84,
    "Pending Packaging": 88,
    "Packaging Completed": 92,
    "Pending Delivery/Pickup": 95,
    Delivered: 97,
    "Pending Feedback": 98,
    "Feedback Completed": 99,
    Completed: 100,
    Finished: 100,
  };

  const quoteProgressMap = {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Cost Verification": 45,
    "Cost Verification Completed": 55,
    "Pending Quote Submission": 70,
    "Quote Submission Completed": 80,
    "Pending Client Decision": 90,
    Completed: 100,
    Finished: 100,
  };
  const quoteMockupProgressMap = {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Mockup": 45,
    "Mockup Completed": 55,
    "Pending Quote Submission": 70,
    "Quote Submission Completed": 80,
    "Pending Client Decision": 90,
    Completed: 100,
    Finished: 100,
  };
  const quotePreviousSamplesProgressMap = {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Sample Retrieval": 45,
    "Pending Sample / Work done Retrieval": 45,
    "Pending Quote Submission": 70,
    "Pending Sample / Work done Sent": 70,
    "Quote Submission Completed": 80,
    "Pending Client Decision": 90,
    Completed: 100,
    Finished: 100,
  };
  const quoteSampleProductionProgressMap = {
    "Quote Created": 5,
    "Pending Scope Approval": 20,
    "Scope Approval Completed": 30,
    "Pending Mockup": 40,
    "Mockup Completed": 45,
    "Pending Production": 55,
    "Pending Sample Production": 55,
    "Pending Quote Submission": 70,
    "Quote Submission Completed": 80,
    "Pending Client Decision": 90,
    Completed: 100,
    Finished: 100,
  };

  const progressMap =
    project.projectType === "Quote"
      ? quoteRequirementMode === "mockup"
        ? quoteMockupProgressMap
        : quoteRequirementMode === "previousSamples"
          ? quotePreviousSamplesProgressMap
          : quoteRequirementMode === "sampleProduction"
            ? quoteSampleProductionProgressMap
        : quoteProgressMap
      : standardProgressMap;
  const progress = progressMap[statusToneTarget] ?? progressMap[resolvedStatus] ?? 5;
  const leadDisplay = getLeadDisplay(project, "Unassigned");
  const avatarName = getLeadDisplay(project, "U");
  const leadAvatarUrl = getLeadAvatarUrl(project);
  const parsedVersion = Number(project.versionNumber);
  const projectVersion =
    Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
  const showVersionTag = projectVersion > 1;
  const mockupVersionRaw = Number.parseInt(project?.mockup?.version, 10);
  const mockupVersionLabel =
    Number.isFinite(mockupVersionRaw) && mockupVersionRaw > 0
      ? `v${mockupVersionRaw}`
      : "";
  const hasUploadedMockup = Boolean(project?.mockup?.fileUrl);
  const mockupApprovalStatus = getMockupApprovalStatus(
    project?.mockup?.clientApproval || {},
  );
  const sampleRequirementEnabled =
    project?.projectType !== "Quote" &&
    Boolean(project?.sampleRequirement?.isRequired);
  const corporateEmergencyEnabled =
    project?.projectType === "Corporate Job" &&
    Boolean(project?.corporateEmergency?.isEnabled);
  const sampleApprovalStatus = getSampleApprovalStatus(
    project?.sampleApproval || {},
  );
  const sampleApprovalPending =
    sampleRequirementEnabled && sampleApprovalStatus !== "approved";
  const showPendingClientApprovalTag =
    project?.status === "Pending Mockup" &&
    hasUploadedMockup &&
    mockupApprovalStatus === "pending";
  const showPendingSampleApprovalTag =
    project?.status === "Pending Production" &&
    sampleApprovalPending;
  const hasSpecialRequirementTag =
    sampleApprovalPending || corporateEmergencyEnabled;
  const specialRequirementWatermark = [
    corporateEmergencyEnabled ? "Corporate Emergency" : "",
    sampleApprovalPending ? "Sample Approval Required" : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const referenceImage = getProjectReferenceImage(project);
  return (
    <div
      className={`project-card-new project-type-${projectTypeKey} ${
        hasSpecialRequirementTag ? "has-special-awareness" : ""
      }`}
    >
      {hasSpecialRequirementTag && (
        <div className="special-requirement-watermark" aria-hidden="true">
          {specialRequirementWatermark}
        </div>
      )}
      <div className="card-header">
        {/* Project Thumbnail / Avatar */}
        <div className="project-thumbnail-wrapper">
          {referenceImage ? (
            <img
              src={referenceImage}
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
          <span className={`type-badge type-${projectTypeKey}`}>
            {projectTypeInfo.label}
          </span>
          <span className={`status-badge ${statusInfo.class}`}>
            {["Order Created", "Quote Created"].includes(resolvedStatus)
              ? "WAITING ACCEPTANCE"
              : displayStatus || "Draft"}
          </span>
          {showPendingClientApprovalTag && (
            <span className="status-badge mockup-client-pending">
              {mockupVersionLabel
                ? `Mockup ${mockupVersionLabel} client approval pending`
                : "Mockup client approval pending"}
            </span>
          )}
          {corporateEmergencyEnabled && (
            <span className="status-badge corporate-emergency-awareness">
              Corporate Emergency
            </span>
          )}
          {sampleApprovalPending && (
            <span className="status-badge sample-requirement-awareness">
              Sample Approval Required
            </span>
          )}
          {showPendingSampleApprovalTag && (
            <span className="status-badge sample-client-pending">
              Client sample approval pending
            </span>
          )}
        </div>
        {/* <button className="card-menu-btn">
          <ThreeDotsIcon />
        </button> */}
      </div>

      <div className="card-body">
        <h3 className="project-title-new">
          {renderProjectName(project.details, null, "Untitled Project")}
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
              src={leadAvatarUrl}
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
            resolvedStatus === "Completed"
              ? "active-finished"
              : "disabled-finished"
          }`}
          aria-disabled={resolvedStatus !== "Completed"}
          onClick={() => {
            // Always pass the current status. The parent handler validates if it is eligible
            // and then handles the update to "Finished".
            onUpdateStatus(project._id, resolvedStatus);
          }}
        >
          Mark as Finished
        </button>
      </div>
    </div>
  );
};

export default ProjectCard;


