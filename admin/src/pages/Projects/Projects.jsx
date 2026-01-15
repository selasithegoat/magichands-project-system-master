import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout/DashboardLayout";
import "./Projects.css";
import { ProjectsIcon } from "../../icons/Icons";

const Projects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const getStatusClass = (status) => {
    if (!status) return "draft";
    const lower = status.toLowerCase();
    if (lower.includes("pending")) return "pending";
    if (lower.includes("completed") || lower.includes("delivered"))
      return "completed";
    if (lower.includes("progress")) return "in-progress";
    return "draft";
  };

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
          {loading ? (
            <div className="loading-state">Loading projects...</div>
          ) : projects.length === 0 ? (
            <div className="empty-state">No projects found.</div>
          ) : (
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
                {projects.map((project) => (
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
                    <td>
                      {/* Handle both ISO and HH:mm format */}
                      {project.receivedTime
                        ? project.receivedTime.includes("T")
                          ? new Date(project.receivedTime).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              }
                            )
                          : project.receivedTime
                        : "-"}
                    </td>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Projects;
