import React, { useState } from "react";
import "./Header.css";
import { SearchIcon, BellIcon } from "../../icons/Icons";
import NotificationDropdown from "./NotificationDropdown";
import ReminderAlertModal from "./ReminderAlertModal";
import useNotifications from "../../hooks/useNotifications";

const Header = ({ onMenuClick, user }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    activeReminderAlert,
    reminderActionLoading,
    reminderActionError,
    handleReminderAlertAction,
  } = useNotifications({
    soundEnabled: user?.notificationSettings?.sound ?? true,
    userId: user?._id || "",
  });

  return (
    <header className="header">
      <div className="header-left">
        <button className="menu-btn" onClick={onMenuClick}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>
        <div className="breadcrumbs">
          <span className="breadcrumb-current">Projects Overview</span>
        </div>
      </div>

      <div className="header-actions">
        {/* Notification Button */}
        <div
          className="notification-container"
          style={{ position: "relative" }}
        >
          <button
            className="notification-btn"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <BellIcon className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </button>

          {isDropdownOpen && (
            <NotificationDropdown
              onClose={() => setIsDropdownOpen(false)}
              notifications={notifications}
              loading={loading}
              markAsRead={markAsRead}
              markAllAsRead={markAllAsRead}
              clearNotifications={clearNotifications}
            />
          )}
        </div>
      </div>

      <ReminderAlertModal
        reminder={activeReminderAlert}
        loading={reminderActionLoading}
        error={reminderActionError}
        onSnooze={() => handleReminderAlertAction("snooze")}
        onStop={() => handleReminderAlertAction("stop")}
        onComplete={() => handleReminderAlertAction("complete")}
      />
    </header>
  );
};

export default Header;
