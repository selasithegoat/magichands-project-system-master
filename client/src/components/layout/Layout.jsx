import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import Header from "./Header";
import NotificationModal from "../ui/NotificationModal";
import Toast from "../ui/Toast";
import ReminderAlertModal from "../features/ReminderAlertModal";
import DeliveryCalendarFab from "../features/DeliveryCalendarFab";
import ChatDock from "../chat/ChatDock";
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
import HelpIcon from "../icons/HelpIcon";
import {
  PRODUCTION_SUB_DEPARTMENTS,
  GRAPHICS_SUB_DEPARTMENTS,
  STORES_SUB_DEPARTMENTS,
  PHOTOGRAPHY_SUB_DEPARTMENTS,
  normalizeDepartmentId,
} from "../../constants/departments";
import {
  initNotificationSound,
  playNotificationSound,
  triggerNotificationVibration,
} from "../../utils/notificationSound";
import { formatProjectDisplayName } from "../../utils/projectName";
import useAdaptivePolling from "../../hooks/useAdaptivePolling";
import useAuthorizedProjectNavigation from "../../hooks/useAuthorizedProjectNavigation.jsx";

const NOTIFICATION_POLL_INTERVAL_MS = 15000;
const HIDDEN_NOTIFICATION_POLL_INTERVAL_MS = 60000;
const CHAT_OPEN_EVENT_NAME = "mh:open-chat";
const CHAT_MENTION_NOTIFICATION_SOURCE_PREFIX = "chat_mention";
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

const toArray = (value) =>
  Array.isArray(value) ? value : value ? [value] : [];

const normalizeDepartmentToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

const isFrontDeskDepartment = (value) =>
  normalizeDepartmentToken(value) === "front-desk";

const isChatMentionNotification = (notification) =>
  String(notification?.source || "")
    .trim()
    .toLowerCase()
    .startsWith(CHAT_MENTION_NOTIFICATION_SOURCE_PREFIX);

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
  onNavigateHelp,
  onCreateProject,
  activeView,
  user, // Receive user
  projectCount, // Receive projectCount prop
  engagedCount = 0, // [New] Department engagement count
  onSignOut, // Receive onSignOut prop
  theme,
  onToggleTheme,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isFrontDeskUser = toArray(user?.department).some(isFrontDeskDepartment);
  const isFrontDeskOrdersPage = location.pathname === "/frontdesk/orders";
  const { navigateToProject, projectRouteChoiceDialog } =
    useAuthorizedProjectNavigation(user);

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
  const dismissedReminderNotificationIdsRef = useRef(new Set());
  const reminderSoundIdRef = useRef("");

  // [New] Native Notification Permission Logic
  useEffect(() => {
    initNotificationSound();

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const dispatchOpenChat = (detail = {}) => {
    window.dispatchEvent(
      new CustomEvent(CHAT_OPEN_EVENT_NAME, {
        detail,
      }),
    );
  };

  const openProjectFromNotification = React.useCallback(
    (notification, { onBeforeNavigate } = {}) => {
      const projectId = toEntityId(
        notification?.project?._id || notification?.project,
      );
      if (!projectId) return false;

      const projectValue =
        notification?.project && typeof notification.project === "object"
          ? notification.project
          : { _id: projectId };
      const notificationType = String(notification?.type || "")
        .trim()
        .toUpperCase();
      const detailSearch =
        notificationType === "ACTIVITY"
          ? "tab=Activities"
          : notificationType === "UPDATE"
            ? "tab=Updates"
            : "";

      navigateToProject(projectValue, {
        detailSearch,
        fallbackPath: "/client",
        allowGenericEngaged: true,
        title: "Choose Authorized Page",
        message:
          "Project Details is only available to the assigned lead for this project. Choose an authorized page instead.",
        onBeforeNavigate,
      });
      return true;
    },
    [navigateToProject],
  );

  const openProjectFromCalendar = React.useCallback(
    (project) => {
      navigateToProject(project, {
        fallbackPath: "/client",
        allowGenericEngaged: true,
        title: "Choose Authorized Page",
        message:
          "Project Details is only available to the assigned lead for this project. Choose an authorized page instead.",
      });
    },
    [navigateToProject],
  );

  const handleChatMentionOpen = (notification) => {
    if (!isChatMentionNotification(notification)) {
      return false;
    }

    setIsNotificationOpen(false);
    setIsMobileMenuOpen(false);
    dispatchOpenChat({ kind: "public" });
    return true;
  };

  const showNativeNotification = (notification) => {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification(notification.title, {
        body: notification.message,
        icon: "/mhlogo.png", // Optional: use app logo
      });
      n.onclick = () => {
        window.focus();
        if (handleChatMentionOpen(notification)) {
          n.close();
          return;
        }
        if (notification.project) {
          openProjectFromNotification(notification, {
            onBeforeNavigate: () => {
              setIsNotificationOpen(false);
              setIsMobileMenuOpen(false);
            },
          });
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

    if (!isChatMentionNotification(notification)) {
      playNotificationSound(notification.type, allowSound).catch(() => {});
    }

    // Show Native Notification
    showNativeNotification(notification);

    triggerNotificationVibration();

    const id = Date.now() + Math.random();
    const projectId = toEntityId(
      notification?.project?._id || notification?.project,
    );
    setToasts((prev) => [
      ...prev,
      {
        id,
        message: notification.message,
        type: notification.type === "ASSIGNMENT" ? "warning" : "info",
        chatKind: isChatMentionNotification(notification) ? "public" : "",
        projectId,
        notification,
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
        const projectId = toEntityId(item?.project?._id || item?.project);
        const projectDepartments = Array.isArray(item?.project?.departments)
          ? item.project.departments
          : [];
        const projectOrderId = String(item?.project?.orderId || "").trim();
        const projectName = formatProjectDisplayName(
          item?.project?.details,
          null,
          "",
        );
        return {
          notificationId,
          reminderId,
          title: String(item?.title || "Reminder").trim(),
          message: String(item?.message || "").trim(),
          createdAt: item?.createdAt || null,
          projectId,
          projectOrderId,
          projectName,
          project:
            item?.project && typeof item.project === "object"
              ? item.project
              : {
                  _id: projectId,
                  departments: projectDepartments,
                },
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
    const unreadMap = new Map(
      unreadReminderNotifications.map((item) => [item.notificationId, item]),
    );
    dismissedReminderNotificationIdsRef.current = new Set(
      Array.from(dismissedReminderNotificationIdsRef.current).filter((id) =>
        unreadIds.has(id),
      ),
    );

    setReminderQueue((prev) => {
      const next = prev
        .filter((item) => unreadIds.has(item.notificationId))
        .map((item) => unreadMap.get(item.notificationId) || item);
      const queueSet = new Set(next.map((item) => item.notificationId));

      for (const item of unreadReminderNotifications) {
        if (handledReminderNotificationIdsRef.current.has(item.notificationId)) {
          continue;
        }
        if (dismissedReminderNotificationIdsRef.current.has(item.notificationId)) {
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
      dismissedReminderNotificationIdsRef.current.delete(notificationId);
    } catch (error) {
      console.error("Error marking reminder notification as read:", error);
    }
  };

  const dismissReminderAlert = () => {
    const notificationId = toEntityId(activeReminderAlert?.notificationId);
    if (!notificationId) {
      setActiveReminderAlert(null);
      setReminderActionError("");
      return;
    }

    dismissedReminderNotificationIdsRef.current.add(notificationId);
    queuedReminderNotificationIdsRef.current.delete(notificationId);
    setReminderQueue((prev) =>
      prev.filter((item) => item.notificationId !== notificationId),
    );
    setActiveReminderAlert(null);
    setReminderActionError("");
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

  const handleReminderNavigate = () => {
    if (!activeReminderAlert) return;
    const notificationId = toEntityId(activeReminderAlert.notificationId);
    if (!notificationId) return;
    const reminderProject =
      activeReminderAlert.project ||
      (activeReminderAlert.projectId
        ? { _id: activeReminderAlert.projectId }
        : null);

    void markNotificationReadSilently(notificationId);
    handledReminderNotificationIdsRef.current.add(notificationId);
    queuedReminderNotificationIdsRef.current.delete(notificationId);
    setReminderQueue((prev) =>
      prev.filter((item) => item.notificationId !== notificationId),
    );
    setActiveReminderAlert(null);
    setReminderActionError("");
    if (reminderProject) {
      navigateToProject(reminderProject, {
        fallbackPath: "/client",
        allowGenericEngaged: true,
        title: "Choose Authorized Page",
        message:
          "Project Details is only available to the assigned lead for this project. Choose an authorized page instead.",
      });
    }
  };

  const EXCLUDED_NOTIFICATION_SOURCE = "inventory";

  const fetchNotifications = async (isInitial = false) => {
    try {
      const res = await fetch(
        `/api/notifications?excludeSource=${encodeURIComponent(
          EXCLUDED_NOTIFICATION_SOURCE,
        )}`,
      );
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
      dismissedReminderNotificationIdsRef.current = new Set();
      setReminderQueue([]);
      setActiveReminderAlert(null);
      setReminderActionError("");
    }

    // Always fetch once on mount so the unread dot is in sync across route changes.
    fetchNotifications(true);
  }, [user]);

  useAdaptivePolling(() => fetchNotifications(false), {
    enabled: Boolean(user?._id),
    intervalMs: NOTIFICATION_POLL_INTERVAL_MS,
    hiddenIntervalMs: HIDDEN_NOTIFICATION_POLL_INTERVAL_MS,
    runImmediately: false,
  });

  useEffect(() => {
    const currentUserId = String(user?._id || "");
    if (!currentUserId) return undefined;

    const handleNotificationRealtime = (event) => {
      const recipientId = String(event?.detail?.recipientId || "");
      const portal = String(event?.detail?.portal || "").toLowerCase();
      if (portal === EXCLUDED_NOTIFICATION_SOURCE) {
        return;
      }
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
    const refreshed = reminderQueue.find(
      (item) => item.notificationId === activeReminderAlert.notificationId,
    );
    if (!refreshed) {
      setActiveReminderAlert(null);
      setReminderActionError("");
      return;
    }
    if (refreshed !== activeReminderAlert) {
      setActiveReminderAlert(refreshed);
    }
  }, [activeReminderAlert, reminderQueue]);

  useEffect(() => {
    if (!activeReminderAlert) return;
    const alertId = String(
      activeReminderAlert.notificationId || activeReminderAlert.reminderId || "",
    );
    if (!alertId || reminderSoundIdRef.current === alertId) return;
    reminderSoundIdRef.current = alertId;
    const allowSound = user?.notificationSettings?.sound ?? true;
    playNotificationSound("REMINDER", allowSound).catch(() => {});
  }, [activeReminderAlert, user?.notificationSettings?.sound]);

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch(
        `/api/notifications/read-all?excludeSource=${encodeURIComponent(
          EXCLUDED_NOTIFICATION_SOURCE,
        )}`,
        {
        method: "PATCH",
        },
      );
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setNotificationCount(0);
        setReminderQueue([]);
        setActiveReminderAlert(null);
        setReminderActionError("");
        queuedReminderNotificationIdsRef.current = new Set();
        dismissedReminderNotificationIdsRef.current = new Set();
      }
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  };

  const handleClearNotifications = async () => {
    try {
      const res = await fetch(
        `/api/notifications?excludeSource=${encodeURIComponent(
          EXCLUDED_NOTIFICATION_SOURCE,
        )}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setNotifications([]);
        lastIdsRef.current = new Set();
        setNotificationCount(0);
        setReminderQueue([]);
        setActiveReminderAlert(null);
        setReminderActionError("");
        queuedReminderNotificationIdsRef.current = new Set();
        dismissedReminderNotificationIdsRef.current = new Set();
      }
    } catch (err) {
      console.error("Error clearing notifications:", err);
    }
  };

  const handleMarkSingleRead = async (notification, options = {}) => {
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

        if (handleChatMentionOpen(notification)) {
          return;
        }

        // Intelligent Routing based on notification type
        if (projectId) {
          if (notification.title === "Final Update Posted") {
            // Special Case: End of Day Update for Front Desk
            navigate("/end-of-day");
          } else {
            openProjectFromNotification(notification);
          }
        } else if (type === "SYSTEM") {
          // System notifications with no project context - go to dashboard
          navigate("/client");
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

  const avatarAlt = `${getFullName()} avatar`;
  const avatarUrl = user?.avatarUrl || "";

  const userDepartments = Array.isArray(user?.department)
    ? user.department.map(normalizeDepartmentId)
    : user?.department
      ? [normalizeDepartmentId(user.department)]
      : [];

  const hasProduction = userDepartments.some((d) =>
    PRODUCTION_SUB_DEPARTMENTS.includes(d),
  );
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
        onNavigateHelp={onNavigateHelp}
        onToggleMobileMenu={() => setIsMobileMenuOpen(true)}
        onToggleNotification={() => setIsNotificationOpen(!isNotificationOpen)} // Toggle
        notificationCount={notificationCount}
        engagedCount={engagedCount}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      {/* Notification Modal */}
      <NotificationModal
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        notifications={notifications}
        onMarkAllRead={handleMarkAllAsRead}
        onClearAll={handleClearNotifications}
        onMarkRead={handleMarkSingleRead}
        currentUser={user}
      />

      <ReminderAlertModal
        reminder={activeReminderAlert}
        loading={reminderActionLoading}
        error={reminderActionError}
        onSnooze={() => processReminderAlertAction("snooze")}
        onStop={() => processReminderAlertAction("stop")}
        onComplete={() => processReminderAlertAction("complete")}
        onNavigateProject={handleReminderNavigate}
        onClose={dismissReminderAlert}
      />
      {projectRouteChoiceDialog}

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
              <Link
                to="#"
                className={`drawer-item ${activeView === "help" ? "active" : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  setIsMobileMenuOpen(false);
                  if (typeof onNavigateHelp === "function") {
                    onNavigateHelp();
                  }
                }}
              >
                <HelpIcon width={20} height={20} />
                Help
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
                <div className={`user-profile-mini ${avatarUrl ? "has-image" : ""}`}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={avatarAlt} />
                  ) : (
                    getInitials()
                  )}
                </div>
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
              if (toast.chatKind) {
                dispatchOpenChat({ kind: toast.chatKind });
                removeToast(toast.id);
                return;
              }
              if (toast.notification) {
                removeToast(toast.id);
                openProjectFromNotification(toast.notification);
                return;
              }
              if (toast.projectId) {
                navigateToProject(
                  { _id: toast.projectId },
                  {
                    fallbackPath: "/client",
                    allowGenericEngaged: true,
                    title: "Choose Authorized Page",
                    message:
                      "Project Details is only available to the assigned lead for this project. Choose an authorized page instead.",
                  },
                );
                removeToast(toast.id);
              }
            }}
          />
        ))}
      </div>

      {user?._id && <ChatDock user={user} />}

      {isFrontDeskUser && (
        <DeliveryCalendarFab
          hasFrontDeskFab
          onOpenProject={openProjectFromCalendar}
        />
      )}

      {isFrontDeskUser && (
        <button
          type="button"
          className={`frontdesk-fab ${isFrontDeskOrdersPage ? "active" : ""}`}
          onClick={() => navigate("/frontdesk/orders")}
          aria-label="Open orders management"
        >
          <span className="frontdesk-fab-icon">
            <ClipboardListIcon />
          </span>
          <span className="frontdesk-fab-label">Orders</span>
        </button>
      )}

      {/* Page Content */}
      <main className="layout-content">{children}</main>
    </div>
  );
};

export default Layout;
