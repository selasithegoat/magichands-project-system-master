import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const useInactivityLogout = (timeout = 1800000) => {
  // Default: 30 minutes
  const navigate = useNavigate();
  const timeoutRef = useRef(null);

  const logout = async () => {
    try {
      // Call logout endpoint to clear cookies
      await fetch("/api/auth/logout", { method: "POST" });

      // Clear local storage if used
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // Redirect to login
      navigate("/login");
    } catch (error) {
      console.error("Logout failed", error);
      // Force redirect even if API fails
      navigate("/login");
    }
  };

  const resetTimer = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(logout, timeout);
  };

  useEffect(() => {
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer, true);
      });
      window.removeEventListener("focus", resetTimer, true);
      document.removeEventListener("visibilitychange", handleVisibility, true);
    };
  }, []);

  return null; // Hook doesn't render anything
};

export default useInactivityLogout;
