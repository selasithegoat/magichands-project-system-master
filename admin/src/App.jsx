import React, { useState, useEffect, Suspense, lazy } from "react";
// Lazy Load Components
const Login = lazy(() => import("./pages/Login/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const Projects = lazy(() => import("./pages/Projects/Projects"));
const CancelledOrders = lazy(
  () => import("./pages/CancelledOrders/CancelledOrders"),
);
const ProjectDetails = lazy(
  () => import("./pages/ProjectDetails/ProjectDetails"),
);
const OrderGroupDetails = lazy(
  () => import("./pages/OrderGroupDetails/OrderGroupDetails"),
);
const PerformanceAnalytics = lazy(
  () => import("./pages/Analytics/PerformanceAnalytics"),
);
const ProjectAnalytics = lazy(
  () => import("./pages/Analytics/ProjectAnalytics"),
);
const Teams = lazy(() => import("./pages/Teams/Teams"));
const Clients = lazy(() => import("./pages/Clients/Clients"));
const OrdersManagement = lazy(
  () => import("@client/pages/FrontDeskOrders/FrontDeskOrders"),
);
const OrderActions = lazy(
  () => import("@client/pages/NewOrders/OrderActions"),
);
const NewOrdersForm = lazy(
  () => import("@client/pages/NewOrders/NewOrders"),
);
const MinimalQuoteForm = lazy(
  () => import("@client/pages/CreateProject/QuoteWizard/MinimalQuoteForm"),
);
const BillingDocuments = lazy(
  () => import("@client/pages/BillingDocuments/BillingDocuments"),
);
const ChatDock = lazy(() => import("@client/components/chat/ChatDock"));
import DashboardLayout from "./layouts/DashboardLayout/DashboardLayout";
import useInactivityLogout from "./hooks/useInactivityLogout";
import useRealtimeClient from "./hooks/useRealtimeClient";
import GlobalSmsPrompt from "./components/features/GlobalSmsPrompt";
import AdminFrontDeskScope from "./components/AdminFrontDeskScope/AdminFrontDeskScope";
import { clearPersistedFilterState } from "@client/utils/filterPersistence";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";

const normalizeDepartments = (value) => {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map((entry) => String(entry || "").trim().toLowerCase())
    .filter(Boolean);
};

const hasAdminPortalAccess = (user) =>
  Boolean(
    user &&
      user.role === "admin" &&
      normalizeDepartments(user.department).includes("administration"),
  );

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setUser(hasAdminPortalAccess(data) ? data : null);
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
    clearPersistedFilterState();
    setUser(hasAdminPortalAccess(userData) ? userData : null);
  };

  const handleLogout = async () => {
    setUser(null);
    clearPersistedFilterState();
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    } catch (err) {
      console.error("Logout failed", err);
    }
  };

  // Inactivity Timeout (5 minutes)
  useInactivityLogout(5 * 60 * 1000, () => setUser(null), Boolean(user?._id));
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
    if (!hasAdminPortalAccess(user)) {
      return <Navigate to="/login" replace />;
    }
    return (
      <DashboardLayout user={user} onLogout={handleLogout}>
        {children}
      </DashboardLayout>
    );
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
          <Route path="/client" element={<Navigate to="/dashboard" replace />} />
          <Route path="/create" element={<Navigate to="/orders-management" replace />} />
          <Route
            path="/create/select-type"
            element={<Navigate to="/orders-management" replace />}
          />

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
            path="/cancelled-orders"
            element={
              <ProtectedRoute>
                <CancelledOrders user={user} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders-management"
            element={
              <ProtectedRoute>
                <AdminFrontDeskScope>
                  <OrdersManagement />
                </AdminFrontDeskScope>
              </ProtectedRoute>
            }
          />
          <Route
            path="/frontdesk/orders"
            element={<Navigate to="/orders-management" replace />}
          />
          <Route
            path="/new-orders"
            element={<Navigate to="/orders-management" replace />}
          />
          <Route
            path="/new-orders/form"
            element={
              <ProtectedRoute>
                <AdminFrontDeskScope>
                  <NewOrdersForm />
                </AdminFrontDeskScope>
              </ProtectedRoute>
            }
          />
          <Route
            path="/new-orders/actions/:id"
            element={
              <ProtectedRoute>
                <AdminFrontDeskScope>
                  <OrderActions />
                </AdminFrontDeskScope>
              </ProtectedRoute>
            }
          />
          <Route
            path="/create/quote"
            element={
              <ProtectedRoute>
                <AdminFrontDeskScope>
                  <MinimalQuoteForm />
                </AdminFrontDeskScope>
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing-documents"
            element={
              <ProtectedRoute>
                <AdminFrontDeskScope>
                  <BillingDocuments user={user} requestSource="admin" />
                </AdminFrontDeskScope>
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
            path="/projects/orders/:orderNumber"
            element={
              <ProtectedRoute>
                <OrderGroupDetails user={user} />
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
      {user && <GlobalSmsPrompt user={user} />}
      {user?._id && (
        <Suspense fallback={null}>
          <ChatDock user={user} theme="dark" />
        </Suspense>
      )}
      <Toaster
        position="top-right"
        reverseOrder={false}
        gutter={12}
        containerStyle={{
          maxHeight: "min(70vh, calc(100vh - 32px))",
          overflowY: "auto",
          overscrollBehavior: "contain",
        }}
        toastOptions={{
          duration: 10000,
          style: { pointerEvents: "none" },
        }}
      />
    </>
  );
}

export default App;
