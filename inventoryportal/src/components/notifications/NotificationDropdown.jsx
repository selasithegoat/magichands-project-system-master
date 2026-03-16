import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmDialog from "../ui/ConfirmDialog";
import {
  AlertCircleIcon,
  BellIcon,
  CheckIcon,
  FileTextIcon,
  RecordsIcon,
  ShieldCheckIcon,
} from "../icons/Icons";
import "./NotificationDropdown.css";

const formatTime = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return date.toLocaleDateString("en-US");
};

const getNotificationTypeMeta = (type) => {
  switch (type) {
    case "ASSIGNMENT":
      return {
        label: "Task",
        className: "assignment",
        icon: <FileTextIcon className="notification-type-icon" />,
      };
    case "ACTIVITY":
      return {
        label: "Alert",
        className: "activity",
        icon: <AlertCircleIcon className="notification-type-icon" />,
      };
    case "UPDATE":
      return {
        label: "Update",
        className: "update",
        icon: <RecordsIcon className="notification-type-icon" />,
      };
    case "ACCEPTANCE":
      return {
        label: "Accepted",
        className: "acceptance",
        icon: <CheckIcon className="notification-type-icon" />,
      };
    case "REMINDER":
      return {
        label: "Reminder",
        className: "reminder",
        icon: <BellIcon className="notification-type-icon" />,
      };
    default:
      return {
        label: "System",
        className: "system",
        icon: <ShieldCheckIcon className="notification-type-icon" />,
      };
  }
};

const resolveNotificationRoute = (notification) => {
  const content = `${notification?.title || ""} ${
    notification?.message || ""
  }`.toLowerCase();

  if (content.includes("purchase order") || content.includes("po-")) {
    return "purchase-orders";
  }
  if (content.includes("inventory record") || content.includes("low stock")) {
    return "inventory-records";
  }
  if (content.includes("stock transaction")) {
    return "stock-transactions";
  }
  if (content.includes("supplier")) {
    return "suppliers";
  }
  if (content.includes("client item")) {
    return "client-items";
  }
  if (content.includes("report")) {
    return "reports";
  }
  if (content.includes("category")) {
    return "inventory-types";
  }
  return "";
};

const NotificationDropdown = ({
  onClose,
  notifications,
  loading,
  markAsRead,
  markAllAsRead,
  clearNotifications,
  onNavigate,
}) => {
  const dropdownRef = useRef(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !item.isRead),
    [notifications],
  );
  const readNotifications = useMemo(
    () => notifications.filter((item) => item.isRead),
    [notifications],
  );

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current?.contains(event.target)) return;
      if (event.target?.closest?.("[data-notification-root]")) return;
      onClose?.();
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleItemClick = (notification) => {
    if (!notification?._id) return;
    markAsRead?.(notification._id);
    const target = resolveNotificationRoute(notification);
    if (target && onNavigate) {
      onNavigate(target);
    }
    onClose?.();
  };

  const handleClearAll = async () => {
    await clearNotifications?.();
    setConfirmOpen(false);
    onClose?.();
  };

  return (
    <>
      <div className="notification-dropdown" ref={dropdownRef}>
        <div className="notification-header">
          <h3>Notifications</h3>
          <div className="notification-actions">
            <button
              type="button"
              onClick={markAllAsRead}
              className="text-btn"
              disabled={unreadNotifications.length === 0}
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="text-btn danger"
              disabled={notifications.length === 0}
            >
              Clear all
            </button>
          </div>
        </div>

        <div className="notification-list">
          {loading ? (
            <div className="notification-empty">Loading notifications...</div>
          ) : notifications.length === 0 ? (
            <div className="notification-empty">No notifications yet.</div>
          ) : (
            <>
              {unreadNotifications.length > 0 && (
                <>
                  <div className="notification-section-header">New</div>
                  {unreadNotifications.map((notification) => {
                    const typeMeta = getNotificationTypeMeta(notification.type);
                    return (
                      <button
                        type="button"
                        key={notification._id}
                        className="notification-item unread"
                        onClick={() => handleItemClick(notification)}
                      >
                        <div
                          className={`notification-icon ${typeMeta.className}`}
                          title={typeMeta.label}
                          aria-label={typeMeta.label}
                        >
                          {typeMeta.icon}
                        </div>
                        <div className="notification-content">
                          <p className="notification-title">
                            {notification.title}
                          </p>
                          <p className="notification-message">
                            {notification.message}
                          </p>
                          <span className="notification-time">
                            {formatTime(notification.createdAt)}
                          </span>
                        </div>
                        <span className="unread-dot" />
                      </button>
                    );
                  })}
                </>
              )}

              {readNotifications.length > 0 && (
                <>
                  <div className="notification-section-header">Earlier</div>
                  {readNotifications.map((notification) => {
                    const typeMeta = getNotificationTypeMeta(notification.type);
                    return (
                      <button
                        type="button"
                        key={notification._id}
                        className="notification-item"
                        onClick={() => handleItemClick(notification)}
                      >
                        <div
                          className={`notification-icon ${typeMeta.className}`}
                          title={typeMeta.label}
                          aria-label={typeMeta.label}
                        >
                          {typeMeta.icon}
                        </div>
                        <div className="notification-content">
                          <p className="notification-title">
                            {notification.title}
                          </p>
                          <p className="notification-message">
                            {notification.message}
                          </p>
                          <span className="notification-time">
                            {formatTime(notification.createdAt)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Clear notifications?"
        message="This will remove all notifications from your list."
        confirmText="Clear"
        onConfirm={handleClearAll}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
};

export default NotificationDropdown;
