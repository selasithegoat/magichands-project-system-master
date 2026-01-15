import React, { useState, useEffect } from "react";
import Login from "./pages/Login/Login";
import AssignProject from "./pages/AssignProject/AssignProject";
import Projects from "./pages/Projects/Projects";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (error) {
        console.error("Session verification failed", error);
      } finally {
        setLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
    } catch (err) {
      console.error("Logout failed", err);
      setUser(null);
    }
  };

  // Inactivity Timeout Logic
  useEffect(() => {
    if (!user) return; // Only track if logged in

    const TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
    let timeoutId;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log("User inactive for 15 minutes. Logging out...");
        alert("Session expired due to inactivity.");
        handleLogout();
      }, TIMEOUT_MS);
    };

    // Events to track activity
    const events = ["mousemove", "keydown", "click", "scroll"];

    const setupEventListeners = () => {
      events.forEach((event) => {
        window.addEventListener(event, resetTimer);
      });
      resetTimer(); // Start timer on mount/login
    };

    const cleanupEventListeners = () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };

    setupEventListeners();

    return cleanupEventListeners;
  }, [user]);

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#94a3b8",
        }}
      >
        Loading...
      </div>
    );
  }

  if (user) {
    return (
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/assign" element={<AssignProject />} />
        </Routes>
      </Router>
    );
  }

  return <Login onLoginSuccess={handleLoginSuccess} />;
}

export default App;
