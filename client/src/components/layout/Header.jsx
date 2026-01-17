import React from "react";

import MenuIcon from "../icons/MenuIcon";

const Header = ({
  activeView,
  user,
  projectCount, // [New]
  onNavigateDashboard,
  onNavigateProject,
  onNavigateHistory,
  onNavigateProfile,
  onNavigateNewOrders, // [New]
  onNavigateEndOfDay, // [New]
  onToggleMobileMenu,
  onToggleNotification, // New prop
  notificationCount = 0, // New prop
}) => {
  const getInitials = () => {
    if (!user) return "U";
    const f = user.firstName ? user.firstName[0] : "";
    const l = user.lastName ? user.lastName[0] : "";
    return (f + l).toUpperCase() || "U";
  };

  return (
    <header className="main-header">
      <div className="header-inner">
        <div className="header-brand">
          <button className="hamburger-btn" onClick={onToggleMobileMenu}>
            <MenuIcon />
          </button>
          <div className="logo-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="brand-name">MagicHands</span>
        </div>

        <nav className="main-nav">
          <a
            href="#"
            className={`nav-item ${activeView === "dashboard" ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigateDashboard();
            }}
          >
            Dashboard
          </a>
          <a
            href="#"
            className={`nav-item ${activeView === "projects" ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigateProject();
            }}
          >
            Projects
            {projectCount > 0 && (
              <span className="nav-badge">{projectCount}</span>
            )}
          </a>
          <a
            href="#"
            className={`nav-item ${activeView === "history" ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigateHistory();
            }}
          >
            History
          </a>
          {user?.department?.includes("Front Desk") && (
            <>
              <a
                href="#"
                className={`nav-item ${
                  activeView === "new-orders" ? "active" : ""
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigateNewOrders();
                }}
              >
                New Orders
              </a>
              <a
                href="#"
                className={`nav-item ${
                  activeView === "end-of-day" ? "active" : ""
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  // Check if onNavigateEndOfDay exists, if not usage might need update in Layout/App
                  if (typeof onNavigateEndOfDay === "function") {
                    onNavigateEndOfDay();
                  }
                }}
              >
                End of Day Update
              </a>
            </>
          )}
        </nav>
        <div className="header-actions">
          <button className="icon-btn" onClick={onToggleNotification}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            {notificationCount > 0 && <span className="notif-dot"></span>}
          </button>
          <div
            className="user-profile-mini"
            onClick={onNavigateProfile}
            style={{ cursor: "pointer" }}
          >
            {getInitials()}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
