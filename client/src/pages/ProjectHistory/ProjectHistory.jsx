import React, { useState } from "react";
import "./ProjectHistory.css";

// Icons
const ChevronLeft = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const SearchIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8"></circle>
    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
  </svg>
);

const FilterIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="4" y1="21" x2="4" y2="14"></line>
    <line x1="4" y1="10" x2="4" y2="3"></line>
    <line x1="12" y1="21" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12" y2="3"></line>
    <line x1="20" y1="21" x2="20" y2="16"></line>
    <line x1="20" y1="12" x2="20" y2="3"></line>
    <line x1="1" y1="14" x2="7" y2="14"></line>
    <line x1="9" y1="8" x2="15" y2="8"></line>
    <line x1="17" y1="16" x2="23" y2="16"></line>
  </svg>
);

const BuildingIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
    <line x1="9" y1="22" x2="9" y2="22.01"></line>
    <line x1="15" y1="22" x2="15" y2="22.01"></line>
    <line x1="12" y1="22" x2="12" y2="22.01"></line>
    <line x1="12" y1="2" x2="12" y2="22"></line>
    <line x1="4" y1="10" x2="20" y2="10"></line>
    <line x1="4" y1="6" x2="20" y2="6"></line>
    <line x1="4" y1="14" x2="20" y2="14"></line>
    <line x1="4" y1="18" x2="20" y2="18"></line>
  </svg>
);

const CalendarIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="16" y1="2" x2="16" y2="6"></line>
    <line x1="8" y1="2" x2="8" y2="6"></line>
    <line x1="3" y1="10" x2="21" y2="10"></line>
  </svg>
);

const CheckCircle = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
);

const ArchiveIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="21 8 21 21 3 21 3 8"></polyline>
    <rect x="1" y="3" width="22" height="5"></rect>
    <line x1="10" y1="12" x2="14" y2="12"></line>
  </svg>
);

const EyeIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const RefreshIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M23 4v6h-6"></path>
    <path d="M1 20v-6h6"></path>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
  </svg>
);

const ProjectHistory = ({ onBack }) => {
  const [filter, setFilter] = useState("All");

  return (
    <div className="history-container">
      {/* Header */}
      <div className="history-header">
        <button className="history-back-btn" onClick={onBack}>
          <ChevronLeft />
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

        {/* Card 1 */}
        <div className="history-card">
          <div className="card-top-row">
            <span className="order-id-tag">ORD-2023-884</span>
            <span className="status-badge delivered">
              <CheckCircle /> Delivered
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
              <CheckCircle /> Delivered
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

      {/* Month: September 2023 */}
      <div className="month-section">
        <div className="month-header">
          <span className="month-label">September 2023</span>
          <span className="project-count">1 Project</span>
        </div>

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
  );
};

export default ProjectHistory;
