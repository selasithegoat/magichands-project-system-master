import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./PendingAssignments.css";

const PendingAssignments = ({ onStartNew, user }) => {
  const [adjustments, setAdjustments] = useState([]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssignments = async () => {
      if (!user) return;
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          const pending = data.filter((p) => {
            const leadId = p.projectLeadId?._id || p.projectLeadId;
            return leadId === user._id && p.status === "Pending Scope Approval";
          });
          setAdjustments(pending);
        }
      } catch (error) {
        console.error("Failed to load assignments", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAssignments();
  }, [user]);

  const handleAccept = (projectId) => {
    navigate(`/create/wizard?edit=${projectId}`);
  };

  if (loading) return <div>Loading...</div>;

  const isFrontDesk = user?.department?.includes("Front Desk");

  return (
    <div className="pending-assignments-container">
      <div className="pa-header">
        <div>
          <h1>Pending Project Assignments</h1>
          <p>You have {adjustments.length} projects waiting for acceptance.</p>
        </div>
        {isFrontDesk && (
          <button
            className="btn-start-new-header"
            onClick={onStartNew}
            style={{
              padding: "0.75rem 1.5rem",
              background: "#3498db",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "600",
            }}
          >
            Start New Project
          </button>
        )}
      </div>

      <div className="pa-grid">
        {adjustments.length === 0 ? (
          <div className="no-assignments">
            <p>No pending assignments.</p>
            {isFrontDesk && (
              <button
                className="btn-start-new"
                onClick={onStartNew}
                style={{
                  marginTop: "1rem",
                  padding: "0.75rem 1.5rem",
                  background: "#3498db",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Start New Project
              </button>
            )}
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
                  {new Date(
                    project.orderDate || project.createdAt,
                  ).toLocaleDateString()}{" "}
                  at{" "}
                  {project.receivedTime
                    ? project.receivedTime.includes("T")
                      ? new Date(project.receivedTime).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : project.receivedTime
                    : "N/A"}
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
