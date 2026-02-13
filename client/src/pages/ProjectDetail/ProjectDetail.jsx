import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { DEPARTMENTS, getDepartmentLabel } from "../../constants/departments";
import "./ProjectDetail.css";
import UserAvatar from "../../components/ui/UserAvatar";
import BackArrow from "../../components/icons/BackArrow";
import EditIcon from "../../components/icons/EditIcon";
import LocationIcon from "../../components/icons/LocationIcon";
import CalendarIcon from "../../components/icons/CalendarIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import WarningIcon from "../../components/icons/WarningIcon";
import CheckIcon from "../../components/icons/CheckIcon";
import FolderIcon from "../../components/icons/FolderIcon";
import TrashIcon from "../../components/icons/TrashIcon"; // Import TrashIcon
import Toast from "../../components/ui/Toast";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import ProjectUpdates from "./ProjectUpdates";
import ProjectChallenges from "./ProjectChallenges";
import ProjectActivity from "./ProjectActivity";
import ProgressDonutIcon from "../../components/icons/ProgressDonutIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ClipboardListIcon from "../../components/icons/ClipboardListIcon";
import EyeIcon from "../../components/icons/EyeIcon";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay } from "../../utils/leadDisplay";
import {
  mergeProductionRiskSuggestions,
  requestProductionRiskSuggestions,
} from "../../utils/productionRiskAi";
import ProductionRiskSuggestionModal from "../../components/features/ProductionRiskSuggestionModal";
// Lazy Load PDF Component
const ProjectPdfDownload = React.lazy(
  () => import("../../components/features/ProjectPdfDownload"),
);
import PaintbrushIcon from "../../components/icons/PaintbrushIcon";
import FactoryIcon from "../../components/icons/FactoryIcon";
import PackageIcon from "../../components/icons/PackageIcon";
import TruckIcon from "../../components/icons/TruckIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";

const STATUS_STEPS = [
  { label: "Order Confirmed", statuses: ["Order Confirmed"] },
  {
    label: "Scope Approval",
    statuses: ["Pending Scope Approval", "Scope Approval Completed"],
  },
  { label: "Mockup", statuses: ["Pending Mockup", "Mockup Completed"] },
  {
    label: "Production",
    statuses: ["Pending Production", "Production Completed"],
  },
  {
    label: "Packaging",
    statuses: ["Pending Packaging", "Packaging Completed"],
  },
  {
    label: "Delivery/Pickup",
    statuses: ["Pending Delivery/Pickup", "Delivered"],
  },
  {
    label: "Feedback",
    statuses: ["Pending Feedback", "Feedback Completed"],
  },
];

const QUOTE_STEPS = [
  { label: "Order Confirmed", statuses: ["Order Confirmed"] },
  {
    label: "Scope Approval",
    statuses: ["Pending Scope Approval", "Scope Approval Completed"],
  },
  {
    label: "Quote Request",
    statuses: ["Pending Quote Request", "Quote Request Completed"],
  },
  {
    label: "Send Response",
    statuses: ["Pending Send Response", "Response Sent"],
  },
];

const DEFAULT_WORKFLOW_STATUS = "Order Confirmed";

const STANDARD_WORKFLOW_STATUSES = new Set([
  "Order Confirmed",
  "Pending Scope Approval",
  "Scope Approval Completed",
  "Pending Mockup",
  "Mockup Completed",
  "Pending Production",
  "Production Completed",
  "Pending Packaging",
  "Packaging Completed",
  "Pending Delivery/Pickup",
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
]);

const QUOTE_WORKFLOW_STATUSES = new Set([
  "Order Confirmed",
  "Pending Scope Approval",
  "Scope Approval Completed",
  "Pending Quote Request",
  "Quote Request Completed",
  "Pending Send Response",
  "Response Sent",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
  "Delivered",
]);

const resolveWorkflowStatus = (project) => {
  const isProjectOnHold = Boolean(
    project?.hold?.isOnHold || project?.status === "On Hold",
  );

  if (!isProjectOnHold) {
    return project?.status || DEFAULT_WORKFLOW_STATUS;
  }

  const previousStatus =
    typeof project?.hold?.previousStatus === "string"
      ? project.hold.previousStatus.trim()
      : "";

  if (!previousStatus || previousStatus === "On Hold") {
    return DEFAULT_WORKFLOW_STATUS;
  }

  const validStatuses =
    project?.projectType === "Quote"
      ? QUOTE_WORKFLOW_STATUSES
      : STANDARD_WORKFLOW_STATUSES;

  return validStatuses.has(previousStatus)
    ? previousStatus
    : DEFAULT_WORKFLOW_STATUS;
};

const getStatusColor = (status) => {
  switch (status) {
    case "Order Confirmed":
      return "#94a3b8"; // Slate
    case "Pending Scope Approval":
    case "Scope Approval Completed":
    case "Scope Approval":
      return "#f97316"; // Orange
    case "Pending Mockup":
    case "Mockup Completed":
    case "Mockup":
      return "#a855f7"; // Purple
    case "Pending Production":
    case "Production Completed":
    case "Production":
      return "#3b82f6"; // Blue
    case "Pending Packaging":
    case "Packaging Completed":
    case "Packaging":
      return "#6366f1"; // Indigo
    case "Pending Delivery/Pickup":
    case "Delivered":
    case "Delivery/Pickup":
      return "#14b8a6"; // Teal
    case "Pending Feedback":
    case "Feedback Completed":
    case "Feedback":
      return "#06b6d4"; // Cyan
    case "Completed":
    case "Finished":
      return "#22c55e"; // Green
    case "Pending Quote Request":
    case "Quote Request Completed":
    case "Quote Request":
      return "#eab308"; // Yellow/Gold
    case "Pending Send Response":
    case "Response Sent":
    case "Send Response":
      return "#6366f1"; // Indigo
    default:
      return "#cbd5e1"; // Grey
  }
};

const ProjectDetail = ({ onProjectChange, user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabParam || "Overview");
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatesCount, setUpdatesCount] = useState(0); // [New] Updates count for tab badge

  // PDF Image Processing & Form Data removed - moved to ProjectPdfDownload component

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      setProject(data);
    } catch (err) {
      console.error(err);
      setError("Could not load project details");
    } finally {
      setLoading(false);
    }
  };

  const fetchUpdatesCount = async () => {
    try {
      const res = await fetch(`/api/updates/project/${id}`);
      if (res.ok) {
        const data = await res.json();
        setUpdatesCount(data.length);
      }
    } catch (err) {
      console.error("Error fetching updates count:", err);
    }
  };

  useEffect(() => {
    if (id) fetchProject();
  }, [id]);

  // [New] Fetch updates count
  useEffect(() => {
    if (id) fetchUpdatesCount();
  }, [id]);

  useRealtimeRefresh(
    () => {
      if (id) {
        fetchProject();
        fetchUpdatesCount();
      }
    },
    { enabled: Boolean(id) },
  );

  const handleFinishProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Finished" }),
      });

      if (res.ok) {
        // Force refresh or redirect to history
        navigate("/history");
      } else {
        console.error("Failed to finish project");
        alert(
          "Failed to mark project as finished. Make sure it is 'Completed'.",
        );
      }
    } catch (err) {
      console.error("Error finishing project:", err);
    }
  };

  // Status update logic removed - Admin only feature now.
  // const [advancing, setAdvancing] = useState(false);

  if (loading)
    return (
      <div
        className="project-detail-container"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <LoadingSpinner />
      </div>
    );
  if (error)
    return (
      <div className="project-detail-container">
        <p style={{ padding: "2rem", color: "red" }}>{error}</p>
      </div>
    );
  if (!project) return null;

  const isProjectOnHold = Boolean(
    project.hold?.isOnHold || project.status === "On Hold",
  );
  const workflowStatus = resolveWorkflowStatus(project);

  const isEmergency =
    project.priority === "Urgent" || project.projectType === "Emergency";
  const isCorporate = project.projectType === "Corporate Job";
  const isQuote = project.projectType === "Quote";
  const showFeedbackSection = [
    "Delivered",
    "Pending Feedback",
    "Feedback Completed",
    "Completed",
    "Finished",
  ].includes(project.status);
  const paymentLabels = {
    part_payment: "Part Payment",
    full_payment: "Full Payment",
    po: "P.O",
    authorized: "Authorized",
  };
  const paymentTypes = (project.paymentVerifications || []).map(
    (entry) => entry.type,
  );
  const hasPaymentVerification = paymentTypes.length > 0;
  const invoiceSent = Boolean(project.invoice?.sent);
  const showPaymentWarning =
    !isQuote &&
    !hasPaymentVerification &&
    ["Pending Mockup", "Pending Production", "Scope Approval Completed"].includes(
      project.status,
    );

  let themeClass = "";
  if (isEmergency) themeClass = "emergency-theme";
  else if (isCorporate) themeClass = "corporate-theme";
  else if (isQuote) themeClass = "quote-theme";

  return (
    <div className={`project-detail-container ${themeClass}`}>
      {isEmergency && (
        <div
          style={{
            background: "#fee2e2",
            color: "#991b1b",
            padding: "0.5rem 1rem",
            textAlign: "center",
            fontWeight: "bold",
            borderBottom: "1px solid #fca5a5",
          }}
        >
          🔥 EMERGENCY PROJECT
        </div>
      )}
      {isCorporate && (
        <div
          style={{
            background: "#f0fdf4",
            color: "#166534",
            padding: "0.5rem 1rem",
            textAlign: "center",
            fontWeight: "bold",
            borderBottom: "1px solid #bbf7d0",
          }}
        >
          🏢 CORPORATE JOB
        </div>
      )}
      {isQuote && (
        <div
          style={{
            background: "#fffbeb",
            color: "#b45309",
            padding: "0.5rem 1rem",
            textAlign: "center",
            fontWeight: "bold",
            borderBottom: "1px solid #fde68a",
          }}
        >
          📜 QUOTE REQUEST
        </div>
      )}
      <header className="project-header">
        <div className="header-top">
          <div className="header-left">
            <button className="back-button" onClick={() => navigate(-1)}>
              <BackArrow />
            </button>
            <h1 className="project-title">
              {project.orderId || "Untitled"}
              <span className="status-badge">
                <ClockIcon width="14" height="14" />{" "}
                {project.status === "Pending Scope Approval"
                  ? "WAITING ACCEPTANCE"
                  : project.status.startsWith("Pending ")
                    ? project.status.replace("Pending ", "")
                    : project.status}
              </span>
              {project.status === "Completed" && (
                <button
                  className="btn-primary"
                  onClick={() => handleFinishProject()}
                  style={{
                    marginLeft: "1rem",
                    padding: "0.4rem 0.8rem",
                    fontSize: "0.75rem",
                    backgroundColor: "#10b981",
                  }}
                >
                  Mark as Finished
                </button>
              )}
            </h1>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {/* PDF Download Button - Lazy Loaded */}
            {project && (
              <React.Suspense
                fallback={
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    Loading PDF...
                  </span>
                }
              >
                <ProjectPdfDownload project={project} />
              </React.Suspense>
            )}

            {/* Only show Edit if NOT pending acceptance and NOT completed */}
          </div>
        </div>

        <div className="billing-tags">
          {invoiceSent && (
            <span className="billing-tag invoice">
              {isQuote ? "Quote Sent" : "Invoice Sent"}
            </span>
          )}
          {!isQuote &&
            paymentTypes.map((type) => (
              <span key={type} className="billing-tag payment">
                {paymentLabels[type] || type}
              </span>
            ))}
        </div>
        {showPaymentWarning && (
          <div className="payment-warning">
            Payment verification is required before production can begin.
          </div>
        )}

        {/* Acceptance Banner */}
        {project.status === "Pending Scope Approval" && (
          <div
            className="acceptance-banner"
            style={{
              backgroundColor: "#fff7ed",
              border: "1px solid #fdba74",
              borderRadius: "8px",
              padding: "1rem",
              marginTop: "1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h3 style={{ color: "#9a3412", marginBottom: "0.25rem" }}>
                Project Waiting Acceptance
              </h3>
              <p style={{ color: "#c2410c", fontSize: "0.875rem" }}>
                Review the details below. You must accept this project to start
                work.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                const route =
                  project.projectType === "Quote"
                    ? `/create/quote-wizard?edit=${project._id}`
                    : `/create/wizard?edit=${project._id}`;
                navigate(route);
              }}
              style={{ backgroundColor: "#ea580c" }}
            >
              Accept Project
            </button>
          </div>
        )}

        <div className="project-subtitle">{project.details?.projectName}</div>
        <nav className="header-nav">
          {["Overview", "Updates", "Challenges", "Activities"].map((tab) => (
            <a
              key={tab}
              className={`nav-item ${activeTab === tab ? "active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {tab === "Updates" && updatesCount > 0 && (
                <span
                  style={{
                    marginLeft: "0.4rem",
                    backgroundColor:
                      activeTab === "Updates" ? "white" : "#3b82f6",
                    color: activeTab === "Updates" ? "#3b82f6" : "white",
                    padding: "2px 6px",
                    borderRadius: "999px",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                  }}
                >
                  {updatesCount}
                </span>
              )}
            </a>
          ))}
        </nav>
      </header>

      <main className="project-content">
        {activeTab === "Overview" && (
          <>
            <div className="main-column">
              <ProjectInfoCard project={project} />
              {project.projectType === "Quote" && (
                <QuoteChecklistCard project={project} />
              )}
              {showFeedbackSection && (
                <FeedbackCard feedbacks={project.feedbacks} />
              )}
              <DepartmentsCard
                departments={project.departments}
                acknowledgements={project.acknowledgements}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Finished" ||
                  project.status === "Pending Scope Approval"
                }
              />
              <OrderItemsCard
                items={project.items}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Finished" ||
                  project.status === "Pending Scope Approval"
                }
              />
              <ReferenceMaterialsCard project={project} />
              <ApprovedMockupCard project={project} />
              <RisksCard
                risks={project.uncontrollableFactors}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Finished" ||
                  project.status === "Pending Scope Approval"
                }
              />
              <ProductionRisksCard
                risks={project.productionRisks}
                project={project}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Finished" ||
                  project.status === "Pending Scope Approval"
                }
              />
            </div>
            <div className="side-column">
              <ProgressCard
                project={project}
                workflowStatus={workflowStatus}
                isOnHold={isProjectOnHold}
              />
              {/* Quick Actions Removed */}
              <ApprovalsCard
                workflowStatus={workflowStatus}
                type={project.projectType}
                isOnHold={isProjectOnHold}
              />
            </div>
          </>
        )}
        {activeTab === "Updates" && (
          <ProjectUpdates project={project} currentUser={user} />
        )}
        {activeTab === "Challenges" && (
          <ProjectChallenges project={project} onUpdate={fetchProject} />
        )}
        {activeTab === "Activities" && <ProjectActivity project={project} />}
      </main>
    </div>
  );
};

const ProjectInfoCard = ({ project }) => {
  const details = project.details || {};
  const lead = getLeadDisplay(project, "Unassigned");

  // Format Date
  const formatDate = (d) => {
    if (!d) return "TBD";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">
          <span style={{ color: "#94a3b8" }}>ⓘ</span> Project Info
        </h3>
      </div>
      <div className="info-grid">
        <div className="info-item">
          <h4>PROJECT LEAD</h4>
          <div className="lead-profile">
            <UserAvatar name={lead} width="32px" height="32px" />
            <span>{lead}</span>
          </div>
        </div>
        <div className="info-item">
          <h4>RECEIVED</h4>
          <div className="info-text-bold">
            <ClockIcon width="16" height="16" />{" "}
            {project.receivedTime
              ? project.receivedTime.includes("T")
                ? new Date(project.receivedTime).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : `${new Date(
                    project.orderDate || project.createdAt,
                  ).toLocaleDateString()} | ${project.receivedTime}`
              : "N/A"}
          </div>
        </div>
        {project.projectType !== "Quote" && (
          <div className="info-item">
            <h4>CONTACT</h4>
            <span className="info-text-bold">
              {details.contactType || "N/A"}
            </span>
          </div>
        )}
        <div className="info-item">
          <h4>DELIVERY SCHEDULE</h4>
          <div className="info-text-bold">
            <CalendarIcon width="16" height="16" />{" "}
            {formatDate(details.deliveryDate)}
          </div>
          {project.projectType !== "Quote" && (
            <div className="info-subtext">
              {details.deliveryTime || "All Day"}
            </div>
          )}
        </div>
        {project.projectType !== "Quote" && (
          <div className="info-item">
            <h4>LOCATION</h4>
            <div className="info-text-bold">
              <LocationIcon width="16" height="16" />{" "}
              {details.deliveryLocation || "Unknown"}
            </div>
            <div className="info-subtext"></div>
          </div>
        )}
      </div>
    </div>
  );
};

const QuoteChecklistCard = ({ project }) => {
  const checklist = project.quoteDetails?.checklist || {};

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">📋 Quote Requirements</h3>
      </div>
      <div
        className="checklist-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "1rem",
          marginTop: "1rem",
        }}
      >
        {Object.entries(checklist).map(([key, val]) => (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem",
              background: val
                ? "rgba(16, 185, 129, 0.1)"
                : "rgba(255, 255, 255, 0.03)",
              borderRadius: "8px",
              border: val
                ? "1px solid rgba(16, 185, 129, 0.2)"
                : "1px solid var(--border-color)",
              color: val ? "#10b981" : "var(--text-secondary)",
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: "1.2rem" }}>{val ? "✓" : "○"}</span>
            <span
              style={{
                fontSize: "0.9rem",
                fontWeight: val ? 600 : 400,
                color: val ? "#0c0c0cff" : "var(--text-secondary)",
              }}
            >
              {key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (str) => str.toUpperCase())}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const FeedbackCard = ({ feedbacks = [] }) => {
  const sortedFeedbacks = [...feedbacks].sort((a, b) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  const formatFeedbackDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">Feedback</h3>
      </div>
      {sortedFeedbacks.length === 0 ? (
        <div className="empty-feedback">No feedback submitted yet.</div>
      ) : (
        <div className="feedback-list">
          {sortedFeedbacks.map((feedback) => (
            <div
              className="feedback-item"
              key={feedback._id || feedback.createdAt}
            >
              <div className="feedback-meta">
                <span
                  className={`feedback-pill ${
                    feedback.type === "Positive" ? "positive" : "negative"
                  }`}
                >
                  {feedback.type || "Feedback"}
                </span>
                <span className="feedback-by">
                  {feedback.createdByName || "Unknown"}
                </span>
                <span className="feedback-date">
                  {formatFeedbackDate(feedback.createdAt)}
                </span>
              </div>
              <div className="feedback-notes">
                {feedback.notes?.trim()
                  ? feedback.notes
                  : "No notes provided."}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DepartmentsCard = ({
  departments = [],
  acknowledgements = [],
  projectId,
  onUpdate,
  readOnly = false,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showModal) {
      setSelectedDepts(departments);
    }
  }, [showModal, departments]);

  const toggleDept = (deptId) => {
    if (selectedDepts.includes(deptId)) {
      setSelectedDepts(selectedDepts.filter((d) => d !== deptId));
    } else {
      setSelectedDepts([...selectedDepts, deptId]);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/departments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departments: selectedDepts }),
      });

      if (res.ok) {
        setShowModal(false);
        onUpdate();
      } else {
        console.error("Failed to update departments");
      }
    } catch (err) {
      console.error("Error updating departments:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">
          👥 Departments
          {departments.length > 0 && (
            <span
              style={{
                marginLeft: "0.5rem",
                backgroundColor: "#3b82f6",
                color: "white",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {departments.length}
            </span>
          )}
        </h3>
        {!readOnly && (
          <button
            className="edit-link"
            onClick={() => setShowModal(true)}
            style={{
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            <EditIcon width="14" height="14" /> Edit
          </button>
        )}
      </div>
      <div className="dept-list">
        {departments.length > 0 ? (
          departments.map((dept, index) => {
            const isAcknowledged = acknowledgements?.some(
              (a) => a.department === dept,
            );
            return (
              <span key={index} className="dept-tag">
                <span
                  className="dept-dot"
                  style={{ background: isAcknowledged ? "#10b8a6" : "#3b82f6" }}
                ></span>{" "}
                {getDepartmentLabel(dept)}
                {isAcknowledged && (
                  <span
                    className="acknowledged-badge"
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.65rem",
                      fontWeight: "700",
                      background: "#10b8a6",
                      color: "#fff",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      textTransform: "uppercase",
                    }}
                  >
                    ✓ Acknowledged
                  </span>
                )}
              </span>
            );
          })
        ) : (
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
            No departments assigned
          </span>
        )}
      </div>

      {/* Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div
            className="modal-content"
            style={{ width: "600px", maxWidth: "90vw" }}
          >
            <h3 className="modal-title">Manage Departments</h3>
            <div
              className="dept-selection-list"
              style={{
                maxHeight: "400px",
                overflowY: "auto",
                margin: "1rem 0",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "0.5rem",
                paddingRight: "0.5rem",
              }}
            >
              {DEPARTMENTS.map((dept) => (
                <label
                  key={dept.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    cursor: "pointer",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    backgroundColor: selectedDepts.includes(dept.id)
                      ? "#eff6ff"
                      : "transparent",
                    transition: "all 0.2s",
                    border: selectedDepts.includes(dept.id)
                      ? "1px solid #dbeafe"
                      : "1px solid transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedDepts.includes(dept.id)}
                    onChange={() => toggleDept(dept.id)}
                    style={{
                      width: "16px",
                      height: "16px",
                      accentColor: "#2563eb",
                    }}
                  />
                  <span
                    style={{
                      fontWeight: selectedDepts.includes(dept.id) ? 600 : 400,
                      color: selectedDepts.includes(dept.id)
                        ? "#1e293b"
                        : "#64748b",
                      fontSize: "0.875rem",
                    }}
                  >
                    {dept.label}
                  </span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowModal(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const OrderItemsCard = ({
  items = [],
  projectId,
  onUpdate,
  readOnly = false,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // Track item being edited
  const [newItem, setNewItem] = useState({
    description: "",
    breakdown: "",
    qty: 1,
  });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  const showToast = (message, type = "info") => {
    setToast({ message, type });
  };

  const handleAddItem = async () => {
    if (!newItem.description) {
      showToast("Description is required", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });

      if (res.ok) {
        setIsAdding(false);
        setNewItem({ description: "", breakdown: "", qty: 1 });
        showToast("Item added successfully", "success");
        if (onUpdate) onUpdate();
      } else {
        showToast("Failed to add item", "error");
      }
    } catch (err) {
      console.error("Failed to add item", err);
      showToast("Server error", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = async () => {
    if (!newItem.description) {
      showToast("Description is required", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/items/${editingItem._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newItem),
        },
      );

      if (res.ok) {
        setEditingItem(null);
        setNewItem({ description: "", breakdown: "", qty: 1 });
        showToast("Item updated successfully", "success");
        if (onUpdate) onUpdate();
      } else {
        showToast("Failed to update item", "error");
      }
    } catch (err) {
      console.error("Failed to update item", err);
      showToast("Server error", "error");
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (item) => {
    setEditingItem(item);
    setNewItem({
      description: item.description,
      breakdown: item.breakdown,
      qty: item.qty,
    });
    setIsAdding(true); // Reuse the adding UI for editing
  };

  const cancelEditing = () => {
    setIsAdding(false);
    setEditingItem(null);
    setNewItem({ description: "", breakdown: "", qty: 1 });
  };

  const handleDeleteItem = (itemId) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Item",
      message:
        "Are you sure you want to remove this item? This action cannot be undone.",
      onConfirm: () => performDelete(itemId),
    });
  };

  const performDelete = async (itemId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/items/${itemId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        showToast("Item deleted successfully", "success");
        if (onUpdate) onUpdate();
      } else {
        showToast("Failed to delete item", "error");
      }
    } catch (err) {
      console.error("Error deleting item:", err);
      showToast("Server error", "error");
    } finally {
      setConfirmDialog({ ...confirmDialog, isOpen: false });
    }
  };

  return (
    <div className="detail-card">
      {/* Toast Container */}
      {toast &&
        createPortal(
          <div className="ui-toast-container">
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          </div>,
          document.body,
        )}

      {/* Confirmation Dialog - Using ConfirmationModal for consistency */}
      <ConfirmationModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        confirmText="Yes, Delete"
        cancelText="No, Keep It"
      />

      <div className="card-header">
        <h3 className="card-title">📦 Order Items</h3>
        {!readOnly && !isAdding && (
          <button
            className="edit-link"
            onClick={() => setIsAdding(true)}
            style={{
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            + Add Item
          </button>
        )}
      </div>

      {isAdding && (
        <div className="edit-item-form">
          <div className="edit-item-grid">
            <input
              type="text"
              placeholder="Description"
              className="input-field"
              value={newItem.description}
              onChange={(e) =>
                setNewItem({ ...newItem, description: e.target.value })
              }
              autoFocus
            />
            <input
              type="text"
              placeholder="Breakdown / Details (Optional)"
              className="input-field"
              value={newItem.breakdown}
              onChange={(e) =>
                setNewItem({ ...newItem, breakdown: e.target.value })
              }
            />
            <div className="edit-item-row">
              <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                Qty:
              </label>
              <input
                type="number"
                min="1"
                className="input-field"
                style={{ width: "80px" }}
                value={newItem.qty}
                onChange={(e) =>
                  setNewItem({ ...newItem, qty: e.target.value })
                }
              />
              <div
                style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}
              >
                <button className="btn-secondary" onClick={cancelEditing}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={editingItem ? handleUpdateItem : handleAddItem}
                  disabled={loading}
                >
                  {loading ? "Saving..." : editingItem ? "Update" : "Add Item"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <table className="items-table">
          <thead>
            <tr>
              <th>DESCRIPTION</th>
              <th style={{ textAlign: "right" }}>QTY</th>
              <th style={{ width: "80px" }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td>
                  <div className="item-desc">
                    <span className="item-name">{item.description}</span>
                    <span className="item-sub">{item.breakdown}</span>
                  </div>
                </td>
                <td className="item-qty">{item.qty}</td>
                <td>
                  {!readOnly && (
                    <div
                      style={{ display: "flex", justifyContent: "flex-end" }}
                    >
                      <button
                        className="btn-icon-small"
                        onClick={() => startEditing(item)}
                        style={{ marginRight: "0.5rem" }}
                      >
                        <EditIcon width="14" height="14" color="#64748b" />
                      </button>
                      <button
                        className="btn-icon-small delete"
                        onClick={() => handleDeleteItem(item._id)}
                      >
                        <TrashIcon width="14" height="14" color="#ef4444" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !isAdding && (
          <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
            No items listed.
          </p>
        )
      )}
    </div>
  );
};

const ReferenceMaterialsCard = ({ project }) => {
  const details = project.details || {};
  const sampleImage = project.sampleImage || details.sampleImage;
  const attachments = project.attachments || details.attachments || [];

  if (!sampleImage && (!attachments || attachments.length === 0)) return null;

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">📎 Reference Materials</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Sample Image */}
          {sampleImage && (
            <div>
            <h4
              style={{
                fontSize: "0.75rem",
                fontWeight: "600",
                color: "#64748b",
                marginBottom: "0.5rem",
                textTransform: "uppercase",
              }}
            >
              Sample Image
            </h4>
              <div
                style={{
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  maxWidth: "200px",
                }}
              >
                <a
                  href={`${sampleImage}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    src={`${sampleImage}`}
                    alt="Sample"
                    style={{
                      width: "100%",
                      height: "auto",
                      display: "block",
                    }}
                  />
                </a>
              </div>
              <a
                href={`${sampleImage}`}
                download
                style={{
                  marginTop: "0.5rem",
                  display: "inline-block",
                  fontSize: "0.75rem",
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Download
              </a>
            </div>
          )}

        {/* Attachments */}
        {attachments.length > 0 && (
          <div>
            <h4
              style={{
                fontSize: "0.75rem",
                fontWeight: "600",
                color: "#64748b",
                marginBottom: "0.5rem",
                textTransform: "uppercase",
              }}
            >
              Attachments ({attachments.length})
            </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                  gap: "0.5rem",
                }}
              >
                {attachments.map((path, idx) => {
                  const isImage = path.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                  const fileName = path.split("/").pop();
                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.35rem",
                      }}
                    >
                      <a
                        href={`${path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          position: "relative",
                          aspectRatio: "1",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#f8fafc", // slate-50
                          textDecoration: "none",
                        }}
                      >
                        {isImage ? (
                          <img
                            src={`${path}`}
                            alt="attachment"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              textAlign: "center",
                              padding: "0.5rem",
                              color: "#64748b",
                              width: "100%",
                              overflow: "hidden",
                            }}
                          >
                            <FolderIcon width="24" height="24" />
                            <div
                              style={{
                                marginTop: "0.25rem",
                                fontSize: "0.7rem",
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                color: "#334155",
                              }}
                            >
                              {fileName}
                            </div>
                          </div>
                        )}
                      </a>
                      <a
                        href={`${path}`}
                        download
                        style={{
                          fontSize: "0.7rem",
                          color: "#2563eb",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        Download
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
        )}
      </div>
    </div>
  );
};

const ApprovedMockupCard = ({ project }) => {
  const mockup = project.mockup || {};
  const mockupUrl = mockup.fileUrl;
  const mockupName =
    mockup.fileName || (mockupUrl ? mockupUrl.split("/").pop() : "");

  if (!mockupUrl) return null;

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">Approved Mockup</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div
          style={{
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            padding: "0.75rem",
            background: "#f8fafc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <a
            href={`${mockupUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#2563eb",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            {mockupName || "View Mockup"}
          </a>
          <a
            href={`${mockupUrl}`}
            download
            style={{
              fontSize: "0.8rem",
              color: "#0f766e",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Download
          </a>
        </div>
        {mockup.note && (
          <div
            style={{
              fontSize: "0.8rem",
              color: "#64748b",
            }}
          >
            Note: {mockup.note}
          </div>
        )}
      </div>
    </div>
  );
};

const RisksCard = ({ risks = [], projectId, onUpdate, readOnly = false }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState(null);
  const [formData, setFormData] = useState({
    description: "",
    responsible: "MH",
    status: "Pending",
  });
  const [loading, setLoading] = useState(false);

  // Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const getRiskEntryId = (risk) => risk?._id || risk?.id || "";

  // Reset form when modal opens
  useEffect(() => {
    if (showModal) {
      if (editingRisk) {
        setFormData({
          description: editingRisk.description,
          responsible: editingRisk.responsible?.value || "MH",
          status: editingRisk.status?.value || "Pending",
        });
      } else {
        setFormData({
          description: "",
          responsible: "MH",
          status: "Pending",
        });
      }
    }
  }, [showModal, editingRisk]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.description) return;

    setLoading(true);
    try {
      const url = editingRisk
        ? `/api/projects/${projectId}/uncontrollable-factors/${getRiskEntryId(editingRisk)}`
        : `/api/projects/${projectId}/uncontrollable-factors`;

      const method = editingRisk ? "PATCH" : "POST";

      const payload = {
        description: formData.description,
        responsible: {
          label: formData.responsible === "MH" ? "Magic Hands" : "Client",
          value: formData.responsible,
        },
        status: {
          label: formData.status,
          value: formData.status,
        },
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingRisk(null);
        onUpdate(); // Refresh project data
      } else {
        console.error("Failed to save factor");
      }
    } catch (err) {
      console.error("Error saving factor:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (factorId) => {
    setDeleteId(factorId);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/uncontrollable-factors/${deleteId}`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        onUpdate();
        setIsDeleteModalOpen(false);
        setDeleteId(null);
      }
    } catch (err) {
      console.error("Error deleting factor:", err);
    }
  };

  return (
    <div className="risk-section">
      <div className="risk-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="risk-title">
          <WarningIcon width="20" height="20" color="#991b1b" /> Uncontrollable
          Factors
        </div>
        <div
          className="risk-count"
          style={{ fontSize: "0.875rem", color: "#7f1d1d" }}
        >
          {risks.length} flagged items {isOpen ? "▲" : "▼"}
        </div>
      </div>
      {isOpen && (
        <>
          <div className="risk-list">
            {risks.length > 0 ? (
              risks.map((risk, i) => (
                <div className="risk-item" key={i}>
                  <div className="risk-icon-wrapper">
                    <div className="risk-dot"></div>
                  </div>
                  <div className="risk-content-main">
                    <h5>{risk.description}</h5>
                    <p>Status: {risk.status?.label || "Pending"}</p>
                  </div>
                  {!readOnly && (
                    <div className="risk-actions">
                      <button
                        className="btn-icon-small"
                        onClick={() => {
                          setEditingRisk(risk);
                          setShowModal(true);
                        }}
                      >
                        <EditIcon width="14" height="14" />
                      </button>
                      <button
                        className="btn-icon-small delete"
                        onClick={() => handleDeleteClick(getRiskEntryId(risk))}
                      >
                        <TrashIcon width="14" height="14" color="#ef4444" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <p style={{ color: "#9ca3af", margin: 0 }}>
                  No uncontrollable factors reported.
                </p>
              </div>
            )}
          </div>
          {!readOnly && (
            <div className="risk-card-footer">
              <button
                className="btn-add-risk"
                onClick={() => {
                  setEditingRisk(null);
                  setShowModal(true);
                }}
              >
                + Add Uncontrollable Factor
              </button>
            </div>
          )}
        </>
      )}

      {/* Inline Modal for adding/editing factor */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: "400px" }}>
            <h3 className="modal-title">
              {editingRisk
                ? "Edit Uncontrollable Factor"
                : "Add Uncontrollable Factor"}
            </h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                />
              </div>
              <div
                className="form-row"
                style={{ display: "flex", gap: "1rem" }}
              >
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Responsible</label>
                  <select
                    className="input-field"
                    value={formData.responsible}
                    onChange={(e) =>
                      setFormData({ ...formData, responsible: e.target.value })
                    }
                  >
                    <option value="MH">Magic Hands</option>
                    <option value="Client">Client</option>
                    <option value="3rd Party">3rd Party</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Status</label>
                  <select
                    className="input-field"
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                  >
                    <option value="Pending">Pending</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Escalated">Escalated</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Factor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Delete Factor"
        message="Are you sure you want to delete this uncontrollable factor? This action cannot be undone."
        confirmText="Yes, Delete"
        cancelText="No, Keep"
        onConfirm={confirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
};

const ProductionRisksCard = ({
  risks = [],
  project = null,
  projectId,
  onUpdate,
  readOnly = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState(null);
  const [formData, setFormData] = useState({ description: "", preventive: "" });
  const [loading, setLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isApplyingAiSuggestions, setIsApplyingAiSuggestions] = useState(false);
  const [showAiReviewModal, setShowAiReviewModal] = useState(false);
  const [pendingAiSuggestions, setPendingAiSuggestions] = useState([]);
  const [aiNotice, setAiNotice] = useState(null);

  // Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const getRiskEntryId = (risk) => risk?._id || risk?.id || "";

  // Reset form when modal opens
  useEffect(() => {
    if (showModal) {
      if (editingRisk) {
        setFormData({
          description: editingRisk.description,
          preventive: editingRisk.preventive,
        });
      } else {
        setFormData({ description: "", preventive: "" });
      }
    }
  }, [showModal, editingRisk]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.description) return;

    setLoading(true);
    try {
      const url = editingRisk
        ? `/api/projects/${projectId}/production-risks/${getRiskEntryId(editingRisk)}`
        : `/api/projects/${projectId}/production-risks`;

      const method = editingRisk ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingRisk(null);
        onUpdate(); // Refresh project data
      } else {
        console.error("Failed to save risk");
      }
    } catch (err) {
      console.error("Error saving risk:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (riskId) => {
    setDeleteId(riskId);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/production-risks/${deleteId}`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        onUpdate();
        setIsDeleteModalOpen(false);
        setDeleteId(null);
      }
    } catch (err) {
      console.error("Error deleting risk:", err);
    }
  };

  const handleMagicAiAssistance = async () => {
    if (isAiLoading || !project || !projectId) return;

    setIsAiLoading(true);
    setAiNotice(null);

    try {
      const suggestions = await requestProductionRiskSuggestions(project);
      const { addedCount, addedSuggestions } = mergeProductionRiskSuggestions(
        risks,
        suggestions,
      );

      if (addedCount === 0) {
        setAiNotice({
          type: "info",
          text: "No new suggestions to add. Update project details and try again.",
        });
        return;
      }

      setPendingAiSuggestions(addedSuggestions);
      setShowAiReviewModal(true);
    } catch (error) {
      setAiNotice({
        type: "error",
        text: error.message || "Magic AI Assistance failed. Please try again.",
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApplyAiSuggestions = async (selectedSuggestions) => {
    if (
      isApplyingAiSuggestions ||
      !projectId ||
      !Array.isArray(selectedSuggestions) ||
      selectedSuggestions.length === 0
    ) {
      return;
    }

    setIsApplyingAiSuggestions(true);
    setAiNotice(null);

    try {
      const { addedCount, addedSuggestions } = mergeProductionRiskSuggestions(
        risks,
        selectedSuggestions,
      );

      if (addedCount === 0) {
        setAiNotice({
          type: "info",
          text: "No new suggestions were added after review.",
        });
        return;
      }

      const results = await Promise.allSettled(
        addedSuggestions.map((suggestion) =>
          fetch(`/api/projects/${projectId}/production-risks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(suggestion),
          }),
        ),
      );

      let successCount = 0;
      let firstFailureMessage = "";

      for (const result of results) {
        if (result.status === "rejected") {
          if (!firstFailureMessage) {
            firstFailureMessage =
              result.reason?.message ||
              "Network error while adding suggested risks.";
          }
          continue;
        }

        if (result.value.ok) {
          successCount += 1;
          continue;
        }

        if (!firstFailureMessage) {
          const errorPayload = await result.value.json().catch(() => ({}));
          firstFailureMessage =
            errorPayload?.message || "Failed to add one or more suggestions.";
        }
      }

      if (successCount > 0) {
        await onUpdate();
      }

      if (successCount === addedCount) {
        setAiNotice({
          type: "success",
          text: `Added ${successCount} reviewed suggestion${successCount === 1 ? "" : "s"}.`,
        });
        return;
      }

      if (successCount > 0) {
        setAiNotice({
          type: "error",
          text:
            firstFailureMessage ||
            `Added ${successCount} of ${addedCount} reviewed suggestions.`,
        });
        return;
      }

      setAiNotice({
        type: "error",
        text: firstFailureMessage || "Unable to add selected suggestions.",
      });
    } catch (error) {
      setAiNotice({
        type: "error",
        text: error.message || "Failed to apply selected suggestions.",
      });
    } finally {
      setIsApplyingAiSuggestions(false);
      setShowAiReviewModal(false);
      setPendingAiSuggestions([]);
    }
  };

  return (
    <div className="detail-card" style={{ padding: "0" }}>
      <div
        className="risk-header"
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderBottom: isOpen ? "1px solid #e2e8f0" : "none" }}
      >
        <div className="risk-title" style={{ color: "#000" }}>
          <span style={{ color: "#eab308" }}>⚠️</span> Production Risks
        </div>
        <div
          className="risk-count"
          style={{ fontSize: "0.875rem", color: "#64748b" }}
        >
          {risks.length} flagged items {isOpen ? "▲" : "▼"}
        </div>
      </div>
      {isOpen && (
        <>
          <div className="risk-list">
            {risks.length > 0 ? (
              risks.map((risk, i) => (
                <div className="risk-item" key={i}>
                  <div className="risk-icon-wrapper">
                    <div
                      className="risk-dot"
                      style={{ backgroundColor: "#eab308" }}
                    ></div>
                  </div>
                  <div className="risk-content-main">
                    <h5>{risk.description}</h5>
                    <p>Preventive: {risk.preventive}</p>
                  </div>
                  {!readOnly && (
                    <div className="risk-actions">
                      <button
                        className="btn-icon-small"
                        onClick={() => {
                          setEditingRisk(risk);
                          setShowModal(true);
                        }}
                      >
                        <EditIcon width="14" height="14" />
                      </button>
                      <button
                        className="btn-icon-small delete"
                        onClick={() => handleDeleteClick(getRiskEntryId(risk))}
                      >
                        <TrashIcon width="14" height="14" color="#ef4444" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <p style={{ color: "#9ca3af", margin: 0 }}>
                  No production risks reported.
                </p>
              </div>
            )}
          </div>

          {!readOnly && (
            <div className="risk-card-footer risk-card-footer-actions">
              <button
                type="button"
                className="btn-magic-ai"
                onClick={handleMagicAiAssistance}
                disabled={isAiLoading || isApplyingAiSuggestions}
              >
                {isAiLoading ? "Generating Suggestions..." : "Magic AI Assistance"}
              </button>
              {aiNotice && (
                <p className={`magic-ai-status ${aiNotice.type}`}>{aiNotice.text}</p>
              )}
              <button
                className="btn-add-risk"
                onClick={() => {
                  setEditingRisk(null);
                  setShowModal(true);
                }}
              >
                + Add Production Risk
              </button>
            </div>
          )}
        </>
      )}

      {/* Inline Modal for adding/editing risk */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: "400px" }}>
            <h3 className="modal-title">
              {editingRisk ? "Edit Production Risk" : "Add Production Risk"}
            </h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Preventive Measures</label>
                <textarea
                  className="input-field"
                  value={formData.preventive}
                  onChange={(e) =>
                    setFormData({ ...formData, preventive: e.target.value })
                  }
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Risk"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Delete Risk"
        message="Are you sure you want to delete this production risk? This action cannot be undone."
        confirmText="Yes, Delete"
        cancelText="No, Keep"
        onConfirm={confirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
      <ProductionRiskSuggestionModal
        isOpen={showAiReviewModal}
        title="Review before add"
        suggestions={pendingAiSuggestions}
        onClose={() => {
          if (isApplyingAiSuggestions) return;
          setShowAiReviewModal(false);
          setPendingAiSuggestions([]);
        }}
        onConfirm={handleApplyAiSuggestions}
        isApplying={isApplyingAiSuggestions}
      />
    </div>
  );
};

const ProgressCard = ({ project, workflowStatus, isOnHold }) => {
  const calculateProgress = (status, type) => {
    if (type === "Quote") {
      switch (status) {
        case "Order Confirmed":
          return 5;
        case "Pending Scope Approval":
          return 25;
        case "Scope Approval Completed":
          return 35;
        case "Pending Quote Request":
          return 50;
        case "Quote Request Completed":
          return 60;
        case "Pending Send Response":
          return 75;
        case "Response Sent":
          return 90;
        case "Pending Feedback":
          return 97;
        case "Feedback Completed":
          return 99;
        case "Completed":
          return 100;
        case "Finished":
          return 100;
        case "Delivered":
          return 95;
        default:
          return 0;
      }
    }

    switch (status) {
      case "Order Confirmed":
        return 5;
      case "Pending Scope Approval":
        return 15;
      case "Scope Approval Completed":
        return 22;
      case "Pending Mockup":
        return 30;
      case "Mockup Completed":
        return 40;
      case "Pending Production":
        return 50;
      case "Production Completed":
        return 65;
      case "Pending Packaging":
        return 75;
      case "Packaging Completed":
        return 82;
      case "Pending Delivery/Pickup":
        return 90;
      case "Delivered":
        return 95;
      case "Pending Feedback":
        return 97;
      case "Feedback Completed":
        return 99;
      case "Completed":
        return 100;
      case "Finished":
        return 100;
      default:
        return 0;
    }
  };

  const progress = calculateProgress(workflowStatus, project.projectType);
  const color = getStatusColor(workflowStatus);

  return (
    <div className="detail-card progress-card">
      <div className="progress-header">
        <span>OVERALL PROGRESS</span>
        {/* Loader icon placeholder */}
        <div
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            border: "2px solid #e2e8f0",
            borderTopColor: "#cbd5e1",
          }}
        ></div>
      </div>
      <div className="chart-container">
        {/* Simple SVG Donut Chart */}
        <ProgressDonutIcon percentage={progress} color={color} />
      </div>
      {isOnHold && (
        <div className="workflow-hold-indicator">
          On Hold - Workflow paused at {workflowStatus}
        </div>
      )}
    </div>
  );
};

const ApprovalsCard = ({ workflowStatus, type, isOnHold }) => {
  const steps = type === "Quote" ? QUOTE_STEPS : STATUS_STEPS;

  // Find current step index
  let currentStepIndex = steps.findIndex((step) =>
    step.statuses.includes(workflowStatus),
  );

  if (currentStepIndex !== -1 && workflowStatus !== "Order Confirmed") {
    // Determine if the status represents a completed step
    const isCompletedVariant =
      workflowStatus.includes("Completed") ||
      workflowStatus === "Delivered" ||
      workflowStatus === "Response Sent";

    if (isCompletedVariant) {
      // If completed, visually move to the next step (making it "Pending")
      currentStepIndex++;
    }
  }

  // Handle global Completed/Finished status
  if (workflowStatus === "Completed" || workflowStatus === "Finished") {
    currentStepIndex = steps.length;
  }

  // Fallback
  if (
    currentStepIndex === -1 &&
    workflowStatus !== "Completed" &&
    workflowStatus !== "Finished"
  ) {
    currentStepIndex = 0;
  }

  const statusIcons = {
    "Order Confirmed": ClipboardListIcon,
    "Scope Approval": EyeIcon,
    Mockup: PaintbrushIcon,
    Production: FactoryIcon,
    Packaging: PackageIcon,
    "Delivery/Pickup": TruckIcon,
    Feedback: CheckCircleIcon,
    "Quote Request": ClipboardListIcon,
    "Send Response": ClockIcon,
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">✅ Approvals</h3>
      </div>
      {isOnHold && (
        <div className="workflow-hold-indicator approvals-hold-indicator">
          On Hold - Workflow paused at {workflowStatus}
        </div>
      )}
      <div className="approval-list">
        {steps.map((step, index) => {
          // Status States:
          // 1. Completed: index < currentStepIndex
          // 2. Active: index === currentStepIndex
          // 3. Pending: index > currentStepIndex

          const isCompleted = index < currentStepIndex;
          const isActive = index === currentStepIndex;
          const stepColor = getStatusColor(step.label); // Get color for this step label
          const IconComponent = statusIcons[step.label] || CheckCircleIcon;

          let subText = "Pending";
          if (isCompleted) {
            subText = "Completed";
          } else if (isActive) {
            const stepStatuses = step.statuses || [];
            const pendingStatus = stepStatuses[0];
            const completedStatus = stepStatuses[stepStatuses.length - 1];

            if (step.label === "Feedback") {
              subText =
                workflowStatus === "Feedback Completed"
                  ? "Completed"
                  : "Pending";
            } else if (workflowStatus === "Order Confirmed") {
              subText = "Confirmed";
            } else if (
              stepStatuses.includes(workflowStatus) &&
              workflowStatus === completedStatus &&
              completedStatus !== pendingStatus
            ) {
              subText = "Completed";
            } else {
              subText = "Pending";
            }
          }

          return (
            <div
              key={step.label}
              className={`approval-item ${isActive ? "active" : ""}`}
            >
              <div
                className={`approval-status ${
                  isCompleted ? "completed" : isActive ? "active" : "pending"
                }`}
                style={{
                  // Override background/border colors with specific step color
                  backgroundColor: isCompleted
                    ? stepColor
                    : isActive
                      ? "#fff"
                      : "#fff",
                  borderColor: isCompleted
                    ? stepColor
                    : isActive
                      ? stepColor
                      : "#e2e8f0",
                  boxShadow: isActive
                    ? `0 0 0 4px ${stepColor}33` // Add a subtle glow for active
                    : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  borderWidth: "2px",
                  borderStyle: "solid",
                  transition: "all 0.3s ease",
                  zIndex: "1",
                }}
              >
                <IconComponent
                  width="16"
                  height="16"
                  color={
                    isCompleted ? "#fff" : isActive ? stepColor : "#cbd5e1"
                  }
                  strokeWidth={isActive ? "2.5" : "2"}
                />
              </div>
              <div className="approval-content">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    className={`approval-title ${
                      isCompleted
                        ? ""
                        : isActive
                          ? "active-text"
                          : "pending-text"
                    }`}
                    style={{
                      color: isActive
                        ? stepColor
                        : isCompleted
                          ? "#1e293b"
                          : "#94a3b8",
                      fontWeight: isActive ? "600" : "500",
                    }}
                  >
                    {step.label}
                  </span>
                  {isActive &&
                    subText === "Pending" &&
                    workflowStatus !== "Order Confirmed"}
                </div>

                <span className="approval-sub">{subText}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectDetail;
