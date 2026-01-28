import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import NotificationModal from "../ui/NotificationModal";
import "./Layout.css";
// Icons
import XIcon from "../icons/XIcon";
import LayoutGridIcon from "../icons/LayoutGridIcon";
import FolderIcon from "../icons/FolderIcon";
import UsersIcon from "../icons/UsersIcon";
import SettingsIcon from "../icons/SettingsIcon";
import LogOutIcon from "../icons/LogOutIcon";
import ClipboardListIcon from "../icons/ClipboardListIcon";

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
  onNavigateNewOrders, // [New]
  onNavigateEndOfDay, // [New]
  onNavigateEngagedProjects, // [New] Production Team
  onCreateProject,
  activeView,
  user, // Receive user
  projectCount, // Receive projectCount prop
  onSignOut, // Receive onSignOut prop
}) => {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // [New] Notifications State
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationCount, setNotificationCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        const unreadCount = data.filter((n) => !n.isRead).length;
        setNotificationCount(unreadCount);
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 60000); // Poll every 60s
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "PATCH",
      });
      if (res.ok) {
        setNotifications(notifications.map((n) => ({ ...n, isRead: true })));
        setNotificationCount(0);
      }
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  };

  const handleClearNotifications = async () => {
    try {
      const res = await fetch("/api/notifications", { method: "DELETE" });
      if (res.ok) {
        setNotifications([]);
        setNotificationCount(0);
      }
    } catch (err) {
      console.error("Error clearing notifications:", err);
    }
  };

  const handleMarkSingleRead = async (id, projectId) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
        );
        setNotificationCount((prev) => Math.max(0, prev - 1));

        if (projectId) {
          setIsNotificationOpen(false);
          setIsMobileMenuOpen(false);
          navigate(`/projects/${projectId}`);
        }
      }
    } catch (err) {
      console.error("Error marking single read:", err);
    }
  };

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
        projectCount={projectCount}
        onNavigateDashboard={onNavigateDashboard}
        onNavigateProject={onNavigateProject}
        onNavigateHistory={onNavigateHistory}
        onNavigateProfile={onNavigateProfile}
        onNavigateNewOrders={onNavigateNewOrders} // Pass prop
        onNavigateEndOfDay={onNavigateEndOfDay} // Pass prop
        onNavigateEngagedProjects={onNavigateEngagedProjects} // [New]
        onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
        onToggleNotification={() => setIsNotificationOpen(!isNotificationOpen)} // Toggle
        notificationCount={notificationCount}
      />

      {/* Notification Modal */}
      <NotificationModal
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        onMarkAllRead={handleMarkAllAsRead}
        onClearAll={handleClearNotifications}
        onMarkRead={handleMarkSingleRead}
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
              <div
                className="drawer-brand"
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <img
                  src="/mhlogo.png"
                  alt="Logo"
                  style={{ height: "40px", width: "auto" }}
                />
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
                {projectCount > 0 && (
                  <span className="drawer-badge">{projectCount}</span>
                )}
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
              {user?.department?.includes("Front Desk") && (
                <>
                  <a
                    href="#"
                    className={`drawer-item ${
                      activeView === "new-orders" ? "active" : ""
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      setIsMobileMenuOpen(false);
                      onNavigateNewOrders();
                    }}
                  >
                    <ClipboardListIcon />
                    New Orders
                  </a>
                  <a
                    href="#"
                    className={`drawer-item ${
                      activeView === "end-of-day" ? "active" : ""
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      setIsMobileMenuOpen(false);
                      if (onNavigateEndOfDay) onNavigateEndOfDay();
                    }}
                  >
                    <ClipboardListIcon />
                    End of Day Update
                  </a>
                </>
              )}
            </nav>

            <div className="drawer-footer">
              <div
                className="drawer-user"
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  onNavigateProfile();
                }}
                style={{ cursor: "pointer" }}
              >
                <div className="user-profile-mini">{getInitials()}</div>
                <div className="drawer-user-info">
                  <span className="user-name">{getFullName()}</span>
                  <span className="user-role">
                    {user?.employeeType || "User"}
                  </span>
                </div>
              </div>
              <button
                className="drawer-logout"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  if (onSignOut) onSignOut();
                }}
              >
                <LogOutIcon />
                Sign Out
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
