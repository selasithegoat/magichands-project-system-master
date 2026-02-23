import React from "react";
import "./OngoingProjects.css";
// Icons
import ArrowLeftIcon from "../../components/icons/ArrowLeftIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import FabButton from "../../components/ui/FabButton";
import ProjectCard from "../../components/ui/ProjectCard";
import Toast from "../../components/ui/Toast";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
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
]);

const isPendingAcceptanceProject = (project) => project.status === "Order Confirmed";
const isQuoteProject = (project) => project?.projectType === "Quote";
const isEmergencyProject = (project) =>
  project?.projectType === "Emergency" || project?.priority === "Urgent";

const OngoingProjects = ({
  onNavigateDetail,
  onBack,
  onCreateProject,
  onProjectChange, // New prop
}) => {
  const location = useLocation();
  const [projects, setProjects] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState("");

  const viewMode = React.useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    const requested = String(params.get("view") || "active").toLowerCase();
    if (
      requested === "active" ||
      requested === "overdue" ||
      requested === "emergencies" ||
      requested === "pending-delivery" ||
      requested === "quotes" ||
      requested === "completed"
    ) {
      return requested;
    }
    return "active";
  }, [location.search]);

  React.useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          setProjects(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Error loading projects:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  useRealtimeRefresh(() => fetchProjects());

  const [toast, setToast] = React.useState(null);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error loading projects:", error);
    }
  };

  const handleUpdateStatus = async (projectId, currentStatus) => {
    if (currentStatus !== "Completed") {
      setToast({
        message: "Project must be 'Completed' before marking as finished.",
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
        setToast({ message: "Project marked as Completed!", type: "success" });
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

  // Helper to map status to colors
  const getStatusColor = (status) => {
    switch (status) {
      case "In Progress":
        return { class: "blue", color: "#2563eb" };
      case "Pending Approval":
        return { class: "orange", color: "#f97316" };
      case "Completed":
        return { class: "green", color: "#22c55e" };
      case "On Hold":
        return { class: "orange", color: "#ea580c" };
      default:
        return { class: "blue", color: "#cbd5e1" };
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Pending";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const projectsForSelectedView = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (viewMode) {
      case "completed":
        return projects.filter((project) =>
          HISTORY_PROJECT_STATUSES.has(project.status || ""),
        );
      case "overdue":
        return projects.filter((project) => {
          if (!project?.details?.deliveryDate) return false;
          const deliveryDate = new Date(project.details.deliveryDate);
          return (
            deliveryDate < today &&
            !OVERDUE_EXCLUDED_STATUSES.has(project.status || "")
          );
        });
      case "emergencies":
        return projects.filter((project) => isEmergencyProject(project));
      case "pending-delivery":
        return projects.filter(
          (project) => project?.status === "Pending Delivery/Pickup",
        );
      case "quotes":
        return projects.filter(
          (project) =>
            isQuoteProject(project) &&
            !HISTORY_PROJECT_STATUSES.has(project.status || ""),
        );
      case "active":
      default:
        return projects.filter(
          (project) =>
            !isPendingAcceptanceProject(project) &&
            !HISTORY_PROJECT_STATUSES.has(project.status || ""),
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
      case "active":
      default:
        return "Active Projects";
    }
  }, [viewMode]);

  const isEmergencyView = viewMode === "emergencies";

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
        <SearchIcon style={{ color: "#94a3b8" }} />
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
          filteredProjects.map((p) => (
            <ProjectCard
              key={p._id}
              project={p}
              onDetails={onNavigateDetail}
              onUpdateStatus={handleUpdateStatus}
            />
          ))
        )}
      </div>

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
    </div>
  );
};

export default OngoingProjects;
