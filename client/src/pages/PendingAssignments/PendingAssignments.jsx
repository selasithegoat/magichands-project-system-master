import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./PendingAssignments.css";

const PendingAssignments = ({ onStartNew }) => {
  const [adjustments, setAdjustments] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch projects assigned to me with status "Pending Scope Approval"
    // Since getProjects returns all, we filter client side for now unless we added specific endpoint
    const fetchAssignments = async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          // Filter for my assignments (assuming backend filters getting all projects, but let's be safe if it returns all)
          // Actually getProjects usually returns all projects if admin, or user's projects?
          // Let's assume getProjects returns enough info.
          // Wait, getProjects controller: "Project.find({})" - returns ALL.
          // We need to filter by `projectLeadId` matching current user AND status.
          // We need 'current user' ID.
          // Browser fetch doesn't easily give us ID unless we stored it in context.
          // Let's assume we filter on server or we fetch /auth/me or passing user as prop?
          // I'll update App.jsx to pass User or just fetch /auth/me here or trust server filtering if I implemented it.
          // I didn't change getProjects to filter.
          // I will filter client side here if I can get current user.
          // BETTER: Add a proper endpoint or query param to getProjects?
          // `GET /api/projects?assigned=me`?
          // For now, I'll fetch `/api/auth/me` to get my ID then filter list.

          const userRes = await fetch("/api/auth/me");
          if (userRes.ok) {
            const user = await userRes.json();
            const pending = data.filter(
              (p) =>
                p.projectLeadId === user._id &&
                p.status === "Pending Scope Approval"
            );
            setAdjustments(pending);
          }
        }
      } catch (error) {
        console.error("Failed to load assignments", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAssignments();
  }, []);

  const handleAccept = (projectId) => {
    navigate(`/create/wizard?edit=${projectId}`);
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="pending-assignments-container">
      <div className="pa-header">
        <div>
          <h1>Pending Project Assignments</h1>
          <p>You have {adjustments.length} projects waiting for acceptance.</p>
        </div>
      </div>

      <div className="pa-grid">
        {adjustments.length === 0 ? (
          <div className="no-assignments">
            <p>No pending assignments.</p>
          </div>
        ) : (
          adjustments.map((project) => (
            <div key={project._id} className="pa-card">
              <div className="pa-card-header">
                <span className="pa-order-id">
                  {project.orderId || "New Order"}
                </span>
                <span className="pa-status-badge">{project.status}</span>
              </div>
              <div className="pa-card-body">
                <h3>{project.details?.projectName || "Untitled Project"}</h3>
                <p>
                  <strong>Assigned:</strong>{" "}
                  {new Date(project.createdAt).toLocaleDateString()}
                </p>
                {project.details?.client && (
                  <p>
                    <strong>Client:</strong> {project.details.client}
                  </p>
                )}
              </div>
              <div className="pa-card-footer">
                <button
                  className="btn-accept"
                  onClick={() => handleAccept(project._id)}
                >
                  Accept Project
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PendingAssignments;
