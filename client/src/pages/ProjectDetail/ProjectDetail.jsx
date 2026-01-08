import React, { useState } from "react";
import "./ProjectDetail.css";
import UserAvatar from "../../components/ui/UserAvatar";
import BackArrow from "../../components/icons/BackArrow";
import EditIcon from "../../components/icons/EditIcon";
import LocationIcon from "../../components/icons/LocationIcon";
import CalendarIcon from "../../components/icons/CalendarIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import WarningIcon from "../../components/icons/WarningIcon";
import CheckIcon from "../../components/icons/CheckIcon";
import PlusCircleIcon from "../../components/icons/PlusCircleIcon";
import FolderIcon from "../../components/icons/FolderIcon";
import ProjectExecution from "./ProjectExecution";
import ProjectUpdates from "./ProjectUpdates";
import ProjectChallenges from "./ProjectChallenges";
import ProjectHistory from "./ProjectHistory";
import ProgressDonutIcon from "../../components/icons/ProgressDonutIcon";
// Department icons might be needed if dynamic, for now using dots or generic

const ProjectDetail = () => {
  const [activeTab, setActiveTab] = useState("Overview");

  return (
    <div className="project-detail-container">
      <header className="project-header">
        <div className="header-top">
          <div className="header-left">
            <button className="back-button">
              <BackArrow />
            </button>
            <h1 className="project-title">
              #MH-2023-88
              <span className="status-badge">
                <ClockIcon width="14" height="14" /> In Progress
              </span>
            </h1>
          </div>
          <a href="#" className="edit-link">
            Edit
          </a>
        </div>
        <div className="project-subtitle">Annual Tech Conference Setup</div>
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
              <ProjectInfoCard />
              <DepartmentsCard />
              <OrderItemsCard />
              <RisksCard />
              <ProductionRisksCard />
            </div>
            <div className="side-column">
              <ProgressCard />
              <QuickActionsCard />
              <ApprovalsCard />
            </div>
          </>
        )}
        {activeTab === "Execution" && <ProjectExecution />}
        {activeTab === "Updates" && <ProjectUpdates />}
        {activeTab === "Challenges" && <ProjectChallenges />}
        {activeTab === "Activities" && <ProjectHistory />}
      </main>
    </div>
  );
};

const ProjectInfoCard = () => {
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
            <UserAvatar name="Sarah Jenkins" src="/path/to/avatar.jpg" />
            <span>Sarah Jenkins</span>
          </div>
        </div>
        <div className="info-item">
          <h4>CONTACT</h4>
          <a href="mailto:sarah.j@magichands.co" className="contact-email">
            sarah.j@magichands.co
          </a>
        </div>
        <div className="info-item">
          <h4>DELIVERY SCHEDULE</h4>
          <div className="info-text-bold">
            <CalendarIcon width="16" height="16" /> Oct 24, 2023
          </div>
          <div className="info-subtext">08:00 AM - 06:00 PM</div>
        </div>
        <div className="info-item">
          <h4>LOCATION</h4>
          <div className="info-text-bold">
            <LocationIcon width="16" height="16" /> Grand Hall, West Wing
          </div>
          <div className="info-subtext">
            123 Convention Center Blvd, Tech City
          </div>
        </div>
      </div>
    </div>
  );
};

const DepartmentsCard = () => {
  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">👥 Departments</h3>
        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
          3 Engaged
        </span>
      </div>
      <div className="dept-list">
        <span className="dept-tag">
          <span className="dept-dot" style={{ background: "#22c55e" }}></span>{" "}
          AV Team
        </span>
        <span className="dept-tag">
          <span className="dept-dot" style={{ background: "#3b82f6" }}></span>{" "}
          Marketing
        </span>
        <span className="dept-tag">
          <span className="dept-dot" style={{ background: "#eab308" }}></span>{" "}
          Logistics
        </span>
        <span
          className="dept-tag"
          style={{ background: "#fff", border: "1px solid #e2e8f0" }}
        >
          <span className="dept-dot" style={{ background: "#cbd5e1" }}></span>{" "}
          Catering
        </span>
        <button className="add-dept-btn">+</button>
      </div>
      <div style={{ marginTop: "1rem", fontSize: "0.75rem", color: "#94a3b8" }}>
        Last engaged: 2 hours ago by Marketing
      </div>
    </div>
  );
};

const OrderItemsCard = () => {
  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">📦 Order Items</h3>
        <button
          className="edit-link"
          style={{
            fontSize: "0.875rem",
            display: "flex",
            alignItems: "center",
            gap: "0.25rem",
          }}
        >
          + Add Item
        </button>
      </div>
      <table className="items-table">
        <thead>
          <tr>
            <th>DESCRIPTION</th>
            <th style={{ textAlign: "right" }}>QTY</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="item-desc">
                <span className="item-name">Standard Booth (3x3m)</span>
                <span className="item-sub">Shell scheme, white panels</span>
              </div>
            </td>
            <td className="item-qty">10</td>
          </tr>
          <tr>
            <td>
              <div className="item-desc">
                <span className="item-name">LED Wall P3</span>
                <span className="item-sub">Modular 500x500mm tiles</span>
              </div>
            </td>
            <td className="item-qty">2</td>
          </tr>
          <tr>
            <td>
              <div className="item-desc">
                <span className="item-name">High Table & Stools</span>
                <span className="item-sub">Black finish set</span>
              </div>
            </td>
            <td className="item-qty">15</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const RisksCard = () => {
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
          2 flagged items {isOpen ? "▲" : "▼"}
        </div>
      </div>
      {isOpen && (
        <div className="risk-content">
          <div className="risk-item">
            <div className="risk-dot"></div>
            <div className="risk-details">
              <h5>Weather Forecast</h5>
              <p>Potential rain during outdoor loading on Oct 23.</p>
            </div>
          </div>
          <div className="risk-item">
            <div className="risk-dot"></div>
            <div className="risk-details">
              <h5>Union Strike</h5>
              <p>Local transport union announced partial strike.</p>
            </div>
          </div>
          <button className="risk-add-btn">+ Add Risk Factor</button>
        </div>
      )}
    </div>
  );
};

const ProductionRisksCard = () => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="detail-card" style={{ padding: "0" }}>
      {" "}
      {/* Reusing styles but specialized */}
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
          0 flagged items {isOpen ? "▲" : "▼"}
        </div>
      </div>
    </div>
  );
};

const ProgressCard = () => {
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
        <ProgressDonutIcon percentage={75} />
      </div>
      <div className="progress-stats">
        <div className="stat-box">
          <span className="stat-value">12</span>
          <span className="stat-label">DONE</span>
        </div>
        <div className="stat-box" style={{ background: "#eff6ff" }}>
          <span className="stat-value" style={{ color: "#2563eb" }}>
            4
          </span>
          <span className="stat-label" style={{ color: "#2563eb" }}>
            PENDING
          </span>
        </div>
      </div>
    </div>
  );
};

const QuickActionsCard = () => {
  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">⚡ Quick Actions</h3>
      </div>
      <div className="actions-grid">
        <button className="action-btn primary">
          <CheckIcon className="check-mark primary" width="20" height="20" />{" "}
          Mark Step
        </button>
        <button className="action-btn">
          <EditIcon width="20" height="20" /> Add Update
        </button>
        <button className="action-btn">
          <WarningIcon width="20" height="20" /> Report Risk
        </button>
        <button className="action-btn">
          <FolderIcon width="20" height="20" /> History
        </button>
      </div>
    </div>
  );
};

const ApprovalsCard = () => {
  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">☑ Approvals</h3>
      </div>
      <div className="approval-list">
        <div className="approval-item">
          <div className="approval-status completed">
            <CheckIcon className="check-mark primary" width="14" height="14" />
          </div>
          <div className="approval-content">
            <span className="approval-title">Scope Approval</span>
            <span className="approval-sub">Approved by Mike T. - Oct 10</span>
          </div>
        </div>
        <div className="approval-item">
          <div className="approval-status completed">
            <CheckIcon className="check-mark primary" width="14" height="14" />
          </div>
          <div className="approval-content">
            <span className="approval-title">Dept Engagement</span>
            <span className="approval-sub">Auto-verified - Oct 12</span>
          </div>
        </div>
        <div className="approval-item active">
          <div className="approval-status active">
            <div className="active-dot"></div>
          </div>
          <div className="approval-content">
            <button className="nudge-btn">Nudge</button>
            <span className="approval-title" style={{ color: "#3b82f6" }}>
              Project Coord. Sign
            </span>
            <span className="approval-sub" style={{ color: "#3b82f6" }}>
              Awaiting Signature
            </span>
          </div>
        </div>
        <div className="approval-item">
          <div className="approval-status pending"></div>
          <div className="approval-content">
            <span className="approval-title" style={{ color: "#94a3b8" }}>
              Invoice Generation
            </span>
          </div>
        </div>
        <div className="approval-item">
          <div className="approval-status pending"></div>
          <div className="approval-content">
            <span className="approval-title" style={{ color: "#94a3b8" }}>
              Quality Control
            </span>
          </div>
        </div>
      </div>
      <a className="view-all-link">View All Approvals</a>
    </div>
  );
};

export default ProjectDetail;
