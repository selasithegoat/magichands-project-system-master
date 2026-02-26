import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  initNotificationSound,
  playNotificationSound,
} from "../utils/notificationSound";

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

const useNotifications = ({ soundEnabled = true, userId = "" } = {}) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [reminderQueue, setReminderQueue] = useState([]);
  const [activeReminderAlert, setActiveReminderAlert] = useState(null);
  const [reminderActionLoading, setReminderActionLoading] = useState(false);
  const [reminderActionError, setReminderActionError] = useState("");

  const previousUnreadCountRef = useRef(0);
  const isFirstLoadRef = useRef(true);
  const queuedReminderNotificationIdsRef = useRef(new Set());
  const handledReminderNotificationIdsRef = useRef(new Set());

  const syncReminderQueueFromNotifications = useCallback((notificationList = []) => {
    const unreadReminderNotifications = notificationList
      .filter((item) => !item?.isRead && item?.type === "REMINDER")
      .map((item) => ({
        notificationId: toEntityId(item?._id),
        reminderId: toEntityId(item?.reminder),
        title: String(item?.title || "Reminder").trim(),
        message: String(item?.message || "").trim(),
        createdAt: item?.createdAt || null,
        projectId: toEntityId(item?.project?._id || item?.project),
      }))
      .filter((item) => Boolean(item.notificationId && item.reminderId))
      .sort(
        (a, b) =>
          new Date(a.createdAt || 0).getTime() -
          new Date(b.createdAt || 0).getTime(),
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
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await axios.get("/api/notifications", {
        withCredentials: true,
      });

      const currentNotifications = Array.isArray(res.data) ? res.data : [];
      const newUnreadCount = currentNotifications.filter((n) => !n.isRead).length;

      setNotifications(currentNotifications);
      setUnreadCount(newUnreadCount);
      syncReminderQueueFromNotifications(currentNotifications);

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
  }, [soundEnabled, syncReminderQueueFromNotifications]);

  const removeReminderAlert = useCallback((notificationId) => {
    const normalizedId = String(notificationId || "");
    if (!normalizedId) return;

    queuedReminderNotificationIdsRef.current.delete(normalizedId);
    setReminderQueue((prev) =>
      prev.filter((item) => item.notificationId !== normalizedId),
    );
    setActiveReminderAlert((prev) =>
      prev?.notificationId === normalizedId ? null : prev,
    );
    setReminderActionError("");
  }, []);

  const markNotificationReadSilently = useCallback(async (notificationId) => {
    const normalizedId = String(notificationId || "");
    if (!normalizedId) return false;

    try {
      await axios.patch(
        `/api/notifications/${normalizedId}/read`,
        {},
        { withCredentials: true },
      );

      setNotifications((prev) =>
        prev.map((item) =>
          toEntityId(item?._id) === normalizedId ? { ...item, isRead: true } : item,
        ),
      );
      setUnreadCount((prev) => {
        const next = Math.max(0, prev - 1);
        previousUnreadCountRef.current = next;
        return next;
      });

      return true;
    } catch (error) {
      console.error("Error marking reminder notification as read:", error);
      return false;
    }
  }, []);

  const handleReminderAlertAction = useCallback(
    async (actionType) => {
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
          axios.patch(`/api/reminders/${reminderId}${endpoint}`, body, {
            withCredentials: true,
          });

        if (actionType === "snooze") {
          await request("/snooze", { minutes: 60 });
        } else if (actionType === "stop") {
          try {
            await request("/cancel");
          } catch (cancelError) {
            if (cancelError?.response?.status === 403) {
              await request("/complete");
            } else {
              throw cancelError;
            }
          }
        } else {
          await request("/complete");
        }

        await markNotificationReadSilently(notificationId);
        handledReminderNotificationIdsRef.current.add(notificationId);
        removeReminderAlert(notificationId);
        setActiveReminderAlert(null);
      } catch (error) {
        const message =
          error?.response?.data?.message ||
          error?.message ||
          "Failed to update reminder.";
        setReminderActionError(message);
      } finally {
        setReminderActionLoading(false);
      }
    },
    [
      activeReminderAlert,
      markNotificationReadSilently,
      reminderActionLoading,
      removeReminderAlert,
    ],
  );

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

  useEffect(() => {
    initNotificationSound();
  }, []);

  useEffect(() => {
    fetchNotifications();

    const interval = setInterval(fetchNotifications, 5000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const currentUserId = String(userId || "");
    if (!currentUserId) return undefined;

    const handleNotificationRealtime = (event) => {
      const recipientId = String(event?.detail?.recipientId || "");
      if (recipientId && recipientId !== currentUserId) {
        return;
      }
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
  }, [fetchNotifications, userId]);

  useEffect(() => {
    previousUnreadCountRef.current = 0;
    isFirstLoadRef.current = true;
    queuedReminderNotificationIdsRef.current = new Set();
    handledReminderNotificationIdsRef.current = new Set();
    setReminderQueue([]);
    setActiveReminderAlert(null);
    setReminderActionError("");
  }, [userId]);

  const markAsRead = async (id) => {
    const ok = await markNotificationReadSilently(id);
    if (ok) {
      removeReminderAlert(id);
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
      setReminderQueue([]);
      setActiveReminderAlert(null);
      setReminderActionError("");
      queuedReminderNotificationIdsRef.current = new Set();
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
      setReminderQueue([]);
      setActiveReminderAlert(null);
      setReminderActionError("");
      queuedReminderNotificationIdsRef.current = new Set();
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
    activeReminderAlert,
    reminderActionLoading,
    reminderActionError,
    handleReminderAlertAction,
  };
};

export default useNotifications;
