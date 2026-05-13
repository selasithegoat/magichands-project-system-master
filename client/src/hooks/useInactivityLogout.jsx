import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearPersistedFilterState } from "../utils/filterPersistence";
import { setSessionTimeoutNotice } from "../utils/sessionTimeoutNotice";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "mousedown",
  "mousemove",
  "pointermove",
  "keydown",
  "input",
  "wheel",
  "scroll",
  "touchstart",
  "touchmove",
  "focusin",
  "click",
];

const getKeepAliveIntervalMs = (timeout) =>
  Math.max(15 * 1000, Math.min(60 * 1000, Math.floor(timeout / 2)));

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
  const lastKeepAliveAtRef = useRef(Date.now());
  const keepAliveInFlightRef = useRef(false);
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

  const refreshSession = useCallback(async () => {
    if (
      !enabledRef.current ||
      isLoggingOutRef.current ||
      keepAliveInFlightRef.current
    ) {
      return;
    }

    keepAliveInFlightRef.current = true;
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });
      if (!enabledRef.current || isLoggingOutRef.current) return;

      const sessionUser = res.ok ? await res.json().catch(() => null) : null;
      if (!res.ok || !sessionUser?._id) {
        void logout({ reason: "expired" });
      }
    } catch (error) {
      console.error("Session keepalive failed", error);
    } finally {
      keepAliveInFlightRef.current = false;
    }
  }, [logout]);

  const refreshSessionIfNeeded = useCallback(
    (now = Date.now()) => {
      if (!enabledRef.current || isLoggingOutRef.current) return;

      const elapsedMs = now - lastKeepAliveAtRef.current;
      if (elapsedMs < getKeepAliveIntervalMs(timeout)) return;

      lastKeepAliveAtRef.current = now;
      void refreshSession();
    },
    [refreshSession, timeout],
  );

  const registerActivity = useCallback(() => {
    if (!enabledRef.current || isLoggingOutRef.current) return;

    const now = Date.now();
    lastActivityAtRef.current = now;
    scheduleLogout(now);
    refreshSessionIfNeeded(now);
  }, [refreshSessionIfNeeded, scheduleLogout]);

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
    refreshSessionIfNeeded(now);
  }, [logout, refreshSessionIfNeeded, scheduleLogout, timeout]);

  useEffect(() => {
    if (!enabled) {
      clearLogoutTimer();
      return undefined;
    }

    isLoggingOutRef.current = false;
    lastActivityAtRef.current = Date.now();
    lastKeepAliveAtRef.current = Date.now();
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
  }, [
    clearLogoutTimer,
    enabled,
    handleWindowReturn,
    registerActivity,
    scheduleLogout,
  ]);

  return null;
};

export default useInactivityLogout;
