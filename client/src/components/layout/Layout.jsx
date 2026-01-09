import React, { useState } from "react";
import Header from "./Header";
import "./Layout.css";
// Icons
import XIcon from "../icons/XIcon";
import LayoutGridIcon from "../icons/LayoutGridIcon";
import FolderIcon from "../icons/FolderIcon";
import UsersIcon from "../icons/UsersIcon";
import SettingsIcon from "../icons/SettingsIcon";
import LogOutIcon from "../icons/LogOutIcon";

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

const Layout = ({
  children,
  onNavigateDashboard,
  onNavigateProject,
  onNavigateHistory,
  onNavigateProfile,
  onCreateProject,
  activeView,
  user, // Receive user
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Helper to get initials
  const getInitials = () => {
    if (!user) return "U";
    const f = user.firstName ? user.firstName[0] : "";
    const l = user.lastName ? user.lastName[0] : "";
    return (f + l).toUpperCase() || "U";
  };

  const getFullName = () => {
    if (!user) return "User";
    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.name;
  };

  return (
    <div className="layout-container">
      {/* Top Navigation Header */}
      <Header
        activeView={activeView}
        user={user}
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
                <div className="user-profile-mini">{getInitials()}</div>
                <div className="drawer-user-info">
                  <span className="user-name">{getFullName()}</span>
                  <span className="user-role">
                    {user?.employeeType || "User"}
                  </span>
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
