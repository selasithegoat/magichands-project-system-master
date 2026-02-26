import React from "react";
import "./NotificationModal.css";
import XIcon from "../icons/XIcon";

const getNotificationTypeLabel = (type) => {
  switch (type) {
    case "ASSIGNMENT":
      return "Task";
    case "ACTIVITY":
      return "Alert";
    case "UPDATE":
      return "Update";
    case "ACCEPTANCE":
      return "Accept";
    case "REMINDER":
      return "Reminder";
    default:
      return "System";
  }
};

const NotificationModal = ({
  isOpen,
  onClose,
  notifications = [],
  onMarkAllRead,
  onClearAll,
  onMarkRead,
}) => {
  if (!isOpen) return null;

  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const readNotifications = notifications.filter((n) => n.isRead);

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

  return (
    <div className="notif-modal-overlay" onClick={onClose}>
      <div className="notif-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="notif-header">
          <button className="notif-close-btn" onClick={onClose}>
            <XIcon width="20" height="20" />
          </button>
          <h2 className="notif-title">Notifications</h2>
          <button className="notif-mark-read" onClick={onMarkAllRead}>
            Mark all as read
          </button>
        </div>

        <div className="notif-list-container">
          {unreadNotifications.length > 0 && (
            <div className="notif-section">
              <div className="notif-section-header">
                <span className="section-dot red"></span>
                <span className="section-label">
                  UNREAD ({unreadNotifications.length})
                </span>
              </div>
              {unreadNotifications.map((n) => (
                <div
                  key={n._id}
                  className="notif-item unread"
                  onClick={() => onMarkRead(n)}
                >
                  <div
                    className={`notif-icon-wrapper ${
                      n.type === "ASSIGNMENT" ? "red-bg" : "blue-light-bg"
                    }`}
                  >
                    {getNotificationTypeLabel(n.type)}
                  </div>
                  <div className="notif-content">
                    <div className="notif-row-top">
                      <span className="notif-item-title">{n.title}</span>
                      <span className="notif-time">{formatTime(n.createdAt)}</span>
                    </div>
                    <p className="notif-item-desc">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {readNotifications.length > 0 && (
            <div className="notif-section">
              <div className="notif-section-header">
                <span className="section-dot gray"></span>
                <span className="section-label">EARLIER</span>
              </div>
              {readNotifications.map((n) => (
                <div key={n._id} className="notif-item" onClick={() => onMarkRead(n)}>
                  <div className="notif-icon-wrapper gray-bg">
                    {getNotificationTypeLabel(n.type)}
                  </div>
                  <div className="notif-content">
                    <div className="notif-row-top">
                      <span className="notif-item-title">{n.title}</span>
                      <span className="notif-time">{formatTime(n.createdAt)}</span>
                    </div>
                    <p className="notif-item-desc">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {notifications.length === 0 && (
            <div className="notif-empty">
              <p>No notifications yet.</p>
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
