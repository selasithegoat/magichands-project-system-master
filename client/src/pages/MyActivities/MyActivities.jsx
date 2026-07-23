import React, { useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import "./MyActivities.css";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ArrowLeftIcon from "../../components/icons/ArrowLeftIcon";
import FolderIcon from "../../components/icons/FolderIcon";
import EditIcon from "../../components/icons/EditIcon";
import TrashIcon from "../../components/icons/TrashIcon";
import AlertTriangleIcon from "../../components/icons/AlertTriangleIcon";
import PlusCircleIcon from "../../components/icons/PlusCircleIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import ClipboardListIcon from "../../components/icons/ClipboardListIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import { format, isToday, isYesterday } from "date-fns";
import usePersistedState from "../../hooks/usePersistedState";
import { renderProjectName } from "../../utils/projectName";

const ACTIVITY_FILTER_OPTIONS = [
  "all",
  "create",
  "update",
  "approval",
  "add",
  "risk",
  "delete",
  "other",
];

const MyActivities = ({ onBack, user }) => {
  const queryClient = useQueryClient();
  const [isClearing, setIsClearing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = usePersistedState(
    "client-my-activities-search",
    "",
  );
  const [typeFilter, setTypeFilter] = usePersistedState(
    "client-my-activities-type-filter",
    "all",
    {
      sanitize: (value) =>
        ACTIVITY_FILTER_OPTIONS.includes(value) ? value : "all",
    },
  );
  const [compactView, setCompactView] = usePersistedState(
    "client-my-activities-compact-view",
    false,
    {
      sanitize: (value) => Boolean(value),
    },
  );
  const userId = String(user?._id || user?.id || "").trim();
  const activitiesQueryKey = ["projects", "activities", "me", userId];
  const {
    data: activityPages,
    fetchNextPage,
    hasNextPage: hasMore,
    isFetchingNextPage: isLoadingMore,
    isPending: isLoading,
  } = useInfiniteQuery({
    queryKey: activitiesQueryKey,
    queryFn: async ({ pageParam }) => {
      const res = await fetch(
        `/api/projects/activities/me?page=${pageParam}&limit=20`,
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
      if (!res.ok) throw new Error("Failed to load activities.");
      const payload = await res.json();
      return {
        ...payload,
        activities: Array.isArray(payload?.activities)
          ? payload.activities
          : [],
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage.activities.length === 20 ? pages.length + 1 : undefined,
    enabled: Boolean(userId),
    meta: {
      realtimePaths: ["/api/projects", "/api/updates"],
      realtimeShouldRefresh: (detail) =>
        !detail?.actorId || String(detail.actorId) === userId,
    },
  });
  const activities = useMemo(
    () =>
      (activityPages?.pages || []).flatMap((pageData) =>
        Array.isArray(pageData?.activities) ? pageData.activities : [],
      ),
    [activityPages],
  );

  const handleLoadMore = () => {
    void fetchNextPage();
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
        await queryClient.cancelQueries({ queryKey: activitiesQueryKey });
        queryClient.setQueryData(activitiesQueryKey, {
          pages: [{ activities: [] }],
          pageParams: [1],
        });
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

  const resolveActivityType = (action) => {
    const actionValue = String(action || "").toLowerCase();
    if (actionValue.includes("create")) return "create";
    if (actionValue.includes("update") || actionValue.includes("status"))
      return "update";
    if (actionValue.includes("delete")) return "delete";
    if (actionValue.includes("risk") || actionValue.includes("factor"))
      return "risk";
    if (actionValue.includes("add")) return "add";
    if (actionValue.includes("approval")) return "approval";
    return "other";
  };

  const getActivityIcon = (action) => {
    switch (resolveActivityType(action)) {
      case "create":
        return { icon: <FolderIcon />, color: "blue" };
      case "update":
        return { icon: <EditIcon />, color: "orange" };
      case "delete":
        return {
          icon: <TrashIcon width={20} height={20} color="currentColor" />,
          color: "red",
        };
      case "risk":
        return { icon: <AlertTriangleIcon width="20" height="20" />, color: "red" };
      case "add":
        return { icon: <PlusCircleIcon />, color: "green" };
      case "approval":
        return { icon: <CheckCircleIcon width="20" height="20" />, color: "green" };
      default:
        return { icon: <ClipboardListIcon width="20" height="20" />, color: "gray" };
    }
  };

  const filteredActivities = activities.filter((activity) => {
    const query = searchQuery.trim().toLowerCase();
    const typeMatch =
      typeFilter === "all" || resolveActivityType(activity.action) === typeFilter;
    if (!query) return typeMatch;
    const description = String(activity.description || "").toLowerCase();
    const projectName = String(
      activity.project?.details?.projectName || "",
    ).toLowerCase();
    const orderId = String(activity.project?.orderId || activity.project?._id || "")
      .toLowerCase();
    return (
      typeMatch &&
      (description.includes(query) ||
        projectName.includes(query) ||
        orderId.includes(query))
    );
  });

  // Group activities by date
  const groupedActivities = filteredActivities.reduce((groups, activity) => {
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

      <div className="activity-controls">
        <div className="activity-search">
          <SearchIcon className="activity-search-icon" />
          <input
            type="text"
            placeholder="Search by project, order, or action..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <div className="activity-filter-actions">
          <select
            className="activity-filter-select"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="all">All types</option>
            <option value="create">Created</option>
            <option value="update">Updates</option>
            <option value="approval">Approvals</option>
            <option value="add">Adds</option>
            <option value="risk">Risks</option>
            <option value="delete">Deletes</option>
            <option value="other">Other</option>
          </select>
          <button
            type="button"
            className={`compact-toggle ${compactView ? "active" : ""}`}
            onClick={() => setCompactView((prev) => !prev)}
          >
            {compactView ? "Expanded View" : "Compact View"}
          </button>
        </div>
      </div>

      <div className={`activity-feed ${compactView ? "compact" : ""}`}>
        {isLoading ? (
          <LoadingSpinner />
        ) : filteredActivities.length > 0 ? (
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
                            {renderProjectName(
                              activity.project?.details,
                              null,
                              "Unknown Project",
                            )}
                          </span>
                          <span className="separator" aria-hidden="true" />
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
