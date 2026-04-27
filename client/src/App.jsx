import React, { useState, Suspense, lazy } from "react";
import "./App.css";
import Layout from "./components/layout/Layout";
import ChatDock from "./components/chat/ChatDock";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import Spinner from "./components/ui/Spinner"; // Keep Spinner for initial auth load
import LoadingFallback from "./components/ui/LoadingFallback"; // [NEW] Use for Suspense fallback
import GlobalSmsPrompt from "./components/features/GlobalSmsPrompt";
import useInactivityLogout from "./hooks/useInactivityLogout";
import useRealtimeClient from "./hooks/useRealtimeClient";
import useTheme from "./hooks/useTheme";
import { clearPersistedFilterState } from "./utils/filterPersistence";
import { buildPortalUrl } from "./utils/portalNavigation";
import {
  fetchSystemVersionInfo,
  formatVersionDisplay,
  getCachedSystemVersionInfo,
} from "./utils/systemVersionInfo";

// Lazy Loaded Pages
const Login = lazy(() => import("./pages/Login/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const NextActions = lazy(() => import("./pages/NextActions/NextActions"));
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
const FrontDeskOrders = lazy(
  () => import("./pages/FrontDeskOrders/FrontDeskOrders"),
);
const EndOfDayUpdate = lazy(
  () => import("./pages/EndOfDayUpdate/EndOfDayUpdate"),
);
const DepartmentUpdates = lazy(
  () => import("./pages/EndOfDayUpdate/DepartmentUpdates"),
);
const EngagedProjects = lazy(
  () => import("./pages/EngagedProjects/EngagedProjects"),
);
const EngagedProjectActions = lazy(
  () => import("./pages/EngagedProjects/EngagedProjectActions"),
);
const FAQ = lazy(() => import("./pages/FAQ/FAQ"));

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

const APP_SPLASH_DURATION_MS = 1600;
const THEME_STORAGE_KEY = "mh-client-theme";

const normalizeThemePreference = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "light" || normalized === "dark" ? normalized : "";
};

const StartupSplash = ({ versionInfo }) => {
  const versionLabel = formatVersionDisplay(versionInfo);

  return (
    <div className="startup-splash" role="status" aria-live="polite">
      <div className="startup-splash-mark">
        <img
          src="/mhlogo.png"
          alt="Magic Hands"
          className="startup-splash-logo"
          draggable="false"
        />
        {versionLabel && (
          <div className="startup-splash-version">{versionLabel}</div>
        )}
      </div>
    </div>
  );
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [projectCount, setProjectCount] = useState(0); // Global project count
  const [engagedCount, setEngagedCount] = useState(0); // [New] Department engagement count
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [showPostLoginSplash, setShowPostLoginSplash] = useState(false);
  const [splashVersionInfo, setSplashVersionInfo] = useState(
    () => getCachedSystemVersionInfo(),
  );
  const accountKey = String(
    user?._id || user?.id || user?.email || "",
  ).trim();
  const isLoginRoute =
    location.pathname === "/login" || location.pathname === "/";
  const { theme, toggleTheme } = useTheme({
    accountKey,
    enabled: Boolean(accountKey) && !isLoginRoute,
    serverTheme: user?.themePreference,
    forcedTheme: isLoginRoute ? "light" : "",
  });

  const syncThemePreference = React.useCallback(
    async (nextTheme, { silent = false } = {}) => {
      if (!accountKey) return;
      try {
        const res = await fetch("/api/auth/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ themePreference: nextTheme }),
        });

        if (!res.ok) {
          if (!silent) {
            const errorData = await res.json().catch(() => ({}));
            console.error(
              errorData.message || "Failed to update theme preference",
            );
          }
          return;
        }

        const updatedUser = await res.json().catch(() => ({}));
        setUser((prev) =>
          prev
            ? {
                ...prev,
                themePreference:
                  updatedUser.themePreference ||
                  nextTheme ||
                  prev.themePreference,
              }
            : prev,
        );
      } catch (error) {
        if (!silent) {
          console.error("Failed to update theme preference", error);
        }
      }
    },
    [accountKey],
  );

  const handleToggleTheme = async () => {
    if (!accountKey) return;
    const nextTheme = theme === "dark" ? "light" : "dark";
    toggleTheme();
    await syncThemePreference(nextTheme);
  };

  // Initialize auto-logout (5 minutes)
  useInactivityLogout(5 * 60 * 1000, () => setUser(null), Boolean(user?._id));
  useRealtimeClient(Boolean(user));

  React.useEffect(() => {
    if (!accountKey) return;
    const serverPreference = normalizeThemePreference(user?.themePreference);
    if (serverPreference) return;

    let legacyTheme = "";
    try {
      legacyTheme = window.localStorage.getItem(
        `${THEME_STORAGE_KEY}:${accountKey}`,
      );
    } catch {
      legacyTheme = "";
    }

    const normalizedLegacy = normalizeThemePreference(legacyTheme);
    if (!normalizedLegacy) return;
    syncThemePreference(normalizedLegacy, { silent: true });
  }, [accountKey, user?.themePreference, syncThemePreference]);

  const fetchDashboardCounts = async () => {
    try {
      const res = await fetch("/api/projects/dashboard-counts", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setProjectCount(Number(data?.activeProjects) || 0);
        setEngagedCount(Number(data?.engagedProjects) || 0);
      }
    } catch (err) {
      console.error("Failed to update dashboard counts", err);
    }
  };

  const fetchUser = async ({ showSplash = false } = {}) => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
      });

      if (res.ok) {
        const userData = await res.json();
        if (userData) {
          setUser(userData);
          if (showSplash) {
            const versionInfo = await fetchSystemVersionInfo().catch(() => null);
            if (versionInfo) {
              setSplashVersionInfo(versionInfo);
            }
            setShowPostLoginSplash(true);
          }
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
    } catch {
      setUser(null);
      if (location.pathname !== "/login") {
        navigate("/login");
      }
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
    if (user?._id) {
      fetchDashboardCounts();
    } else {
      setProjectCount(0);
      setEngagedCount(0);
    }
  }, [
    user?._id,
    Array.isArray(user?.department)
      ? user.department.join("|")
      : user?.department || "",
  ]);

  React.useEffect(() => {
    if (!showPostLoginSplash) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setShowPostLoginSplash(false);
    }, APP_SPLASH_DURATION_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [showPostLoginSplash]);

  const performLogout = async () => {
    setUser(null);
    clearPersistedFilterState();
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
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onNavigateDashboard={() => navigate("/client")}
        onNavigateProject={() => navigate("/projects")}
        onNavigateHistory={() => navigate("/history")}
        onNavigateProfile={() => navigate("/profile")}
        onNavigateNewOrders={() => navigate("/new-orders")}
        onNavigateEndOfDay={() => navigate("/end-of-day")}
        onNavigateEngagedProjects={() => navigate("/engaged-projects")}
        onNavigateInventory={() => {
          window.location.href = buildPortalUrl("inventory");
        }}
        onNavigateHelp={() => navigate("/faq")}
        onCreateProject={() => navigate("/create")}
        onNavigateAdmin={() => {
          window.location.href = buildPortalUrl("admin");
        }}
        onSignOut={onSignOut}
      >
        {children}
      </Layout>
    );
  };

  if (showPostLoginSplash) {
    return <StartupSplash versionInfo={splashVersionInfo} />;
  }

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
        <Route
          path="/login"
          element={
            <Login
              onLogin={() => {
                clearPersistedFilterState();
                fetchUser({ showSplash: true });
              }}
            />
          }
        />
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
                onCreateProject={() => navigate("/create")}
                onProjectChange={fetchDashboardCounts} // Refresh counts on change
              />
            </ProtectedLayout>
          }
        />
        <Route
          path="/next-actions"
          element={
            <ProtectedLayout
              activeView="dashboard"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
              onSignOut={handleRequestLogout}
            >
              <NextActions user={user} />
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
              <CreateProjectWizard onProjectCreate={fetchDashboardCounts} />
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
              <ProjectDetail user={user} onProjectChange={fetchDashboardCounts} />
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
                onBack={() => navigate("/client")}
                onCreateProject={() => navigate("/create")}
                user={user}
                onProjectChange={fetchDashboardCounts} // Refresh counts on change
              />
            </ProtectedLayout>
          }
        />
        <Route
          path="/projects/:id"
          element={
            <ProtectedLayout
              activeView="projects"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <ProjectDetail user={user} onProjectChange={fetchDashboardCounts} />
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
              <ProjectHistory onBack={() => navigate("/client")} user={user} />
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
          path="/frontdesk/orders"
          element={
            <ProtectedLayout
              activeView="new-orders"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <FrontDeskOrders />
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
              <NewOrders user={user} />
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
          path="/end-of-day/department-updates"
          element={
            <ProtectedLayout
              activeView="end-of-day"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <DepartmentUpdates user={user} />
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
          path="/faq"
          element={
            <ProtectedLayout
              activeView="help"
              user={user}
              navigate={navigate}
              projectCount={projectCount}
              engagedCount={engagedCount}
            >
              <FAQ user={user} />
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
              <MyActivities user={user} onBack={() => navigate("/profile")} />
            </ProtectedLayout>
          }
        />
        </Routes>
      </Suspense>
      {user && <GlobalSmsPrompt user={user} />}
      {user?._id && <ChatDock user={user} />}
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
