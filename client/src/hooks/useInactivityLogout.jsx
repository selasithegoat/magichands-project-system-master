import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { clearPersistedFilterState } from "../utils/filterPersistence";
import {
  setSessionExpiredNotice,
  setSessionTimeoutNotice,
} from "../utils/sessionTimeoutNotice";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "keydown",
  "input",
  "wheel",
  "touchstart",
];

const getKeepAliveIntervalMs = (timeout) =>
  Math.max(15 * 1000, Math.min(60 * 1000, Math.floor(timeout / 2)));

const useInactivityLogout = (
  timeout = 5 * 60 * 1000,
  onLoggedOut,
  enabled = true,
  sessionActive = enabled,
) => {
  // Default: 5 minutes
  const navigate = useNavigate();
  const location = useLocation();
  const timeoutRef = useRef(null);
  const enabledRef = useRef(enabled);
  const sessionActiveRef = useRef(sessionActive);
  const locationPathRef = useRef(location.pathname);
  const onLoggedOutRef = useRef(onLoggedOut);
  const lastActivityAtRef = useRef(Date.now());
  const lastKeepAliveAtRef = useRef(Date.now());
  const keepAliveInFlightRef = useRef(false);
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    enabledRef.current = enabled;
    sessionActiveRef.current = sessionActive;
    if (!sessionActive) {
      isLoggingOutRef.current = false;
    }
  }, [enabled, sessionActive]);

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
      if (
        !sessionActiveRef.current ||
        isLoggingOutRef.current ||
        (reason === "timeout" && !enabledRef.current)
      ) {
        return;
      }

      isLoggingOutRef.current = true;
      clearLogoutTimer();

      if (reason === "timeout") {
        setSessionTimeoutNotice(timeout);
      } else if (reason === "expired") {
        setSessionExpiredNotice();
      }

      if (typeof onLoggedOutRef.current === "function") {
        onLoggedOutRef.current({ reason });
      }

      clearPersistedFilterState();
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
          keepalive: true,
        });
      } catch (error) {
        console.error("Logout failed", error);
      }

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
      !sessionActiveRef.current ||
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
      if (!sessionActiveRef.current || isLoggingOutRef.current) return;

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

  const registerActivity = useCallback((event) => {
    if (!enabledRef.current || isLoggingOutRef.current) return;
    if (event?.isTrusted === false) return;

    const now = Date.now();
    lastActivityAtRef.current = now;
    scheduleLogout(now);
    refreshSessionIfNeeded(now);
  }, [refreshSessionIfNeeded, scheduleLogout]);

  const handleWindowReturn = useCallback(() => {
    if (!sessionActiveRef.current || isLoggingOutRef.current) return;

    const now = Date.now();
    const lastActivityAt = lastActivityAtRef.current || now;
    const idleMs = now - lastActivityAt;

    if (enabledRef.current && idleMs >= timeout) {
      void logout({ reason: "timeout" });
      return;
    }

    if (enabledRef.current) {
      lastActivityAtRef.current = now;
      scheduleLogout(now);
    }
    lastKeepAliveAtRef.current = now;
    void refreshSession();
  }, [logout, refreshSession, scheduleLogout, timeout]);

  useEffect(() => {
    if (!sessionActive) {
      clearLogoutTimer();
      return undefined;
    }

    isLoggingOutRef.current = false;
    lastActivityAtRef.current = Date.now();
    lastKeepAliveAtRef.current = Date.now();
    if (enabled) {
      scheduleLogout(lastActivityAtRef.current);
    } else {
      clearLogoutTimer();
    }

    void refreshSession();
    const heartbeatId = window.setInterval(() => {
      lastKeepAliveAtRef.current = Date.now();
      void refreshSession();
    }, getKeepAliveIntervalMs(timeout));

    if (enabled) {
      ACTIVITY_EVENTS.forEach((event) => {
        window.addEventListener(event, registerActivity, true);
      });
    }
    window.addEventListener("focus", handleWindowReturn, true);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleWindowReturn();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility, true);

    return () => {
      clearLogoutTimer();
      window.clearInterval(heartbeatId);
      if (enabled) {
        ACTIVITY_EVENTS.forEach((event) => {
          window.removeEventListener(event, registerActivity, true);
        });
      }
      window.removeEventListener("focus", handleWindowReturn, true);
      document.removeEventListener("visibilitychange", handleVisibility, true);
    };
  }, [
    clearLogoutTimer,
    enabled,
    handleWindowReturn,
    refreshSession,
    registerActivity,
    scheduleLogout,
    sessionActive,
    timeout,
  ]);

  return null;
};

export default useInactivityLogout;
