import React from "react";
import { Link } from "react-router-dom";
import {
  PRODUCTION_SUB_DEPARTMENTS,
  GRAPHICS_SUB_DEPARTMENTS,
  STORES_SUB_DEPARTMENTS,
  PHOTOGRAPHY_SUB_DEPARTMENTS,
} from "../../constants/departments";

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
  onNavigateEngagedProjects, // [New] Production Team
  onNavigateInventory, // [New] Stores Team
  onToggleMobileMenu,
  onToggleNotification, // New prop
  notificationCount = 0, // New prop
  engagedCount = 0, // [New] Department engagement count
}) => {
  const getInitials = () => {
    if (!user) return "U";
    const f = user.firstName ? user.firstName[0] : "";
    const l = user.lastName ? user.lastName[0] : "";
    return (f + l).toUpperCase() || "U";
  };

  const userDepartments = Array.isArray(user?.department)
    ? user.department
    : user?.department
      ? [user.department]
      : [];

  const hasProduction =
    userDepartments.includes("Production") ||
    userDepartments.some((d) => PRODUCTION_SUB_DEPARTMENTS.includes(d));
  const hasGraphics =
    userDepartments.includes("Graphics/Design") ||
    userDepartments.some((d) => GRAPHICS_SUB_DEPARTMENTS.includes(d));
  const hasStores =
    userDepartments.includes("Stores") ||
    userDepartments.some((d) => STORES_SUB_DEPARTMENTS.includes(d));
  const hasPhotography =
    userDepartments.includes("Photography") ||
    userDepartments.some((d) => PHOTOGRAPHY_SUB_DEPARTMENTS.includes(d));
  const showEngagedProjects =
    hasProduction || hasGraphics || hasStores || hasPhotography;

  return (
    <header className="main-header">
      <div className="header-inner">
        <div className="header-brand">
          <button className="hamburger-btn" onClick={onToggleMobileMenu}>
            <MenuIcon />
          </button>
          <div className="logo-icon">
            <img
              src="/mhlogo.png"
              alt="MagicHands Logo"
              width="32"
              height="32"
            />
          </div>
          {/* <span className="brand-name">MagicHands</span> */}
        </div>

        <nav className="main-nav">
          <Link
            to="#"
            className={`nav-item ${activeView === "dashboard" ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigateDashboard();
            }}
          >
            Dashboard
          </Link>
          <Link
            to="#"
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
          </Link>
          <Link
            to="#"
            className={`nav-item ${activeView === "history" ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigateHistory();
            }}
          >
            History
          </Link>
          {hasStores && (
            <Link
              to="#"
              className={`nav-item ${activeView === "inventory" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                if (typeof onNavigateInventory === "function") {
                  onNavigateInventory();
                }
              }}
            >
              Inventory
            </Link>
          )}
          {user?.department?.includes("Front Desk") && (
            <>
              <Link
                to="#"
                className={`nav-item ${
                  activeView === "new-orders" ? "active" : ""
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigateNewOrders();
                }}
              >
                New Orders
              </Link>
              <Link
                to="#"
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
              </Link>
            </>
          )}
          {showEngagedProjects && (
            <Link
              to="#"
              className={`nav-item ${
                activeView === "engaged-projects" ? "active" : ""
              }`}
              onClick={(e) => {
                e.preventDefault();
                if (typeof onNavigateEngagedProjects === "function") {
                  onNavigateEngagedProjects();
                }
              }}
            >
              Engaged Projects
              {engagedCount > 0 && (
                <span className="nav-badge">{engagedCount}</span>
              )}
            </Link>
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
