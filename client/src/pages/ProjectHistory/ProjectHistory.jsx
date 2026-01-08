import React, { useState } from "react";
import "./ProjectHistory.css";
// Icons
import ChevronLeftIcon from "../../components/icons/ChevronLeftIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import FilterIcon from "../../components/icons/FilterIcon";
import BuildingIcon from "../../components/icons/BuildingIcon";
import CalendarIcon from "../../components/icons/CalendarIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import ArchiveIcon from "../../components/icons/ArchiveIcon";
import EyeIcon from "../../components/icons/EyeIcon";
import RefreshIcon from "../../components/icons/RefreshIcon";

const ProjectHistory = ({ onBack }) => {
  const [filter, setFilter] = useState("All");

  return (
    <div className="history-container">
      {/* Header */}
      <div className="history-header">
        <button className="history-back-btn" onClick={onBack}>
          <ChevronLeftIcon />
        </button>
        <h1 className="history-title">Project History</h1>
        <div style={{ width: 32 }}></div> {/* Spacer */}
      </div>

      {/* Search */}
      <div className="history-search-bar">
        <SearchIcon className="text-gray-400" />
        <input
          type="text"
          className="search-input"
          placeholder="Search by Order #, Client, or Project Name..."
        />
        <FilterIcon className="filter-icon" />
      </div>

      {/* Filters */}
      <div className="history-filters">
        {["All", "This Month", "Last Month", "Older"].map((f) => (
          <button
            key={f}
            className={`filter-pill ${filter === f ? "active" : "inactive"}`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Month: October 2023 */}
      <div className="month-section">
        <div className="month-header">
          <span className="month-label">October 2023</span>
          <span className="project-count">2 Projects</span>
        </div>

        <div className="history-cards-grid">
          {/* Card 1 */}
          <div className="history-card">
            <div className="card-top-row">
              <span className="order-id-tag">ORD-2023-884</span>
              <span className="status-badge delivered">
                <CheckCircleIcon /> Delivered
              </span>
            </div>
            <h3 className="card-title">Office Renovation Phase 1</h3>

            <div className="card-info-grid">
              <div className="info-item">
                <div className="info-icon">
                  <BuildingIcon />
                </div>
                <div className="info-content">
                  <span className="info-label">Client</span>
                  <span className="info-value">Acme Corp</span>
                </div>
              </div>
              <div className="info-item">
                <div className="info-icon">
                  <CalendarIcon />
                </div>
                <div className="info-content">
                  <span className="info-label">Delivered On</span>
                  <span className="info-value">Oct 24, 2023</span>
                </div>
              </div>
            </div>

            <div className="card-actions">
              <button className="action-btn btn-secondary">
                <EyeIcon /> View Details
              </button>
              <button className="action-btn btn-primary-outline">
                <RefreshIcon /> Reopen
              </button>
            </div>
          </div>

          {/* Card 2 */}
          <div className="history-card">
            <div className="card-top-row">
              <span className="order-id-tag">ORD-2023-882</span>
              <span className="status-badge delivered">
                <CheckCircleIcon /> Delivered
              </span>
            </div>
            <h3 className="card-title">Q3 Marketing Campaign</h3>

            <div className="card-info-grid">
              <div className="info-item">
                <div className="info-icon">
                  <BuildingIcon />
                </div>
                <div className="info-content">
                  <span className="info-label">Client</span>
                  <span className="info-value">Stark Industries</span>
                </div>
              </div>
              <div className="info-item">
                <div className="info-icon">
                  <CalendarIcon />
                </div>
                <div className="info-content">
                  <span className="info-label">Delivered On</span>
                  <span className="info-value">Oct 15, 2023</span>
                </div>
              </div>
            </div>

            <div className="card-actions">
              <button className="action-btn btn-secondary">
                <EyeIcon /> View Details
              </button>
              <button className="action-btn btn-primary-outline">
                <RefreshIcon /> Reopen
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Month: September 2023 */}
      <div className="month-section">
        <div className="month-header">
          <span className="month-label">September 2023</span>
          <span className="project-count">1 Project</span>
        </div>

        <div className="history-cards-grid">
          {/* Card 3 */}
          <div className="history-card">
            <div className="card-top-row">
              <span className="order-id-tag">ORD-2023-865</span>
              <span className="status-badge archived">
                <ArchiveIcon /> Archived
              </span>
            </div>
            <h3 className="card-title">Internal Audit Q2</h3>

            <div className="card-info-grid">
              <div className="info-item">
                <div className="info-icon">
                  <BuildingIcon />
                </div>
                <div className="info-content">
                  <span className="info-label">Department</span>
                  <span className="info-value">Finance Dept.</span>
                </div>
              </div>
              <div className="info-item">
                <div className="info-icon">
                  <CalendarIcon />
                </div>
                <div className="info-content">
                  <span className="info-label">Completed On</span>
                  <span className="info-value">Sep 28, 2023</span>
                </div>
              </div>
            </div>

            <div className="card-actions">
              <button
                className="action-btn btn-secondary"
                style={{ width: "100%" }}
              >
                <EyeIcon /> View Details Only
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectHistory;
