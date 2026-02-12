import React, { useState, useEffect, Suspense, lazy } from "react";
// Lazy Load Components
const Login = lazy(() => import("./pages/Login/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const Projects = lazy(() => import("./pages/Projects/Projects"));
const ProjectDetails = lazy(
  () => import("./pages/ProjectDetails/ProjectDetails"),
);
const PerformanceAnalytics = lazy(
  () => import("./pages/Analytics/PerformanceAnalytics"),
);
const ProjectAnalytics = lazy(
  () => import("./pages/Analytics/ProjectAnalytics"),
);
const Teams = lazy(() => import("./pages/Teams/Teams"));
const Clients = lazy(() => import("./pages/Clients/Clients"));
import DashboardLayout from "./layouts/DashboardLayout/DashboardLayout";
import useInactivityLogout from "./hooks/useInactivityLogout";
import useRealtimeClient from "./hooks/useRealtimeClient";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data); // data will be null if not logged in, which is correct
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
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      setUser(null);
    } catch (err) {
      console.error("Logout failed", err);
      setUser(null);
    }
  };

  // Inactivity Timeout (30 minutes)
  useInactivityLogout(30 * 60 * 1000);
  useRealtimeClient(Boolean(user));

  const LoadingScreen = () => (
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

  if (loading) {
    return <LoadingScreen />;
  }

  const ProtectedRoute = ({ children }) => {
    if (!user || user.role !== "admin") {
      return <Navigate to="/login" replace />;
    }
    return <DashboardLayout user={user}>{children}</DashboardLayout>;
  };

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Login onLoginSuccess={handleLoginSuccess} />
              )
            }
          />
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <Projects user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ProtectedRoute>
                <ProjectDetails user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teams"
            element={
              <ProtectedRoute>
                <Teams user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <ProtectedRoute>
                <Clients user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <PerformanceAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics/projects/:id"
            element={
              <ProtectedRoute>
                <ProjectAnalytics />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route
            path="*"
            element={<Navigate to={user ? "/dashboard" : "/login"} replace />}
          />
        </Routes>
      </Suspense>
      <Toaster
        position="top-right"
        reverseOrder={false}
        toastOptions={{
          duration: 5000,
          style: { pointerEvents: "none" },
        }}
      />
    </>
  );
}

export default App;
