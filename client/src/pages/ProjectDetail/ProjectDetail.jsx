import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import "./ProjectDetail.css";
import UserAvatar from "../../components/ui/UserAvatar";
import BackArrow from "../../components/icons/BackArrow";
import EditIcon from "../../components/icons/EditIcon";
import LocationIcon from "../../components/icons/LocationIcon";
import CalendarIcon from "../../components/icons/CalendarIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import WarningIcon from "../../components/icons/WarningIcon";
import CheckIcon from "../../components/icons/CheckIcon";
import FolderIcon from "../../components/icons/FolderIcon";
import ProjectExecution from "./ProjectExecution";
import ProjectUpdates from "./ProjectUpdates";
import ProjectChallenges from "./ProjectChallenges";
import ProjectActivity from "./ProjectActivity";
import ProgressDonutIcon from "../../components/icons/ProgressDonutIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Overview");
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      setProject(data);
    } catch (err) {
      console.error(err);
      setError("Could not load project details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchProject();
  }, [id]);

  if (loading)
    return (
      <div
        className="project-detail-container"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <LoadingSpinner />
      </div>
    );
  if (error)
    return (
      <div className="project-detail-container">
        <p style={{ padding: "2rem", color: "red" }}>{error}</p>
      </div>
    );
  if (!project) return null;

  return (
    <div className="project-detail-container">
      <header className="project-header">
        <div className="header-top">
          <div className="header-left">
            <button className="back-button" onClick={() => navigate(-1)}>
              <BackArrow />
            </button>
            <h1 className="project-title">
              {project.orderId || "Unititled"}
              <span className="status-badge">
                <ClockIcon width="14" height="14" /> {project.status}
              </span>
            </h1>
          </div>
          <button className="edit-link" onClick={() => console.log("Edit")}>
            Edit
          </button>
        </div>
        <div className="project-subtitle">{project.details?.projectName}</div>
        <nav className="header-nav">
          {["Overview", "Execution", "Updates", "Challenges", "Activities"].map(
            (tab) => (
              <a
                key={tab}
                className={`nav-item ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </a>
            )
          )}
        </nav>
      </header>

      <main className="project-content">
        {activeTab === "Overview" && (
          <>
            <div className="main-column">
              <ProjectInfoCard project={project} />
              <DepartmentsCard departments={project.departments} />
              <OrderItemsCard
                items={project.items}
                projectId={project._id}
                onUpdate={fetchProject}
              />
              <RisksCard risks={project.uncontrollableFactors} />
              <ProductionRisksCard risks={project.productionRisks} />
            </div>
            <div className="side-column">
              <ProgressCard project={project} />
              {/* Quick Actions Removed */}
              <ApprovalsCard status={project.status} />
            </div>
          </>
        )}
        {activeTab === "Execution" && <ProjectExecution project={project} />}
        {activeTab === "Updates" && <ProjectUpdates project={project} />}
        {activeTab === "Challenges" && <ProjectChallenges project={project} />}
        {activeTab === "Activities" && <ProjectActivity project={project} />}
      </main>
    </div>
  );
};

const ProjectInfoCard = ({ project }) => {
  const details = project.details || {};
  const leadName = details.lead || "Unassigned";

  // Format Date
  const formatDate = (d) => {
    if (!d) return "TBD";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">
          <span style={{ color: "#94a3b8" }}>ⓘ</span> Project Info
        </h3>
        <button className="edit-link">
          <EditIcon width="16" height="16" />
        </button>
      </div>
      <div className="info-grid">
        <div className="info-item">
          <h4>PROJECT LEAD</h4>
          <div className="lead-profile">
            <UserAvatar name={leadName} width="32px" height="32px" />
            <span>{leadName}</span>
          </div>
        </div>
        <div className="info-item">
          <h4>CONTACT</h4>
          {/* Mock contact for now as it's not in schema explicitly other than type */}
          <span className="info-text-bold">{details.contactType || "N/A"}</span>
        </div>
        <div className="info-item">
          <h4>DELIVERY SCHEDULE</h4>
          <div className="info-text-bold">
            <CalendarIcon width="16" height="16" />{" "}
            {formatDate(details.deliveryDate)}
          </div>
          <div className="info-subtext">
            {details.deliveryTime || "All Day"}
          </div>
        </div>
        <div className="info-item">
          <h4>LOCATION</h4>
          <div className="info-text-bold">
            <LocationIcon width="16" height="16" />{" "}
            {details.deliveryLocation || "Unknown"}
          </div>
          <div className="info-subtext">{/* Address placeholder */}</div>
        </div>
      </div>
    </div>
  );
};

const DepartmentsCard = ({ departments = [] }) => {
  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">👥 Departments</h3>
        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
          {departments.length} Engaged
        </span>
      </div>
      <div className="dept-list">
        {departments.length > 0 ? (
          departments.map((dept, i) => (
            <span className="dept-tag" key={i}>
              <span
                className="dept-dot"
                style={{ background: "#3b82f6" }}
              ></span>{" "}
              {dept}
            </span>
          ))
        ) : (
          <span style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
            No departments assigned
          </span>
        )}
      </div>
    </div>
  );
};

const OrderItemsCard = ({ items = [], projectId, onUpdate }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState({
    description: "",
    breakdown: "",
    qty: 1,
  });
  const [loading, setLoading] = useState(false);

  const handleAddItem = async () => {
    if (!newItem.description) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });

      if (res.ok) {
        setIsAdding(false);
        setNewItem({ description: "", breakdown: "", qty: 1 });
        if (onUpdate) onUpdate(); // Refresh parent
      }
    } catch (err) {
      console.error("Failed to add item", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">📦 Order Items</h3>
        <button
          className="edit-link"
          onClick={() => setIsAdding(!isAdding)}
          style={{
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          {isAdding ? "Cancel" : "+ Add Item"}
        </button>
      </div>

      {isAdding && (
        <div
          style={{
            padding: "1rem",
            background: "#f8fafc",
            borderRadius: "8px",
            marginBottom: "1rem",
            border: "1px solid #e2e8f0",
          }}
        >
          <div style={{ display: "grid", gap: "1rem" }}>
            <input
              type="text"
              placeholder="Description"
              className="input-field"
              value={newItem.description}
              onChange={(e) =>
                setNewItem({ ...newItem, description: e.target.value })
              }
              autoFocus
            />
            <input
              type="text"
              placeholder="Breakdown / Details (Optional)"
              className="input-field"
              value={newItem.breakdown}
              onChange={(e) =>
                setNewItem({ ...newItem, breakdown: e.target.value })
              }
            />
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                Qty:
              </label>
              <input
                type="number"
                min="1"
                className="input-field"
                style={{ width: "80px" }}
                value={newItem.qty}
                onChange={(e) =>
                  setNewItem({ ...newItem, qty: e.target.value })
                }
              />
              <button
                className="btn-primary"
                style={{ marginLeft: "auto", padding: "0.5rem 1rem" }}
                onClick={handleAddItem}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <table className="items-table">
          <thead>
            <tr>
              <th>DESCRIPTION</th>
              <th style={{ textAlign: "right" }}>QTY</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td>
                  <div className="item-desc">
                    <span className="item-name">{item.description}</span>
                    <span className="item-sub">{item.breakdown}</span>
                  </div>
                </td>
                <td className="item-qty">{item.qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#94a3b8", fontSize: "0.875rem" }}>
          No items listed.
        </p>
      )}
    </div>
  );
};

const RisksCard = ({ risks = [] }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="risk-section">
      <div className="risk-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="risk-title">
          <WarningIcon width="20" height="20" color="#991b1b" /> Uncontrollable
          Factors
        </div>
        <div
          className="risk-count"
          style={{ fontSize: "0.875rem", color: "#7f1d1d" }}
        >
          {risks.length} flagged items {isOpen ? "▲" : "▼"}
        </div>
      </div>
      {isOpen && (
        <div className="risk-content">
          {risks.length > 0 ? (
            risks.map((risk, i) => (
              <div className="risk-item" key={i}>
                <div className="risk-dot"></div>
                <div className="risk-details">
                  <h5>{risk.description}</h5>
                  <p>Status: {risk.status?.label || "Pending"}</p>
                </div>
              </div>
            ))
          ) : (
            <p
              style={{
                color: "#7f1d1d",
                fontSize: "0.875rem",
                marginBottom: "1rem",
              }}
            >
              No uncontrollable factors reported.
            </p>
          )}
          <button className="risk-add-btn">+ Add Risk Factor</button>
        </div>
      )}
    </div>
  );
};

const ProductionRisksCard = ({ risks = [] }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="detail-card" style={{ padding: "0" }}>
      <div
        className="risk-header"
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderBottom: isOpen ? "1px solid #e2e8f0" : "none" }}
      >
        <div className="risk-title" style={{ color: "#000" }}>
          <span style={{ color: "#eab308" }}>⚠️</span> Production Risks
        </div>
        <div
          className="risk-count"
          style={{ fontSize: "0.875rem", color: "#64748b" }}
        >
          {risks.length} flagged items {isOpen ? "▲" : "▼"}
        </div>
      </div>
      {isOpen && (
        <div className="risk-content">
          {risks.length > 0 ? (
            risks.map((risk, i) => (
              <div className="risk-item" key={i}>
                <div
                  className="risk-dot"
                  style={{ backgroundColor: "#eab308" }}
                ></div>
                <div className="risk-details">
                  <h5>{risk.description}</h5>
                  <p>Preventive: {risk.preventive}</p>
                </div>
              </div>
            ))
          ) : (
            <p
              style={{
                color: "#64748b",
                fontSize: "0.875rem",
                marginBottom: "1rem",
              }}
            >
              No production risks reported.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const ProgressCard = ({ project }) => {
  // Mock calculation or from project data if available
  const progress = project.progress !== undefined ? project.progress : 50;

  return (
    <div className="detail-card progress-card">
      <div className="progress-header">
        <span>OVERALL PROGRESS</span>
        {/* Loader icon placeholder */}
        <div
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            border: "2px solid #e2e8f0",
            borderTopColor: "#cbd5e1",
          }}
        ></div>
      </div>
      <div className="chart-container">
        {/* Simple SVG Donut Chart */}
        <ProgressDonutIcon percentage={progress} />
      </div>
      <div className="progress-stats">
        <div className="stat-box">
          <span className="stat-value">--</span>
          <span className="stat-label">DONE</span>
        </div>
        <div className="stat-box" style={{ background: "#eff6ff" }}>
          <span className="stat-value" style={{ color: "#2563eb" }}>
            --
          </span>
          <span className="stat-label" style={{ color: "#2563eb" }}>
            PENDING
          </span>
        </div>
      </div>
    </div>
  );
};

const ApprovalsCard = ({ status }) => {
  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">☑ Approvals</h3>
      </div>
      <div className="approval-list">
        {/* Mock Data for now - could be dynamic later */}
        <div className="approval-item">
          <div className="approval-status completed">
            <CheckIcon className="check-mark primary" width="14" height="14" />
          </div>
          <div className="approval-content">
            <span className="approval-title">Scope Approval</span>
            <span className="approval-sub">Approved by System</span>
          </div>
        </div>

        <div className="approval-item active">
          <div className="approval-status active">
            <div className="active-dot"></div>
          </div>
          <div className="approval-content">
            <button className="nudge-btn">Nudge</button>
            <span className="approval-title" style={{ color: "#3b82f6" }}>
              Current Status
            </span>
            <span className="approval-sub" style={{ color: "#3b82f6" }}>
              {status}
            </span>
          </div>
        </div>
      </div>
      <a className="view-all-link">View All Approvals</a>
    </div>
  );
};

export default ProjectDetail;
