import React, { useState, useEffect } from "react";
import "./ProjectHistory.css";
// Icons
import ChevronLeftIcon from "../../components/icons/ChevronLeftIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import FilterIcon from "../../components/icons/FilterIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import HistoryProjectCard from "../../components/ui/HistoryProjectCard";
import { useNavigate } from "react-router-dom"; // Add navigation hook

const ProjectHistory = ({ onBack }) => {
  const [filter, setFilter] = useState("All");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Hook for navigation

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        // Filter only Completed projects
        const completed = data.filter((p) => p.status === "Completed");
        setProjects(completed.reverse()); // Show newest first
      }
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (id) => {
    navigate(`/detail/${id}`);
  };

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

      {/* Content */}
      {loading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingTop: "4rem",
          }}
        >
          <LoadingSpinner />
        </div>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#64748b" }}>
          <p>No completed projects found.</p>
        </div>
      ) : (
        <div className="month-section">
          <div className="month-header">
            <span className="month-label">History</span>
            <span className="project-count">{projects.length} Projects</span>
          </div>

          <div className="history-cards-grid">
            {projects.map((project) => (
              <HistoryProjectCard
                key={project._id}
                project={project}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectHistory;
