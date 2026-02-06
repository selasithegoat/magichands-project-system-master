import React, { useState, useEffect } from "react";
import "./MyActivities.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ArrowLeftIcon from "../../components/icons/ArrowLeftIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import { format, isToday, isYesterday } from "date-fns";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";

const MyActivities = ({ onBack }) => {
  const [activities, setActivities] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchActivities = async (pageNum) => {
    try {
      const res = await fetch(
        `/api/projects/activities/me?page=${pageNum}&limit=20`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (pageNum === 1) {
          setActivities(data.activities);
        } else {
          setActivities((prev) => [...prev, ...data.activities]);
        }
        // If we received fewer items than limit, we've reached the end
        if (data.activities.length < 20) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchActivities(1);
  }, []);

  useRealtimeRefresh(() => {
    setPage(1);
    setHasMore(true);
    fetchActivities(1);
  });

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    setIsLoadingMore(true);
    fetchActivities(nextPage);
  };

  const handleClearHistory = () => {
    setIsModalOpen(true);
  };

  const confirmClearHistory = async () => {
    setIsModalOpen(false);
    setIsClearing(true);
    try {
      const res = await fetch("/api/projects/activities/me/cleanup", {
        method: "DELETE",
      });
      if (res.ok) {
        // Refresh list
        setPage(1);
        setHasMore(true);
        fetchActivities(1);
      } else {
        alert("Failed to clear history.");
      }
    } catch (error) {
      console.error("Error clearing history:", error);
    } finally {
      setIsClearing(false);
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getActivityIcon = (action) => {
    if (action.includes("create")) return { icon: "📁", color: "blue" };
    if (action.includes("update") || action.includes("status"))
      return { icon: "✏️", color: "orange" };
    if (action.includes("delete")) return { icon: "🗑️", color: "red" };
    if (action.includes("risk") || action.includes("factor"))
      return { icon: "⚠️", color: "red" };
    if (action.includes("add")) return { icon: "➕", color: "green" };
    if (action.includes("approval")) return { icon: "✅", color: "green" };
    return { icon: "📝", color: "gray" };
  };

  // Group activities by date
  const groupedActivities = activities.reduce((groups, activity) => {
    const date = new Date(activity.createdAt);
    let dateLabel = format(date, "MMMM d, yyyy");

    if (isToday(date)) {
      dateLabel = "Today";
    } else if (isYesterday(date)) {
      dateLabel = "Yesterday";
    }

    if (!groups[dateLabel]) {
      groups[dateLabel] = [];
    }
    groups[dateLabel].push(activity);
    return groups;
  }, {});

  const sortedDateLabels = Object.keys(groupedActivities).sort((a, b) => {
    // Custom sort to put Today/Yesterday first, then by date descending
    if (a === "Today") return -1;
    if (b === "Today") return 1;
    if (a === "Yesterday") return -1;
    if (b === "Yesterday") return 1;
    return new Date(b) - new Date(a);
  });

  return (
    <div className="my-activities-container">
      <div className="page-header-row">
        <div>
          <button className="back-btn" onClick={onBack}>
            <ArrowLeftIcon /> Back to Profile
          </button>
          <h1>My Activities</h1>
          <p>A history of your actions across all projects.</p>
        </div>
        <button
          className="clear-history-btn"
          onClick={handleClearHistory}
          disabled={isClearing}
        >
          {isClearing ? "Clearing..." : "Clear Completed Activity"}
        </button>
      </div>

      <div className="activity-feed">
        {isLoading ? (
          <LoadingSpinner />
        ) : activities.length > 0 ? (
          <>
            {sortedDateLabels.map((dateLabel) => (
              <div key={dateLabel} className="activity-group">
                <div className="date-header">{dateLabel}</div>
                {groupedActivities[dateLabel].map((activity) => {
                  const { icon, color } = getActivityIcon(activity.action);
                  return (
                    <div className="activity-card" key={activity._id}>
                      <div className={`activity-icon-large ${color}`}>
                        {icon}
                      </div>
                      <div className="activity-details">
                        <p className="activity-desc">{activity.description}</p>
                        <div className="activity-meta">
                          <span className="project-name">
                            {activity.project?.details?.projectName ||
                              "Unknown Project"}
                          </span>
                          <span className="separator">•</span>
                          <span className="time">
                            {formatTimeAgo(activity.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {hasMore && (
              <div className="load-more-container">
                <button
                  className="load-more-btn"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? "Loading..." : "Load Older Activities"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="no-activity">
            <p>No activity found.</p>
          </div>
        )}
        {/* Modal */}
        <ConfirmationModal
          isOpen={isModalOpen}
          onConfirm={confirmClearHistory}
          onCancel={() => setIsModalOpen(false)}
          title="Clear Activity History"
          message="Are you sure you want to clear all activity logs for COMPLETED projects? This action cannot be undone."
          confirmText="Yes, Clear History"
          cancelText="Cancel"
        />
      </div>
    </div>
  );
};

export default MyActivities;
