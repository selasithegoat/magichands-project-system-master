import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

import "./Projects.css";
import { TrashIcon, ProjectsIcon } from "../../icons/Icons";
import ConfirmationModal from "../../components/ConfirmationModal/ConfirmationModal";

const Projects = ({ user }) => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
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

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch("/api/projects?source=admin", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        } else {
          console.error("Failed to fetch projects");
        }
      } catch (err) {
        console.error("Error fetching projects:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

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
        setProjects(projects.filter((p) => p._id !== projectId));
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
    if (lower.includes("pending")) return "pending";
    if (lower.includes("completed") || lower.includes("delivered"))
      return "completed";
    if (lower.includes("progress") || lower.includes("sent"))
      return "in-progress";
    return "draft";
  };

  // Derived Lists
  const uniqueClients = [
    ...new Set(
      projects
        .map((p) => p.details?.client)
        .filter((c) => c && c.trim() !== ""),
    ),
  ].sort();

  const uniqueLeads = [
    ...new Set(
      projects.map((p) => {
        if (p.projectLeadId) {
          return `${p.projectLeadId.firstName} ${p.projectLeadId.lastName}`;
        }
        return p.details?.lead || "";
      }),
    ),
  ]
    .filter((l) => l && l !== "" && l !== "Unassigned")
    .sort();

  // Filter Logic
  const filteredProjects = projects.filter((project) => {
    // 1. Status
    if (filterStatus !== "All") {
      if (filterStatus === "Completed") {
        // Show both Completed and Finished projects when filtering by Completed
        if (project.status !== "Completed" && project.status !== "Finished")
          return false;
      } else if (project.status !== filterStatus) {
        return false;
      }
    }

    // 2. Search Query (Order ID)
    if (
      searchQuery &&
      !project.orderId?.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    // 3. Client
    if (clientFilter !== "All" && project.details?.client !== clientFilter) {
      return false;
    }

    // 4. Lead
    if (leadFilter !== "All") {
      const leadName = project.projectLeadId
        ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
        : project.details?.lead || "";
      if (leadName !== leadFilter) return false;
    }

    return true;
  });

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedProjects = filteredProjects.slice(
    indexOfFirstItem,
    indexOfLastItem,
  );
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);

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
              <option value="In Progress">In Progress</option>
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
            Showing {paginatedProjects.length} of {filteredProjects.length}{" "}
            results
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Loading projects...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="empty-state">No projects found matching filter.</div>
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
                {paginatedProjects.map((project) => (
                  <tr key={project._id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>
                        {project.orderId || "N/A"}
                      </span>
                    </td>
                    <td>{project.details?.projectName || "Untitled"}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: "700",
                          backgroundColor:
                            project.projectType === "Emergency"
                              ? "#fef2f2"
                              : project.projectType === "Corporate Job"
                                ? "#f0fdf4"
                                : project.projectType === "Quote"
                                  ? "#fffbeb"
                                  : "#eff6ff",
                          color:
                            project.projectType === "Emergency"
                              ? "#e74c3c"
                              : project.projectType === "Corporate Job"
                                ? "#42a165"
                                : project.projectType === "Quote"
                                  ? "#f39c12"
                                  : "#3498db",
                          border: `1px solid ${
                            project.projectType === "Emergency"
                              ? "#e74c3c40"
                              : project.projectType === "Corporate Job"
                                ? "#42a16540"
                                : project.projectType === "Quote"
                                  ? "#f39c1240"
                                  : "#3498db40"
                          }`,
                        }}
                      >
                        {project.projectType || "Standard"}
                      </span>
                    </td>
                    <td>
                      {project.projectLeadId
                        ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
                        : project.details?.lead || "Unassigned"}
                    </td>
                    <td>{project.details?.client || "-"}</td>
                    <td>
                      {formatDate(project.orderDate || project.createdAt)}
                    </td>
                    <td>{formatTime(project.receivedTime)}</td>
                    <td>
                      <span
                        className={`status-badge ${getStatusClass(
                          project.status,
                        )}`}
                      >
                        {project.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="action-btn"
                        onClick={() => navigate(`/projects/${project._id}`)}
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
