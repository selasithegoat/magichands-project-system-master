import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import "./Projects.css";
import { TrashIcon, ProjectsIcon } from "../../icons/Icons";
import ConfirmationModal from "../../components/ConfirmationModal/ConfirmationModal";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getLeadDisplay } from "../../utils/leadDisplay";

const GROUP_ROW_TRANSITION_MS = 220;

const Projects = ({ user }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [groupedOrders, setGroupedOrders] = useState([]);
  const [expandedOrderGroups, setExpandedOrderGroups] = useState({});
  const [collapsingOrderGroups, setCollapsingOrderGroups] = useState({});
  const collapseTimersRef = useRef({});
  const [loading, setLoading] = useState(true);

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    projectId: null,
  });

  // Pagination & Filter State
  // Pagination & Filter State
  const [filterStatus, setFilterStatus] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("All");
  const [leadFilter, setLeadFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const openProjectDetails = (project) => {
    const projectId = project?._id;
    if (!projectId) return;
    navigate(`/projects/${projectId}`, { state: { project } });
  };

  const buildFallbackOrderGroups = (projectList = []) => {
    const groups = new Map();

    projectList.forEach((project, index) => {
      const orderNumber = String(
        project?.orderRef?.orderNumber || project?.orderId || "UNASSIGNED",
      ).trim();
      const groupKey = orderNumber || project?._id || `fallback-${index}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          id: groupKey,
          orderRef: project?.orderRef?._id || project?.orderRef || null,
          orderNumber: orderNumber || "UNASSIGNED",
          orderDate: project?.orderRef?.orderDate || project?.orderDate || null,
          client: project?.orderRef?.client || project?.details?.client || "",
          clientEmail:
            project?.orderRef?.clientEmail || project?.details?.clientEmail || "",
          clientPhone:
            project?.orderRef?.clientPhone || project?.details?.clientPhone || "",
          projects: [],
        });
      }

      groups.get(groupKey).projects.push(project);
    });

    return Array.from(groups.values()).sort((a, b) => {
      const aTime = new Date(
        a.orderDate || a.projects?.[0]?.createdAt || 0,
      ).getTime();
      const bTime = new Date(
        b.orderDate || b.projects?.[0]?.createdAt || 0,
      ).getTime();
      return bTime - aTime;
    });
  };

  const fetchProjects = async () => {
    try {
      const [projectsRes, groupedRes] = await Promise.all([
        fetch("/api/projects?source=admin", {
          credentials: "include",
        }),
        fetch("/api/projects/orders?source=admin&collapseRevisions=true", {
          credentials: "include",
        }),
      ]);

      let projectsData = [];

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        projectsData = Array.isArray(data) ? data : [];
        setProjects(projectsData);
      } else {
        setProjects([]);
        console.error("Failed to fetch projects");
      }

      if (groupedRes.ok) {
        const groupedData = await groupedRes.json();
        setGroupedOrders(Array.isArray(groupedData) ? groupedData : []);
      } else {
        setGroupedOrders(buildFallbackOrderGroups(projectsData));
        console.error("Failed to fetch grouped orders");
      }
    } catch (err) {
      console.error("Error fetching projects:", err);
      setProjects([]);
      setGroupedOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(
    () => () => {
      Object.values(collapseTimersRef.current).forEach((timerId) => {
        clearTimeout(timerId);
      });
      collapseTimersRef.current = {};
    },
    [],
  );

  useRealtimeRefresh(() => fetchProjects());

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "-";
    if (timeStr.includes("T")) {
      return new Date(timeStr).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
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

  const handleDeleteClick = (e, projectId) => {
    e.stopPropagation();
    setDeleteModal({ isOpen: true, projectId });
  };

  const handleDeleteConfirm = async () => {
    const { projectId } = deleteModal;
    if (!projectId) return;

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        await fetchProjects();
      } else {
        alert("Failed to delete project");
      }
    } catch (err) {
      console.error("Error deleting project:", err);
      alert("Error deleting project");
    }
  };

  const getStatusClass = (status) => {
    if (!status) return "draft";
    const lower = status.toLowerCase();
    if (lower.includes("hold")) return "on-hold";
    if (lower.includes("feedback")) return "in-progress";
    if (lower.includes("pending")) return "pending";
    if (lower.includes("finished")) return "completed";
    if (lower.includes("completed")) return "completed";
    if (lower.includes("delivered")) return "in-progress";
    if (lower.includes("progress") || lower.includes("sent"))
      return "in-progress";
    return "draft";
  };

  const getGroupProjects = (group) =>
    Array.isArray(group?.projects) ? group.projects : [];

  const getGroupClient = (group, projects = []) =>
    group?.client ||
    projects.find((project) => project?.details?.client)?.details?.client ||
    "-";

  const getGroupLeadText = (projects = []) => {
    const leads = Array.from(
      new Set(
        projects
          .map((project) => getLeadDisplay(project, "Unassigned"))
          .filter(Boolean),
      ),
    );
    return leads.length > 0 ? leads.join(", ") : "Unassigned";
  };

  const getGroupStatusSummary = (projects = []) => {
    const statuses = Array.from(
      new Set(projects.map((project) => project?.status).filter(Boolean)),
    );
    if (statuses.length === 0) {
      return { label: "Draft", className: getStatusClass("Draft") };
    }
    const primary = statuses[0];
    return {
      label:
        statuses.length === 1 ? primary : `${primary} +${statuses.length - 1} more`,
      className: getStatusClass(primary),
    };
  };

  const matchesStatusFilter = (projectStatus) => {
    if (filterStatus === "All") return true;
    if (filterStatus === "Completed") {
      return projectStatus === "Completed" || projectStatus === "Finished";
    }
    return projectStatus === filterStatus;
  };

  // Derived Lists
  const uniqueClients = [
    ...new Set(
      groupedOrders
        .map((group) => getGroupClient(group, getGroupProjects(group)))
        .filter((c) => c && c.trim() !== ""),
    ),
  ].sort();

  const uniqueLeads = [
    ...new Set(
      groupedOrders.flatMap((group) =>
        getGroupProjects(group).map((project) => getLeadDisplay(project, "")),
      ),
    ),
  ]
    .filter((l) => l && l !== "" && l !== "Unassigned")
    .sort();

  // Filter Logic
  const filteredOrderGroups = groupedOrders.filter((group) => {
    const projectsInGroup = getGroupProjects(group);
    if (projectsInGroup.length === 0) return false;

    if (
      searchQuery &&
      !String(group?.orderNumber || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    if (
      clientFilter !== "All" &&
      getGroupClient(group, projectsInGroup) !== clientFilter
    ) {
      return false;
    }

    if (leadFilter !== "All") {
      const hasLead = projectsInGroup.some(
        (project) => getLeadDisplay(project, "") === leadFilter,
      );
      if (!hasLead) return false;
    }

    const hasStatus = projectsInGroup.some((project) =>
      matchesStatusFilter(project?.status),
    );
    if (!hasStatus) return false;

    return true;
  });

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedOrderGroups = filteredOrderGroups.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );
  const totalPages = Math.ceil(filteredOrderGroups.length / itemsPerPage);

  useEffect(() => {
    setExpandedOrderGroups((prev) => {
      const next = {};
      filteredOrderGroups.forEach((group) => {
        const key = group?.id || group?.orderNumber;
        if (!key) return;
        next[key] = prev[key] || false;
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }

      for (const key of nextKeys) {
        if (prev[key] !== next[key]) {
          return next;
        }
      }

      return prev;
    });
  }, [filteredOrderGroups]);

  useEffect(() => {
    setCollapsingOrderGroups((prev) => {
      const next = {};
      filteredOrderGroups.forEach((group) => {
        const key = group?.id || group?.orderNumber;
        if (!key) return;
        if (prev[key]) next[key] = true;
      });

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (prevKeys.length !== nextKeys.length) {
        return next;
      }

      for (const key of nextKeys) {
        if (prev[key] !== next[key]) {
          return next;
        }
      }

      return prev;
    });
  }, [filteredOrderGroups]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const toggleOrderGroup = (groupKey) => {
    if (!groupKey) return;
    const isExpanded = Boolean(expandedOrderGroups[groupKey]);

    if (isExpanded) {
      setCollapsingOrderGroups((prev) => ({
        ...prev,
        [groupKey]: true,
      }));

      if (collapseTimersRef.current[groupKey]) {
        clearTimeout(collapseTimersRef.current[groupKey]);
      }

      collapseTimersRef.current[groupKey] = window.setTimeout(() => {
        setExpandedOrderGroups((prev) => ({
          ...prev,
          [groupKey]: false,
        }));
        setCollapsingOrderGroups((prev) => {
          const next = { ...prev };
          delete next[groupKey];
          return next;
        });
        delete collapseTimersRef.current[groupKey];
      }, GROUP_ROW_TRANSITION_MS);
      return;
    }

    if (collapseTimersRef.current[groupKey]) {
      clearTimeout(collapseTimersRef.current[groupKey]);
      delete collapseTimersRef.current[groupKey];
    }

    setCollapsingOrderGroups((prev) => {
      if (!prev[groupKey]) return prev;
      const next = { ...prev };
      delete next[groupKey];
      return next;
    });
    setExpandedOrderGroups((prev) => ({
      ...prev,
      [groupKey]: true,
    }));
  };

  const renderTypeBadge = (projectType) => {
    const typeLabel = projectType || "Standard";
    const isEmergency = typeLabel === "Emergency";
    const isCorporate = typeLabel === "Corporate Job";
    const isQuote = typeLabel === "Quote";

    const backgroundColor = isEmergency
      ? "#fef2f2"
      : isCorporate
        ? "#f0fdf4"
        : isQuote
          ? "#fffbeb"
          : "#eff6ff";
    const textColor = isEmergency
      ? "#e74c3c"
      : isCorporate
        ? "#42a165"
        : isQuote
          ? "#f39c12"
          : "#3498db";
    const borderColor = isEmergency
      ? "#e74c3c40"
      : isCorporate
        ? "#42a16540"
        : isQuote
          ? "#f39c1240"
          : "#3498db40";

    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: "4px",
          fontSize: "11px",
          fontWeight: "700",
          backgroundColor,
          color: textColor,
          border: `1px solid ${borderColor}`,
        }}
      >
        {typeLabel}
      </span>
    );
  };

  return (
    <div className="projects-page">
      <div className="projects-header">
        <h1>
          <ProjectsIcon className="text-secondary" /> Projects
        </h1>
        {/* Add Filter/Search here later */}
      </div>

      <div className="projects-table-container">
        <div className="table-controls">
          {/* Filter Bar */}
          <div className="filter-bar">
            {/* Search Order # */}
            <div className="search-pill-wrapper">
              <input
                type="text"
                placeholder="Search Order #..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="search-pill"
              />
              <div className="search-icon-small">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
            </div>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-pill"
            >
              <option value="All">All Status</option>
              <option value="Draft">Draft</option>
              <option value="New Order">New Order</option>
              <option value="Order Confirmed">Order Confirmed</option>
              <option value="Pending Approval">Pending Approval</option>
              <option value="Pending Scope Approval">
                Pending Scope Approval
              </option>
              <option value="Pending Departmental Engagement">
                Pending Departmental Engagement
              </option>
              <option value="Departmental Engagement Completed">
                Departmental Engagement Completed
              </option>
              <option value="Pending Mockup">Pending Mockup</option>
              <option value="Pending Proof Reading">
                Pending Proof Reading
              </option>
              <option value="Pending Production">Pending Production</option>
              <option value="Pending Quality Control">
                Pending Quality Control
              </option>
              <option value="Pending Photography">Pending Photography</option>
              <option value="Pending Packaging">Pending Packaging</option>
              <option value="Pending Delivery/Pickup">
                Pending Delivery/Pickup
              </option>
              <option value="On Hold">On Hold</option>
              <option value="In Progress">In Progress</option>
              <option value="Pending Feedback">Pending Feedback</option>
              <option value="Feedback Completed">Feedback Completed</option>
              <option value="Completed">Completed</option>
              <option value="Delivered">Delivered</option>
              <option value="Pending Quote Request">
                Pending Quote Request
              </option>
              <option value="Pending Send Response">
                Pending Send Response
              </option>
              <option value="Response Sent">Response Sent</option>
            </select>

            {/* Client Filter */}
            <select
              value={clientFilter}
              onChange={(e) => {
                setClientFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-pill"
            >
              <option value="All">All Clients</option>
              {uniqueClients.map((client, idx) => (
                <option key={idx} value={client}>
                  {client}
                </option>
              ))}
            </select>

            {/* Lead Filter */}
            <select
              value={leadFilter}
              onChange={(e) => {
                setLeadFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="filter-pill"
            >
              <option value="All">All Leads</option>
              {uniqueLeads.map((lead, idx) => (
                <option key={idx} value={lead}>
                  {lead}
                </option>
              ))}
            </select>
          </div>
          <div className="result-count">
            Showing {paginatedOrderGroups.length} of {filteredOrderGroups.length}{" "}
            results
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading orders...</div>
        ) : filteredOrderGroups.length === 0 ? (
          <div className="empty-state">No orders found matching filter.</div>
        ) : (
          <>
            <table className="projects-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Project Name</th>
                  <th>Type</th>
                  <th>Lead</th>
                  <th>Client</th>
                  <th>Assigned Date</th>
                  <th>Received Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedOrderGroups.map((group) => {
                  const groupKey = group?.id || group?.orderNumber || "order";
                  const projectsInGroup = getGroupProjects(group);
                  const isGrouped = projectsInGroup.length > 1;
                  const primaryProject = projectsInGroup[0] || null;

                  if (!primaryProject) return null;

                  const groupClient = getGroupClient(group, projectsInGroup);
                  const groupStatus = getGroupStatusSummary(projectsInGroup);
                  const expanded = Boolean(expandedOrderGroups[groupKey]);
                  const isCollapsing = Boolean(collapsingOrderGroups[groupKey]);
                  const showGroupChildren = expanded || isCollapsing;
                  const groupTypes = Array.from(
                    new Set(
                      projectsInGroup
                        .map((project) => project?.projectType || "Standard")
                        .filter(Boolean),
                    ),
                  );

                  if (!isGrouped) {
                    const project = primaryProject;
                    return (
                      <tr key={project._id}>
                        <td>
                          <span style={{ fontWeight: 600 }}>
                            {project.orderId || group?.orderNumber || "N/A"}
                          </span>
                        </td>
                        <td>{project.details?.projectName || "Untitled"}</td>
                        <td>{renderTypeBadge(project.projectType)}</td>
                        <td>{getLeadDisplay(project, "Unassigned")}</td>
                        <td>{groupClient}</td>
                        <td>{formatDate(project.orderDate || project.createdAt)}</td>
                        <td>{formatTime(project.receivedTime)}</td>
                        <td>
                          <span className={`status-badge ${getStatusClass(project.status)}`}>
                            {project.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="action-btn"
                            onClick={() => openProjectDetails(project)}
                          >
                            View
                          </button>
                          {!(
                            user &&
                            (project.projectLeadId?._id === user._id ||
                              project.projectLeadId === user._id)
                          ) && (
                            <button
                              className="action-btn delete-btn"
                              onClick={(e) => handleDeleteClick(e, project._id)}
                              style={{
                                marginLeft: "0.5rem",
                                background: "rgba(239, 68, 68, 0.1)",
                                color: "#ef4444",
                                border: "1px solid rgba(239, 68, 68, 0.2)",
                              }}
                              title="Delete Project"
                            >
                              <TrashIcon width="16" height="16" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <React.Fragment key={groupKey}>
                      <tr className="project-group-header-row">
                        <td>
                          <div className="project-group-order-cell">
                            <button
                              type="button"
                              className="project-group-toggle-btn"
                              onClick={() => toggleOrderGroup(groupKey)}
                              aria-expanded={expanded}
                            >
                              {expanded ? (
                                <svg
                                  viewBox="0 0 24 24"
                                  version="1.1"
                                  xmlns="http://www.w3.org/2000/svg"
                                  aria-hidden="true"
                                  focusable="false"
                                >
                                  <polygon points="8 5 8 19 16 12" />
                                </svg>
                              ) : (
                                <svg
                                  viewBox="0 0 24 24"
                                  version="1.1"
                                  xmlns="http://www.w3.org/2000/svg"
                                  aria-hidden="true"
                                  focusable="false"
                                >
                                  <polygon points="5 8 12 16 19 8" />
                                </svg>
                              )}
                            </button>
                            <div className="project-group-order-text">
                              <span className="project-group-order-id">
                                {group?.orderNumber || "N/A"}
                              </span>
                              <span className="project-group-order-count">
                                {projectsInGroup.length} projects
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="project-group-project-cell">
                            <span className="project-group-title">Grouped Order</span>
                            <span className="project-group-subtitle">
                              Expand to view all projects under this order
                            </span>
                          </div>
                        </td>
                        <td>
                          {groupTypes.length === 1
                            ? renderTypeBadge(groupTypes[0])
                            : `Mixed (${groupTypes.length})`}
                        </td>
                        <td>Multiple Leads</td>
                        <td>{groupClient}</td>
                        <td>{formatDate(group?.orderDate || primaryProject?.orderDate || primaryProject?.createdAt)}</td>
                        <td>-</td>
                        <td>
                          <span className={`status-badge ${groupStatus.className}`}>
                            {groupStatus.label}
                          </span>
                        </td>
                        <td>-</td>
                      </tr>

                      {showGroupChildren &&
                        projectsInGroup.map((project) => (
                          <tr
                            key={project._id}
                            className={`project-group-child-row ${
                              isCollapsing
                                ? "project-group-child-row-collapsing"
                                : "project-group-child-row-expanding"
                            }`}
                          >
                            <td>
                              <span
                                style={{ fontWeight: 600 }}
                                className="project-group-child-order-id"
                              >
                                -
                              </span>
                            </td>
                            <td>{project.details?.projectName || "Untitled"}</td>
                            <td>{renderTypeBadge(project.projectType)}</td>
                            <td>{getLeadDisplay(project, "Unassigned")}</td>
                            <td>{project.details?.client || groupClient}</td>
                            <td>{formatDate(project.orderDate || project.createdAt)}</td>
                            <td>{formatTime(project.receivedTime)}</td>
                            <td>
                              <span
                                className={`status-badge ${getStatusClass(project.status)}`}
                              >
                                {project.status}
                              </span>
                            </td>
                            <td>
                              <button
                                className="action-btn"
                                onClick={() => openProjectDetails(project)}
                              >
                                View
                              </button>
                              {!(
                                user &&
                                (project.projectLeadId?._id === user._id ||
                                  project.projectLeadId === user._id)
                              ) && (
                                <button
                                  className="action-btn delete-btn"
                                  onClick={(e) => handleDeleteClick(e, project._id)}
                                  style={{
                                    marginLeft: "0.5rem",
                                    background: "rgba(239, 68, 68, 0.1)",
                                    color: "#ef4444",
                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                  }}
                                  title="Delete Project"
                                >
                                  <TrashIcon width="16" height="16" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pagination-container">
                <button
                  className="pagination-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </button>
                <span className="pagination-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="pagination-btn"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ ...deleteModal, isOpen: false })}
        onConfirm={handleDeleteConfirm}
        title="Delete Project"
        message="Are you sure you want to delete this project? This action cannot be undone."
        confirmText="Delete"
        isDangerous={true}
      />
    </div>
  );
};

export default Projects;
