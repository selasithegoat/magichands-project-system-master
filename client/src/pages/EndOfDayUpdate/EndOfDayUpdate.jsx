import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Import useNavigate
import Spinner from "../../components/ui/Spinner";
import "./EndOfDayUpdate.css";

const EndOfDayUpdate = ({ user }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Hook

  useEffect(() => {
    // Redirect if user is loaded but not Front Desk
    if (user && !user.department?.includes("Front Desk")) {
      navigate("/");
      return;
    }

    fetchProjects();
  }, [user, navigate]);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        const activeProjects = data.filter(
          (p) =>
            p.status !== "Completed" && p.status !== "Pending Scope Approval"
        );
        setProjects(activeProjects);
      }
    } catch (err) {
      console.error("Failed to fetch projects", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return "";
    return timeString;
  };

  if (loading) {
    return (
      <div className="spinner-container">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="end-of-day-container">
      <div className="page-header">
        <h1>End of Day Update</h1>
        <p>Final updates on all active projects</p>
      </div>

      <div className="table-container">
        <table className="update-table">
          <thead>
            <tr>
              <th>Lead Name</th>
              <th>Order Number</th>
              <th>Order Name</th>
              <th>Delivery Date & Time</th>
              <th>Status</th>
              <th>Final Update</th>
            </tr>
          </thead>
          <tbody>
            {console.log("Projects in EndOfDay:", projects)}
            {projects.length > 0 ? (
              projects.map((project) => (
                <tr key={project._id}>
                  <td>
                    {project.projectLeadId
                      ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
                      : project.details?.lead || "Unassigned"}
                  </td>
                  <td>{project.orderId || "N/A"}</td>
                  <td>{project.details?.projectName || "Untitled"}</td>
                  <td>
                    <div className="delivery-cell">
                      <span>{formatDate(project.details?.deliveryDate)}</span>
                      <span className="time-sub">
                        {formatTime(project.details?.deliveryTime)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`status-badge ${project.status
                        ?.toLowerCase()
                        .replace(/\s+/g, "-")}`}
                    >
                      {project.status}
                    </span>
                  </td>
                  <td className="update-cell">
                    {project.endOfDayUpdate ? (
                      <div className="update-content">
                        <p>{project.endOfDayUpdate}</p>
                        <span className="update-date">
                          {formatDate(project.endOfDayUpdateDate)}
                        </span>
                      </div>
                    ) : (
                      <span className="no-update">No final update yet</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="empty-state">
                  No active projects found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EndOfDayUpdate;
