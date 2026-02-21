import React, { useState, Suspense, lazy } from "react";
import Layout from "./components/layout/Layout";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import Spinner from "./components/ui/Spinner"; // Keep Spinner for initial auth load
import LoadingFallback from "./components/ui/LoadingFallback"; // [NEW] Use for Suspense fallback
import useInactivityLogout from "./hooks/useInactivityLogout";
import useRealtimeClient from "./hooks/useRealtimeClient";
import {
  PRODUCTION_SUB_DEPARTMENTS,
  GRAPHICS_SUB_DEPARTMENTS,
  STORES_SUB_DEPARTMENTS,
  PHOTOGRAPHY_SUB_DEPARTMENTS,
} from "./constants/departments";

// Lazy Loaded Pages
const Login = lazy(() => import("./pages/Login/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail/ProjectDetail"));
const ProjectHistory = lazy(
  () => import("./pages/ProjectHistory/ProjectHistory"),
);
const OngoingProjects = lazy(
  () => import("./pages/OngoingProjects/OngoingProjects"),
);
const Profile = lazy(() => import("./pages/Profile/Profile"));
const NewOrders = lazy(() => import("./pages/NewOrders/NewOrders"));
const OrderActions = lazy(() => import("./pages/NewOrders/OrderActions"));
const EndOfDayUpdate = lazy(
  () => import("./pages/EndOfDayUpdate/EndOfDayUpdate"),
);
const EngagedProjects = lazy(
  () => import("./pages/EngagedProjects/EngagedProjects"),
);
const EngagedProjectActions = lazy(
  () => import("./pages/EngagedProjects/EngagedProjectActions"),
);
const Inventory = lazy(() => import("./pages/Inventory/Inventory"));

import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";

const CreateProjectWizard = lazy(
  () => import("./pages/CreateProject/CreateProjectWizard"),
);
const CreateProjectLanding = lazy(
  () => import("./pages/CreateProject/CreateProjectLanding"),
);
const QuoteProjectWizard = lazy(
  () => import("./pages/CreateProject/QuoteWizard/QuoteProjectWizard"),
);
const MinimalQuoteForm = lazy(
  () => import("./pages/CreateProject/QuoteWizard/MinimalQuoteForm"),
);
const PendingAssignments = lazy(
  () => import("./pages/PendingAssignments/PendingAssignments"),
);
const MyActivities = lazy(() => import("./pages/MyActivities/MyActivities"));

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [projectCount, setProjectCount] = useState(0); // Global project count
  const [engagedCount, setEngagedCount] = useState(0); // [New] Department engagement count
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  // Initialize auto-logout (5 minutes)
  useInactivityLogout(5 * 60 * 1000, () => setUser(null));
  useRealtimeClient(Boolean(user));

  // Fetch project count
  const fetchProjectCount = async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        // Count active projects (exclude history status)
        const active = data.filter((p) => p.status !== "Finished");
        setProjectCount(active.length);
      }
    } catch (err) {
      console.error("Failed to update project count", err);
    }
  };

  // [New] Fetch engaged project count for user's department(s)
  const fetchEngagedCount = async (userData) => {
    const rawDepts = userData?.department || user?.department || [];
    const userDepts = Array.isArray(rawDepts)
      ? rawDepts
      : rawDepts
        ? [rawDepts]
        : [];

    // Map user's departments to sub-departments (same logic as EngagedProjects.jsx)
    const hasProductionParent = userDepts.includes("Production");
    const hasGraphicsParent = userDepts.includes("Graphics/Design");
    const hasStoresParent = userDepts.includes("Stores");
    const hasPhotographyParent = userDepts.includes("Photography");

    const productionSubDepts = hasProductionParent
      ? PRODUCTION_SUB_DEPARTMENTS
      : userDepts.filter((d) => PRODUCTION_SUB_DEPARTMENTS.includes(d));
    const hasGraphics =
      hasGraphicsParent ||
      userDepts.some((d) => GRAPHICS_SUB_DEPARTMENTS.includes(d));
    const hasStores =
      hasStoresParent ||
      userDepts.some((d) => STORES_SUB_DEPARTMENTS.includes(d));
    const hasPhotography =
      hasPhotographyParent ||
      userDepts.some((d) => PHOTOGRAPHY_SUB_DEPARTMENTS.includes(d));

    let subDepts = [];
    if (productionSubDepts.length > 0) {
      subDepts = [...subDepts, ...productionSubDepts];
    }
    if (hasGraphics) {
      subDepts = [...subDepts, ...GRAPHICS_SUB_DEPARTMENTS];
    }
    if (hasStores) {
      subDepts = [...subDepts, ...STORES_SUB_DEPARTMENTS];
    }
    if (hasPhotography) {
      subDepts = [...subDepts, ...PHOTOGRAPHY_SUB_DEPARTMENTS];
    }

    const uniqueSubDepts = Array.from(new Set(subDepts));

    if (uniqueSubDepts.length === 0) {
      setEngagedCount(0);
      return;
    }

    try {
      const res = await fetch("/api/projects?mode=engaged");
      if (res.ok) {
        const data = await res.json();
        // Count projects where any of the user's sub-departments are engaged
        const engaged = data.filter((p) => {
          if (!p.departments || p.departments.length === 0) return false;
          return (
            p.departments.some((dept) => uniqueSubDepts.includes(dept)) &&
            p.status !== "Completed" &&
            p.status !== "Delivered" &&
            p.status !== "Pending Feedback" &&
            p.status !== "Feedback Completed" &&
            p.status !== "Finished"
          );
        });
        setEngagedCount(engaged.length);
      }
    } catch (err) {
      console.error("Failed to update engaged count", err);
    }
  };

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });

      if (res.ok) {
        const userData = await res.json();
        if (userData) {
          setUser(userData);
          fetchProjectCount(); // Fetch count when user is loaded
          // If on login page and authorized, go to dashboard
          if (location.pathname === "/login") {
            navigate("/client");
          }
        } else {
          setUser(null);
          if (location.pathname !== "/login") {
            navigate("/login");
          }
        }
      } else {
        setUser(null);
        // If unauthorized and trying to access protected route, go to login
        if (location.pathname !== "/login") {
          navigate("/login");
        }
      }
    } catch (err) {
      setUser(null);
      navigate("/login");
    } finally {
      setIsLoading(false);
    }
  };

  // Check for active session on load
  React.useEffect(() => {
    fetchUser();
  }, []);

  // [New] Fetch engaged count when user changes
  React.useEffect(() => {
    if (user?.department?.length) {
      fetchEngagedCount(user);
    }
  }, [user]);

  const performLogout = async () => {
    setUser(null);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const handleRequestLogout = () => {
    setIsLogoutDialogOpen(true);
  };

  const handleCancelLogout = () => {
    setIsLogoutDialogOpen(false);
  };

  const handleConfirmLogout = async () => {
    setIsLogoutDialogOpen(false);
    await performLogout();
  };

  const ProtectedLayout = ({
    children,
    activeView,
    onSignOut = handleRequestLogout,
  }) => {
    if (!user) {
      return <Navigate to="/login" replace />;
    }

    return (
      <Layout
        activeView={activeView}
        user={user}
        projectCount={projectCount}
        engagedCount={engagedCount}
        onNavigateDashboard={() => navigate("/client")}
        onNavigateProject={() => navigate("/projects")}
        onNavigateHistory={() => navigate("/history")}
        onNavigateProfile={() => navigate("/profile")}
        onNavigateNewOrders={() => navigate("/new-orders")}
        onNavigateEndOfDay={() => navigate("/end-of-day")}
        onNavigateEngagedProjects={() => navigate("/engaged-projects")}
        onNavigateInventory={() => navigate("/inventory")}
        onCreateProject={() => navigate("/create")}
        onNavigateAdmin={() => {
          const host = window.location.hostname;
          const adminHost = host ? `admin.${host}` : "admin.magichandsproject.lan";
          window.location.href = `http://${adminHost}`;
        }}
        onSignOut={onSignOut}
      >
        {children}
      </Layout>
    );
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
    <>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
        <Route path="/login" element={<Login onLogin={fetchUser} />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route
          path="/client"
          element={
            <ProtectedLayout
              activeView="dashboard"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
              onSignOut={handleRequestLogout}
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
              engagedCount={engagedCount}
            >
              <PendingAssignments
                user={user}
                onStartNew={() => navigate("/create/select-type")}
              />
            </ProtectedLayout>
          }
        />
        <Route
          path="/create/select-type"
          element={
            <ProtectedLayout
              activeView="create"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <CreateProjectLanding />
            </ProtectedLayout>
          }
        />
        <Route
          path="/create/quote"
          element={
            <ProtectedLayout
              activeView="create"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <MinimalQuoteForm />
            </ProtectedLayout>
          }
        />
        <Route
          path="/create/quote-wizard"
          element={
            <ProtectedLayout
              activeView="create"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <QuoteProjectWizard />
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
              engagedCount={engagedCount}
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
              engagedCount={engagedCount}
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
              engagedCount={engagedCount}
            >
              <OngoingProjects
                onNavigateDetail={(id) => navigate(`/detail/${id}`)}
                onBack={() => navigate("/client")}
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
              engagedCount={engagedCount}
            >
              <ProjectHistory onBack={() => navigate("/client")} />
            </ProtectedLayout>
          }
        />
        <Route
          path="/new-orders"
          element={
            <ProtectedLayout
              activeView="new-orders"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <CreateProjectLanding />
            </ProtectedLayout>
          }
        />
        <Route
          path="/new-orders/form"
          element={
            <ProtectedLayout
              activeView="new-orders"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <NewOrders />
            </ProtectedLayout>
          }
        />
        <Route
          path="/new-orders/actions/:id"
          element={
            <ProtectedLayout
              activeView="new-orders"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <OrderActions />
            </ProtectedLayout>
          }
        />
        <Route
          path="/end-of-day"
          element={
            <ProtectedLayout
              activeView="end-of-day"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <EndOfDayUpdate user={user} />
            </ProtectedLayout>
          }
        />
        <Route
          path="/engaged-projects"
          element={
            <ProtectedLayout
              activeView="engaged-projects"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <EngagedProjects user={user} />
            </ProtectedLayout>
          }
        />
        <Route
          path="/engaged-projects/actions/:id"
          element={
            <ProtectedLayout
              activeView="engaged-projects"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <EngagedProjectActions user={user} />
            </ProtectedLayout>
          }
        />
        <Route
          path="/inventory/*"
          element={
            <ProtectedLayout
              activeView="inventory"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <Inventory user={user} />
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
              engagedCount={engagedCount}
            >
              <Profile
                user={user}
                onUpdateProfile={fetchUser}
                onSignOut={handleRequestLogout}
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
              engagedCount={engagedCount}
            >
              <MyActivities onBack={() => navigate("/profile")} />
            </ProtectedLayout>
          }
        />
        </Routes>
      </Suspense>
      <ConfirmDialog
        isOpen={isLogoutDialogOpen}
        title="Confirm Sign Out"
        message="Are you sure you want to sign out from your account?"
        confirmText="Sign Out"
        cancelText="Stay Logged In"
        onConfirm={handleConfirmLogout}
        onCancel={handleCancelLogout}
      />
    </>
  );
}

export default App;
