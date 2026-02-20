import React, { useState, useEffect } from "react";
import "./ProjectHistory.css";
// Icons
import ChevronLeftIcon from "../../components/icons/ChevronLeftIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import FilterIcon from "../../components/icons/FilterIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import HistoryProjectCard from "../../components/ui/HistoryProjectCard";
import { useNavigate } from "react-router-dom"; // Add navigation hook
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";

const ProjectHistory = ({ onBack }) => {
  const [filter, setFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Hook for navigation

  useEffect(() => {
    fetchHistory();
  }, []);

  useRealtimeRefresh(() => fetchHistory());

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        // History should only show Finished projects
        const finished = data.filter((p) => p.status === "Finished");
        setProjects(finished.reverse()); // Show newest first
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

  const getProjectDate = (project) => {
    const dateStr =
      project.details?.deliveryDate || project.orderDate || project.createdAt;
    const d = dateStr ? new Date(dateStr) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  };

  const matchesFilter = (project) => {
    if (filter === "All") return true;

    const projectDate = getProjectDate(project);
    if (!projectDate) return false;

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisMonthStart = thisMonth;

    if (filter === "This Month") {
      return projectDate >= thisMonthStart && projectDate < nextMonth;
    }
    if (filter === "Last Month") {
      return projectDate >= lastMonthStart && projectDate < thisMonthStart;
    }
    // Older
    return projectDate < lastMonthStart;
  };

  const matchesSearch = (project) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    const details = project.details || {};
    const orderId = (project.orderId || "").toLowerCase();
    const projectName = (details.projectName || "").toLowerCase();
    const client = (
      details.client ||
      details.clientName ||
      details.department ||
      ""
    ).toLowerCase();

    return (
      orderId.includes(query) ||
      projectName.includes(query) ||
      client.includes(query)
    );
  };

  const filteredProjects = projects.filter(
    (project) => matchesFilter(project) && matchesSearch(project),
  );

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
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
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
          <p>No finished projects found.</p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "#64748b" }}>
          <p>No projects match your search or filter.</p>
        </div>
      ) : (
        <div className="month-section">
          <div className="month-header">
            <span className="month-label">History</span>
            <span className="project-count">
              {filteredProjects.length} Projects
            </span>
          </div>

          <div className="history-cards-grid">
            {filteredProjects.map((project) => (
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
