import React, { useEffect, useState, useRef } from "react";
import "./NotificationDropdown.css";
import axios from "axios";

// Helper to format date
const formatTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return date.toLocaleDateString();
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
    // Click outside to close
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
            {/* Unread Section */}
            {notifications.some((n) => !n.isRead) && (
              <>
                <div className="notification-section-header">New</div>
                {notifications
                  .filter((n) => !n.isRead)
                  .map((notification) => (
                    <div
                      key={notification._id}
                      className="notification-item unread"
                      onClick={() => markAsRead(notification._id)}
                    >
                      <div className="notification-icon">
                        {notification.type === "ASSIGNMENT" && "📋"}
                        {notification.type === "ACTIVITY" && "⚠️"}
                        {notification.type === "UPDATE" && "📝"}
                        {notification.type === "ACCEPTANCE" && "✅"}
                        {notification.type === "SYSTEM" && "🖥️"}
                      </div>
                      <div className="notification-content">
                        <p className="notification-title">
                          {notification.title}
                        </p>
                        <p className="notification-message">
                          {notification.message}
                        </p>
                        <span className="notification-time">
                          {formatTime(notification.createdAt)}
                        </span>
                      </div>
                      <div className="unread-dot"></div>
                    </div>
                  ))}
              </>
            )}

            {/* Read Section */}
            {notifications.some((n) => n.isRead) && (
              <>
                <div className="notification-section-header">Earlier</div>
                {notifications
                  .filter((n) => n.isRead)
                  .map((notification) => (
                    <div
                      key={notification._id}
                      className="notification-item"
                      onClick={() => markAsRead(notification._id)}
                    >
                      <div className="notification-icon">
                        {notification.type === "ASSIGNMENT" && "📋"}
                        {notification.type === "ACTIVITY" && "⚠️"}
                        {notification.type === "UPDATE" && "📝"}
                        {notification.type === "ACCEPTANCE" && "✅"}
                        {notification.type === "SYSTEM" && "🖥️"}
                      </div>
                      <div className="notification-content">
                        <p className="notification-title">
                          {notification.title}
                        </p>
                        <p className="notification-message">
                          {notification.message}
                        </p>
                        <span className="notification-time">
                          {formatTime(notification.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationDropdown;
