import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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

  useEffect(() => {
    enabledRef.current = enabled;
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

  const logout = useCallback(async () => {
    if (!enabledRef.current) return;

    try {
      // Call logout endpoint to clear cookies
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    } catch (error) {
      console.error("Logout failed", error);
    }

    if (!enabledRef.current) return;

    if (typeof onLoggedOutRef.current === "function") {
      onLoggedOutRef.current();
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    if (locationPathRef.current !== "/login") {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const resetTimer = useCallback(() => {
    if (!enabledRef.current) return;

    clearLogoutTimer();
    timeoutRef.current = setTimeout(logout, timeout);
  }, [clearLogoutTimer, logout, timeout]);

  useEffect(() => {
    if (!enabled) {
      clearLogoutTimer();
      return undefined;
    }

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

    // Add event listeners
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

    // Start initial timer
    resetTimer();

    // Cleanup
    return () => {
      clearLogoutTimer();
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer, true);
      });
      window.removeEventListener("focus", resetTimer, true);
      document.removeEventListener("visibilitychange", handleVisibility, true);
    };
  }, [clearLogoutTimer, enabled, resetTimer]);

  return null; // Hook doesn't render anything
};

export default useInactivityLogout;
