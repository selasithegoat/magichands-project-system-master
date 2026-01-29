import React from "react";
import "./NotificationModal.css";
// Icons
import XIcon from "../icons/XIcon"; // Using Close icon
import SearchIcon from "../icons/SearchIcon";
import AlertTriangleIcon from "../icons/AlertTriangleIcon";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import ClockIcon from "../icons/ClockIcon";
import CalendarIcon from "../icons/CalendarIcon";

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

  // Group by date or priority if needed, but for now let's just show list
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
      <div
        className="notif-modal-content"
        onClick={(e) => e.stopPropagation()} // Prevent close on click inside
      >
        {/* Header */}
        <div className="notif-header">
          <button className="notif-close-btn" onClick={onClose}>
            <XIcon width="20" height="20" />
          </button>
          <h2 className="notif-title">Notifications</h2>
          <button className="notif-mark-read" onClick={onMarkAllRead}>
            Mark all as read
          </button>
        </div>

        {/* Search */}
        <div className="notif-search-container">
          <SearchIcon style={{ width: 16, height: 16, color: "#94a3b8" }} />
          <input
            type="text"
            className="notif-search-input"
            placeholder="Search project updates"
          />
        </div>

        {/* Scrollable List */}
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
                    className={`notif-icon-wrapper ${n.type === "ASSIGNMENT" ? "red-bg" : "blue-light-bg"}`}
                  >
                    {n.type === "ASSIGNMENT" ? "📌" : "🔔"}
                  </div>
                  <div className="notif-content">
                    <div className="notif-row-top">
                      <span className="notif-item-title">{n.title}</span>
                      <span className="notif-time">
                        {formatTime(n.createdAt)}
                      </span>
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
                <div
                  key={n._id}
                  className="notif-item"
                  onClick={() => onMarkRead(n)}
                >
                  <div className="notif-icon-wrapper gray-bg">
                    {n.type === "ASSIGNMENT" ? "📌" : "🔔"}
                  </div>
                  <div className="notif-content">
                    <div className="notif-row-top">
                      <span className="notif-item-title">{n.title}</span>
                      <span className="notif-time">
                        {formatTime(n.createdAt)}
                      </span>
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

        {/* Footer */}
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
