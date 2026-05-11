import { useEffect, useRef } from "react";

const REALTIME_STATUS_EVENT = "mh:realtime-status";

const publishRealtimeStatus = (patch = {}) => {
  if (typeof window === "undefined") return;

  const now = Date.now();
  const detail = {
    ...(window.__MH_REALTIME_STATUS__ || {}),
    ...patch,
    updatedAt: now,
  };
  window.__MH_REALTIME_STATUS__ = detail;
  window.dispatchEvent(new CustomEvent(REALTIME_STATUS_EVENT, { detail }));
};

const useRealtimeClient = (enabled = true) => {
  const sourceRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
        publishRealtimeStatus({
          connected: false,
          lastDisconnectedAt: Date.now(),
        });
      }
      return;
    }

    if (sourceRef.current) return;

    const source = new EventSource("/api/realtime", {
      withCredentials: true,
    });
    sourceRef.current = source;

    const handleOpen = () => {
      publishRealtimeStatus({
        connected: true,
        lastConnectedAt: Date.now(),
      });
    };

    const handleError = () => {
      publishRealtimeStatus({
        connected: false,
        lastErrorAt: Date.now(),
      });
    };

    const handleChange = (event) => {
      let detail = {};
      try {
        detail = event?.data ? JSON.parse(event.data) : {};
      } catch {
        detail = {};
      }
      window.dispatchEvent(
        new CustomEvent("mh:data-changed", { detail }),
      );
    };

    const handleNotificationChange = (event) => {
      let detail = {};
      try {
        detail = event?.data ? JSON.parse(event.data) : {};
      } catch {
        detail = {};
      }
      window.dispatchEvent(
        new CustomEvent("mh:notifications-changed", { detail }),
      );
    };

    const handleChatChange = (event) => {
      let detail = {};
      try {
        detail = event?.data ? JSON.parse(event.data) : {};
      } catch {
        detail = {};
      }
      window.dispatchEvent(
        new CustomEvent("mh:chat-changed", { detail }),
      );
    };

    const handlePresenceChange = (event) => {
      let detail = {};
      try {
        detail = event?.data ? JSON.parse(event.data) : {};
      } catch {
        detail = {};
      }
      window.dispatchEvent(
        new CustomEvent("mh:presence-changed", { detail }),
      );
    };

    source.addEventListener("open", handleOpen);
    source.addEventListener("error", handleError);
    source.addEventListener("data_changed", handleChange);
    source.addEventListener("notification_changed", handleNotificationChange);
    source.addEventListener("chat_changed", handleChatChange);
    source.addEventListener("presence_changed", handlePresenceChange);

    return () => {
      source.removeEventListener("open", handleOpen);
      source.removeEventListener("error", handleError);
      source.removeEventListener("data_changed", handleChange);
      source.removeEventListener("notification_changed", handleNotificationChange);
      source.removeEventListener("chat_changed", handleChatChange);
      source.removeEventListener("presence_changed", handlePresenceChange);
      source.close();
      sourceRef.current = null;
      publishRealtimeStatus({
        connected: false,
        lastDisconnectedAt: Date.now(),
      });
    };
  }, [enabled]);
};

export default useRealtimeClient;
