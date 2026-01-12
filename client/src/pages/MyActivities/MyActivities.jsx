import React, { useState, useEffect } from "react";
import "./MyActivities.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import UploadIcon from "../../components/icons/UploadIcon";
import ArrowLeftIcon from "../../components/icons/ArrowLeftIcon";

const MyActivities = ({ onBack }) => {
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        // Fetch all activities (limit 50 or 0 for all)
        const res = await fetch("/api/projects/activities/me?limit=50", {
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (res.ok) {
          const data = await res.json();
          setActivities(data);
        }
      } catch (error) {
        console.error("Error fetching activities:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchActivities();
  }, []);

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600)
      return `${Math.floor(diffInSeconds / 60)} mins ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800)
      return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return date.toLocaleDateString();
  };

  const getActivityIcon = (action) => {
    if (action.includes("create")) return { icon: "📁", color: "blue" };
    if (action.includes("update") || action.includes("status"))
      return { icon: "✏️", color: "orange" };
    if (action.includes("delete")) return { icon: "🗑️", color: "red" };
    if (action.includes("add")) return { icon: "➕", color: "green" };
    if (action.includes("approval")) return { icon: "✅", color: "green" };
    return { icon: "📝", color: "gray" };
  };

  return (
    <div className="my-activities-container">
      <div className="page-header">
        <button className="back-btn" onClick={onBack}>
          <ArrowLeftIcon /> Back to Profile
        </button>
        <h1>My Activities</h1>
        <p>A history of your actions across all projects.</p>
      </div>

      <div className="activity-feed">
        {isLoading ? (
          <LoadingSpinner />
        ) : activities.length > 0 ? (
          activities.map((activity) => {
            const { icon, color } = getActivityIcon(activity.action);
            return (
              <div className="activity-card" key={activity._id}>
                <div className={`activity-icon-large ${color}`}>{icon}</div>
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
          })
        ) : (
          <div className="no-activity">
            <p>No activity found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyActivities;
