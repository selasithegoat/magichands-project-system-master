import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import Toast from "../../components/ui/Toast";
import ClipboardListIcon from "../../components/icons/ClipboardListIcon";
import ChevronRightIcon from "../../components/icons/ChevronRightIcon";
import SearchIcon from "../../components/icons/SearchIcon";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import useAuthorizedProjectNavigation from "../../hooks/useAuthorizedProjectNavigation.jsx";
import usePersistedState from "../../hooks/usePersistedState";
import "./NextActions.css";

const ACTION_FETCH_LIMIT = 100;
const PRIORITY_OPTIONS = ["all", "critical", "high", "medium", "normal", "low"];

const formatPriority = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "Normal";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatActionDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getActionSearchText = (action) =>
  [
    action?.title,
    action?.description,
    action?.orderId,
    action?.projectName,
    action?.department,
    action?.projectType,
    action?.status,
    action?.priority,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const NextActions = ({ user }) => {
  const navigate = useNavigate();
  const { navigateToProject, projectRouteChoiceDialog } =
    useAuthorizedProjectNavigation(user);
  const [actions, setActions] = useState([]);
  const [totalActions, setTotalActions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [activePriority, setActivePriority] = usePersistedState(
    "client-next-actions-priority-filter",
    "all",
    {
      sanitize: (value) =>
        PRIORITY_OPTIONS.includes(value) ? value : "all",
    },
  );
  const [searchQuery, setSearchQuery] = usePersistedState(
    "client-next-actions-search",
    "",
  );

  const fetchActions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/projects/next-actions?limit=${ACTION_FETCH_LIMIT}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load next actions.");
      }
      setActions(Array.isArray(payload?.actions) ? payload.actions : []);
      setTotalActions(Number(payload?.total) || 0);
    } catch (error) {
      setActions([]);
      setTotalActions(0);
      setToast({
        type: "error",
        message: error.message || "Failed to load next actions.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  useRealtimeRefresh(() => fetchActions(), {
    paths: ["/api/projects", "/api/updates"],
    excludePaths: ["/api/projects/activities", "/api/projects/ai"],
  });

  const priorityCounts = useMemo(() => {
    return actions.reduce(
      (acc, action) => {
        const priority = action?.priority || "normal";
        acc.all += 1;
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
      },
      { all: 0, critical: 0, high: 0, medium: 0, normal: 0, low: 0 },
    );
  }, [actions]);

  const filteredActions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return actions.filter((action) => {
      if (
        activePriority !== "all" &&
        String(action?.priority || "normal") !== activePriority
      ) {
        return false;
      }
      if (!query) return true;
      return getActionSearchText(action).includes(query);
    });
  }, [actions, activePriority, searchQuery]);

  const handleOpenAction = (action) => {
    if (!action) return;
    if (action.route) {
      navigate(action.route);
      return;
    }
    if (action.projectId) {
      navigateToProject(
        { _id: action.projectId },
        {
          fallbackPath: "/next-actions",
          allowGenericEngaged: true,
          title: "Choose Authorized Page",
          message:
            "Project Details is only available to the assigned lead for this project. Choose an authorized page instead.",
        },
      );
    }
  };

  const hiddenActionCount = Math.max(0, totalActions - actions.length);

  return (
    <div className="next-actions-page">
      <header className="next-actions-header">
        <div>
          <div className="next-actions-eyebrow">Action Queue</div>
          <h1>My Next Actions</h1>
          <p>
            All role-based tasks currently available to you, ordered by urgency.
          </p>
        </div>
        <div className="next-actions-summary">
          <strong>{loading ? "..." : totalActions}</strong>
          <span>open actions</span>
        </div>
      </header>

      <section className="next-actions-toolbar">
        <div className="next-actions-search">
          <SearchIcon width="16" height="16" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by order, project, department, or action"
          />
        </div>
        <div className="next-actions-filters" aria-label="Priority filter">
          {PRIORITY_OPTIONS.map((priority) => (
            <button
              key={priority}
              type="button"
              className={activePriority === priority ? "active" : ""}
              onClick={() => setActivePriority(priority)}
            >
              {priority === "all" ? "All" : formatPriority(priority)}
              <span>{priorityCounts[priority] || 0}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="next-actions-list-card">
        <div className="next-actions-list-head">
          <div>
            <h2>Queue</h2>
            <p>
              Showing {filteredActions.length} of {actions.length}
              {hiddenActionCount > 0 ? ` loaded, ${hiddenActionCount} more hidden by cap` : ""}.
            </p>
          </div>
          <button type="button" onClick={() => navigate("/client")}>
            Dashboard
          </button>
        </div>

        {loading ? (
          <div className="next-actions-loading">
            <LoadingSpinner />
          </div>
        ) : filteredActions.length ? (
          <div className="next-actions-list">
            {filteredActions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`next-action-card priority-${action.priority || "normal"}`}
                onClick={() => handleOpenAction(action)}
              >
                <span className="next-action-icon">
                  <ClipboardListIcon width="18" height="18" />
                </span>
                <span className="next-action-content">
                  <span className="next-action-meta-row">
                    <span className="next-action-priority">
                      {formatPriority(action.priority)}
                    </span>
                    {action.department && <span>{action.department}</span>}
                    {action.orderId && <span>{action.orderId}</span>}
                    {action.dueAt && <span>Due {formatActionDate(action.dueAt)}</span>}
                  </span>
                  <strong>{action.title}</strong>
                  <span>{action.description}</span>
                  {action.projectName && (
                    <em>
                      {action.projectName}
                      {action.status ? ` | ${action.status}` : ""}
                    </em>
                  )}
                </span>
                <span className="next-action-open">
                  {action.ctaLabel || "Open"}
                  <ChevronRightIcon width="15" height="15" />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="next-actions-empty">
            <p>No next actions match the current filters.</p>
          </div>
        )}
      </section>

      {projectRouteChoiceDialog}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default NextActions;
