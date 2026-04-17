import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearPersistedFilterState } from "../utils/filterPersistence";
import { setSessionTimeoutNotice } from "../utils/sessionTimeoutNotice";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "focusin",
  "click",
];

const useInactivityLogout = (
  timeout = 5 * 60 * 1000,
  onLoggedOut,
  enabled = true,
) => {
  // Default: 5 minutes
  const navigate = useNavigate();
  const location = useLocation();
  const timeoutRef = useRef(null);
  const enabledRef = useRef(enabled);
  const locationPathRef = useRef(location.pathname);
  const onLoggedOutRef = useRef(onLoggedOut);
  const lastActivityAtRef = useRef(Date.now());
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      isLoggingOutRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    locationPathRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    onLoggedOutRef.current = onLoggedOut;
  }, [onLoggedOut]);

  const clearLogoutTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const logout = useCallback(
    async ({ reason = "manual" } = {}) => {
      if (!enabledRef.current || isLoggingOutRef.current) return;

      isLoggingOutRef.current = true;
      clearLogoutTimer();

      if (reason === "timeout") {
        setSessionTimeoutNotice(timeout);
      }

      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          keepalive: true,
        });
      } catch (error) {
        console.error("Logout failed", error);
      }

      if (typeof onLoggedOutRef.current === "function") {
        onLoggedOutRef.current({ reason });
      }

      clearPersistedFilterState();
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      if (locationPathRef.current !== "/login") {
        navigate("/login", { replace: true });
      }
    },
    [clearLogoutTimer, navigate, timeout],
  );

  const scheduleLogout = useCallback(
    (activityAt) => {
      if (!enabledRef.current || isLoggingOutRef.current) return;

      const now = Date.now();
      const remainingMs = timeout - (now - activityAt);
      clearLogoutTimer();

      if (remainingMs <= 0) {
        void logout({ reason: "timeout" });
        return;
      }

      timeoutRef.current = window.setTimeout(() => {
        void logout({ reason: "timeout" });
      }, remainingMs);
    },
    [clearLogoutTimer, logout, timeout],
  );

  const registerActivity = useCallback(() => {
    if (!enabledRef.current || isLoggingOutRef.current) return;

    const now = Date.now();
    lastActivityAtRef.current = now;
    scheduleLogout(now);
  }, [scheduleLogout]);

  const handleWindowReturn = useCallback(() => {
    if (!enabledRef.current || isLoggingOutRef.current) return;

    const now = Date.now();
    const lastActivityAt = lastActivityAtRef.current || now;
    const idleMs = now - lastActivityAt;

    if (idleMs >= timeout) {
      void logout({ reason: "timeout" });
      return;
    }

    lastActivityAtRef.current = now;
    scheduleLogout(now);
  }, [logout, scheduleLogout, timeout]);

  useEffect(() => {
    if (!enabled) {
      clearLogoutTimer();
      return undefined;
    }

    isLoggingOutRef.current = false;
    lastActivityAtRef.current = Date.now();
    scheduleLogout(lastActivityAtRef.current);

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
      clearLogoutTimer();
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, registerActivity, true);
      });
      window.removeEventListener("focus", handleWindowReturn, true);
      document.removeEventListener("visibilitychange", handleVisibility, true);
    };
  }, [clearLogoutTimer, enabled, handleWindowReturn, registerActivity, scheduleLogout]);

  return null;
};

export default useInactivityLogout;
