import React, { useState } from "react";
import "./Header.css";
import { SearchIcon, BellIcon } from "../../icons/Icons";
import NotificationDropdown from "./NotificationDropdown";
import useNotifications from "../../hooks/useNotifications";

const Header = ({ onMenuClick }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  } = useNotifications();

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
    </header>
  );
};

export default Header;
