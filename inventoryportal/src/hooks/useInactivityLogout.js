import { useEffect, useRef } from "react";
import { setSessionTimeoutNotice } from "../utils/sessionTimeoutNotice";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_KEEPALIVE_MS = 60 * 1000;
const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "mousedown",
  "mousemove",
  "keydown",
  "click",
  "wheel",
  "scroll",
  "touchstart",
  "touchmove",
  "focusin",
];

const useInactivityLogout = ({
  enabled = true,
  timeout = DEFAULT_TIMEOUT_MS,
  onLogout,
  keepalive = true,
  keepaliveInterval = DEFAULT_KEEPALIVE_MS,
} = {}) => {
  const timeoutRef = useRef(null);
  const keepaliveRef = useRef(0);
  const lastActivityAtRef = useRef(Date.now());
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    const clearTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = null;
    };

    if (!enabled) {
      clearTimer();
      isLoggingOutRef.current = false;
      return undefined;
    }

    const triggerTimeoutLogout = async () => {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;
      clearTimer();
      setSessionTimeoutNotice(timeout);

      try {
        if (typeof onLogout === "function") {
          await onLogout({ reason: "timeout" });
        }
      } finally {
        isLoggingOutRef.current = false;
      }
    };

    const scheduleLogout = (activityAt) => {
      if (isLoggingOutRef.current) return;

      const now = Date.now();
      const remainingMs = timeout - (now - activityAt);
      clearTimer();

      if (remainingMs <= 0) {
        void triggerTimeoutLogout();
        return;
      }

      timeoutRef.current = window.setTimeout(() => {
        void triggerTimeoutLogout();
      }, remainingMs);
    };

    const sendKeepalive = () => {
      if (!keepalive || isLoggingOutRef.current) return;
      const now = Date.now();
      if (now - keepaliveRef.current < keepaliveInterval) return;
      keepaliveRef.current = now;
      fetch("/api/auth/me?source=inventory", {
        credentials: "include",
        cache: "no-store",
      }).catch(() => {});
    };

    const registerActivity = () => {
      if (isLoggingOutRef.current) return;
      const now = Date.now();
      lastActivityAtRef.current = now;
      scheduleLogout(now);
      sendKeepalive();
    };

    const handleWindowReturn = () => {
      if (isLoggingOutRef.current) return;

      const now = Date.now();
      const lastActivityAt = lastActivityAtRef.current || now;
      const idleMs = now - lastActivityAt;

      if (idleMs >= timeout) {
        void triggerTimeoutLogout();
        return;
      }

      lastActivityAtRef.current = now;
      scheduleLogout(now);
      sendKeepalive();
    };

    isLoggingOutRef.current = false;
    lastActivityAtRef.current = Date.now();
    scheduleLogout(lastActivityAtRef.current);
    sendKeepalive();

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, registerActivity, true);
    });
    window.addEventListener("focus", handleWindowReturn, true);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleWindowReturn();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility, true);

    return () => {
      clearTimer();
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, registerActivity, true);
      });
      window.removeEventListener("focus", handleWindowReturn, true);
      document.removeEventListener("visibilitychange", handleVisibility, true);
    };
  }, [enabled, keepalive, keepaliveInterval, onLogout, timeout]);

  return null;
};

export default useInactivityLogout;
