import React from "react";
import "./OngoingProjects.css";
// Icons
import ArrowLeftIcon from "../../components/icons/ArrowLeftIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import ThreeDotsIcon from "../../components/icons/ThreeDotsIcon";
import CalendarIcon from "../../components/icons/CalendarIcon";
import AlertTriangleIcon from "../../components/icons/AlertTriangleIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";

const OngoingProjects = ({ onNavigateDetail, onBack }) => {
  const [projects, setProjects] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        }
      } catch (error) {
        console.error("Error loading projects:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

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

  return (
    <div className="ongoing-container">
      {/* Header */}
      <div className="ongoing-header">
        <button className="ongoing-back-btn" onClick={onBack}>
          <ArrowLeftIcon />
        </button>
        <span className="ongoing-title">Ongoing Projects</span>
      </div>

      {/* Stats */}
      <div className="ongoing-stats-row">
        <div>
          <h1 className="stats-main-text">{projects.length} Active Orders</h1>
          <span className="stats-sub-text">Updates synced just now</span>
        </div>
        <a className="view-all-link">View All</a>
      </div>

      {/* Search */}
      <div className="ongoing-search-wrapper">
        <SearchIcon style={{ color: "#94a3b8" }} />
        <input
          type="text"
          className="ongoing-search-input"
          placeholder="Search by project or order #..."
        />
      </div>

      {/* Grid */}
      <div className="projects-grid">
        {loading ? (
          <LoadingSpinner />
        ) : projects.length === 0 ? (
          <p>No ongoing projects found.</p>
        ) : (
          projects.map((p) => {
            const statusStyle = getStatusColor(p.status);
            // Mock progress based on status or random for now as schema doesn't have it
            const progress =
              p.status === "Completed"
                ? 100
                : p.status === "Pending Approval"
                ? 10
                : 50;

            return (
              <div className="ongoing-card" key={p._id}>
                {/* Header Row */}
                <div className="card-header-row">
                  <span className={`status-pill ${statusStyle.class}`}>
                    {p.status}
                  </span>
                  <button className="card-menu-btn">
                    <ThreeDotsIcon />
                  </button>
                </div>

                {/* Title */}
                <h3 className="project-name">
                  {p.details?.projectName || "Untitled"}
                </h3>
                <span className="project-code">{p.orderId}</span>

                {/* Progress */}
                <div className="progress-container">
                  <div className="progress-info">
                    <span>Progress</span>
                    <span className={`progress-percent ${statusStyle.class}`}>
                      {progress}%
                    </span>
                  </div>
                  <div className="track">
                    <div
                      className="fill"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: statusStyle.color,
                      }}
                    ></div>
                  </div>
                </div>

                {/* Footer Meta */}
                <div className="card-meta-row">
                  <div className="user-info">
                    {/* Avatar placeholder */}
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        backgroundColor: "#cbd5e1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        fontWeight: "bold",
                        color: "#475569",
                      }}
                    >
                      {(p.details?.lead || "U").charAt(0).toUpperCase()}
                    </div>
                    <span className="user-name">
                      {p.details?.lead || "Unassigned"}
                    </span>
                  </div>

                  <div className={`date-info`}>
                    <CalendarIcon />
                    {formatDate(p.details?.deliveryDate)}
                  </div>
                </div>

                {/* Actions */}
                <div className="card-actions-row">
                  <button
                    className="btn-details"
                    onClick={() => onNavigateDetail(p._id)}
                  >
                    Details
                  </button>
                  <button className="btn-update">Update Status</button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button className="fab-btn-blue">+</button>
    </div>
  );
};

export default OngoingProjects;
