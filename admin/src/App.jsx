import React, { useState, useEffect } from "react";
import Login from "./pages/Login/Login";
import AssignProject from "./pages/AssignProject/AssignProject";
import Projects from "./pages/Projects/Projects";
import ProjectDetails from "./pages/ProjectDetails/ProjectDetails";
import Teams from "./pages/Teams/Teams";
import Clients from "./pages/Clients/Clients";
import useInactivityLogout from "./hooks/useInactivityLogout";
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

  // Inactivity Timeout (30 minutes)
  useInactivityLogout(30 * 60 * 1000);

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
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<Projects user={user} />} />
        <Route path="/projects/:id" element={<ProjectDetails user={user} />} />
        <Route path="/assign" element={<AssignProject user={user} />} />
        <Route path="/teams" element={<Teams user={user} />} />
        <Route path="/clients" element={<Clients user={user} />} />
      </Routes>
    );
  }

  return <Login onLoginSuccess={handleLoginSuccess} />;
}

export default App;
