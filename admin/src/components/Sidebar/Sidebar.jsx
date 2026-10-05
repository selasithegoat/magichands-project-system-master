import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "./Sidebar.css";
import { LogoutIcon } from "../../icons/Icons";
import { adminNavigationItems } from "../../config/adminNavigation";
import ConfirmationModal from "../ConfirmationModal/ConfirmationModal";

const iconPaths = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  projects: (
    <>
      <path d="M3 7.5h6l2-2h10v13.25A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75V7.5Z" />
      <path d="M3 10h18" />
    </>
  ),
  deadlines: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18M12 13v3l2 1" />
    </>
  ),
  production: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4M7 13l3-3 2 2 5-5" />
    </>
  ),
  orders: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  billing: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v5h4M9 12h6M9 16h6" />
    </>
  ),
  authorizations: (
    <>
      <path d="M12 3 20 6v5c0 5-3.25 8-8 10-4.75-2-8-5-8-10V6l8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  cancelled: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  clients: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20v-2a5.5 5.5 0 0 1 11 0v2M15 5.5a3 3 0 0 1 0 5.8M17 14a5 5 0 0 1 3.5 4.75V20" />
    </>
  ),
  team: (
    <>
      <circle cx="12" cy="7" r="3" />
      <circle cx="5" cy="10" r="2" />
      <circle cx="19" cy="10" r="2" />
      <path d="M7 21v-2a5 5 0 0 1 10 0v2M1.5 20v-1a3.5 3.5 0 0 1 4-3.5M22.5 20v-1a3.5 3.5 0 0 0-4-3.5" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      <path d="m4 7 6-4 6 6 5-5" />
    </>
  ),
  performance: (
    <>
      <path d="M4 18a9 9 0 1 1 16 0" />
      <path d="m12 12 4-4M7 18h10" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
};

const SidebarIcon = ({ name }) => (
  <svg
    className="sidebar-nav-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {iconPaths[name]}
  </svg>
);

const getUserName = (user) => {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  return user?.name || fullName || "Administrator";
};

const getUserInitials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AD";

const getUserRole = (user) => {
  const department = Array.isArray(user?.department)
    ? user.department.find(Boolean)
    : user?.department;

  return department ? `${department} / Admin` : "Administrator";
};

const Sidebar = ({ isOpen, onClose, user, onLogout }) => {
  const navigate = useNavigate();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const userName = getUserName(user);

  const handleLogout = async () => {
    try {
      if (typeof onLogout === "function") {
        await onLogout();
      } else {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          keepalive: true,
        });
      }
      setIsLogoutModalOpen(false);
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout failed", err);
      navigate("/login", { replace: true });
    }
  };

  return (
    <>
      <aside
        className={`sidebar ${isOpen ? "sidebar-mobile-open" : ""}`}
        aria-label="Admin portal navigation"
      >
        <div className="sidebar-brand">
          <NavLink
            to="/dashboard"
            className="sidebar-brand-link"
            onClick={onClose}
            aria-label="MagicHands Admin Portal home"
          >
            <span className="sidebar-brand-mark">
              <img
                src={`${import.meta.env.BASE_URL}icon.png`}
                alt=""
                aria-hidden="true"
              />
            </span>
            <span className="sidebar-brand-copy">
              <strong>MagicHands</strong>
              <span>Admin Portal</span>
            </span>
          </NavLink>
          <button
            type="button"
            className="mobile-close-btn"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <span className="sidebar-nav-label">Workspace</span>
          {adminNavigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <SidebarIcon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status" role="status">
            <span className="sidebar-status-dot" aria-hidden="true" />
            <span>Secure admin session</span>
          </div>

          <div className="sidebar-account">
            <div className="sidebar-avatar" aria-hidden="true">
              {getUserInitials(userName)}
            </div>
            <div className="sidebar-account-copy">
              <strong title={userName}>{userName}</strong>
              <span title={getUserRole(user)}>{getUserRole(user)}</span>
            </div>
            <button
              type="button"
              className="sidebar-logout-btn"
              onClick={() => setIsLogoutModalOpen(true)}
              aria-label="Log out"
              title="Log out"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </aside>
      <ConfirmationModal
        isOpen={isLogoutModalOpen}
        onClose={() => setIsLogoutModalOpen(false)}
        onConfirm={handleLogout}
        title="Confirm Logout"
        message="Are you sure you want to log out from the admin portal?"
        confirmText="Logout"
        cancelText="Cancel"
        isDangerous
      />
    </>
  );
};

export default Sidebar;
