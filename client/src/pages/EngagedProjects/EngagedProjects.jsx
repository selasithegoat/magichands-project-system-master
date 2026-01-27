import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  PRODUCTION_SUB_DEPARTMENTS,
  getDepartmentLabel,
} from "../../constants/departments";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import Toast from "../../components/ui/Toast";
import "./EngagedProjects.css";

const EngagedProjects = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Modal State
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [updateForm, setUpdateForm] = useState({
    content: "",
    category: "Production",
    department: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchEngagedProjects();
  }, []);

  const fetchEngagedProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        // Filter projects that have at least one production sub-department engaged
        const engaged = data.filter((project) => {
          if (!project.departments || project.departments.length === 0)
            return false;
          return project.departments.some((dept) =>
            PRODUCTION_SUB_DEPARTMENTS.includes(dept),
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

  const handleOpenUpdateModal = (project) => {
    setSelectedProject(project);
    // Get only production sub-departments for this project
    const engagedDepts = project.departments.filter((dept) =>
      PRODUCTION_SUB_DEPARTMENTS.includes(dept),
    );
    setUpdateForm({
      content: "",
      category: "Production",
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
        <h1>Engaged Projects</h1>
        <p className="engaged-subtitle">
          Projects where the Production department is actively engaged.
        </p>
      </header>

      <div className="engaged-table-wrapper">
        {projects.length === 0 ? (
          <div className="empty-state">
            <p>No engaged projects at this time.</p>
          </div>
        ) : (
          <table className="engaged-table">
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Lead</th>
                <th>Client</th>
                <th>Delivery Date & Time</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => {
                const lead = project.projectLeadId
                  ? `${project.projectLeadId.firstName || ""} ${project.projectLeadId.lastName || ""}`.trim()
                  : project.details?.lead || "Unassigned";
                const client = project.details?.client || "N/A";
                const deliveryDate = formatDate(project.details?.deliveryDate);
                const deliveryTime = formatTime(project.details?.deliveryTime);

                return (
                  <tr key={project._id}>
                    <td
                      className="project-id-cell"
                      onClick={() => navigate(`/detail/${project._id}`)}
                    >
                      {project.orderId || project._id.slice(-6).toUpperCase()}
                    </td>
                    <td>{lead}</td>
                    <td>{client}</td>
                    <td>
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
                  .filter((dept) => PRODUCTION_SUB_DEPARTMENTS.includes(dept))
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
