import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  initNotificationSound,
  playNotificationSound,
} from "../utils/notificationSound";

const useNotifications = ({ soundEnabled = true } = {}) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs to track state avoiding stale closures in setInterval
  const previousUnreadCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axios.get("/api/notifications", {
        withCredentials: true,
      });

      const currentNotifications = res.data;
      const newUnreadCount = currentNotifications.filter(
        (n) => !n.isRead,
      ).length;

      setNotifications(currentNotifications);
      setUnreadCount(newUnreadCount);

      // Trigger toast logic
      if (!isFirstLoadRef.current) {
        if (newUnreadCount > previousUnreadCountRef.current) {
          const latestInfo = currentNotifications.find((n) => !n.isRead);
          if (latestInfo) {
            playNotificationSound(latestInfo.type, soundEnabled).catch(() => {});
            toast(latestInfo.message, {
              icon: "\u{1F514}",
              style: {
                borderRadius: "10px",
                background: "#333",
                color: "#fff",
              },
            });
          }
        }
      } else {
        isFirstLoadRef.current = false;
      }

      previousUnreadCountRef.current = newUnreadCount;
      setLoading(false);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      setLoading(false);
    }
  }, [soundEnabled]);

  useEffect(() => {
    initNotificationSound();
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Poll every 5 seconds
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await axios.patch(
        `/api/notifications/${id}/read`,
        {},
        { withCredentials: true },
      );
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((prev) => {
        const newCount = Math.max(0, prev - 1);
        previousUnreadCountRef.current = newCount;
        return newCount;
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.patch(
        "/api/notifications/read-all",
        {},
        { withCredentials: true },
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(() => {
        previousUnreadCountRef.current = 0;
        return 0;
      });
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const clearNotifications = async () => {
    try {
      await axios.delete("/api/notifications", {
        withCredentials: true,
      });
      setNotifications([]);
      setUnreadCount(() => {
        previousUnreadCountRef.current = 0;
        return 0;
      });
    } catch (error) {
      console.error("Error clearing notifications:", error);
    }
  };

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    refreshPermissions: fetchNotifications,
  };
};

export default useNotifications;
