import React from "react";

// For clean extraction, I'll inline the SVG icons in Header.jsx as well if they are not in separate files.
// Based on Layout.jsx, they are defined LOCALLY. I will extract them to this file or reuse.

// Icons (Copying from Layout.jsx for self-containment)
const MenuIconSvg = () => (
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
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

const Header = ({
  activeView,
  onNavigateDashboard,
  onNavigateProject,
  onNavigateHistory,
  onNavigateProfile,
  onToggleMobileMenu,
}) => {
  return (
    <header className="main-header">
      <div className="header-inner">
        <div className="header-brand">
          <button className="hamburger-btn" onClick={onToggleMobileMenu}>
            <MenuIconSvg />
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
            <span className="nav-badge">12</span>
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
        </nav>
        <div className="header-actions">
          <button className="icon-btn">
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
            <span className="notif-dot"></span>
          </button>
          <div
            className="user-profile-mini"
            onClick={onNavigateProfile}
            style={{ cursor: "pointer" }}
          >
            AJ
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
