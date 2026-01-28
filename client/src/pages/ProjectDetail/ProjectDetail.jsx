import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
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
import { PDFDownloadLink } from "@react-pdf/renderer"; // Import PDFDownloadLink
import ProjectSummaryPDF from "../CreateProject/ProjectSummaryPDF"; // Import ProjectSummaryPDF
import PaintbrushIcon from "../../components/icons/PaintbrushIcon";
import FactoryIcon from "../../components/icons/FactoryIcon";
import PackageIcon from "../../components/icons/PackageIcon";
import TruckIcon from "../../components/icons/TruckIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";

const STATUS_FLOW = [
  "Order Confirmed",
  "Pending Scope Approval",
  "Pending Mockup",
  "Pending Production",
  "Pending Packaging",
  "Pending Delivery/Pickup",
  "Delivered",
];

const QUOTE_STATUS_FLOW = [
  "Order Confirmed",
  "Pending Scope Approval",
  "Pending Quote Request",
  "Pending Send Response",
  "Response Sent",
  "Completed",
];

const getStatusColor = (status) => {
  switch (status) {
    case "Order Confirmed":
      return "#94a3b8"; // Slate
    case "Pending Scope Approval":
      return "#f97316"; // Orange
    case "Pending Mockup":
      return "#a855f7"; // Purple
    case "Pending Production":
      return "#3b82f6"; // Blue
    case "Pending Packaging":
      return "#6366f1"; // Indigo
    case "Pending Delivery/Pickup":
      return "#14b8a6"; // Teal
    case "Delivered":
      return "#22c55e"; // Green
    case "Completed":
      return "#22c55e"; // Green
    case "Pending Quote Request":
      return "#eab308"; // Yellow/Gold
    case "Pending Send Response":
      return "#6366f1"; // Indigo
    case "Response Sent":
      return "#06b6d4"; // Cyan
    default:
      return "#cbd5e1"; // Grey
  }
};

const ProjectDetail = ({ onProjectChange, user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Overview");
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // PDF Image Processing
  const [imageUrls, setImageUrls] = useState({});

  React.useEffect(() => {
    if (!project) return;

    const fetchImages = async () => {
      const urls = {};
      const pathsToFetch = [];
      const details = project.details || {};

      // Add Sample Image
      const sampleImg = project.sampleImage || details.sampleImage;
      if (
        sampleImg &&
        typeof sampleImg === "string" &&
        sampleImg.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)
      ) {
        pathsToFetch.push(sampleImg);
      }

      // Add Attachments
      const attachments = project.attachments || details.attachments;
      if (attachments && Array.isArray(attachments)) {
        attachments.forEach((path) => {
          if (
            typeof path === "string" &&
            path.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i)
          ) {
            pathsToFetch.push(path);
          }
        });
      }

      if (pathsToFetch.length === 0) return;

      console.log("ProjectDetail: Processing images for PDF:", pathsToFetch);

      await Promise.all(
        pathsToFetch.map(async (path) => {
          try {
            // 1. Fetch Blob (from localhost:5000 proxied or direct)
            const res = await fetch(`http://localhost:5000${path}`);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const blob = await res.blob();

            // 2. Load into Image to allow Canvas conversion
            const img = new Image();
            const blobUrl = URL.createObjectURL(blob);
            img.src = blobUrl;

            await new Promise((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = (e) => reject(e);
            });

            // 3. Draw to Canvas and Export as PNG
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);

            // 4. Get PNG Blob
            const pngBlob = await new Promise((resolve) =>
              canvas.toBlob(resolve, "image/png"),
            );

            // 5. Create Object URL for the PNG
            const pngUrl = URL.createObjectURL(pngBlob);
            urls[path] = pngUrl;

            // Cleanup temp url
            URL.revokeObjectURL(blobUrl);
          } catch (err) {
            console.error(`Error processing image ${path}:`, err);
          }
        }),
      );

      setImageUrls(urls);
    };

    fetchImages();
  }, [project]);

  // Helper to map project data to PDF formData structure
  const getPdfFormData = () => {
    if (!project) return {};
    const details = project.details || {};
    return {
      projectName: details.projectName || project.projectName,
      contactType: details.contactType,
      supplySource: details.supplySource,
      deliveryDate: details.deliveryDate
        ? new Date(details.deliveryDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : "N/A",
      deliveryTime: details.deliveryTime,
      deliveryLocation: details.deliveryLocation,
      briefOverview: details.briefOverview, // Included in Step 5 PDF
      leadLabel: project.projectLeadId
        ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
        : details.lead,
      departments: project.departments,
      items: project.items,
      uncontrollableFactors: project.uncontrollableFactors,
      productionRisks: project.productionRisks,
      attachments: project.attachments || details.attachments,
      sampleImage: project.sampleImage || details.sampleImage,
      details: details, // Fallback for some nested checks in PDF
    };
  };

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

  useEffect(() => {
    if (id) fetchProject();
  }, [id]);

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

  const isEmergency =
    project.priority === "Urgent" || project.projectType === "Emergency";

  return (
    <div
      className={`project-detail-container ${isEmergency ? "emergency-theme" : ""}`}
    >
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
                  : project.status}
              </span>
            </h1>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {/* PDF Download Button */}
            {project && (
              <PDFDownloadLink
                document={
                  <ProjectSummaryPDF
                    formData={getPdfFormData()}
                    imageUrls={imageUrls}
                    pdfType={
                      project.projectType === "Emergency" ||
                      project.priority === "Urgent"
                        ? "EMERGENCY"
                        : project.projectType === "Quote"
                          ? "QUOTE"
                          : project.projectType === "Corporate Job"
                            ? "CORPORATE"
                            : "STANDARD"
                    }
                  />
                }
                fileName={`Project_${project.orderId || "Brief"}.pdf`}
                style={{
                  textDecoration: "none",
                  padding: "0.5rem 1rem",
                  color: "#fff",
                  backgroundColor: "#475569", // Slate color
                  borderRadius: "6px",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                {({ loading }) => (
                  <>
                    <FolderIcon width="16" height="16" color="#ffffff" />
                    {loading ? "Generating..." : "Download Brief"}
                  </>
                )}
              </PDFDownloadLink>
            )}

            {/* Only show Edit if NOT pending acceptance and NOT completed */}
            {project.status !== "Pending Scope Approval" &&
              project.status !== "Completed" && (
                <button
                  className="edit-link"
                  onClick={() => console.log("Edit")}
                >
                  Edit
                </button>
              )}
          </div>
        </div>

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
              <DepartmentsCard
                departments={project.departments}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Completed" ||
                  project.status === "Pending Scope Approval"
                }
              />
              <OrderItemsCard
                items={project.items}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Completed" ||
                  project.status === "Pending Scope Approval"
                }
              />
              <ReferenceMaterialsCard project={project} />
              <RisksCard
                risks={project.uncontrollableFactors}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Completed" ||
                  project.status === "Pending Scope Approval"
                }
              />
              <ProductionRisksCard
                risks={project.productionRisks}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Completed" ||
                  project.status === "Pending Scope Approval"
                }
              />
            </div>
            <div className="side-column">
              <ProgressCard project={project} />
              {/* Quick Actions Removed */}
              <ApprovalsCard
                status={project.status}
                type={project.projectType}
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
  const lead = project.projectLeadId
    ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
    : details.lead || "Unassigned";

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
        {project.status !== "Pending Scope Approval" && (
          <button className="edit-link">
            <EditIcon width="16" height="16" />
          </button>
        )}
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
                color: val ? "#f8fafc" : "var(--text-secondary)",
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

const DepartmentsCard = ({
  departments = [],
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
        <h3 className="card-title">👥 Departments</h3>
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
          departments.map((dept, index) => (
            <span key={index} className="dept-tag">
              <span
                className="dept-dot"
                style={{ background: "#3b82f6" }}
              ></span>{" "}
              {getDepartmentLabel(dept)}
            </span>
          ))
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
                href={`http://localhost:5000${sampleImage}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={`http://localhost:5000${sampleImage}`}
                  alt="Sample"
                  style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                  }}
                />
              </a>
            </div>
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
                  <a
                    key={idx}
                    href={`http://localhost:5000${path}`}
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
                        src={`http://localhost:5000${path}`}
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
                );
              })}
            </div>
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
        ? `/api/projects/${projectId}/uncontrollable-factors/${editingRisk._id}`
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
                        onClick={() => handleDeleteClick(risk._id)}
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
        onConfirm={confirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
};

const ProductionRisksCard = ({
  risks = [],
  projectId,
  onUpdate,
  readOnly = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState(null);
  const [formData, setFormData] = useState({ description: "", preventive: "" });
  const [loading, setLoading] = useState(false);

  // Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

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
        ? `/api/projects/${projectId}/production-risks/${editingRisk._id}`
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
                        onClick={() => handleDeleteClick(risk._id)}
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
            <div className="risk-card-footer">
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
        onConfirm={confirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
};

const ProgressCard = ({ project }) => {
  const calculateProgress = (status, type) => {
    if (type === "Quote") {
      switch (status) {
        case "Order Confirmed":
          return 5;
        case "Pending Scope Approval":
          return 25;
        case "Pending Quote Request":
          return 50;
        case "Pending Send Response":
          return 75;
        case "Response Sent":
          return 90;
        case "Completed":
          return 100;
        default:
          return 0;
      }
    }

    switch (status) {
      case "Order Confirmed":
        return 5;
      case "Pending Scope Approval":
        return 15;
      case "Pending Mockup":
        return 30;
      case "Pending Production":
        return 50;
      case "Pending Packaging":
        return 75;
      case "Pending Delivery/Pickup":
        return 90;
      case "Delivered":
        return 100;
      case "Completed":
        return 100;
      default:
        return 0;
    }
  };

  const progress = calculateProgress(project.status, project.projectType);
  const color = getStatusColor(project.status);

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
    </div>
  );
};

const ApprovalsCard = ({ status, type }) => {
  const flow = type === "Quote" ? QUOTE_STATUS_FLOW : STATUS_FLOW;

  // If status is "Completed", we want to show everything as done.
  // We can simulate this by setting index to length of array (past the last item)
  let currentStatusIndex = flow.indexOf(status);

  if (status === "Completed") {
    currentStatusIndex = flow.length;
  }

  const statusIcons = {
    "Order Confirmed": ClipboardListIcon,
    "Pending Scope Approval": EyeIcon,
    "Pending Mockup": PaintbrushIcon,
    "Pending Production": FactoryIcon,
    "Pending Packaging": PackageIcon,
    "Pending Delivery/Pickup": TruckIcon,
    Delivered: CheckCircleIcon,
    "Pending Quote Request": ClipboardListIcon,
    "Pending Send Response": ClockIcon,
    "Response Sent": CheckCircleIcon,
    Completed: CheckCircleIcon,
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">✅ Approvals</h3>
      </div>
      <div className="approval-list">
        {flow.map((step, index) => {
          // Status States:
          // 1. Completed: index < currentStatusIndex
          // 2. Active: index === currentStatusIndex
          // 3. Pending: index > currentStatusIndex

          const isCompleted = index < currentStatusIndex;
          const isActive = index === currentStatusIndex;
          const stepColor = getStatusColor(step); // Get specific color for this step
          const IconComponent = statusIcons[step] || CheckCircleIcon;

          return (
            <div
              key={step}
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
                    {step}
                  </span>
                  {isActive && status !== "Delivered" && (
                    <button className="nudge-btn">Nudge</button>
                  )}
                </div>

                <span className="approval-sub">
                  {isCompleted
                    ? "Completed"
                    : isActive
                      ? "Current Status"
                      : "Pending"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectDetail;
