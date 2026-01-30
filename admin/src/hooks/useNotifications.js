import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";

const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Refs to track state avoiding stale closures in setInterval
  const previousUnreadCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/notifications", {
        withCredentials: true,
      });

      const currentNotifications = res.data;
      const newUnreadCount = currentNotifications.filter(
        (n) => !n.isRead,
      ).length;

      setNotifications(currentNotifications);
      setUnreadCount(newUnreadCount);

      // Trigger Toast logic
      if (!isFirstLoadRef.current) {
        // Only check for toasts if this is NOT the first load
        if (newUnreadCount > previousUnreadCountRef.current) {
          const latestInfo = currentNotifications.find((n) => !n.isRead);
          if (latestInfo) {
            toast(latestInfo.message, {
              icon: "🔔",
              style: {
                borderRadius: "10px",
                background: "#333",
                color: "#fff",
              },
            });
          }
        }
      } else {
        // Mark first load as done
        isFirstLoadRef.current = false;
        setLoading(false);
      }

      previousUnreadCountRef.current = newUnreadCount;

      // We don't necessarily need to set loading to false every time, but it's fine.
      if (loading) setLoading(false);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      setLoading(false);
    }
  }, []); // Empty dependency array as references are stable

  useEffect(() => {
    // Initial fetch
    fetchNotifications();

    // Poll every 5 seconds
    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await axios.patch(
        `http://localhost:5000/api/notifications/${id}/read`,
        {},
        { withCredentials: true },
      );
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
      );
      // Update unread count manually to reflect immediate UI change
      // Note: The next poll will align everything, but this gives instant feedback
      setUnreadCount((prev) => {
        const newCount = Math.max(0, prev - 1);
        previousUnreadCountRef.current = newCount; // Update ref to avoid false positive toast on next poll if count drops
        return newCount;
      });
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await axios.patch(
        "http://localhost:5000/api/notifications/read-all",
        {},
        { withCredentials: true },
      );
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount((prev) => {
        previousUnreadCountRef.current = 0;
        return 0;
      });
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  };

  const clearNotifications = async () => {
    try {
      await axios.delete("http://localhost:5000/api/notifications", {
        withCredentials: true,
      });
      setNotifications([]);
      setUnreadCount((prev) => {
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
