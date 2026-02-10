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
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay, getLeadSearchText } from "../../utils/leadDisplay";
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
const ACKNOWLEDGE_PHRASE = "I agree to be engaged in this project";
const COMPLETE_PHRASE = "I confirm this engagement is complete";

const EngagedProjects = ({ user }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("active");
  const [projects, setProjects] = useState([]);
  const [historyProjects, setHistoryProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(null);

  // Filter State
  const [statusFilter, setStatusFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [historyProjectIdQuery, setHistoryProjectIdQuery] = useState("");
  const [historyDeptFilter, setHistoryDeptFilter] = useState("All");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // Modal State
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [updateForm, setUpdateForm] = useState({
    content: "",
    category: "Production",
    department: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [showAcknowledgeModal, setShowAcknowledgeModal] = useState(false);
  const [acknowledgeTarget, setAcknowledgeTarget] = useState(null);
  const [acknowledgeInput, setAcknowledgeInput] = useState("");
  const [acknowledgeSubmitting, setAcknowledgeSubmitting] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completeInput, setCompleteInput] = useState("");
  const [completeSubmitting, setCompleteSubmitting] = useState(false);

  const userDepartments = Array.isArray(user?.department)
    ? user.department
    : user?.department
      ? [user.department]
      : [];
  const hasProductionParent = userDepartments.includes("Production");
  const hasGraphicsParent = userDepartments.includes("Graphics/Design");
  const hasStoresParent = userDepartments.includes("Stores");
  const hasPhotographyParent = userDepartments.includes("Photography");

  const productionSubDepts = useMemo(() => {
    if (hasProductionParent) return PRODUCTION_SUB_DEPARTMENTS;
    return userDepartments.filter((d) =>
      PRODUCTION_SUB_DEPARTMENTS.includes(d),
    );
  }, [userDepartments, hasProductionParent]);

  // Determine all engaged departments the user belongs to
  const userEngagedDepts = useMemo(() => {
    const found = [];
    if (hasProductionParent || productionSubDepts.length > 0)
      found.push("Production");
    if (
      hasGraphicsParent ||
      userDepartments.some((d) => GRAPHICS_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Graphics");
    if (
      hasStoresParent ||
      userDepartments.some((d) => STORES_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Stores");
    if (
      hasPhotographyParent ||
      userDepartments.some((d) => PHOTOGRAPHY_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Photography");
    return found;
  }, [
    userDepartments,
    productionSubDepts,
    hasProductionParent,
    hasGraphicsParent,
    hasStoresParent,
    hasPhotographyParent,
  ]);

  // Determine sub-departments to check based on the selected department filter
  const engagedSubDepts = useMemo(() => {
    // If filtering by a specific department
    if (departmentFilter === "Graphics") return GRAPHICS_SUB_DEPARTMENTS;
    if (departmentFilter === "Stores") return STORES_SUB_DEPARTMENTS;
    if (departmentFilter === "Photography") return PHOTOGRAPHY_SUB_DEPARTMENTS;
    if (departmentFilter === "Production") return productionSubDepts;

    // If "All" or default, aggregate from all user's engaged departments
    let aggregated = [];
    if (hasProductionParent || productionSubDepts.length > 0)
      aggregated = [...aggregated, ...productionSubDepts];
    if (userEngagedDepts.includes("Graphics"))
      aggregated = [...aggregated, ...GRAPHICS_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Stores"))
      aggregated = [...aggregated, ...STORES_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Photography"))
      aggregated = [...aggregated, ...PHOTOGRAPHY_SUB_DEPARTMENTS];

    return aggregated;
  }, [userEngagedDepts, departmentFilter, productionSubDepts]);

  // Determine user's primary label for the current view
  const primaryDeptLabel = useMemo(() => {
    if (departmentFilter !== "All") return departmentFilter;
    if (userEngagedDepts.length === 1) return userEngagedDepts[0];
    return "Engaged";
  }, [userEngagedDepts, departmentFilter]);

  useEffect(() => {
    fetchEngagedProjects();
  }, [engagedSubDepts]);

  useRealtimeRefresh(() => fetchEngagedProjects());

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
        const completedStatuses = new Set(["Completed", "Finished"]);
        const postDeliveryStatuses = new Set([
          "Delivered",
          "Pending Feedback",
          "Feedback Completed",
        ]);
        // Active engaged (exclude completed/finished/post-delivery)
        const activeEngaged = engaged.filter(
          (p) =>
            !completedStatuses.has(p.status) &&
            !postDeliveryStatuses.has(p.status),
        );
        // History engaged (completed/finished only)
        const historyEngaged = engaged.filter((p) =>
          completedStatuses.has(p.status),
        );
        setProjects(activeEngaged);
        setHistoryProjects(historyEngaged);
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
        const lead = getLeadSearchText(project);

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

  useEffect(() => {
    setHistoryPage(1);
    setHistoryDeptFilter("All");
  }, [departmentFilter]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyProjectIdQuery, historyDeptFilter]);

  // Pagination logic
  const totalPages = Math.ceil(filteredProjects.length / ITEMS_PER_PAGE);
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProjects.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredProjects, currentPage]);

  const filteredHistoryProjects = useMemo(() => {
    return historyProjects.filter((project) => {
      const engagedDeptsForUser = (project.departments || []).filter((dept) =>
        engagedSubDepts.includes(dept),
      );
      if (engagedDeptsForUser.length === 0) return false;

      if (historyProjectIdQuery.trim()) {
        const query = historyProjectIdQuery.toLowerCase();
        const projectId = (project.orderId || project._id).toLowerCase();
        if (!projectId.includes(query)) return false;
      }

      if (
        historyDeptFilter !== "All" &&
        !engagedDeptsForUser.includes(historyDeptFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [
    historyProjects,
    historyProjectIdQuery,
    historyDeptFilter,
    engagedSubDepts,
  ]);

  const historyTotalPages = Math.ceil(
    filteredHistoryProjects.length / ITEMS_PER_PAGE,
  );
  const paginatedHistoryProjects = useMemo(() => {
    const startIndex = (historyPage - 1) * ITEMS_PER_PAGE;
    return filteredHistoryProjects.slice(
      startIndex,
      startIndex + ITEMS_PER_PAGE,
    );
  }, [filteredHistoryProjects, historyPage]);

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
      return projDepts.some((d) => productionSubDepts.includes(d));
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
        return true;
      } else {
        const errorData = await res.json().catch(() => ({}));
        setToast({
          type: "error",
          message: errorData.message || "Failed to update status.",
        });
        return false;
      }
    } catch (err) {
      console.error("Error updating status:", err);
      setToast({
        type: "error",
        message: "An unexpected error occurred.",
      });
      return false;
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
        return true;
      } else {
        const errorData = await res.json();
        setToast({
          type: "error",
          message: errorData.message || "Acknowledgement failed.",
        });
        return false;
      }
    } catch (err) {
      console.error("Error acknowledging project:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
      return false;
    }
  };

  const openAcknowledgeModal = (project, department) => {
    setAcknowledgeTarget({ project, department });
    setAcknowledgeInput("");
    setShowAcknowledgeModal(true);
  };

  const closeAcknowledgeModal = () => {
    setShowAcknowledgeModal(false);
    setAcknowledgeTarget(null);
    setAcknowledgeInput("");
    setAcknowledgeSubmitting(false);
  };

  const handleConfirmAcknowledge = async () => {
    if (!acknowledgeTarget) return;
    if (acknowledgeInput.trim() !== ACKNOWLEDGE_PHRASE) return;

    setAcknowledgeSubmitting(true);
    const acknowledged = await handleAcknowledge(
      acknowledgeTarget.project,
      acknowledgeTarget.department,
    );
    setAcknowledgeSubmitting(false);
    if (acknowledged) {
      setShowAcknowledgeModal(false);
      setAcknowledgeTarget(null);
      setAcknowledgeInput("");
    }
  };

  const openCompleteModal = (project, action) => {
    setCompleteTarget({ project, action });
    setCompleteInput("");
    setShowCompleteModal(true);
  };

  const closeCompleteModal = () => {
    setShowCompleteModal(false);
    setCompleteTarget(null);
    setCompleteInput("");
    setCompleteSubmitting(false);
  };

  const handleConfirmComplete = async () => {
    if (!completeTarget) return;
    if (completeInput.trim() !== COMPLETE_PHRASE) return;

    setCompleteSubmitting(true);
    const completed = await handleCompleteStatus(
      completeTarget.project,
      completeTarget.action,
    );
    setCompleteSubmitting(false);
    if (completed) {
      setShowCompleteModal(false);
      setCompleteTarget(null);
      setCompleteInput("");
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
        <h1>
          {activeTab === "active"
            ? `${primaryDeptLabel} Projects`
            : `${primaryDeptLabel} Project History`}
        </h1>
        <p className="engaged-subtitle">
          {activeTab === "active"
            ? "Projects where your department is actively engaged."
            : "Completed or finished projects for your engaged departments."}
        </p>
      </header>

      <div className="engaged-tabs">
        <button
          className={`engaged-tab ${activeTab === "active" ? "active" : ""}`}
          onClick={() => setActiveTab("active")}
        >
          Active
        </button>
        <button
          className={`engaged-tab ${activeTab === "history" ? "active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
      </div>

      {/* Filter Controls */}
      {activeTab === "active" ? (
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
      ) : (
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
            <label>Engaged Department</label>
            <select
              className="filter-select"
              value={historyDeptFilter}
              onChange={(e) => setHistoryDeptFilter(e.target.value)}
            >
              <option value="All">All Engaged</option>
              {Array.from(new Set(engagedSubDepts)).map((dept) => (
                <option key={dept} value={dept}>
                  {getDepartmentLabel(dept)}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group search-group">
            <label>Project ID</label>
            <input
              type="text"
              className="filter-input"
              placeholder="Filter by Project ID..."
              value={historyProjectIdQuery}
              onChange={(e) => setHistoryProjectIdQuery(e.target.value)}
            />
          </div>

          <div className="filter-results">
            Showing {filteredHistoryProjects.length} of{" "}
            {historyProjects.length} projects
          </div>
        </div>
      )}

      {activeTab === "active" ? (
        <>
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
                    const lead = getLeadDisplay(project, "Unassigned");
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
                            <span
                              className="indicator emergency"
                              title="Emergency"
                            >
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
                                  onClick={() => openCompleteModal(project, action)}
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
                                  onClick={() => openAcknowledgeModal(project, dept)}
                                  title={`Accept engagement for ${getDepartmentLabel(dept)}`}
                                >
                                  {`Accept ${getDepartmentLabel(dept)} Engagement`}
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
        </>
      ) : (
        <>
          <div className="engaged-table-wrapper">
            {filteredHistoryProjects.length === 0 ? (
              <div className="empty-state">
                <p>No history projects match your filters.</p>
              </div>
            ) : (
              <table className="engaged-table">
                <thead>
                  <tr>
                    <th>Project ID</th>
                    <th>Lead</th>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Department</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistoryProjects.map((project) => {
                    const lead = getLeadDisplay(project, "Unassigned");
                    const client = project.details?.client || "N/A";
                    const projectId =
                      project.orderId || project._id.slice(-6).toUpperCase();
                    const engagedDeptsForUser = (project.departments || [])
                      .filter((dept) => engagedSubDepts.includes(dept))
                      .map((dept) => getDepartmentLabel(dept));
                    const engagedDeptLabel =
                      engagedDeptsForUser.length > 0
                        ? engagedDeptsForUser.join(", ")
                        : "N/A";

                    return (
                      <tr key={project._id}>
                        <td
                          className="project-id-cell"
                          onClick={() => navigate(`/detail/${project._id}`)}
                        >
                          {projectId}
                        </td>
                        <td>{lead}</td>
                        <td>{client}</td>
                        <td>
                          <span
                            className={`status-badge ${project.status.toLowerCase().replace(/\s+/g, "-")}`}
                          >
                            {project.status}
                          </span>
                        </td>
                        <td>{engagedDeptLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {historyTotalPages > 1 && (
            <div className="pagination-controls">
              <button
                className="pagination-btn"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyPage === 1}
              >
                ← Previous
              </button>
              <div className="pagination-info">
                Page {historyPage} of {historyTotalPages}
              </div>
              <button
                className="pagination-btn"
                onClick={() =>
                  setHistoryPage((p) => Math.min(historyTotalPages, p + 1))
                }
                disabled={historyPage === historyTotalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
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

      {/* Complete Engagement Confirmation Modal */}
      {showCompleteModal && completeTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Engagement Completion</h3>
            <p className="acknowledge-confirm-text">
              You are about to mark{" "}
              <strong>{completeTarget.action.label}</strong> for project{" "}
              <strong>
                {completeTarget.project.orderId ||
                  completeTarget.project._id.slice(-6).toUpperCase()}
              </strong>
              .
            </p>
            <p className="acknowledge-confirm-text">
              Type the phrase below to confirm:
            </p>
            <div className="acknowledge-phrase">{COMPLETE_PHRASE}</div>
            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Confirmation</label>
              <input
                type="text"
                className="input-field"
                value={completeInput}
                onChange={(e) => setCompleteInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeCompleteModal}
                disabled={completeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmComplete}
                disabled={
                  completeSubmitting ||
                  completeInput.trim() !== COMPLETE_PHRASE
                }
              >
                {completeSubmitting ? "Confirming..." : "Confirm Completion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Acknowledge Confirmation Modal */}
      {showAcknowledgeModal && acknowledgeTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Engagement Acceptance</h3>
            <p className="acknowledge-confirm-text">
              You are about to acknowledge engagement for{" "}
              <strong>{getDepartmentLabel(acknowledgeTarget.department)}</strong>{" "}
              on project{" "}
              <strong>
                {acknowledgeTarget.project.orderId ||
                  acknowledgeTarget.project._id.slice(-6).toUpperCase()}
              </strong>
              .
            </p>
            <p className="acknowledge-confirm-text">
              Type the phrase below to confirm:
            </p>
            <div className="acknowledge-phrase">{ACKNOWLEDGE_PHRASE}</div>
            <div className="form-group" style={{ marginTop: "1rem" }}>
              <label>Confirmation</label>
              <input
                type="text"
                className="input-field"
                value={acknowledgeInput}
                onChange={(e) => setAcknowledgeInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeAcknowledgeModal}
                disabled={acknowledgeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmAcknowledge}
                disabled={
                  acknowledgeSubmitting ||
                  acknowledgeInput.trim() !== ACKNOWLEDGE_PHRASE
                }
              >
                {acknowledgeSubmitting ? "Confirming..." : "Confirm Acceptance"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EngagedProjects;

