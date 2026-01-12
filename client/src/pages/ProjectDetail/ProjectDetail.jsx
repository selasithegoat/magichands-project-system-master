import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
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

const STATUS_FLOW = [
  "Order Confirmed",
  "Pending Scope Approval",
  "Pending Mockup",
  "Pending Production",
  "Pending Packaging",
  "Pending Delivery/Pickup",
  "Delivered",
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
    default:
      return "#cbd5e1"; // Grey
  }
};

const ProjectDetail = ({ onProjectChange }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Overview");
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const [advancing, setAdvancing] = useState(false);
  const [toast, setToast] = useState(null); // Lift toast state up or use context/global ref later? For now, re-using card pattern inside here is tricky unless we move toast up.
  // Actually, OrderItemsCard has its own toast. Let's add a global toast state for ProjectDetail if needed, or just let the button handle it.
  // Wait, I see OrderItemsCard uses a local toast. I should lift it up properly or create a separate one for the main page.
  // For simplicity since I just refactored render props, I'll add a separate toast/portal here or just use a simple state.
  // To avoid duplication, I'll add a `pageToast` state.
  const [pageToast, setPageToast] = useState(null);

  const handleAdvanceStatus = async () => {
    if (!project) return;
    const currentIndex = STATUS_FLOW.indexOf(project.status);
    if (currentIndex === -1 && project.status !== STATUS_FLOW[0]) {
      // If unknown status, maybe start at beginning?
    }

    if (currentIndex >= STATUS_FLOW.length - 1) return; // Already at end

    const nextStatus = STATUS_FLOW[currentIndex + 1] || STATUS_FLOW[0];

    setAdvancing(true);
    try {
      const res = await fetch(`/api/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        setPageToast({
          message: `Status updated to ${nextStatus}`,
          type: "success",
        });
        fetchProject();
        if (onProjectChange) onProjectChange(); // Refresh global count
      } else {
        setPageToast({ message: "Failed to update status", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setPageToast({ message: "Server error", type: "error" });
    } finally {
      setAdvancing(false);
    }
  };

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

  return (
    <div className="project-detail-container">
      <header className="project-header">
        <div className="header-top">
          <div className="header-left">
            <button className="back-button" onClick={() => navigate(-1)}>
              <BackArrow />
            </button>
            <h1 className="project-title">
              {project.orderId || "Unititled"}
              <span className="status-badge">
                <ClockIcon width="14" height="14" /> {project.status}
              </span>
              {project.status !== "Completed" && (
                <button
                  onClick={handleAdvanceStatus}
                  disabled={advancing || project.status === "Delivered"}
                  style={{
                    marginLeft: "12px",
                    padding: "4px 12px",
                    fontSize: "0.75rem",
                    background: "#e0f2fe",
                    color: "#0369a1",
                    border: "none",
                    borderRadius: "20px",
                    cursor:
                      project.status === "Delivered" ? "default" : "pointer",
                    opacity: project.status === "Delivered" ? 0.5 : 1,
                    fontWeight: 600,
                  }}
                >
                  {advancing
                    ? "..."
                    : project.status === "Delivered"
                    ? "Ready to Finish"
                    : "Next Step →"}
                </button>
              )}
            </h1>
          </div>
          <button className="edit-link" onClick={() => console.log("Edit")}>
            Edit
          </button>
        </div>

        {/* Page Level Toast */}
        {pageToast &&
          createPortal(
            <div className="ui-toast-container">
              <Toast
                message={pageToast.message}
                type={pageToast.type}
                onClose={() => setPageToast(null)}
              />
            </div>,
            document.body
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
              <DepartmentsCard departments={project.departments} />
              <OrderItemsCard
                items={project.items}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={project.status === "Completed"}
              />
              <RisksCard
                risks={project.uncontrollableFactors}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={project.status === "Completed"}
              />
              <ProductionRisksCard
                risks={project.productionRisks}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={project.status === "Completed"}
              />
            </div>
            <div className="side-column">
              <ProgressCard project={project} />
              {/* Quick Actions Removed */}
              <ApprovalsCard status={project.status} />
            </div>
          </>
        )}
        {activeTab === "Updates" && <ProjectUpdates project={project} />}
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
  const leadName = details.lead || "Unassigned";

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
        <button className="edit-link">
          <EditIcon width="16" height="16" />
        </button>
      </div>
      <div className="info-grid">
        <div className="info-item">
          <h4>PROJECT LEAD</h4>
          <div className="lead-profile">
            <UserAvatar name={leadName} width="32px" height="32px" />
            <span>{leadName}</span>
          </div>
        </div>
        <div className="info-item">
          <h4>CONTACT</h4>
          {/* Mock contact for now as it's not in schema explicitly other than type */}
          <span className="info-text-bold">{details.contactType || "N/A"}</span>
        </div>
        <div className="info-item">
          <h4>DELIVERY SCHEDULE</h4>
          <div className="info-text-bold">
            <CalendarIcon width="16" height="16" />{" "}
            {formatDate(details.deliveryDate)}
          </div>
          <div className="info-subtext">
            {details.deliveryTime || "All Day"}
          </div>
        </div>
        <div className="info-item">
          <h4>LOCATION</h4>
          <div className="info-text-bold">
            <LocationIcon width="16" height="16" />{" "}
            {details.deliveryLocation || "Unknown"}
          </div>
          <div className="info-subtext">{/* Address placeholder */}</div>
        </div>
      </div>
    </div>
  );
};

const DepartmentsCard = ({ departments = [] }) => {
  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">👥 Departments</h3>
        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
          {departments.length} Engaged
        </span>
      </div>
      <div className="dept-list">
        {departments.length > 0 ? (
          departments.map((dept, i) => (
            <span className="dept-tag" key={i}>
              <span
                className="dept-dot"
                style={{ background: "#3b82f6" }}
              ></span>{" "}
              {dept}
            </span>
          ))
        ) : (
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
            No departments assigned
          </span>
        )}
      </div>
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
        if (onUpdate) onUpdate(); // Refresh parent
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
      {/* Toast Container - Portaled to body for global positioning */}
      {toast &&
        createPortal(
          <div className="ui-toast-container">
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          </div>,
          document.body
        )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        confirmText="Delete"
        type="danger"
      />

      <div className="card-header">
        <h3 className="card-title">📦 Order Items</h3>
        {!readOnly && (
          <button
            className="edit-link"
            onClick={() => setIsAdding(!isAdding)}
            style={{
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            {isAdding ? "Cancel" : "+ Add Item"}
          </button>
        )}
      </div>

      {isAdding && (
        <div
          style={{
            padding: "1rem",
            background: "#f8fafc",
            borderRadius: "8px",
            marginBottom: "1rem",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "grid", gap: "1rem" }}>
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
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
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
              <button
                className="btn-primary"
                style={{ marginLeft: "auto", padding: "0.5rem 1rem" }}
                onClick={handleAddItem}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Item"}
              </button>
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
              <th style={{ width: "40px" }}></th>
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
                    <button
                      onClick={() => handleDeleteItem(item._id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px",
                        opacity: 0.6,
                      }}
                      className="delete-item-btn"
                    >
                      <TrashIcon width="16" height="16" color="#ef4444" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
          No items listed.
        </p>
      )}
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
        }
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
        }
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
  const calculateProgress = (status) => {
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

  const progress = calculateProgress(project.status);
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

const ApprovalsCard = ({ status }) => {
  // If status is "Completed", we want to show everything as done.
  // We can simulate this by setting index to length of array (past the last item)
  let currentStatusIndex = STATUS_FLOW.indexOf(status);

  if (status === "Completed") {
    currentStatusIndex = STATUS_FLOW.length;
  }

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">✅Approvals</h3>
      </div>
      <div className="approval-list">
        {STATUS_FLOW.map((step, index) => {
          // Status States:
          // 1. Completed: index < currentStatusIndex
          // 2. Active: index === currentStatusIndex
          // 3. Pending: index > currentStatusIndex

          const isCompleted = index < currentStatusIndex;
          const isActive = index === currentStatusIndex;
          const stepColor = getStatusColor(step); // Get specific color for this step

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
                    ? "#fff"
                    : "#fff",
                  boxShadow: isActive
                    ? `0 0 0 2px ${stepColor}`
                    : isCompleted
                    ? "none"
                    : `0 0 0 2px #e2e8f0`,
                }}
              >
                {isCompleted ? (
                  <CheckIcon
                    className="check-mark primary"
                    width="14"
                    height="14"
                    color="#fff" // White check on colored background
                    strokeWidth="3"
                  />
                ) : isActive ? (
                  <div
                    className="active-dot"
                    style={{ backgroundColor: stepColor }}
                  ></div>
                ) : null}
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
                        ? "#1e293b" // Keep completed text dark? Or match color? Let's keep dark for readability, maybe title is dark.
                        : "#94a3b8",
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
