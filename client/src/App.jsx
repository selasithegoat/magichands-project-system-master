import React, { useState } from "react";
import Login from "./pages/Login/Login";
import Dashboard from "./pages/Dashboard/Dashboard";
import ProjectDetail from "./pages/ProjectDetail/ProjectDetail";
import ProjectHistory from "./pages/ProjectHistory/ProjectHistory";
import OngoingProjects from "./pages/OngoingProjects/OngoingProjects";
import Profile from "./pages/Profile/Profile";
import Layout from "./components/layout/Layout";
import Spinner from "./components/ui/Spinner"; // Import Spinner

import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import CreateProjectWizard from "./pages/CreateProject/CreateProjectWizard";

// Helper to wrap protected content in Layout
const ProtectedLayout = ({ children, activeView, user, navigate }) => (
  <Layout
    activeView={activeView}
    user={user} // Pass user to Layout
    onNavigateDashboard={() => navigate("/")}
    onNavigateProject={() => navigate("/projects")}
    onNavigateHistory={() => navigate("/history")}
    onNavigateProfile={() => navigate("/profile")}
    onCreateProject={() => navigate("/create")}
  >
    {children}
  </Layout>
);

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
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

  // Check for active session on load
  React.useEffect(() => {
    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      setUser(null); // Clear user state
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
        <Spinner />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login onLogin={fetchUser} />} />

      <Route
        path="/"
        element={
          <ProtectedLayout
            activeView="dashboard"
            user={user}
            navigate={navigate}
          >
            <Dashboard
              user={user} // Pass user to Dashboard
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
          <ProtectedLayout activeView="create" user={user} navigate={navigate}>
            <CreateProjectWizard />
          </ProtectedLayout>
        }
      />

      <Route
        path="/detail"
        element={
          <ProtectedLayout activeView="detail" user={user} navigate={navigate}>
            <ProjectDetail />
          </ProtectedLayout>
        }
      />

      <Route
        path="/projects"
        element={
          <ProtectedLayout
            activeView="projects"
            user={user}
            navigate={navigate}
          >
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
          <ProtectedLayout activeView="history" user={user} navigate={navigate}>
            <ProjectHistory onBack={() => navigate("/")} />
          </ProtectedLayout>
        }
      />

      <Route
        path="/profile"
        element={
          <ProtectedLayout activeView="profile" user={user} navigate={navigate}>
            <Profile
              user={user}
              onUpdateProfile={fetchUser}
              onSignOut={handleLogout}
            />
          </ProtectedLayout>
        }
      />
    </Routes>
  );
}

export default App;
