import React, { useEffect, useMemo, useState } from "react";
import { PRODUCTION_SUB_DEPARTMENTS } from "../../constants/departments";
import "./NotificationModal.css";
import XIcon from "../icons/XIcon";
import ClipboardListIcon from "../icons/ClipboardListIcon";
import AlertTriangleIcon from "../icons/AlertTriangleIcon";
import RefreshIcon from "../icons/RefreshIcon";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import SystemIcon from "../icons/SystemIcon";
import ReminderBellIcon from "../icons/ReminderBellIcon";

const getNotificationTypeMeta = (type) => {
  switch (type) {
    case "ASSIGNMENT":
      return {
        label: "Task",
        className: "assignment",
        icon: <ClipboardListIcon width="16" height="16" color="currentColor" />,
      };
    case "ACTIVITY":
      return {
        label: "Alert",
        className: "activity",
        icon: <AlertTriangleIcon width="16" height="16" color="currentColor" />,
      };
    case "UPDATE":
      return {
        label: "Update",
        className: "update",
        icon: <RefreshIcon width="16" height="16" />,
      };
    case "REVISION":
      return {
        label: "Revision",
        className: "revision",
        icon: <RefreshIcon width="16" height="16" />,
      };
    case "ACCEPTANCE":
      return {
        label: "Accept",
        className: "acceptance",
        icon: <CheckCircleIcon width="16" height="16" />,
      };
    case "REMINDER":
      return {
        label: "Reminder",
        className: "reminder",
        icon: <ReminderBellIcon width="16" height="16" color="currentColor" />,
      };
    default:
      return {
        label: "System",
        className: "system",
        icon: <SystemIcon width="16" height="16" />,
      };
  }
};

const NotificationModal = ({
  isOpen,
  onClose,
  notifications = [],
  onMarkAllRead,
  onClearAll,
  onMarkRead,
  currentUser,
}) => {
  const toEntityId = (value) => {
    if (!value) return "";
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    if (typeof value === "object") {
      if (value._id) return toEntityId(value._id);
      if (value.id) return String(value.id);
    }
    return "";
  };

  const getUserLabel = (user) => {
    if (!user || typeof user !== "object") return "";
    if (user.name) return user.name;
    const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return full || "";
  };

  const getProjectLabel = (project) => {
    if (!project || typeof project !== "object") return "";
    const name =
      project?.details?.projectName ||
      project?.details?.title ||
      project?.details?.projectTitle ||
      "";
    const orderId = project?.orderId || "";
    if (name && orderId) return `${name} · ${orderId}`;
    return name || orderId;
  };

  const userId = toEntityId(currentUser?._id || currentUser?.id);
  const departments = Array.isArray(currentUser?.department)
    ? currentUser.department
    : currentUser?.department
      ? [currentUser.department]
      : [];
  const isFrontDesk = departments.includes("Front Desk");
  const isProduction =
    departments.includes("Production") ||
    departments.some((dept) => PRODUCTION_SUB_DEPARTMENTS.includes(dept));
  const hasScopedTabs = isFrontDesk || isProduction;
  const [activeTab, setActiveTab] = useState(hasScopedTabs ? "mine" : "all");

  useEffect(() => {
    if (!hasScopedTabs) {
      setActiveTab("all");
      return;
    }
    setActiveTab((prev) => (prev === "team" || prev === "mine" ? prev : "mine"));
  }, [hasScopedTabs]);

  const mineNotifications = useMemo(() => {
    if (!userId && !isProduction) return [];
    return notifications.filter((n) => {
      let isAssignedLead = false;
      if (userId) {
        const leadId = toEntityId(
          n?.project?.projectLeadId?._id || n?.project?.projectLeadId,
        );
        isAssignedLead = Boolean(leadId && leadId === userId);
      }

      if (isAssignedLead) return true;

      if (!isProduction) return false;

      const projectDepartments = Array.isArray(n?.project?.departments)
        ? n.project.departments
        : [];

      if (!projectDepartments.length) return false;

      if (departments.includes("Production")) {
        return projectDepartments.some((dept) =>
          PRODUCTION_SUB_DEPARTMENTS.includes(dept),
        );
      }

      return projectDepartments.some((dept) => departments.includes(dept));
    });
  }, [departments, isProduction, notifications, userId]);

  const teamNotifications = useMemo(() => notifications, [notifications]);

  const visibleNotifications = useMemo(() => {
    if (!isFrontDesk) return notifications;
    return activeTab === "mine" ? mineNotifications : teamNotifications;
  }, [activeTab, isFrontDesk, mineNotifications, notifications, teamNotifications]);

  const unreadNotifications = visibleNotifications.filter((n) => !n.isRead);
  const readNotifications = visibleNotifications.filter((n) => n.isRead);
  const unreadCount = unreadNotifications.length;
  const totalCount = visibleNotifications.length;

  const mineCount = mineNotifications.length;
  const teamCount = teamNotifications.length;

  if (!isOpen) return null;

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return date.toLocaleDateString();
  };

  const renderMeta = (notification) => {
    const project = notification?.project;
    const leadId = toEntityId(project?.projectLeadId?._id || project?.projectLeadId);
    const leadName = getUserLabel(project?.projectLeadId);
    const leadLabel = leadId && userId && leadId === userId ? "You" : leadName;
    const projectLabel = getProjectLabel(project);
    if (!leadLabel && !projectLabel) return null;

    return (
      <div className="notif-meta">
        {leadLabel && <span className="notif-meta-pill">For: {leadLabel}</span>}
        {projectLabel && (
          <span className="notif-meta-pill subtle">Project: {projectLabel}</span>
        )}
      </div>
    );
  };

  return (
    <div className="notif-modal-overlay" onClick={onClose}>
      <div className="notif-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="notif-header">
          <div className="notif-title-group">
            <h2 className="notif-title">Notifications</h2>
            {totalCount > 0 && (
              <span className="notif-count-pill">{unreadCount} unread</span>
            )}
          </div>
          <div className="notif-header-actions">
            <button
              className="notif-mark-read"
              onClick={onMarkAllRead}
              disabled={unreadCount === 0}
            >
              Mark all read
            </button>
            <button className="notif-close-btn" onClick={onClose}>
              <XIcon width="18" height="18" />
            </button>
          </div>
        </div>

        {hasScopedTabs && (
          <div className="notif-tabs" role="tablist" aria-label="Notification view">
            <button
              type="button"
              className={`notif-tab ${activeTab === "mine" ? "active" : ""}`}
              onClick={() => setActiveTab("mine")}
              role="tab"
              aria-selected={activeTab === "mine"}
            >
              Mine
              <span className="notif-tab-count">{mineCount}</span>
            </button>
            <button
              type="button"
              className={`notif-tab ${activeTab === "team" ? "active" : ""}`}
              onClick={() => setActiveTab("team")}
              role="tab"
              aria-selected={activeTab === "team"}
            >
              Team/All
              <span className="notif-tab-count">{teamCount}</span>
            </button>
          </div>
        )}

        <div className="notif-list-container">
          {unreadNotifications.length > 0 && (
            <div className="notif-section">
              <div className="notif-section-header">
                <span className="section-dot red"></span>
                <span className="section-label">
                  UNREAD ({unreadNotifications.length})
                </span>
              </div>
              {unreadNotifications.map((n) => {
                const typeMeta = getNotificationTypeMeta(n.type);
                return (
                  <div
                    key={n._id}
                    className="notif-item unread"
                    onClick={() =>
                      onMarkRead(n, {
                        viewScope: hasScopedTabs ? activeTab : "all",
                      })
                    }
                  >
                    <div
                      className={`notif-icon-wrapper ${typeMeta.className}`}
                      title={typeMeta.label}
                      aria-label={typeMeta.label}
                    >
                      {typeMeta.icon}
                    </div>
                    <div className="notif-content">
                      <div className="notif-row-top">
                        <span className="notif-item-title">{n.title}</span>
                        <span className="notif-time">{formatTime(n.createdAt)}</span>
                      </div>
                      <p className="notif-item-desc">{n.message}</p>
                      {renderMeta(n)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {readNotifications.length > 0 && (
            <div className="notif-section">
              <div className="notif-section-header">
                <span className="section-dot gray"></span>
                <span className="section-label">EARLIER</span>
              </div>
              {readNotifications.map((n) => {
                const typeMeta = getNotificationTypeMeta(n.type);
                return (
                  <div
                    key={n._id}
                    className="notif-item"
                    onClick={() =>
                      onMarkRead(n, {
                        viewScope: hasScopedTabs ? activeTab : "all",
                      })
                    }
                  >
                    <div
                      className={`notif-icon-wrapper ${typeMeta.className}`}
                      title={typeMeta.label}
                      aria-label={typeMeta.label}
                    >
                      {typeMeta.icon}
                    </div>
                    <div className="notif-content">
                      <div className="notif-row-top">
                        <span className="notif-item-title">{n.title}</span>
                        <span className="notif-time">{formatTime(n.createdAt)}</span>
                      </div>
                      <p className="notif-item-desc">{n.message}</p>
                      {renderMeta(n)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalCount === 0 && (
            <div className="notif-empty">
              <p>No notifications in this view.</p>
            </div>
          )}
        </div>

        <div className="notif-footer">
          <button className="notif-clear-btn" onClick={onClearAll}>
            Clear all notifications
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;
