import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./NotificationDropdown.css";
import {
  BROWSER_PUSH_STATUS_EVENT,
  getBrowserPushStatus,
  requestBrowserPushPermission,
} from "@client/utils/browserPush";
import {
  AssignIcon,
  SupportIcon,
  ProjectsIcon,
  CheckCircleIcon,
  BellIcon,
  ShieldIcon,
} from "../../icons/Icons";

const formatTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return date.toLocaleDateString();
};

const getNotificationTypeMeta = (type) => {
  switch (type) {
    case "ASSIGNMENT":
      return {
        label: "Task",
        className: "assignment",
        icon: <AssignIcon className="notification-type-icon" />,
      };
    case "ACTIVITY":
      return {
        label: "Alert",
        className: "activity",
        icon: <SupportIcon className="notification-type-icon" />,
      };
    case "UPDATE":
      return {
        label: "Update",
        className: "update",
        icon: <ProjectsIcon className="notification-type-icon" />,
      };
    case "REVISION":
      return {
        label: "Revision",
        className: "revision",
        icon: <ProjectsIcon className="notification-type-icon" />,
      };
    case "ACCEPTANCE":
      return {
        label: "Accept",
        className: "acceptance",
        icon: <CheckCircleIcon className="notification-type-icon" />,
      };
    case "REMINDER":
      return {
        label: "Reminder",
        className: "reminder",
        icon: <BellIcon className="notification-type-icon" />,
      };
    default:
      return {
        label: "System",
        className: "system",
        icon: <ShieldIcon className="notification-type-icon" />,
      };
  }
};

const NotificationDropdown = ({
  onClose,
  notifications,
  loading,
  markAsRead,
  markAllAsRead,
  clearNotifications,
}) => {
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const [pushStatus, setPushStatus] = useState(getBrowserPushStatus);
  const [pushMessage, setPushMessage] = useState("");

  const enableBrowserNotifications = async () => {
    setPushMessage("");
    const result = await requestBrowserPushPermission();
    setPushStatus(result.status);
    if (result.status === "denied") {
      setPushMessage("Notifications are blocked in this browser's site settings.");
    } else if (result.status === "error") {
      setPushMessage(result.error?.message || "Could not enable browser notifications.");
    }
  };

  const openNotification = (notification) => {
    markAsRead(notification._id);
    if (notification.actionUrl?.startsWith("/")) {
      onClose();
      navigate(notification.actionUrl);
      return;
    }
    const projectId = notification.project?._id;
    if (
      notification.source?.startsWith("production_action_escalation:") &&
      projectId
    ) {
      onClose();
      navigate(`/projects/${projectId}`);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    const handleStatus = (event) => {
      setPushStatus(event.detail?.status || getBrowserPushStatus());
      setPushMessage(event.detail?.message || "");
    };
    window.addEventListener(BROWSER_PUSH_STATUS_EVENT, handleStatus);
    return () => window.removeEventListener(BROWSER_PUSH_STATUS_EVENT, handleStatus);
  }, []);

  return (
    <div className="notification-dropdown" ref={dropdownRef}>
      <div className="notification-header">
        <h3>Notifications</h3>
        <div className="notification-actions">
          <button onClick={markAllAsRead} className="text-btn">
            Mark all read
          </button>
          <button onClick={clearNotifications} className="text-btn danger">
            Clear all
          </button>
        </div>
      </div>

      {pushStatus !== "unsupported" && pushStatus !== "insecure" && (
        <div className="browser-push-row">
          <div>
            <strong>Desktop alerts</strong>
            <span>
              {pushStatus === "granted" || pushStatus === "subscribed"
                ? "Enabled — alerts close automatically."
                : "Get alerts even when this portal is closed."}
            </span>
          </div>
          {pushStatus !== "granted" && pushStatus !== "subscribed" && (
            <button type="button" onClick={enableBrowserNotifications}>
              Enable
            </button>
          )}
          {pushMessage && <p role="status">{pushMessage}</p>}
        </div>
      )}

      <div className="notification-list">
        {loading ? (
          <div className="notification-empty">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="notification-empty">No notifications</div>
        ) : (
          <>
            {notifications.some((n) => !n.isRead) && (
              <>
                <div className="notification-section-header">New</div>
                {notifications
                  .filter((n) => !n.isRead)
                  .map((notification) => {
                    const typeMeta = getNotificationTypeMeta(notification.type);
                    return (
                      <div
                        key={notification._id}
                        className="notification-item unread"
                        onClick={() => openNotification(notification)}
                      >
                        <div
                          className={`notification-icon ${typeMeta.className}`}
                          title={typeMeta.label}
                          aria-label={typeMeta.label}
                        >
                          {typeMeta.icon}
                        </div>
                        <div className="notification-content">
                          <p className="notification-title">
                            <span>{notification.title}</span>
                          </p>
                          <p className="notification-message">
                            <span>{notification.message}</span>
                          </p>
                          <span className="notification-time">
                            <span>{formatTime(notification.createdAt)}</span>
                          </span>
                        </div>
                        <div className="unread-dot"></div>
                      </div>
                    );
                  })}
              </>
            )}

            {notifications.some((n) => n.isRead) && (
              <>
                <div className="notification-section-header">Earlier</div>
                {notifications
                  .filter((n) => n.isRead)
                  .map((notification) => {
                    const typeMeta = getNotificationTypeMeta(notification.type);
                    return (
                      <div
                        key={notification._id}
                        className="notification-item"
                        onClick={() => openNotification(notification)}
                      >
                        <div
                          className={`notification-icon ${typeMeta.className}`}
                          title={typeMeta.label}
                          aria-label={typeMeta.label}
                        >
                          {typeMeta.icon}
                        </div>
                        <div className="notification-content">
                          <p className="notification-title">
                            <span>{notification.title}</span>
                          </p>
                          <p className="notification-message">
                            <span>{notification.message}</span>
                          </p>
                          <span className="notification-time">
                            <span>{formatTime(notification.createdAt)}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationDropdown;
