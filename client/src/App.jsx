import React, { useState } from "react";
import Login from "./pages/Login/Login";
import Dashboard from "./pages/Dashboard/Dashboard";
import ProjectDetail from "./pages/ProjectDetail/ProjectDetail";
import ProjectHistory from "./pages/ProjectHistory/ProjectHistory";
import OngoingProjects from "./pages/OngoingProjects/OngoingProjects";
import Profile from "./pages/Profile/Profile";
import Layout from "./components/layout/Layout";

import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import CreateProjectWizard from "./pages/CreateProject/CreateProjectWizard";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);

  // Check for active session on load
  React.useEffect(() => {
    const checkSession = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/auth/me", {
          credentials: "include",
        });

        if (res.ok) {
          // If on login page and authorized, go to dashboard
          if (location.pathname === "/login") {
            navigate("/");
          }
        } else {
          // If unauthorized and trying to access protected route, go to login
          if (location.pathname !== "/login") {
            navigate("/login");
          }
        }
      } catch (err) {
        navigate("/login");
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("http://localhost:5000/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      navigate("/login");
    } catch (error) {
      console.error("Logout failed", error);
      navigate("/login");
    }
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        Loading...
      </div>
    );
  }

  // Helper to wrap protected content in Layout
  const ProtectedLayout = ({ children, activeView }) => (
    <Layout
      activeView={activeView}
      onNavigateDashboard={() => navigate("/")}
      onNavigateProject={() => navigate("/projects")}
      onNavigateHistory={() => navigate("/history")}
      onNavigateProfile={() => navigate("/profile")}
      onCreateProject={() => navigate("/create")}
    >
      {children}
    </Layout>
  );

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={() => navigate("/")} />} />

      <Route
        path="/"
        element={
          <ProtectedLayout activeView="dashboard">
            <Dashboard
              onNavigateProject={() => navigate("/detail")}
              onCreateProject={() => navigate("/create")}
              onSeeAllProjects={() => navigate("/projects")}
            />
          </ProtectedLayout>
        }
      />

      <Route
        path="/create"
        element={
          <ProtectedLayout activeView="create">
            <CreateProjectWizard />
          </ProtectedLayout>
        }
      />

      <Route
        path="/detail"
        element={
          <ProtectedLayout activeView="detail">
            <ProjectDetail />
          </ProtectedLayout>
        }
      />

      <Route
        path="/projects"
        element={
          <ProtectedLayout activeView="projects">
            <OngoingProjects
              onNavigateDetail={() => navigate("/detail")}
              onBack={() => navigate("/")}
            />
          </ProtectedLayout>
        }
      />

      <Route
        path="/history"
        element={
          <ProtectedLayout activeView="history">
            <ProjectHistory onBack={() => navigate("/")} />
          </ProtectedLayout>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedLayout activeView="profile">
            <Profile onSignOut={handleLogout} />
          </ProtectedLayout>
        }
      />
    </Routes>
  );
}

export default App;
