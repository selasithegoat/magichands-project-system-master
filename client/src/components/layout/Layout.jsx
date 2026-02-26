import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import Header from "./Header";
import NotificationModal from "../ui/NotificationModal";
import Toast from "../ui/Toast";
import ReminderAlertModal from "../features/ReminderAlertModal";
import "./Layout.css";
// Icons
import XIcon from "../icons/XIcon";
import LayoutGridIcon from "../icons/LayoutGridIcon";
import FolderIcon from "../icons/FolderIcon";
import UsersIcon from "../icons/UsersIcon";
import SettingsIcon from "../icons/SettingsIcon";
import LogOutIcon from "../icons/LogOutIcon";
import ClipboardListIcon from "../icons/ClipboardListIcon";
import PackageIcon from "../icons/PackageIcon";
import {
  PRODUCTION_SUB_DEPARTMENTS,
  GRAPHICS_SUB_DEPARTMENTS,
  STORES_SUB_DEPARTMENTS,
  PHOTOGRAPHY_SUB_DEPARTMENTS,
} from "../../constants/departments";
import {
  initNotificationSound,
  playNotificationSound,
} from "../../utils/notificationSound";

const NOTIFICATION_POLL_INTERVAL_MS = 5000;
let notificationBootstrapUserId = "";

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    if (value._id) return toEntityId(value._id);
    if (value.id) return String(value.id);
  }
  return "";
};

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
  onNavigateInventory, // [New] Stores Team
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
  const [reminderQueue, setReminderQueue] = useState([]);
  const [activeReminderAlert, setActiveReminderAlert] = useState(null);
  const [reminderActionLoading, setReminderActionLoading] = useState(false);
  const [reminderActionError, setReminderActionError] = useState("");
  const queuedReminderNotificationIdsRef = useRef(new Set());
  const handledReminderNotificationIdsRef = useRef(new Set());

  // [New] Native Notification Permission Logic
  useEffect(() => {
    initNotificationSound();

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
    const allowSound = user?.notificationSettings?.sound ?? true;

    playNotificationSound(notification.type, allowSound).catch(() => {});

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

  const syncReminderQueueFromNotifications = (notificationList = []) => {
    const unreadReminderNotifications = notificationList
      .filter((item) => !item?.isRead && item?.type === "REMINDER")
      .map((item) => {
        const notificationId = toEntityId(item?._id);
        const reminderId = toEntityId(item?.reminder);
        return {
          notificationId,
          reminderId,
          title: String(item?.title || "Reminder").trim(),
          message: String(item?.message || "").trim(),
          createdAt: item?.createdAt || null,
          projectId: toEntityId(item?.project?._id || item?.project),
        };
      })
      .filter((item) => Boolean(item.notificationId && item.reminderId))
      .sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
      );

    const unreadIds = new Set(
      unreadReminderNotifications.map((item) => item.notificationId),
    );

    setReminderQueue((prev) => {
      const next = prev.filter((item) => unreadIds.has(item.notificationId));
      const queueSet = new Set(next.map((item) => item.notificationId));

      for (const item of unreadReminderNotifications) {
        if (handledReminderNotificationIdsRef.current.has(item.notificationId)) {
          continue;
        }
        if (queueSet.has(item.notificationId)) continue;
        next.push(item);
        queueSet.add(item.notificationId);
      }

      queuedReminderNotificationIdsRef.current = queueSet;
      return next;
    });
  };

  const markNotificationReadSilently = async (notificationId) => {
    if (!notificationId) return;
    try {
      const res = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) return;

      setNotifications((prev) =>
        prev.map((item) =>
          item._id === notificationId ? { ...item, isRead: true } : item,
        ),
      );
      setNotificationCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error("Error marking reminder notification as read:", error);
    }
  };

  const processReminderAlertAction = async (actionType) => {
    if (!activeReminderAlert || reminderActionLoading) return;
    const reminderId = toEntityId(activeReminderAlert.reminderId);
    const notificationId = toEntityId(activeReminderAlert.notificationId);

    if (!reminderId || !notificationId) {
      setReminderActionError("This reminder cannot be managed anymore.");
      return;
    }

    setReminderActionLoading(true);
    setReminderActionError("");

    try {
      const request = async (endpoint, body = {}) =>
        fetch(`/api/reminders/${reminderId}${endpoint}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });

      if (actionType === "snooze") {
        const snoozeRes = await request("/snooze", { minutes: 60 });
        if (!snoozeRes.ok) {
          const errorData = await snoozeRes.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to snooze reminder.");
        }
      } else if (actionType === "stop") {
        const stopRes = await request("/cancel");
        if (!stopRes.ok) {
          if (stopRes.status === 403) {
            const completeRes = await request("/complete");
            if (!completeRes.ok) {
              const errorData = await completeRes.json().catch(() => ({}));
              throw new Error(
                errorData.message || "Failed to stop reminder for this user.",
              );
            }
          } else {
            const errorData = await stopRes.json().catch(() => ({}));
            throw new Error(errorData.message || "Failed to stop reminder.");
          }
        }
      } else {
        const completeRes = await request("/complete");
        if (!completeRes.ok) {
          const errorData = await completeRes.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to complete reminder.");
        }
      }

      await markNotificationReadSilently(notificationId);
      handledReminderNotificationIdsRef.current.add(notificationId);
      queuedReminderNotificationIdsRef.current.delete(notificationId);

      setReminderQueue((prev) =>
        prev.filter((item) => item.notificationId !== notificationId),
      );
      setActiveReminderAlert(null);
      setReminderActionError("");
    } catch (error) {
      setReminderActionError(error.message || "Failed to update reminder.");
    } finally {
      setReminderActionLoading(false);
    }
  };

  const fetchNotifications = async (isInitial = false) => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
        const unreadCount = data.filter((n) => !n.isRead).length;
        setNotificationCount(unreadCount);
        syncReminderQueueFromNotifications(data);

        // On refresh/first load, do not popup existing unread notifications.
        if (isInitial) {
          data.forEach((n) => {
            if (!n.isRead) {
              shownToastsRef.current.add(n._id);
            }
          });
        } else {
          // Show toasts only for newly arrived unread notifications.
          data.forEach((n) => {
            const isNewSinceLastFetch = !lastIdsRef.current.has(n._id);
            if (
              isNewSinceLastFetch &&
              !n.isRead &&
              !shownToastsRef.current.has(n._id)
            ) {
              addToast(n);
            }
          });
        }

        // Update tracking IDs
        lastIdsRef.current = new Set(data.map((n) => n._id));
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
    }
  };

  useEffect(() => {
    const currentUserId = user?._id || "";
    if (!currentUserId) return;

    if (notificationBootstrapUserId !== currentUserId) {
      notificationBootstrapUserId = currentUserId;
      shownToastsRef.current = new Set();
      lastIdsRef.current = new Set();
      queuedReminderNotificationIdsRef.current = new Set();
      handledReminderNotificationIdsRef.current = new Set();
      setReminderQueue([]);
      setActiveReminderAlert(null);
      setReminderActionError("");
    }

    // Always fetch once on mount so the unread dot is in sync across route changes.
    fetchNotifications(true);

    const interval = setInterval(
      () => fetchNotifications(false),
      NOTIFICATION_POLL_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    const currentUserId = String(user?._id || "");
    if (!currentUserId) return undefined;

    const handleNotificationRealtime = (event) => {
      const recipientId = String(event?.detail?.recipientId || "");
      if (recipientId && recipientId !== currentUserId) {
        return;
      }
      fetchNotifications(false);
    };

    window.addEventListener(
      "mh:notifications-changed",
      handleNotificationRealtime,
    );

    return () => {
      window.removeEventListener(
        "mh:notifications-changed",
        handleNotificationRealtime,
      );
    };
  }, [user]);

  useEffect(() => {
    if (activeReminderAlert) return;
    if (reminderQueue.length === 0) return;

    setActiveReminderAlert(reminderQueue[0]);
    setReminderActionError("");
  }, [activeReminderAlert, reminderQueue]);

  useEffect(() => {
    if (!activeReminderAlert) return;
    const exists = reminderQueue.some(
      (item) => item.notificationId === activeReminderAlert.notificationId,
    );
    if (!exists) {
      setActiveReminderAlert(null);
      setReminderActionError("");
    }
  }, [activeReminderAlert, reminderQueue]);

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", {
        method: "PATCH",
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setNotificationCount(0);
        setReminderQueue([]);
        setActiveReminderAlert(null);
        setReminderActionError("");
        queuedReminderNotificationIdsRef.current = new Set();
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
        setReminderQueue([]);
        setActiveReminderAlert(null);
        setReminderActionError("");
        queuedReminderNotificationIdsRef.current = new Set();
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
        setReminderQueue((prev) =>
          prev.filter((item) => item.notificationId !== String(id)),
        );
        queuedReminderNotificationIdsRef.current.delete(String(id));
        if (activeReminderAlert?.notificationId === String(id)) {
          setActiveReminderAlert(null);
          setReminderActionError("");
        }

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
        onNavigateInventory={onNavigateInventory} // [New]
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

      <ReminderAlertModal
        reminder={activeReminderAlert}
        loading={reminderActionLoading}
        error={reminderActionError}
        onSnooze={() => processReminderAlertAction("snooze")}
        onStop={() => processReminderAlertAction("stop")}
        onComplete={() => processReminderAlertAction("complete")}
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
              <Link
                to="#"
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
              </Link>
              <Link
                to="#"
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
              </Link>
              <Link
                to="#"
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
              </Link>
              <Link
                to="#"
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
              </Link>
              {hasStores && (
                <Link
                  to="#"
                  className={`drawer-item ${
                    activeView === "inventory" ? "active" : ""
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    setIsMobileMenuOpen(false);
                    if (typeof onNavigateInventory === "function") {
                      onNavigateInventory();
                    }
                  }}
                >
                  <PackageIcon width={20} height={20} />
                  INVENTORY
                </Link>
              )}
              {showEngagedProjects && (
                <Link
                  to="#"
                  className={`drawer-item ${
                    activeView === "engaged-projects" ? "active" : ""
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    setIsMobileMenuOpen(false);
                    if (typeof onNavigateEngagedProjects === "function") {
                      onNavigateEngagedProjects();
                    }
                  }}
                >
                  <ClipboardListIcon />
                  Engaged Projects
                  {engagedCount > 0 && (
                    <span className="drawer-badge">{engagedCount}</span>
                  )}
                </Link>
              )}
              {user?.department?.includes("Front Desk") && (
                <>
                  <Link
                    to="#"
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
                  </Link>
                  <Link
                    to="#"
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
                  </Link>
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
