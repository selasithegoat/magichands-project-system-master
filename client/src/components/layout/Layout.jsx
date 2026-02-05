import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import NotificationModal from "../ui/NotificationModal";
import Toast from "../ui/Toast";
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
  engagedCount = 0, // [New] Department engagement count
  onSignOut, // Receive onSignOut prop
}) => {
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // [New] Notifications & Toasts State
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [toasts, setToasts] = useState([]);
  const lastIdsRef = useRef(new Set());
  const shownToastsRef = useRef(new Set()); // Track notification IDs already shown as toasts

  // [New] Native Notification Permission Logic
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const showNativeNotification = (notification) => {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(notification.title, {
        body: notification.message,
        icon: "/mhlogo.png", // Optional: use app logo
      });
      n.onclick = () => {
        window.focus();
        if (notification.project) {
          const projectId = notification.project._id || notification.project;
          setIsNotificationOpen(false);
          setIsMobileMenuOpen(false);
          navigate(`/detail/${projectId}`);
        }
        n.close();
      };
    }
  };

  const addToast = (notification) => {
    // Prevent duplicate toasts
    if (shownToastsRef.current.has(notification._id)) {
      return;
    }
    shownToastsRef.current.add(notification._id);

    // Check user preferences for Push/Toasts
    const allowPush = user?.notificationSettings?.push ?? true;
    if (!allowPush) return;

    // Show Native Notification
    showNativeNotification(notification);

    // Vibrate on mobile (wrapped in try-catch as Chrome blocks this until user interaction)
    try {
      if ("vibrate" in navigator) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch {
      // Silently ignore - vibration blocked before user interaction
    }

    const id = Date.now() + Math.random();
    setToasts((prev) => [
      ...prev,
      {
        id,
        message: notification.message,
        type: notification.type === "ASSIGNMENT" ? "warning" : "info",
        projectId: notification.project?._id || notification.project,
      },
    ]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchNotifications = async (isInitial = false) => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        const unreadCount = data.filter((n) => !n.isRead).length;
        setNotificationCount(unreadCount);

        // Show toasts for unread notifications not yet shown
        data.forEach((n) => {
          if (!n.isRead && !shownToastsRef.current.has(n._id)) {
            addToast(n);
          }
        });

        // Update tracking IDs
        lastIdsRef.current = new Set(data.map((n) => n._id));
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications(true);
      const interval = setInterval(() => fetchNotifications(false), 5000); // 5s for near real-time
      return () => clearInterval(interval);
    }
  }, [user]);

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "PATCH",
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
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
        lastIdsRef.current = new Set();
        setNotificationCount(0);
      }
    } catch (err) {
      console.error("Error clearing notifications:", err);
    }
  };

  const handleMarkSingleRead = async (notification) => {
    const id = notification._id;
    const projectId = notification.project?._id || notification.project;
    const type = notification.type;

    try {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
        );
        setNotificationCount((prev) => Math.max(0, prev - 1));

        // Close modals
        setIsNotificationOpen(false);
        setIsMobileMenuOpen(false);

        // Intelligent Routing based on notification type
        if (projectId) {
          // Special Case: End of Day Update for Front Desk
          if (notification.title === "Final Update Posted") {
            navigate("/end-of-day");
          } else if (notification.title === "New Project Engagement") {
            navigate("/engaged-projects");
          } else {
            switch (type) {
              case "ACTIVITY":
                navigate(`/detail/${projectId}?tab=Activities`);
                break;
              case "UPDATE":
                navigate(`/detail/${projectId}?tab=Updates`);
                break;
              case "ASSIGNMENT":
                // Navigate to project details for assigned project
                navigate(`/detail/${projectId}`);
                break;
              case "ACCEPTANCE":
                navigate(`/detail/${projectId}`);
                break;
              default:
                navigate(`/detail/${projectId}`);
            }
          }
        } else if (type === "SYSTEM") {
          // System notifications with no project context - go to dashboard
          navigate("/dashboard");
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
        engagedCount={engagedCount}
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

      {/* Notification Toasts */}
      <div className="ui-toast-container">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
            duration={5000}
            onClick={() => {
              if (toast.projectId) {
                navigate(`/detail/${toast.projectId}`);
                removeToast(toast.id);
              }
            }}
          />
        ))}
      </div>

      {/* Page Content */}
      <main className="layout-content">{children}</main>
    </div>
  );
};

export default Layout;
