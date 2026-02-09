import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";

import "./ProjectDetails.css";
import {
  ProjectsIcon,
  PencilIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "../../icons/Icons";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";

// Add missing icons locally
const DownloadIcon = ({ width = 14, height = 14, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const SystemIcon = ({ width = 16, height = 16, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const FolderIcon = ({ width = 24, height = 24, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

const ProjectDetails = ({ user }) => {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState([]); // New state for updates

  // Status handling
  const handleStatusChange = async (newStatus) => {
    if (!project) return;
    const oldStatus = project.status;

    // Optimistic update
    setProject({ ...project, status: newStatus });

    try {
      const res = await fetch(`/api/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error("Failed to update status");
      }

      const updatedProject = await res.json();
      setProject(updatedProject);
    } catch (err) {
      console.error("Error updating status:", err);
      // Revert on error
      setProject({ ...project, status: oldStatus });
      alert("Failed to update status");
    }
  };

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        // Initialize edit form with flat structure for general info
        setEditForm({
          client: data.details?.client || "",
          clientEmail: data.details?.clientEmail || "", // [NEW]
          clientPhone: data.details?.clientPhone || "", // [NEW]
          briefOverview: data.details?.briefOverview || "", // [New]
          orderDate: data.orderDate
            ? data.orderDate.split("T")[0]
            : data.createdAt
              ? data.createdAt.split("T")[0]
              : "",
          receivedTime: data.receivedTime || "",
          deliveryDate: data.details?.deliveryDate
            ? data.details.deliveryDate.split("T")[0]
            : "",
          deliveryTime: data.details?.deliveryTime || "",
          deliveryLocation: data.details?.deliveryLocation || "",
          contactType: data.details?.contactType || "",
          supplySource: data.details?.supplySource || "",
        });
      } else {
        console.error("Failed to fetch project");
      }
    } catch (err) {
      console.error("Error fetching project:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUpdates = async () => {
    try {
      const res = await fetch(`/api/updates/project/${id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUpdates(data);
      }
    } catch (err) {
      console.error("Error fetching updates:", err);
    }
  };

  useEffect(() => {
    fetchProject();
    fetchUpdates();

    // Fetch users for Lead Edit
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/auth/users", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAvailableUsers(data);
        }
      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    };
    fetchUsers();
  }, [id]);

  useRealtimeRefresh(
    () => {
      fetchProject();
      fetchUpdates();
    },
    { enabled: Boolean(id) },
  );

  // Lead Edit State
  const [isEditingLead, setIsEditingLead] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [leadForm, setLeadForm] = useState("");
  const [assistantLeadForm, setAssistantLeadForm] = useState("");

  // Sync leadForm when project loads
  useEffect(() => {
    if (project) {
      setLeadForm(project.projectLeadId?._id || project.projectLeadId || "");
      setAssistantLeadForm(
        project.assistantLeadId?._id || project.assistantLeadId || "",
      );
    }
  }, [project]);

  const handleSaveLead = async () => {
    try {
      // Find selected user object for optimistic update (optional but good)
      const selectedUser = availableUsers.find((u) => u._id === leadForm);
      const leadLabel = selectedUser
        ? `${selectedUser.firstName} ${selectedUser.lastName}`
        : "";

      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectLeadId: leadForm,
          assistantLeadId: assistantLeadForm,
          lead: leadLabel, // Also update duplicate lead name in details if needed
        }),
      });

      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setIsEditingLead(false);
      } else {
        alert("Failed to update Project Lead");
      }
    } catch (error) {
      console.error("Error updating lead:", error);
      alert("Error updating lead");
    }
  };

  const handleEditToggle = () => {
    if (!project) return;
    // Reset form to current project state when opening edit
    if (!isEditing) {
      setEditForm({
        client: project.details?.client || "",
        clientEmail: project.details?.clientEmail || "", // [NEW]
        clientPhone: project.details?.clientPhone || "", // [NEW]
        orderDate: project.orderDate
          ? project.orderDate.split("T")[0]
          : project.createdAt
            ? project.createdAt.split("T")[0]
            : "",
        receivedTime: project.receivedTime || "",
        deliveryDate: project.details?.deliveryDate
          ? project.details.deliveryDate.split("T")[0]
          : "",
        deliveryTime: project.details?.deliveryTime || "",
        deliveryLocation: project.details?.deliveryLocation || "",
        contactType: project.details?.contactType || "",
        supplySource: project.details?.supplySource || "",
      });
    }
    setIsEditing(!isEditing);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    try {
      // Construct payload with flattened fields as expected by the controller
      const payload = {
        client: editForm.client,
        clientEmail: editForm.clientEmail, // [NEW]
        clientPhone: editForm.clientPhone, // [NEW]
        briefOverview: editForm.briefOverview, // [New]
        orderDate: editForm.orderDate,
        receivedTime: editForm.receivedTime,
        deliveryDate: editForm.deliveryDate,
        deliveryTime: editForm.deliveryTime,
        deliveryLocation: editForm.deliveryLocation,
        contactType: editForm.contactType,
        supplySource: editForm.supplySource,
      };

      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setIsEditing(false);
      } else {
        console.error("Failed to update project");
        alert("Failed to save changes.");
      }
    } catch (err) {
      console.error("Error saving project:", err);
      alert("Error saving changes.");
    }
  };

  const handleChecklistToggle = async (key, val) => {
    if (!project || !project.quoteDetails) return;

    const currentChecklist = project.quoteDetails.checklist || {};
    const updatedChecklist = { ...currentChecklist, [key]: !val };

    // Optimistic update
    const updatedProject = {
      ...project,
      quoteDetails: {
        ...project.quoteDetails,
        checklist: updatedChecklist,
      },
    };
    setProject(updatedProject);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          quoteDetails: {
            ...project.quoteDetails,
            checklist: updatedChecklist,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update checklist");
      }
    } catch (err) {
      console.error("Error updating checklist:", err);
      alert("Failed to update checklist");
      // Revert is not strictly necessary if we rely on next fetch, but good practice
      // For now, simpler to just re-fetch if needed or rely on alert
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
        Loading details...
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
        Project not found.
      </div>
    );
  }

  // Helpers
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    // ISO string
    if (timeStr.includes("T")) {
      return new Date(timeStr).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    // Check for 12-hour format (e.g. 02:30 PM)
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
    if (match) {
      let [_, h, m, period] = match;
      h = parseInt(h);
      if (period.toUpperCase() === "PM" && h < 12) h += 12;
      if (period.toUpperCase() === "AM" && h === 12) h = 0;
      return `${h.toString().padStart(2, "0")}:${m}`;
    }
    return timeStr;
  };

  const formatReceivedTime = () => {
    if (!project.receivedTime) return "N/A";
    const time = formatTime(project.receivedTime);

    // If original was ISO, formatTime returns just the time.
    // If it was just time string, formatTime returns just the time (converted).
    // We want to show Date + Time if possible.

    if (project.receivedTime.includes("T")) {
      return new Date(project.receivedTime).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    const dateBase = project.orderDate || project.createdAt;
    return `${new Date(dateBase).toLocaleDateString()} at ${time}`;
  };

  const formatLastUpdated = (dateString) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const details = project.details || {};

  const normalizeAttachment = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      return value.url || value.path || value.location || value.filename || null;
    }
    return null;
  };

  return (
    <div
      className={`project-details-page ${
        project &&
        (project.priority === "Urgent" || project.projectType === "Emergency")
          ? "emergency-theme"
          : ""
      }`}
    >
      <Link to="/projects" className="back-link">
        ← Back to Projects
      </Link>

      {project &&
        (project.priority === "Urgent" ||
          project.projectType === "Emergency") && (
          <div className="emergency-banner mb-6">
            <span style={{ fontSize: "1.5rem" }}>🔥</span>
            <span>EMERGENCY PROJECT - URGENT</span>
          </div>
        )}

        <div className="details-header">
          <div className="header-left header-left-vertical">
            <h1 className="header-order">
              {project.orderId || "Order #..."}
            </h1>
            <div className="header-status">
              <select
                className={`status-badge-select ${project.status
                  ?.toLowerCase()
                  .replace(" ", "-")}`}
                value={project.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={
                  loading ||
                  (user &&
                    (project.projectLeadId?._id === user._id ||
                      project.projectLeadId === user._id))
                }
                style={{
                  marginLeft: 0,
                  padding: "0.25rem 0.5rem",
                  borderRadius: "999px",
                  border: "1px solid transparent",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  backgroundColor: "rgba(255, 255, 255, 0.2)", // Translucent background
                  color: "inherit",
                }}
              >
                {(project.projectType === "Quote"
                  ? [
                      "Order Confirmed",
                      "Pending Scope Approval",
                      "Scope Approval Completed",
                      "Pending Quote Request",
                      "Quote Request Completed",
                      "Pending Send Response",
                      "Response Sent",
                      "Completed",
                    ]
                  : [
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
                      "Completed",
                    ]
                ).map((status) => (
                  <option
                    key={status}
                    value={status}
                    style={{ color: "#1e293b" }}
                  >
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <p className="header-project-name">{details.projectName}</p>
          </div>
        </div>

      <div className="details-grid">
        {/* Left Column */}
        <div className="main-info">
          {/* General Info */}
          <div className="detail-card">
            <h3
              className="card-title"
              style={{ justifyContent: "space-between" }}
            >
              <span>
                General Information
                {project.sectionUpdates?.details && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: "normal",
                      marginLeft: "0.75rem",
                    }}
                  >
                    (Last Updated:{" "}
                    {formatLastUpdated(project.sectionUpdates.details)})
                  </span>
                )}
              </span>
              {!isEditing ? (
                !(
                  user &&
                  (project.projectLeadId?._id === user._id ||
                    project.projectLeadId === user._id)
                ) && (
                  <button
                    onClick={handleEditToggle}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                    title="Edit Info"
                  >
                    <PencilIcon width="18" height="18" />
                  </button>
                )
              ) : (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleSave}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#22c55e",
                      cursor: "pointer",
                    }}
                    title="Save"
                  >
                    <CheckCircleIcon width="20" height="20" />
                  </button>
                  <button
                    onClick={handleEditToggle}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                    }}
                    title="Cancel"
                  >
                    <XMarkIcon width="20" height="20" />
                  </button>
                </div>
              )}
            </h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Client</label>
                {isEditing ? (
                  <input
                    className="edit-input"
                    name="client"
                    value={editForm.client}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{details.client || "N/A"}</p>
                )}
              </div>
              <div className="info-item">
                <label>Client Email</label>
                {isEditing ? (
                  <input
                    className="edit-input"
                    name="clientEmail"
                    value={editForm.clientEmail}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{details.clientEmail || "N/A"}</p>
                )}
              </div>
              <div className="info-item">
                <label>Client Phone</label>
                {isEditing ? (
                  <input
                    className="edit-input"
                    name="clientPhone"
                    value={editForm.clientPhone}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{details.clientPhone || "N/A"}</p>
                )}
              </div>
              <div className="info-item">
                <label>Order Date</label>
                {isEditing ? (
                  <input
                    type="date"
                    className="edit-input"
                    name="orderDate"
                    value={editForm.orderDate}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{formatDate(project.orderDate || project.createdAt)}</p>
                )}
              </div>
              <div className="info-item">
                <label>Received Time</label>
                {isEditing ? (
                  <input
                    type="time"
                    className="edit-input"
                    name="receivedTime"
                    value={
                      editForm.receivedTime?.includes("T")
                        ? ""
                        : editForm.receivedTime || ""
                    }
                    onChange={handleChange}
                  />
                ) : (
                  <p>{formatReceivedTime()}</p>
                )}
              </div>
              {project.projectType !== "Quote" && (
                <>
                  <div className="info-item">
                    <label>Delivery</label>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input
                          type="date"
                          className="edit-input"
                          name="deliveryDate"
                          value={editForm.deliveryDate}
                          onChange={handleChange}
                        />
                        <input
                          type="time"
                          className="edit-input"
                          name="deliveryTime"
                          value={editForm.deliveryTime}
                          onChange={handleChange}
                        />
                      </div>
                    ) : (
                      <p>
                        {formatDate(details.deliveryDate)}
                        {details.deliveryTime
                          ? ` @ ${formatTime(details.deliveryTime)}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Location</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="deliveryLocation"
                        value={editForm.deliveryLocation}
                        onChange={handleChange}
                      />
                    ) : (
                      <p>{details.deliveryLocation || "N/A"}</p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Contact Type</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="contactType"
                        value={editForm.contactType}
                        onChange={handleChange}
                      />
                    ) : (
                      <p>{details.contactType || "N/A"}</p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Supply Source</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="supplySource"
                        value={editForm.supplySource}
                        onChange={handleChange}
                      />
                    ) : (
                      <p>{details.supplySource || "N/A"}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Brief Overview Section (Moved from General Info) */}
          {true && (
            <div className="detail-card">
              <h3 className="card-title">Brief Overview</h3>
              <div style={{ marginTop: "1rem" }}>
                {isEditing ? (
                  <textarea
                    className="edit-input"
                    name="briefOverview"
                    value={editForm.briefOverview || ""}
                    onChange={handleChange}
                    rows={4}
                    style={{
                      resize: "vertical",
                      width: "100%",
                      padding: "0.75rem",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "0.95rem",
                    }}
                  />
                ) : (
                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      color: "var(--text-secondary)",
                      lineHeight: "1.6",
                      fontSize: "0.95rem",
                    }}
                  >
                    {details.briefOverview || "No overview provided."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Quote Checklist (Only for Quote projects) */}
          {project.projectType === "Quote" && (
            <div className="detail-card">
              <h3 className="card-title">Quote Requirements</h3>
              <div
                className="checklist-admin-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                  gap: "1rem",
                  marginTop: "1rem",
                }}
              >
                {project.quoteDetails?.checklist ? (
                  Object.entries(project.quoteDetails.checklist).map(
                    ([key, val]) => (
                      <div
                        key={key}
                        onClick={() => handleChecklistToggle(key, val)}
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
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        className="checklist-admin-item"
                      >
                        <span
                          style={{
                            color: val ? "#10b981" : "var(--text-secondary)",
                            fontSize: "1.2rem",
                          }}
                        >
                          {val ? "✓" : "○"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.9rem",
                            color: val ? "#f8fafc" : "var(--text-secondary)",
                            fontWeight: val ? 600 : 400,
                          }}
                        >
                          {key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (str) => str.toUpperCase())}
                        </span>
                      </div>
                    ),
                  )
                ) : (
                  <p style={{ color: "var(--text-secondary)" }}>
                    No checklist requirements.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Reference Material / Image */}
          {(project.sampleImage ||
            details.sampleImage ||
            (project.attachments && project.attachments.length > 0) ||
            (details.attachments && details.attachments.length > 0)) && (
            <div className="detail-card">
              <h3 className="card-title">Reference Material</h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                  marginTop: "1rem",
                }}
              >
                {/* Unified Attachments Grid */}
                <div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(120px, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    {[
                      // Combine sampleImage (if exists) + all attachments
                      ...(project.sampleImage || details.sampleImage
                        ? [project.sampleImage || details.sampleImage]
                        : []),
                      ...(project.attachments || []),
                      ...(details.attachments || []),
                    ]
                      .map(normalizeAttachment)
                      .filter(Boolean)
                      // Filter out duplicates if any (by path string)
                      .filter(
                        (value, index, self) => self.indexOf(value) === index,
                      )
                      .map((path, idx) => {
                        const isImage =
                          typeof path === "string" &&
                          /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
                        // Safe check for path being a string before split
                        const fileName =
                          typeof path === "string"
                            ? path.split("/").pop()
                            : "File";

                        // Debug log for path issues if any
                        // console.log("Rendering attachment path:", path);

                          return (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.4rem",
                              }}
                            >
                              <a
                                href={path}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  position: "relative",
                                  aspectRatio: "1",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "10px",
                                  overflow: "hidden",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(255, 255, 255, 0.03)",
                                  textDecoration: "none",
                                  transition: "transform 0.2s",
                                }}
                                onMouseOver={(e) =>
                                  (e.currentTarget.style.transform =
                                    "scale(1.02)")
                                }
                                onMouseOut={(e) =>
                                  (e.currentTarget.style.transform = "scale(1)")
                                }
                                title={fileName}
                              >
                                {isImage ? (
                                  <img
                                    src={path}
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
                                      padding: "0.75rem",
                                      color: "var(--text-secondary)",
                                      width: "100%",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <FolderIcon width="28" height="28" />
                                    <div
                                      style={{
                                        marginTop: "0.5rem",
                                        fontSize: "0.75rem",
                                        whiteSpace: "nowrap",
                                        textOverflow: "ellipsis",
                                        overflow: "hidden",
                                        color: "#f8fafc",
                                      }}
                                    >
                                      {fileName}
                                    </div>
                                  </div>
                                )}
                              </a>
                              <a
                                href={path}
                                download
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#38bdf8",
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
                </div>
              </div>
          )}

          {/* Order Items */}
          <div className="detail-card">
            <h3 className="card-title">
              {/* ... (Header content unchanged) */}
              <span>
                Order Items
                {project.sectionUpdates?.items && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: "normal",
                      marginLeft: "0.75rem",
                    }}
                  >
                    (Last Updated:{" "}
                    {formatLastUpdated(project.sectionUpdates.items)})
                  </span>
                )}
              </span>
            </h3>
            <div className="card-scroll-area">
              {project.items && project.items.length > 0 ? (
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Detailed Specs</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.items.map((item, i) => (
                      <tr key={i}>
                        <td>{item.description}</td>
                        <td>{item.breakdown || "-"}</td>
                        <td>{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>
                  No items listed.
                </p>
              )}
            </div>
          </div>

          {/* Project Updates */}
          <div className="detail-card">
            <h3 className="card-title">Project Updates</h3>
            <div
              className="updates-list card-scroll-area"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                marginTop: "1rem",
              }}
            >
              {updates && updates.length > 0 ? (
                updates.map((update) => (
                  <div
                    key={update._id}
                    style={{
                      padding: "1rem",
                      background: "rgba(255, 255, 255, 0.03)",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {update.author
                            ? `${update.author.firstName} ${update.author.lastName}`
                            : "System"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-secondary)",
                            background: "rgba(255,255,255,0.1)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          {update.author?.role || "System"}
                        </span>
                        {update.category && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              border: "1px solid var(--border-color)",
                              padding: "2px 6px",
                              borderRadius: "10px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {update.category}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {formatLastUpdated(update.createdAt)}
                      </span>
                    </div>

                    <p
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: "0.95rem",
                        whiteSpace: "pre-wrap",
                        margin: 0,
                      }}
                    >
                      {update.content}
                    </p>

                    {update.attachments && update.attachments.length > 0 && (
                      <div
                        style={{
                          marginTop: "0.75rem",
                          paddingTop: "0.75rem",
                          borderTop: "1px solid var(--border-color)",
                        }}
                      >
                        <a
                          href={update.attachments[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            color: "#6366f1",
                            textDecoration: "none",
                            fontSize: "0.9rem",
                          }}
                        >
                          <DownloadIcon /> {update.attachments[0].name}
                        </a>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>
                  No updates posted yet.
                </p>
              )}
            </div>
          </div>

          {/* Challenges (if any) */}
          {project.challenges && project.challenges.length > 0 && (
            <div className="detail-card">
              <h3 className="card-title">
                <span>
                  Project Challenges
                  {project.sectionUpdates?.challenges && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        fontWeight: "normal",
                        marginLeft: "0.75rem",
                      }}
                    >
                      (Last Updated:{" "}
                      {formatLastUpdated(project.sectionUpdates.challenges)})
                    </span>
                  )}
                </span>
              </h3>
              <div
                className="card-scroll-area"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {project.challenges.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "0.5rem",
                      background: "rgba(239, 68, 68, 0.1)",
                      borderRadius: "6px",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                    }}
                  >
                    <p style={{ fontWeight: 600, color: "#fca5a5" }}>
                      {c.title}
                    </p>
                    <p style={{ fontSize: "0.9rem", color: "#f8fafc" }}>
                      {c.description}
                    </p>
                    <span style={{ fontSize: "0.8rem", color: "#fca5a5" }}>
                      Status: {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="side-info">
          <div className="detail-card">
            <h3
              className="card-title"
              style={{ justifyContent: "space-between" }}
            >
              <span>People & Departments</span>
              {!isEditingLead ? (
                !(
                  user &&
                  (project.projectLeadId?._id === user._id ||
                    project.projectLeadId === user._id)
                ) && (
                  <button
                    onClick={() => setIsEditingLead(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                    title="Edit Lead"
                  >
                    <PencilIcon width="18" height="18" />
                  </button>
                )
              ) : (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleSaveLead}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#22c55e",
                      cursor: "pointer",
                    }}
                    title="Save"
                  >
                    <CheckCircleIcon width="20" height="20" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingLead(false);
                      setLeadForm(
                        project.projectLeadId?._id ||
                          project.projectLeadId ||
                          "",
                      );
                      setAssistantLeadForm(
                        project.assistantLeadId?._id ||
                          project.assistantLeadId ||
                          "",
                      );
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                    }}
                    title="Cancel"
                  >
                    <XMarkIcon width="20" height="20" />
                  </button>
                </div>
              )}
            </h3>
            <div className="info-item" style={{ marginBottom: "1.5rem" }}>
              <label>Project Lead</label>
              {isEditingLead ? (
                <select
                  className="edit-input" // Reuse existing class for styling
                  value={leadForm}
                  onChange={(e) => setLeadForm(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem" }}
                >
                  <option value="">Select a Lead</option>
                  {availableUsers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
              ) : (
                <p>
                  {project.projectLeadId
                    ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
                    : details.lead || "Unassigned"}
                </p>
              )}
            </div>

            <div className="info-item" style={{ marginBottom: "1.5rem" }}>
              <label>Assistant Lead</label>
              {isEditingLead ? (
                <select
                  className="edit-input"
                  value={assistantLeadForm}
                  onChange={(e) => setAssistantLeadForm(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem" }}
                >
                  <option value="">None</option>
                  {availableUsers
                    .filter((u) => u._id !== leadForm)
                    .map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                </select>
              ) : (
                <p>
                  {project.assistantLeadId
                    ? `${project.assistantLeadId.firstName} ${project.assistantLeadId.lastName}`
                    : "None"}
                </p>
              )}
            </div>

            <div className="info-item">
              <label>
                Engaged Departments
                {project.sectionUpdates?.departments && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: "normal",
                      marginTop: "0.25rem",
                      marginBottom: "0.5rem",
                      textTransform: "none",
                      letterSpacing: 0,
                    }}
                  >
                    Updated:{" "}
                    {formatLastUpdated(project.sectionUpdates.departments)}
                  </div>
                )}
              </label>
              <div style={{ marginTop: "0.5rem" }}>
                {project.departments && project.departments.length > 0 ? (
                  project.departments.map((dept, i) => {
                    const isAcknowledged = project.acknowledgements?.some(
                      (a) => a.department === dept,
                    );
                    return (
                      <span
                        key={i}
                        className={`dept-tag ${isAcknowledged ? "acknowledged" : ""}`}
                      >
                        {dept}
                        {isAcknowledged && (
                          <span
                            style={{ marginLeft: "4px", fontSize: "0.7rem" }}
                          >
                            ✓
                          </span>
                        )}
                      </span>
                    );
                  })
                ) : (
                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    None
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Risks / Factors */}
          {(project.uncontrollableFactors?.length > 0 ||
            project.productionRisks?.length > 0) && (
            <div className="detail-card">
              <h3 className="card-title">Risks & Factors</h3>
              {project.uncontrollableFactors?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Uncontrollable Factors
                    {project.sectionUpdates?.uncontrollableFactors && (
                      <span
                        style={{
                          fontWeight: "normal",
                          marginLeft: "0.5rem",
                          opacity: 0.8,
                        }}
                      >
                        (
                        {formatLastUpdated(
                          project.sectionUpdates.uncontrollableFactors,
                        )}
                        )
                      </span>
                    )}
                  </label>
                  <ul
                    style={{
                      paddingLeft: "1.2rem",
                      margin: "0.5rem 0",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {project.uncontrollableFactors.map((f, i) => (
                      <li key={i}>{f.description}</li>
                    ))}
                  </ul>
                </div>
              )}
              {project.productionRisks?.length > 0 && (
                <div>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Production Risks
                    {project.sectionUpdates?.productionRisks && (
                      <span
                        style={{
                          fontWeight: "normal",
                          marginLeft: "0.5rem",
                          opacity: 0.8,
                        }}
                      >
                        (
                        {formatLastUpdated(
                          project.sectionUpdates.productionRisks,
                        )}
                        )
                      </span>
                    )}
                  </label>
                  <ul
                    style={{
                      paddingLeft: "1.2rem",
                      margin: "0.5rem 0",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {project.productionRisks.map((r, i) => (
                      <li key={i}>{r.description}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectDetails;
