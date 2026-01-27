import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  PRODUCTION_SUB_DEPARTMENTS,
  GRAPHICS_SUB_DEPARTMENTS,
  STORES_SUB_DEPARTMENTS,
  PHOTOGRAPHY_SUB_DEPARTMENTS,
  getDepartmentLabel,
} from "../../constants/departments";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import Toast from "../../components/ui/Toast";
import "./EngagedProjects.css";

const STATUS_OPTIONS = [
  "All",
  "Pending Production",
  "Pending Mockup",
  "Pending Packaging",
  "Pending Delivery/Pickup",
  "Order Confirmed",
  "In Progress",
];

const ITEMS_PER_PAGE = 10;

const EngagedProjects = ({ user }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Filter State
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);

  // Modal State
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [updateForm, setUpdateForm] = useState({
    content: "",
    category: "Production",
    department: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // Determine sub-departments to check based on user's department
  const engagedSubDepts = useMemo(() => {
    const depts = user?.department || [];
    if (depts.includes("Graphics/Design")) return GRAPHICS_SUB_DEPARTMENTS;
    if (depts.includes("Stores")) return STORES_SUB_DEPARTMENTS;
    if (depts.includes("Photography")) return PHOTOGRAPHY_SUB_DEPARTMENTS;
    return PRODUCTION_SUB_DEPARTMENTS; // Default to Production
  }, [user]);

  // Determine user's primary "Engaged" department label
  const primaryDept = useMemo(() => {
    const depts = user?.department || [];
    if (depts.includes("Graphics/Design")) return "Graphics";
    if (depts.includes("Stores")) return "Stores";
    if (depts.includes("Photography")) return "Photography";
    return "Production";
  }, [user]);

  useEffect(() => {
    fetchEngagedProjects();
  }, []);

  const fetchEngagedProjects = async () => {
    try {
      // Use mode=engaged to bypass lead filtering and get all projects
      const res = await fetch("/api/projects?mode=engaged");
      if (res.ok) {
        const data = await res.json();
        // Filter projects that have at least one production sub-department engaged
        const engaged = data.filter((project) => {
          if (!project.departments || project.departments.length === 0)
            return false;
          return project.departments.some((dept) =>
            engagedSubDepts.includes(dept),
          );
        });
        // Exclude completed projects
        const activeEngaged = engaged.filter(
          (p) => p.status !== "Completed" && p.status !== "Delivered",
        );
        setProjects(activeEngaged);
      }
    } catch (err) {
      console.error("Error fetching engaged projects:", err);
      setToast({ type: "error", message: "Failed to load projects." });
    } finally {
      setLoading(false);
    }
  };

  // Filter logic
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      // Status filter
      if (statusFilter !== "All" && project.status !== statusFilter) {
        return false;
      }

      // Search filter (Project ID, Project Name, Lead)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const projectId = (project.orderId || project._id).toLowerCase();
        const projectName = (project.details?.projectName || "").toLowerCase();
        const lead = project.projectLeadId
          ? `${project.projectLeadId.firstName || ""} ${project.projectLeadId.lastName || ""}`.toLowerCase()
          : (project.details?.lead || "").toLowerCase();

        if (
          !projectId.includes(query) &&
          !projectName.includes(query) &&
          !lead.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [projects, statusFilter, searchQuery]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchQuery]);

  // Pagination logic
  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredProjects, currentPage]);

  // Check if project is emergency
  const isEmergency = (project) => {
    return project.priority === "Urgent" || project.projectType === "Emergency";
  };

  // Check if delivery is approaching (within 2 days)
  const isApproachingDelivery = (project) => {
    const deliveryDate = project.details?.deliveryDate;
    if (!deliveryDate) return false;
    const delivery = new Date(deliveryDate);
    const now = new Date();
    const diffMs = delivery - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 0 && diffDays <= 2;
  };

  const handleOpenUpdateModal = (project) => {
    setSelectedProject(project);
    // Get only relevant sub-departments for this project
    const engagedDepts = project.departments.filter((dept) =>
      engagedSubDepts.includes(dept),
    );
    setUpdateForm({
      content: "",
      category: primaryDept,
      department: engagedDepts.length > 0 ? engagedDepts[0] : "",
    });
    setShowUpdateModal(true);
  };

  const handleSubmitUpdate = async (e) => {
    e.preventDefault();
    if (!updateForm.content || !updateForm.department) {
      setToast({
        type: "error",
        message: "Please provide update content and select a department.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const data = new FormData();
      data.append(
        "content",
        `[${getDepartmentLabel(updateForm.department)}] ${updateForm.content}`,
      );
      data.append("category", updateForm.category);
      data.append("isEndOfDayUpdate", false);

      const res = await fetch(`/api/updates/project/${selectedProject._id}`, {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        setToast({ type: "success", message: "Update posted successfully!" });
        setShowUpdateModal(false);
        setSelectedProject(null);
        setUpdateForm({ content: "", category: "Production", department: "" });
      } else {
        const errorData = await res.json();
        setToast({
          type: "error",
          message: errorData.message || "Failed to post update.",
        });
      }
    } catch (err) {
      console.error("Error posting update:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "TBD";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    return timeStr;
  };

  if (loading) {
    return (
      <div className="engaged-projects-container">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="engaged-projects-container">
      <header className="engaged-header">
        <h1>{primaryDept} Projects</h1>
        <p className="engaged-subtitle">
          Projects where the {primaryDept} department is actively engaged.
        </p>
      </header>

      {/* Filter Controls */}
      <div className="filter-controls">
        <div className="filter-group">
          <label>Status</label>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group search-group">
          <label>Search</label>
          <input
            type="text"
            className="filter-input"
            placeholder="Project ID, Name, or Lead..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="filter-results">
          Showing {filteredProjects.length} of {projects.length} projects
        </div>
      </div>

      <div className="engaged-table-wrapper">
        {filteredProjects.length === 0 ? (
          <div className="empty-state">
            <p>No projects match your filters.</p>
          </div>
        ) : (
          <table className="engaged-table">
            <thead>
              <tr>
                <th></th>
                <th>Project ID</th>
                <th>Project Name</th>
                <th>Lead</th>
                <th>Client</th>
                <th>Delivery Date & Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProjects.map((project) => {
                const lead = project.projectLeadId
                  ? `${project.projectLeadId.firstName || ""} ${project.projectLeadId.lastName || ""}`.trim()
                  : project.details?.lead || "Unassigned";
                const client = project.details?.client || "N/A";
                const deliveryDate = formatDate(project.details?.deliveryDate);
                const deliveryTime = formatTime(project.details?.deliveryTime);
                const projectName = project.details?.projectName || "Untitled";
                const emergency = isEmergency(project);
                const approaching = isApproachingDelivery(project);

                return (
                  <tr
                    key={project._id}
                    className={`${emergency ? "emergency-row" : ""} ${approaching ? "approaching-row" : ""}`}
                  >
                    <td className="indicator-cell">
                      {emergency && (
                        <span className="indicator emergency" title="Emergency">
                          🔥
                        </span>
                      )}
                      {approaching && !emergency && (
                        <span
                          className="indicator approaching"
                          title="Approaching Delivery"
                        >
                          ⏰
                        </span>
                      )}
                    </td>
                    <td
                      className="project-id-cell"
                      onClick={() => navigate(`/detail/${project._id}`)}
                    >
                      {project.orderId || project._id.slice(-6).toUpperCase()}
                    </td>
                    <td className="project-name-cell">{projectName}</td>
                    <td>{lead}</td>
                    <td>{client}</td>
                    <td className={approaching ? "delivery-approaching" : ""}>
                      {deliveryDate}
                      {deliveryTime && ` @ ${deliveryTime}`}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${project.status.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="update-btn"
                        onClick={() => handleOpenUpdateModal(project)}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pagination-controls">
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            ← Previous
          </button>
          <div className="pagination-info">
            Page {currentPage} of {totalPages}
          </div>
          <button
            className="pagination-btn"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next →
          </button>
        </div>
      )}

      {/* Update Modal */}
      {showUpdateModal && selectedProject && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">
              Post Update for {selectedProject.orderId || "Project"}
            </h3>

            {/* Engaged Departments */}
            <div className="engaged-depts-section">
              <label>Engaged Departments</label>
              <div className="dept-chips">
                {selectedProject.departments
                  .filter((dept) => engagedSubDepts.includes(dept))
                  .map((dept) => (
                    <span
                      key={dept}
                      className={`dept-chip ${updateForm.department === dept ? "selected" : ""}`}
                      onClick={() =>
                        setUpdateForm({ ...updateForm, department: dept })
                      }
                    >
                      {getDepartmentLabel(dept)}
                    </span>
                  ))}
              </div>
            </div>

            <form onSubmit={handleSubmitUpdate}>
              <div className="form-group">
                <label>Update Content</label>
                <textarea
                  className="input-field"
                  rows="4"
                  value={updateForm.content}
                  onChange={(e) =>
                    setUpdateForm({ ...updateForm, content: e.target.value })
                  }
                  placeholder="What's the latest update from your department?"
                  required
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowUpdateModal(false);
                    setSelectedProject(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}
                >
                  {submitting ? "Posting..." : "Post Update"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default EngagedProjects;
