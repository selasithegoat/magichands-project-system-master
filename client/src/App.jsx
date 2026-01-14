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
import PendingAssignments from "./pages/PendingAssignments/PendingAssignments";
import MyActivities from "./pages/MyActivities/MyActivities";

// Helper to wrap protected content in Layout
const ProtectedLayout = ({
  children,
  activeView,
  user,
  navigate,
  onSignOut, // Receive onSignOut
  projectCount, // Receive projectCount
}) => (
  <Layout
    activeView={activeView}
    user={user} // Pass user to Layout
    projectCount={projectCount} // Pass to Layout
    onNavigateDashboard={() => navigate("/")}
    onNavigateProject={() => navigate("/projects")}
    onNavigateHistory={() => navigate("/history")}
    onNavigateProfile={() => navigate("/profile")}
    onCreateProject={() => navigate("/create-project")}
    onSignOut={onSignOut} // Pass onSignOut to Layout
  >
    {children}
  </Layout>
);

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [projectCount, setProjectCount] = useState(0); // Global project count

  // Fetch project count
  const fetchProjectCount = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        // Count active projects (everything except 'Completed')
        const active = data.filter((p) => p.status !== "Completed");
        setProjectCount(active.length);
      }
    } catch (err) {
      console.error("Failed to update project count", err);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        fetchProjectCount(); // Fetch count when user is loaded
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
            projectCount={projectCount}
            onSignOut={handleLogout}
          >
            <Dashboard
              user={user} // Pass user to Dashboard
              onNavigateProject={(id) => navigate(`/detail/${id}`)}
              onCreateProject={() => navigate("/create")}
              onSeeAllProjects={() => navigate("/projects")}
              onProjectChange={fetchProjectCount} // Refresh count on change
            />
          </ProtectedLayout>
        }
      />
      <Route
        path="/create"
        element={
          <ProtectedLayout
            activeView="create"
            user={user}
            navigate={navigate}
            projectCount={projectCount}
          >
            <PendingAssignments onStartNew={() => navigate("/create/wizard")} />
          </ProtectedLayout>
        }
      />
      <Route
        path="/create/wizard"
        element={
          <ProtectedLayout
            activeView="create"
            user={user}
            navigate={navigate}
            projectCount={projectCount}
          >
            <CreateProjectWizard onProjectCreate={fetchProjectCount} />
          </ProtectedLayout>
        }
      />
      <Route
        path="/detail/:id"
        element={
          <ProtectedLayout
            activeView="detail"
            user={user}
            navigate={navigate}
            projectCount={projectCount}
          >
            <ProjectDetail user={user} onProjectChange={fetchProjectCount} />
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
            projectCount={projectCount}
          >
            <OngoingProjects
              onNavigateDetail={(id) => navigate(`/detail/${id}`)}
              onBack={() => navigate("/")}
              onCreateProject={() => navigate("/create")}
              onProjectChange={fetchProjectCount} // Refresh count on change
            />
          </ProtectedLayout>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedLayout
            activeView="history"
            user={user}
            navigate={navigate}
            projectCount={projectCount}
          >
            <ProjectHistory onBack={() => navigate("/")} />
          </ProtectedLayout>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedLayout
            activeView="profile"
            user={user}
            navigate={navigate}
            projectCount={projectCount}
          >
            <Profile
              user={user}
              onUpdateProfile={fetchUser}
              onSignOut={handleLogout}
            />
          </ProtectedLayout>
        }
      />
      <Route
        path="/my-activities"
        element={
          <ProtectedLayout
            activeView="profile" // Use profile as active view for nav
            user={user}
            navigate={navigate}
            projectCount={projectCount}
          >
            <MyActivities onBack={() => navigate("/profile")} />
          </ProtectedLayout>
        }
      />
    </Routes>
  );
}

export default App;
