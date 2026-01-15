import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import DashboardLayout from "../../layouts/DashboardLayout/DashboardLayout";
import "./ProjectDetails.css";
import { ProjectsIcon } from "../../icons/Icons";

const ProjectDetails = () => {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data);
        } else {
          console.error("Failed to fetch project");
        }
      } catch (err) {
        console.error("Error fetching project:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [id]);

  if (loading) {
    return (
      <DashboardLayout>
        <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
          Loading details...
        </div>
      </DashboardLayout>
    );
  }

  if (!project) {
    return (
      <DashboardLayout>
        <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
          Project not found.
        </div>
      </DashboardLayout>
    );
  }

  // Helpers
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatReceivedTime = () => {
    if (!project.receivedTime) return "N/A";
    if (project.receivedTime.includes("T")) {
      return new Date(project.receivedTime).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    // Handle HH:mm format by combining with Order Date or Created At
    const dateBase = project.orderDate || project.createdAt;
    return `${new Date(dateBase).toLocaleDateString()} at ${
      project.receivedTime
    }`;
  };

  const details = project.details || {};

  return (
    <DashboardLayout>
      <div className="project-details-page">
        <Link to="/projects" className="back-link">
          ← Back to Projects
        </Link>

        <div className="details-header">
          <div className="header-left">
            <h1>
              {project.orderId || "Order #..."}
              <span
                className={`status-badge ${project.status
                  ?.toLowerCase()
                  .replace(" ", "-")}`}
              >
                {project.status}
              </span>
            </h1>
            <p>{details.projectName}</p>
          </div>
        </div>

        <div className="details-grid">
          {/* Left Column */}
          <div className="main-info">
            {/* General Info */}
            <div className="detail-card">
              <h3 className="card-title">General Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Client</label>
                  <p>{details.client || "N/A"}</p>
                </div>
                <div className="info-item">
                  <label>Order Date</label>
                  <p>{formatDate(project.orderDate || project.createdAt)}</p>
                </div>
                <div className="info-item">
                  <label>Received Time</label>
                  <p>{formatReceivedTime()}</p>
                </div>
                <div className="info-item">
                  <label>Delivery</label>
                  <p>
                    {formatDate(details.deliveryDate)}
                    {details.deliveryTime ? ` @ ${details.deliveryTime}` : ""}
                  </p>
                </div>
                <div className="info-item">
                  <label>Location</label>
                  <p>{details.deliveryLocation || "N/A"}</p>
                </div>
                <div className="info-item">
                  <label>Contact Type</label>
                  <p>{details.contactType || "N/A"}</p>
                </div>
                <div className="info-item">
                  <label>Supply Source</label>
                  <p>{details.supplySource || "N/A"}</p>
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div className="detail-card">
              <h3 className="card-title">Order Items</h3>
              {project.items && project.items.length > 0 ? (
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Details</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.items.map((item, i) => (
                      <tr key={i}>
                        <td>{item.description}</td>
                        <td>{item.breakdown || "-"}</td>
                        <td>{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>
                  No items listed.
                </p>
              )}
            </div>

            {/* Challenges (if any) */}
            {project.challenges && project.challenges.length > 0 && (
              <div className="detail-card">
                <h3 className="card-title">Project Challenges</h3>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  {project.challenges.map((c, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "0.5rem",
                        background: "rgba(239, 68, 68, 0.1)",
                        borderRadius: "6px",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                      }}
                    >
                      <p style={{ fontWeight: 600, color: "#fca5a5" }}>
                        {c.title}
                      </p>
                      <p style={{ fontSize: "0.9rem", color: "#f8fafc" }}>
                        {c.description}
                      </p>
                      <span style={{ fontSize: "0.8rem", color: "#fca5a5" }}>
                        Status: {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="side-info">
            <div className="detail-card">
              <h3 className="card-title">People & Departments</h3>
              <div className="info-item" style={{ marginBottom: "1.5rem" }}>
                <label>Project Lead</label>
                <p>
                  {project.projectLeadId
                    ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
                    : details.lead || "Unassigned"}
                </p>
              </div>

              <div className="info-item">
                <label>Engaged Departments</label>
                <div style={{ marginTop: "0.5rem" }}>
                  {project.departments && project.departments.length > 0 ? (
                    project.departments.map((dept, i) => (
                      <span key={i} className="dept-tag">
                        {dept}
                      </span>
                    ))
                  ) : (
                    <p
                      style={{
                        fontSize: "0.9rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      None
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Risks / Factors */}
            {(project.uncontrollableFactors?.length > 0 ||
              project.productionRisks?.length > 0) && (
              <div className="detail-card">
                <h3 className="card-title">Risks & Factors</h3>
                {project.uncontrollableFactors?.length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    <label
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                      }}
                    >
                      Uncontrollable Factors
                    </label>
                    <ul
                      style={{
                        paddingLeft: "1.2rem",
                        margin: "0.5rem 0",
                        color: "var(--text-primary)",
                        fontSize: "0.9rem",
                      }}
                    >
                      {project.uncontrollableFactors.map((f, i) => (
                        <li key={i}>{f.description}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {project.productionRisks?.length > 0 && (
                  <div>
                    <label
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                      }}
                    >
                      Production Risks
                    </label>
                    <ul
                      style={{
                        paddingLeft: "1.2rem",
                        margin: "0.5rem 0",
                        color: "var(--text-primary)",
                        fontSize: "0.9rem",
                      }}
                    >
                      {project.productionRisks.map((r, i) => (
                        <li key={i}>{r.description}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ProjectDetails;
