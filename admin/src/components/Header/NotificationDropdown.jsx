import React, { useEffect, useRef } from "react";
import "./NotificationDropdown.css";
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
                        onClick={() => markAsRead(notification._id)}
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
                        onClick={() => markAsRead(notification._id)}
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
