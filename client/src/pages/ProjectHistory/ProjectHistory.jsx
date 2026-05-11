import React, { useState, useEffect, useCallback, useMemo } from "react";
import "./ProjectHistory.css";
// Icons
import ChevronLeftIcon from "../../components/icons/ChevronLeftIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import FilterIcon from "../../components/icons/FilterIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import HistoryProjectCard from "../../components/ui/HistoryProjectCard";
import usePersistedState from "../../hooks/usePersistedState";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import useAuthorizedProjectNavigation from "../../hooks/useAuthorizedProjectNavigation.jsx";

const HISTORY_FILTER_OPTIONS = ["All", "This Month", "Last Month", "Older"];
const HISTORY_RENDER_BATCH_SIZE = 24;

const getProjectDate = (project) => {
  const dateStr =
    project.details?.deliveryDate || project.orderDate || project.createdAt;
  const parsedDate = dateStr ? new Date(dateStr) : null;
  return parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
};

const buildMonthBoundaries = () => {
  const now = new Date();
  return {
    thisMonthStart: new Date(now.getFullYear(), now.getMonth(), 1),
    nextMonth: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    lastMonthStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
  };
};

const getDateBucket = (projectDate, boundaries) => {
  if (!projectDate) return "unknown";

  if (
    projectDate >= boundaries.thisMonthStart &&
    projectDate < boundaries.nextMonth
  ) {
    return "thisMonth";
  }
  if (
    projectDate >= boundaries.lastMonthStart &&
    projectDate < boundaries.thisMonthStart
  ) {
    return "lastMonth";
  }
  return "older";
};

const buildHistorySearchText = (project) => {
  const details = project.details || {};
  return [
    project.orderId,
    details.projectName,
    details.client,
    details.clientName,
    details.department,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const ProjectHistory = ({ onBack, user }) => {
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
  const [visibleLimit, setVisibleLimit] = useState(HISTORY_RENDER_BATCH_SIZE);
  const { navigateToProject, projectRouteChoiceDialog } =
    useAuthorizedProjectNavigation(user);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        const finished = data.filter((p) => p.status === "Finished");
        setProjects(finished);
      }
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useRealtimeRefresh(fetchHistory, {
    paths: ["/api/projects"],
    excludePaths: ["/api/projects/activities", "/api/projects/ai"],
  });

  const handleViewDetails = useCallback(
    (project) => {
      navigateToProject(project, {
        fallbackPath: "/client",
        title: "Choose Authorized Page",
        message:
          "Project Details is only available to the assigned lead for this project. Choose an authorized page instead.",
      });
    },
    [navigateToProject],
  );

  const monthBoundaries = useMemo(buildMonthBoundaries, []);
  const normalizedSearchQuery = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery],
  );

  const historyDerived = useMemo(() => {
    const nextBucketCounts = {
      thisMonth: 0,
      lastMonth: 0,
      older: 0,
      unknown: 0,
    };
    let latestDate = null;

    const projectEntries = projects.map((project) => {
      const projectDate = getProjectDate(project);
      const bucket = getDateBucket(projectDate, monthBoundaries);
      nextBucketCounts[bucket] += 1;

      if (projectDate && (!latestDate || projectDate > latestDate)) {
        latestDate = projectDate;
      }

      return {
        bucket,
        project,
        projectDate,
        searchText: buildHistorySearchText(project),
      };
    });

    return {
      bucketCounts: nextBucketCounts,
      latestDeliveryDate: latestDate,
      projectEntries,
    };
  }, [monthBoundaries, projects]);

  const filteredProjects = useMemo(() => {
    const bucketFilter =
      filter === "This Month"
        ? "thisMonth"
        : filter === "Last Month"
          ? "lastMonth"
          : filter === "Older"
            ? "older"
            : "";

    return historyDerived.projectEntries
      .filter((entry) => {
        if (bucketFilter && entry.bucket !== bucketFilter) return false;
        if (!normalizedSearchQuery) return true;
        return entry.searchText.includes(normalizedSearchQuery);
      })
      .sort((left, right) => {
        const leftTime = left.projectDate?.getTime() || 0;
        const rightTime = right.projectDate?.getTime() || 0;
        return rightTime - leftTime;
      })
      .map((entry) => entry.project);
  }, [filter, historyDerived.projectEntries, normalizedSearchQuery]);

  useEffect(() => {
    setVisibleLimit(HISTORY_RENDER_BATCH_SIZE);
  }, [filter, searchQuery]);

  const visibleProjects = useMemo(
    () => filteredProjects.slice(0, visibleLimit),
    [filteredProjects, visibleLimit],
  );
  const remainingProjectCount = Math.max(
    filteredProjects.length - visibleProjects.length,
    0,
  );
  const hasMoreProjects = remainingProjectCount > 0;

  const totalCount = projects.length;
  const bucketCounts = historyDerived.bucketCounts;
  const latestDeliveryDate = historyDerived.latestDeliveryDate;
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
                  {visibleProjects.length}
                </span>
                <span className="history-results-total">
                  of {filteredProjects.length} matching projects
                </span>
              </div>
              <div className="history-results-meta">Newest first</div>
            </div>

            <div className="history-cards-grid">
              {visibleProjects.map((project, index) => (
                <HistoryProjectCard
                  key={project._id}
                  project={project}
                  onViewDetails={handleViewDetails}
                  animationDelay={index * 60}
                />
              ))}
            </div>
            {hasMoreProjects && (
              <div className="history-list-pagination">
                <span className="history-list-meta">
                  {totalCount} completed projects total
                </span>
                <button
                  type="button"
                  className="history-list-more"
                  onClick={() =>
                    setVisibleLimit((currentLimit) =>
                      currentLimit + HISTORY_RENDER_BATCH_SIZE,
                    )
                  }
                >
                  Show {Math.min(HISTORY_RENDER_BATCH_SIZE, remainingProjectCount)}{" "}
                  more
                </button>
              </div>
            )}
          </>
        )}
      </section>
      {projectRouteChoiceDialog}
    </div>
  );
};

export default ProjectHistory;
