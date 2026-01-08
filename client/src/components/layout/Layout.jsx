import React, { useState } from "react";
import Header from "./Header";
import "./Layout.css";

// --- Icons ---
const MenuIcon = () => (
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
const XIcon = () => (
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
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);
const LayoutGridIcon = () => (
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
    <rect x="3" y="3" width="7" height="7"></rect>
    <rect x="14" y="3" width="7" height="7"></rect>
    <rect x="14" y="14" width="7" height="7"></rect>
    <rect x="3" y="14" width="7" height="7"></rect>
  </svg>
);
const FolderIcon = () => (
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
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
  </svg>
);
const UsersIcon = () => (
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
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);
const SettingsIcon = () => (
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
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1-2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
  </svg>
);
const LogOutIcon = () => (
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
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

const Layout = ({
  children,
  onNavigateDashboard,
  onNavigateProject,
  onNavigateHistory,
  onNavigateProfile,
  onCreateProject,
  activeView, // Receive activeView
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="layout-container">
      {/* Top Navigation Header */}
      {/* Top Navigation Header */}
      <Header
        activeView={activeView}
        onNavigateDashboard={onNavigateDashboard}
        onNavigateProject={onNavigateProject}
        onNavigateHistory={onNavigateHistory}
        onNavigateProfile={onNavigateProfile}
        onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <>
          <div
            className="drawer-backdrop"
            onClick={() => setIsMobileMenuOpen(false)}
          ></div>
          <div className="mobile-drawer">
            <div className="drawer-header">
              <div className="drawer-brand">
                <span className="brand-name">MagicHands</span>
              </div>
              <button
                className="drawer-close-btn"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <XIcon />
              </button>
            </div>

            <nav className="drawer-menu">
              <a
                href="#"
                className={`drawer-item ${
                  activeView === "dashboard" ? "active" : ""
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  onNavigateDashboard();
                }}
              >
                <LayoutGridIcon />
                Dashboard
              </a>
              <a
                href="#"
                className={`drawer-item ${
                  activeView === "projects" ? "active" : ""
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  onNavigateProject();
                }}
              >
                <FolderIcon />
                Projects
                <span className="drawer-badge">12</span>
              </a>
              <a
                href="#"
                className={`drawer-item ${
                  activeView === "create" ? "active" : ""
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  onCreateProject();
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 20,
                    height: 20,
                    border: "1px solid currentColor",
                    borderRadius: 4,
                  }}
                >
                  +
                </div>
                New Project
              </a>
              <a
                href="#"
                className={`drawer-item ${
                  activeView === "history" ? "active" : ""
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  onNavigateHistory();
                }}
              >
                <UsersIcon />
                History
              </a>
              <a href="#" className="drawer-item">
                <SettingsIcon />
                Settings
              </a>
            </nav>

            <div className="drawer-footer">
              <div className="drawer-user">
                <div className="user-profile-mini">AJ</div>
                <div className="drawer-user-info">
                  <span className="user-name">Alex Morgan</span>
                  <span className="user-role">Project Manager</span>
                </div>
              </div>
              <button className="drawer-logout">
                <LogOutIcon />
                Log Out
              </button>
            </div>
          </div>
        </>
      )}

      {/* Page Content */}
      <main className="layout-content">{children}</main>
    </div>
  );
};

export default Layout;
