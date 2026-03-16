import { useCallback, useEffect, useState } from "react";
import { fetchInventory } from "../utils/inventoryApi";

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

const useNotifications = ({ enabled = true, userId = "" } = {}) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const syncUnreadCount = useCallback((items) => {
    const unread = items.filter((item) => !item.isRead).length;
    setUnreadCount(unread);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await fetchInventory("/api/notifications?source=inventory");
      const list = Array.isArray(data) ? data : [];
      setNotifications(list);
      syncUnreadCount(list);
    } catch (error) {
      console.error("Failed to load notifications", error);
    } finally {
      setLoading(false);
    }
  }, [enabled, syncUnreadCount]);

  const markAsRead = useCallback(
    async (notificationId) => {
      const normalizedId = toEntityId(notificationId);
      if (!normalizedId) return;

      try {
        await fetchInventory(`/api/notifications/${normalizedId}/read`, {
          method: "PATCH",
          body: JSON.stringify({}),
        });

        setNotifications((prev) => {
          const next = prev.map((item) =>
            toEntityId(item._id) === normalizedId
              ? { ...item, isRead: true }
              : item,
          );
          syncUnreadCount(next);
          return next;
        });
      } catch (error) {
        console.error("Failed to mark notification as read", error);
      }
    },
    [syncUnreadCount],
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await fetchInventory("/api/notifications/read-all?source=inventory", {
        method: "PATCH",
        body: JSON.stringify({}),
      });

      setNotifications((prev) => prev.map((item) => ({ ...item, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to mark all notifications as read", error);
    }
  }, []);

  const clearNotifications = useCallback(async () => {
    try {
      await fetchInventory("/api/notifications?source=inventory", {
        method: "DELETE",
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error("Failed to clear notifications", error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return undefined;
    }

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [enabled, fetchNotifications]);

  useEffect(() => {
    if (!enabled || !userId) return undefined;
    const currentUserId = String(userId || "");
    const handleNotificationRealtime = (event) => {
      const recipientId = String(event?.detail?.recipientId || "");
      const portal = String(event?.detail?.portal || "");
      if (portal && portal !== "inventory") return;
      if (recipientId && recipientId !== currentUserId) return;
      fetchNotifications();
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
  }, [enabled, fetchNotifications, userId]);

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    refresh: fetchNotifications,
  };
};

export default useNotifications;
