import { useEffect, useRef } from "react";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const useInactivityLogout = ({
  enabled = true,
  timeout = DEFAULT_TIMEOUT_MS,
  onLogout,
} = {}) => {
  const timeoutRef = useRef(null);

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

    const resetTimer = () => {
      startTimer();
    };

    const events = [
      "pointerdown",
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "focusin",
      "click",
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

    return () => {
      clearTimer();
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer, true);
      });
      window.removeEventListener("focus", resetTimer, true);
      document.removeEventListener("visibilitychange", handleVisibility, true);
    };
  }, [enabled, onLogout, timeout]);

  return null;
};

export default useInactivityLogout;
