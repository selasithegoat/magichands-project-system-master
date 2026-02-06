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

const STATUS_ACTIONS = {
  Graphics: {
    label: "Mockup Complete",
    pending: "Pending Mockup",
    complete: "Mockup Completed",
  },
  Production: {
    label: "Production Complete",
    pending: "Pending Production",
    complete: "Production Completed",
  },
  Stores: {
    label: "Stocks & Packaging Complete",
    pending: "Pending Packaging",
    complete: "Packaging Completed",
  },
};

const ITEMS_PER_PAGE = 10;

const EngagedProjects = ({ user }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(null);

  // Filter State
  const [statusFilter, setStatusFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
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

  // Determine all engaged departments the user belongs to
  const userEngagedDepts = useMemo(() => {
    const depts = user?.department || [];
    const found = [];
    if (depts.includes("Production")) found.push("Production");
    if (depts.includes("Graphics/Design")) found.push("Graphics");
    if (depts.includes("Stores")) found.push("Stores");
    if (depts.includes("Photography")) found.push("Photography");
    return found;
  }, [user]);

  // Determine sub-departments to check based on the selected department filter
  const engagedSubDepts = useMemo(() => {
    // If filtering by a specific department
    if (departmentFilter === "Graphics") return GRAPHICS_SUB_DEPARTMENTS;
    if (departmentFilter === "Stores") return STORES_SUB_DEPARTMENTS;
    if (departmentFilter === "Photography") return PHOTOGRAPHY_SUB_DEPARTMENTS;
    if (departmentFilter === "Production") return PRODUCTION_SUB_DEPARTMENTS;

    // If "All" or default, aggregate from all user's engaged departments
    let aggregated = [];
    if (userEngagedDepts.includes("Production"))
      aggregated = [...aggregated, ...PRODUCTION_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Graphics"))
      aggregated = [...aggregated, ...GRAPHICS_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Stores"))
      aggregated = [...aggregated, ...STORES_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Photography"))
      aggregated = [...aggregated, ...PHOTOGRAPHY_SUB_DEPARTMENTS];

    return aggregated;
  }, [userEngagedDepts, departmentFilter]);

  // Determine user's primary label for the current view
  const primaryDeptLabel = useMemo(() => {
    if (departmentFilter !== "All") return departmentFilter;
    if (userEngagedDepts.length === 1) return userEngagedDepts[0];
    return "Engaged";
  }, [userEngagedDepts, departmentFilter]);

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
        // Exclude completed/finished projects
        const activeEngaged = engaged.filter(
          (p) =>
            p.status !== "Completed" &&
            p.status !== "Delivered" &&
            p.status !== "Finished",
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
  }, [statusFilter, departmentFilter, searchQuery]);

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

  const projectHasDept = (project, dept) => {
    const projDepts = project.departments || [];
    if (dept === "Graphics")
      return projDepts.some((d) => GRAPHICS_SUB_DEPARTMENTS.includes(d));
    if (dept === "Production")
      return projDepts.some((d) => PRODUCTION_SUB_DEPARTMENTS.includes(d));
    if (dept === "Stores")
      return projDepts.some((d) => STORES_SUB_DEPARTMENTS.includes(d));
    return false;
  };

  const getDeptActionsForProject = (project) => {
    let allowed = userEngagedDepts.filter((d) => STATUS_ACTIONS[d]);
    if (departmentFilter !== "All") {
      allowed = allowed.filter((d) => d === departmentFilter);
    }
    return allowed
      .filter((dept) => projectHasDept(project, dept))
      .map((dept) => ({ dept, ...STATUS_ACTIONS[dept] }));
  };

  const handleCompleteStatus = async (project, action) => {
    const actionKey = `${project._id}:${action.complete}`;
    setStatusUpdating(actionKey);
    try {
      const res = await fetch(`/api/projects/${project._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action.complete }),
      });

      if (res.ok) {
        setToast({
          type: "success",
          message: `${action.label} recorded.`,
        });
        fetchEngagedProjects();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setToast({
          type: "error",
          message: errorData.message || "Failed to update status.",
        });
      }
    } catch (err) {
      console.error("Error updating status:", err);
      setToast({
        type: "error",
        message: "An unexpected error occurred.",
      });
    } finally {
      setStatusUpdating(null);
    }
  };

  const handleOpenUpdateModal = (project) => {
    setSelectedProject(project);
    // Get only relevant sub-departments for this project
    const engagedDepts = project.departments.filter((dept) =>
      engagedSubDepts.includes(dept),
    );
    setUpdateForm({
      content: "",
      category:
        departmentFilter !== "All"
          ? departmentFilter
          : userEngagedDepts.length > 0
            ? userEngagedDepts[0]
            : "Production",
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

  const handleAcknowledge = async (project, department) => {
    try {
      const res = await fetch(`/api/projects/${project._id}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department }),
      });

      if (res.ok) {
        setToast({
          type: "success",
          message: `${getDepartmentLabel(department)} acknowledged!`,
        });
        fetchEngagedProjects(); // Refresh the list
      } else {
        const errorData = await res.json();
        setToast({
          type: "error",
          message: errorData.message || "Acknowledgement failed.",
        });
      }
    } catch (err) {
      console.error("Error acknowledging project:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
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
        <h1>{primaryDeptLabel} Projects</h1>
        <p className="engaged-subtitle">
          Projects where your department is actively engaged.
        </p>
      </header>

      {/* Filter Controls */}
      <div className="filter-controls">
        {userEngagedDepts.length > 1 && (
          <div className="filter-group">
            <label>Department</label>
            <select
              className="filter-select"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="All">All Departments</option>
              {userEngagedDepts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

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
                const deptActions = getDeptActionsForProject(project);

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
                      {deliveryTime && ` (${deliveryTime})`}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${project.status.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        {deptActions.map((action) => {
                          const actionKey = `${project._id}:${action.complete}`;
                          const isUpdating = statusUpdating === actionKey;
                          const isReady = project.status === action.pending;
                          return (
                            <button
                              key={action.complete}
                              className="complete-btn"
                              onClick={() => handleCompleteStatus(project, action)}
                              disabled={!isReady || isUpdating}
                              title={
                                isReady
                                  ? `Mark ${action.label}`
                                  : `Waiting for ${action.pending}`
                              }
                            >
                              {isUpdating ? "Updating..." : action.label}
                            </button>
                          );
                        })}
                        <button
                          className="update-btn"
                          onClick={() => handleOpenUpdateModal(project)}
                        >
                          Update
                        </button>
                        {project.departments
                          .filter((dept) => engagedSubDepts.includes(dept))
                          .filter(
                            (dept) =>
                              !project.acknowledgements?.some(
                                (a) => a.department === dept,
                              ),
                          )
                          .map((dept) => (
                            <button
                              key={dept}
                              className="acknowledge-btn"
                              onClick={() => handleAcknowledge(project, dept)}
                              title={`Accept engagement for ${getDepartmentLabel(dept)}`}
                            >
                              Accept Engagement
                            </button>
                          ))}
                      </div>
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
                      onClick={() => {
                        let category = "Production";
                        if (GRAPHICS_SUB_DEPARTMENTS.includes(dept))
                          category = "Graphics";
                        else if (STORES_SUB_DEPARTMENTS.includes(dept))
                          category = "Stores";
                        else if (PHOTOGRAPHY_SUB_DEPARTMENTS.includes(dept))
                          category = "Photography";

                        setUpdateForm({
                          ...updateForm,
                          department: dept,
                          category,
                        });
                      }}
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
