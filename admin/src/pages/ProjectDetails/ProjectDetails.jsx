import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout/DashboardLayout";
import "./ProjectDetails.css";
import {
  ProjectsIcon,
  PencilIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "../../icons/Icons";

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

const ProjectDetails = () => {
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

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
          // Initialize edit form with flat structure for general info
          setEditForm({
            client: data.details?.client || "",
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
        const res = await fetch(`/api/updates/project/${id}`);
        if (res.ok) {
          const data = await res.json();
          setUpdates(data);
        }
      } catch (err) {
        console.error("Error fetching updates:", err);
      }
    };

    fetchProject();
    fetchUpdates();
  }, [id]);

  const handleEditToggle = () => {
    if (!project) return;
    // Reset form to current project state when opening edit
    if (!isEditing) {
      setEditForm({
        client: project.details?.client || "",
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

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
          Loading details...
        </div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout>
        <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
          Project not found.
        </div>
      </DashboardLayout>
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

  return (
    <DashboardLayout>
      <div className="project-details-page">
        <Link to="/projects" className="back-link">
          ← Back to Projects
        </Link>

        <div className="details-header">
          <div className="header-left">
            <h1>
              {project.orderId || "Order #..."}
              <select
                className={`status-badge-select ${project.status
                  ?.toLowerCase()
                  .replace(" ", "-")}`}
                value={project.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                disabled={loading}
                style={{
                  marginLeft: "1rem",
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
                {[
                  "Order Confirmed",
                  "Pending Scope Approval",
                  "Pending Mockup",
                  "Pending Production",
                  "Pending Packaging",
                  "Pending Delivery/Pickup",
                  "Delivered",
                  "Completed",
                ].map((status) => (
                  <option
                    key={status}
                    value={status}
                    style={{ color: "#1e293b" }}
                  >
                    {status}
                  </option>
                ))}
              </select>
            </h1>
            <p>{details.projectName}</p>
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
                        editForm.receivedTime.includes("T")
                          ? ""
                          : editForm.receivedTime
                      }
                      onChange={handleChange}
                    />
                  ) : (
                    <p>{formatReceivedTime()}</p>
                  )}
                </div>
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
              </div>
            </div>

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
                        <th>Details</th>
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
                            href={`http://localhost:5000${update.attachments[0].url}`}
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
              <h3 className="card-title">People & Departments</h3>
              <div className="info-item" style={{ marginBottom: "1.5rem" }}>
                <label>Project Lead</label>
                <p>
                  {project.projectLeadId
                    ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
                    : details.lead || "Unassigned"}
                </p>
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
                    project.departments.map((dept, i) => (
                      <span key={i} className="dept-tag">
                        {dept}
                      </span>
                    ))
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
                            project.sectionUpdates.uncontrollableFactors
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
                            project.sectionUpdates.productionRisks
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
    </DashboardLayout>
  );
};

export default ProjectDetails;
