import React, { useState, useEffect } from "react";
import Login from "./pages/Login/Login";
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

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? (
            <Navigate to="/projects" replace />
          ) : (
            <Login onLoginSuccess={handleLoginSuccess} />
          )
        }
      />
      <Route
        path="/"
        element={
          user ? (
            <Navigate to="/projects" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Protected Routes */}
      <Route
        path="/projects"
        element={
          user ? <Projects user={user} /> : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/projects/:id"
        element={
          user ? (
            <ProjectDetails user={user} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/teams"
        element={
          user ? <Teams user={user} /> : <Navigate to="/login" replace />
        }
      />
      <Route
        path="/clients"
        element={
          user ? <Clients user={user} /> : <Navigate to="/login" replace />
        }
      />

      {/* Fallback */}
      <Route
        path="*"
        element={<Navigate to={user ? "/projects" : "/login"} replace />}
      />
    </Routes>
  );
}

export default App;
