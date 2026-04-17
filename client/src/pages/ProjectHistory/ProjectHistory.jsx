import React, { useState, useEffect } from "react";
import "./ProjectHistory.css";
// Icons
import ChevronLeftIcon from "../../components/icons/ChevronLeftIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import FilterIcon from "../../components/icons/FilterIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import HistoryProjectCard from "../../components/ui/HistoryProjectCard";
import { useNavigate } from "react-router-dom"; // Add navigation hook
import usePersistedState from "../../hooks/usePersistedState";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";

const HISTORY_FILTER_OPTIONS = ["All", "This Month", "Last Month", "Older"];

const ProjectHistory = ({ onBack }) => {
  const [filter, setFilter] = usePersistedState(
    "client-project-history-filter",
    "All",
    {
      sanitize: (value) =>
        HISTORY_FILTER_OPTIONS.includes(value) ? value : "All",
    },
  );
  const [searchQuery, setSearchQuery] = usePersistedState(
    "client-project-history-search",
    "",
  );
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Hook for navigation

  useEffect(() => {
    fetchHistory();
  }, []);

  useRealtimeRefresh(() => fetchHistory(), {
    paths: ["/api/projects"],
    excludePaths: ["/api/projects/activities", "/api/projects/ai"],
  });

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

  const getDateBucket = (project) => {
    const projectDate = getProjectDate(project);
    if (!projectDate) return "unknown";

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    if (projectDate >= thisMonthStart && projectDate < nextMonth) {
      return "thisMonth";
    }
    if (projectDate >= lastMonthStart && projectDate < thisMonthStart) {
      return "lastMonth";
    }
    return "older";
  };

  const matchesFilter = (project) => {
    if (filter === "All") return true;
    const bucket = getDateBucket(project);
    if (filter === "This Month") return bucket === "thisMonth";
    if (filter === "Last Month") return bucket === "lastMonth";
    return bucket === "older";
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

  const totalCount = projects.length;
  const bucketCounts = projects.reduce(
    (acc, project) => {
      const bucket = getDateBucket(project);
      if (bucket === "thisMonth") acc.thisMonth += 1;
      if (bucket === "lastMonth") acc.lastMonth += 1;
      if (bucket === "older") acc.older += 1;
      if (bucket === "unknown") acc.unknown += 1;
      return acc;
    },
    { thisMonth: 0, lastMonth: 0, older: 0, unknown: 0 },
  );

  const latestDeliveryDate = projects
    .map(getProjectDate)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];
  const latestDeliveryLabel = latestDeliveryDate
    ? latestDeliveryDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "N/A";

  return (
    <div className="history-container">
      <section className="history-hero">
        <div className="history-hero-left">
          <div className="history-hero-top">
            <button
              className="history-back-btn"
              onClick={onBack}
              aria-label="Back"
            >
              <ChevronLeftIcon />
            </button>
            <span className="history-hero-kicker">Project History</span>
          </div>
          <h1 className="history-title">Delivered work, organized.</h1>
          <p className="history-subtitle">
            Review every completed project, track delivery cadence, and jump
            straight to any finished order when you need context.
          </p>
          <div className="history-hero-meta">
            <span className="history-meta-pill">
              Latest delivery: {latestDeliveryLabel}
            </span>
            <span className="history-meta-pill subtle">Live updates</span>
          </div>
        </div>
        <div className="history-hero-stats">
          <div className="history-stat-card">
            <span className="history-stat-label">Total Completed</span>
            <span className="history-stat-value">{totalCount}</span>
          </div>
          <div className="history-stat-card">
            <span className="history-stat-label">This Month</span>
            <span className="history-stat-value">{bucketCounts.thisMonth}</span>
          </div>
          <div className="history-stat-card">
            <span className="history-stat-label">Last Month</span>
            <span className="history-stat-value">{bucketCounts.lastMonth}</span>
          </div>
          <div className="history-stat-card">
            <span className="history-stat-label">Older</span>
            <span className="history-stat-value">{bucketCounts.older}</span>
          </div>
        </div>
      </section>

      <section className="history-toolbar">
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

        <div className="history-filters">
          {HISTORY_FILTER_OPTIONS.map((f) => (
            <button
              key={f}
              className={`filter-pill ${filter === f ? "active" : "inactive"}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </section>

      <section className="history-results">
        {loading ? (
          <div className="history-loading">
            <LoadingSpinner />
          </div>
        ) : projects.length === 0 ? (
          <div className="history-empty-state">
            <p>No finished projects found.</p>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="history-empty-state">
            <p>No projects match your search or filter.</p>
          </div>
        ) : (
          <>
            <div className="history-results-header">
              <div className="history-results-title">
                <span className="history-results-label">Showing</span>
                <span className="history-results-count">
                  {filteredProjects.length}
                </span>
                <span className="history-results-total">
                  of {totalCount} projects
                </span>
              </div>
              <div className="history-results-meta">Newest first</div>
            </div>

            <div className="history-cards-grid">
              {filteredProjects.map((project, index) => (
                <HistoryProjectCard
                  key={project._id}
                  project={project}
                  onViewDetails={handleViewDetails}
                  animationDelay={index * 60}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default ProjectHistory;
