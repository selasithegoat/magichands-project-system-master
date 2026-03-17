import { useEffect, useRef } from "react";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_KEEPALIVE_MS = 60 * 1000;

const useInactivityLogout = ({
  enabled = true,
  timeout = DEFAULT_TIMEOUT_MS,
  onLogout,
  keepalive = true,
  keepaliveInterval = DEFAULT_KEEPALIVE_MS,
} = {}) => {
  const timeoutRef = useRef(null);
  const keepaliveRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return undefined;
    }

    const clearTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = null;
    };

    const startTimer = () => {
      clearTimer();
      timeoutRef.current = setTimeout(() => {
        clearTimer();
        if (typeof onLogout === "function") {
          onLogout();
        }
      }, timeout);
    };

    const sendKeepalive = () => {
      if (!keepalive) return;
      const now = Date.now();
      if (now - keepaliveRef.current < keepaliveInterval) return;
      keepaliveRef.current = now;
      fetch("/api/auth/me?source=inventory", {
        credentials: "include",
        cache: "no-store",
      }).catch(() => {});
    };

    const resetTimer = () => {
      startTimer();
      sendKeepalive();
    };

    const events = [
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

    events.forEach((event) => {
      window.addEventListener(event, resetTimer, true);
    });
    window.addEventListener("focus", resetTimer, true);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        resetTimer();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility, true);

    startTimer();
    sendKeepalive();

    return () => {
      clearTimer();
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer, true);
      });
      window.removeEventListener("focus", resetTimer, true);
      document.removeEventListener("visibilitychange", handleVisibility, true);
    };
  }, [enabled, keepalive, keepaliveInterval, onLogout, timeout]);

  return null;
};

export default useInactivityLogout;
