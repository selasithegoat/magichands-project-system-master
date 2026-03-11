import { useEffect, useState } from "react";
import QuickActionModal from "../components/modals/QuickActionModal";
import InventoryLayout from "../layouts/InventoryLayout";
import Dashboard from "../pages/Dashboard/Dashboard";
import LoadingScreen from "../components/feedback/LoadingScreen";
import Login from "../pages/Login/Login";
import {
  ClientIcon,
  DashboardIcon,
  LayersIcon,
  PurchaseOrderIcon,
  RecordsIcon,
  ReportIcon,
  SettingsIcon,
  SuppliersIcon,
  SwapIcon,
} from "../components/icons/Icons";
import { hasInventoryPortalAccess } from "../utils/access";
import { quickActions } from "../data/quickActions";

const APP_NAME = "MagicHands Inventory";

const NAV_ITEMS = [
  { label: "Dashboard", icon: DashboardIcon, active: true },
  { label: "Inventory Types", icon: LayersIcon },
  { label: "Inventory Records", icon: RecordsIcon },
  { label: "Stock Transactions", icon: SwapIcon },
  { label: "Client Items", icon: ClientIcon },
  { label: "Suppliers", icon: SuppliersIcon },
  { label: "Purchase Orders", icon: PurchaseOrderIcon },
  { label: "Reports", icon: ReportIcon },
  { label: "Settings", icon: SettingsIcon },
];

const App = () => {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch("/api/auth/me?source=inventory", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          setUser(null);
          return;
        }

        const data = await response.json();
        if (hasInventoryPortalAccess(data)) {
          setUser(data);
          setAccessDenied(false);
        } else if (data) {
          setAccessDenied(true);
          setUser(null);
        }
      } catch (error) {
        console.error("Inventory session check failed", error);
      } finally {
        setChecking(false);
      }
    };

    checkSession();
  }, []);

  const logout = async () => {
    setUser(null);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError("");
    setAccessDenied(false);

    const formData = new FormData(event.currentTarget);
    const employeeId = String(formData.get("employeeId") || "").trim();
    const password = String(formData.get("password") || "");

    if (!employeeId || !password) {
      setLoginError("Employee ID and password are required.");
      return;
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ employeeId, password }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setLoginError(data.message || "Invalid login credentials.");
        return;
      }

      const data = await response.json();
      if (!hasInventoryPortalAccess(data)) {
        await logout();
        setAccessDenied(true);
        setLoginError(
          "Access restricted to Admin, Front Desk, and Stores users.",
        );
        return;
      }

      setUser(data);
    } catch (error) {
      console.error("Login failed", error);
      setLoginError("Unable to sign in. Try again shortly.");
    }
  };

  if (checking) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <Login
        appName={APP_NAME}
        onSubmit={handleLogin}
        error={loginError}
        accessDenied={accessDenied}
      />
    );
  }

  return (
    <>
      <InventoryLayout
        navItems={NAV_ITEMS}
        user={user}
        onLogout={logout}
        onQuickAction={() => setQuickActionOpen(true)}
        notificationCount={3}
      >
        <Dashboard />
      </InventoryLayout>
      <QuickActionModal
        isOpen={quickActionOpen}
        onClose={() => setQuickActionOpen(false)}
        actions={quickActions}
      />
    </>
  );
};

export default App;
