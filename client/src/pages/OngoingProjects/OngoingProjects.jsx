import React from "react";
import "./OngoingProjects.css";
// Icons
import ArrowLeftIcon from "../../components/icons/ArrowLeftIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import FabButton from "../../components/ui/FabButton";
import ProjectCard from "../../components/ui/ProjectCard";
import Toast from "../../components/ui/Toast";
import usePersistedState from "../../hooks/usePersistedState";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import useAuthorizedProjectNavigation from "../../hooks/useAuthorizedProjectNavigation.jsx";
import { getLeadSearchText } from "../../utils/leadDisplay";
import { useLocation } from "react-router-dom";

const HISTORY_PROJECT_STATUSES = new Set(["Finished"]);

const OVERDUE_EXCLUDED_STATUSES = new Set([
  "Delivered",
  "Pending Feedback",
  "Pending Delivery/Pickup",
  "Feedback Completed",
  "Completed",
  "Finished",
  "Declined",
]);

const isPendingAcceptanceProject = (project) =>
  ["Order Created", "Quote Created", "Pending Acceptance"].includes(
    project.status,
  );
const isQuoteProject = (project) => project?.projectType === "Quote";
const isCorporateProject = (project) => project?.projectType === "Corporate Job";
const isEmergencyProject = (project) =>
  project?.projectType === "Emergency" || project?.priority === "Urgent";
const isHistoryProject = (project) =>
  HISTORY_PROJECT_STATUSES.has(project?.status || "");
const PROJECT_RENDER_BATCH_SIZE = 24;

const OngoingProjects = ({
  onBack,
  onCreateProject,
  user,
  onProjectChange, // New prop
}) => {
  const location = useLocation();
  const { navigateToProject, projectRouteChoiceDialog } =
    useAuthorizedProjectNavigation(user);
  const [projects, setProjects] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = usePersistedState(
    "client-ongoing-projects-search",
    "",
  );
  const [visibleLimit, setVisibleLimit] = React.useState(
    PROJECT_RENDER_BATCH_SIZE,
  );

  const viewMode = React.useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    const requested = String(params.get("view") || "active").toLowerCase();
    if (
      requested === "active" ||
      requested === "overdue" ||
      requested === "emergencies" ||
      requested === "pending-delivery" ||
      requested === "quotes" ||
      requested === "corporate" ||
      requested === "completed"
    ) {
      return requested;
    }
    return "active";
  }, [location.search]);

  const buildProjectsUrl = React.useCallback(() => {
    const params = new URLSearchParams({
      view: viewMode,
      summary: "card",
    });
    return `/api/projects?${params.toString()}`;
  }, [viewMode]);

  const fetchProjects = React.useCallback(async () => {
    try {
      const res = await fetch(buildProjectsUrl(), {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error loading projects:", error);
    } finally {
      setLoading(false);
    }
  }, [buildProjectsUrl]);

  React.useEffect(() => {
    setLoading(true);
    fetchProjects();
  }, [fetchProjects]);

  useRealtimeRefresh(() => fetchProjects(), {
    paths: ["/api/projects"],
    excludePaths: ["/api/projects/activities", "/api/projects/ai"],
  });

  const [toast, setToast] = React.useState(null);

  const handleUpdateStatus = async (projectId, currentStatus) => {
    if (currentStatus !== "Completed") {
      setToast({
        message:
          "Project must be 'Completed' before marking as finished.",
        type: "error",
      });
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Finished" }),
      });

      if (res.ok) {
        setToast({ message: "Project marked as Finished!", type: "success" });
        fetchProjects();
        if (onProjectChange) onProjectChange(); // Refresh global count
      } else {
        setToast({ message: "Failed to update status", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setToast({ message: "Server error", type: "error" });
    }
  };

  const projectsForSelectedView = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (viewMode) {
      case "completed":
        return projects.filter((project) => isHistoryProject(project));
      case "overdue":
        return projects.filter((project) => {
          if (!project?.details?.deliveryDate) return false;
          const deliveryDate = new Date(project.details.deliveryDate);
          return (
            deliveryDate < today &&
            !OVERDUE_EXCLUDED_STATUSES.has(project.status || "") &&
            !isHistoryProject(project)
          );
        });
      case "emergencies":
        return projects.filter(
          (project) => isEmergencyProject(project) && !isHistoryProject(project),
        );
      case "pending-delivery":
        return projects.filter(
          (project) =>
            project?.status === "Pending Delivery/Pickup" &&
            !isHistoryProject(project),
        );
      case "quotes":
        return projects.filter(
          (project) =>
            isQuoteProject(project) &&
            !isHistoryProject(project) &&
            !isPendingAcceptanceProject(project),
        );
      case "corporate":
        return projects.filter(
          (project) =>
            isCorporateProject(project) &&
            !isHistoryProject(project),
        );
      case "active":
      default:
        return projects.filter(
          (project) =>
            !isPendingAcceptanceProject(project) &&
            !isHistoryProject(project),
        );
    }
  }, [projects, viewMode]);

  const filteredProjects = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projectsForSelectedView;

    return projectsForSelectedView.filter((project) => {
      const orderId = (project.orderId || project._id || "")
        .toString()
        .toLowerCase();
      const projectName = (project.details?.projectName || "").toLowerCase();
      const client = (project.details?.client || "").toLowerCase();
      const leadText = getLeadSearchText(project);

      return (
        orderId.includes(query) ||
        projectName.includes(query) ||
        client.includes(query) ||
        leadText.includes(query)
      );
    });
  }, [projectsForSelectedView, searchQuery]);

  React.useEffect(() => {
    setVisibleLimit(PROJECT_RENDER_BATCH_SIZE);
  }, [searchQuery, viewMode]);

  const visibleProjects = React.useMemo(
    () => filteredProjects.slice(0, visibleLimit),
    [filteredProjects, visibleLimit],
  );
  const remainingProjectCount = Math.max(
    filteredProjects.length - visibleProjects.length,
    0,
  );
  const hasMoreProjects = remainingProjectCount > 0;
  const totalActive = projectsForSelectedView.length;
  const visibleCount = filteredProjects.length;
  const isFiltering = searchQuery.trim().length > 0;

  const pageTitle = React.useMemo(() => {
    switch (viewMode) {
      case "overdue":
        return "Overdue Projects";
      case "emergencies":
        return "Emergency Projects";
      case "completed":
        return "Finished Projects";
      case "pending-delivery":
        return "Pending Delivery Projects";
      case "quotes":
        return "Quote Projects";
      case "corporate":
        return "Corporate Projects";
      case "active":
      default:
        return "Active Projects";
    }
  }, [viewMode]);

  const isEmergencyView = viewMode === "emergencies";
  const handleProjectOpen = React.useCallback(
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

  return (
    <div className={`ongoing-container ${isEmergencyView ? "emergency-theme" : ""}`}>
      {/* Header */}
      <div className="ongoing-header">
        <button className="ongoing-back-btn" onClick={onBack}>
          <ArrowLeftIcon />
        </button>
        <span className="ongoing-title">{pageTitle}</span>
      </div>

      {/* Stats */}
      <div className="ongoing-stats-row">
        <div>
          <h1 className="stats-main-text">
            {isFiltering
              ? `${visibleCount} of ${totalActive} ${pageTitle}`
              : `${totalActive} ${pageTitle}`}
          </h1>
          <span className="stats-sub-text">Updates synced just now</span>
        </div>
      </div>

      {/* Search */}
      <div className="ongoing-search-wrapper">
        <SearchIcon className="ongoing-search-icon" />
        <input
          type="text"
          className="ongoing-search-input"
          placeholder="Search by project or order #..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Grid */}
      <div className="projects-grid">
        {loading ? (
          <LoadingSpinner />
        ) : filteredProjects.length === 0 ? (
          <p>No projects found for this view.</p>
        ) : (
          visibleProjects.map((p) => (
            <ProjectCard
              key={p._id}
              project={p}
              onDetails={handleProjectOpen}
              onUpdateStatus={handleUpdateStatus}
            />
          ))
        )}
      </div>
      {!loading && hasMoreProjects && (
        <div className="ongoing-list-pagination">
          <span className="ongoing-list-meta">
            Showing {visibleProjects.length} of {filteredProjects.length}
          </span>
          <button
            type="button"
            className="ongoing-list-more"
            onClick={() =>
              setVisibleLimit((currentLimit) =>
                currentLimit + PROJECT_RENDER_BATCH_SIZE,
              )
            }
          >
            Show {Math.min(PROJECT_RENDER_BATCH_SIZE, remainingProjectCount)} more
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="ui-toast-container">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        </div>
      )}

      {/* FAB */}
      {/* FAB */}
      <FabButton onClick={onCreateProject} />
      {projectRouteChoiceDialog}
    </div>
  );
};

export default OngoingProjects;
