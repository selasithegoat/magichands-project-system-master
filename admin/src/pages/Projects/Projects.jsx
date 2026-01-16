import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout/DashboardLayout";
import "./Projects.css";
import { TrashIcon, ProjectsIcon } from "../../icons/Icons";
import ConfirmationModal from "../../components/ConfirmationModal/ConfirmationModal";

const Projects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    projectId: null,
  });

  // Pagination & Filter State
  const [filterStatus, setFilterStatus] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch("/api/projects");
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
    if (lower.includes("progress")) return "in-progress";
    return "draft";
  };

  // Filter Logic
  const filteredProjects = projects.filter((project) => {
    if (filterStatus === "All") return true;
    return project.status === filterStatus;
  });

  // Pagination Logic
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const paginatedProjects = filteredProjects.slice(
    indexOfFirstItem,
    indexOfLastItem
  );
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);

  return (
    <DashboardLayout>
      <div className="projects-page">
        <div className="projects-header">
          <h1>
            <ProjectsIcon className="text-secondary" /> Projects
          </h1>
          {/* Add Filter/Search here later */}
        </div>

        <div className="projects-table-container">
          <div className="table-controls">
            <div className="filter-group">
              <label>Status:</label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1); // Reset to page 1 on filter change
                }}
                className="status-filter"
              >
                <option value="All">All Projects</option>
                <option value="Draft">Draft</option>
                <option value="Pending Approval">Pending Approval</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
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
            <div className="empty-state">
              No projects found matching filter.
            </div>
          ) : (
            <>
              <table className="projects-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Project Name</th>
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
                            project.status
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
    </DashboardLayout>
  );
};

export default Projects;
