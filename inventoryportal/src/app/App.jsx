import { useEffect, useState } from "react";
import QuickActionModal from "../components/modals/QuickActionModal";
import InventoryLayout from "../layouts/InventoryLayout";
import Dashboard from "../pages/Dashboard/Dashboard";
import LoadingScreen from "../components/feedback/LoadingScreen";
import Login from "../pages/Login/Login";
import StockTransactions from "../pages/StockTransactions/StockTransactions";
import InventoryTypes from "../pages/InventoryTypes/InventoryTypes";
import InventoryRecords from "../pages/InventoryRecords/InventoryRecords";
import ClientItems from "../pages/ClientItems/ClientItems";
import Suppliers from "../pages/Suppliers/Suppliers";
import PurchaseOrders from "../pages/PurchaseOrders/PurchaseOrders";
import Reports from "../pages/Reports/Reports";
import Settings from "../pages/Settings/Settings";
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
const THEME_STORAGE_KEY = "inventory-portal-theme";
const PAGE_STORAGE_KEY = "inventory-portal-active-page";

const getPreferredTheme = () => {
  if (typeof window === "undefined") {
    return "light";
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: DashboardIcon },
  { key: "inventory-types", label: "Inventory Types", icon: LayersIcon },
  { key: "inventory-records", label: "Inventory Records", icon: RecordsIcon },
  { key: "stock-transactions", label: "Stock Transactions", icon: SwapIcon },
  { key: "client-items", label: "Client Items", icon: ClientIcon },
  { key: "suppliers", label: "Suppliers", icon: SuppliersIcon },
  { key: "purchase-orders", label: "Purchase Orders", icon: PurchaseOrderIcon },
  { key: "reports", label: "Reports", icon: ReportIcon },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

const App = () => {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [loginError, setLoginError] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [activePage, setActivePage] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    return window.localStorage.getItem(PAGE_STORAGE_KEY) || "dashboard";
  });
  const [theme, setTheme] = useState(() => getPreferredTheme());

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

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PAGE_STORAGE_KEY, activePage);
    }
  }, [activePage]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "dark" ? "light" : "dark"));
  };

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

  const renderActivePage = () => {
    switch (activePage) {
      case "dashboard":
        return <Dashboard />;
      case "stock-transactions":
        return <StockTransactions />;
      case "inventory-types":
        return <InventoryTypes />;
      case "inventory-records":
        return <InventoryRecords />;
      case "client-items":
        return <ClientItems />;
      case "suppliers":
        return <Suppliers />;
      case "purchase-orders":
        return <PurchaseOrders />;
      case "reports":
        return <Reports />;
      case "settings":
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      <InventoryLayout
        navItems={NAV_ITEMS}
        user={user}
        onLogout={logout}
        onQuickAction={() => setQuickActionOpen(true)}
        notificationCount={3}
        activeKey={activePage}
        onNavigate={setActivePage}
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        {renderActivePage()}
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
