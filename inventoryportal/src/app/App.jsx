import { useCallback, useEffect, useState } from "react";
import QuickActionModal from "../components/modals/QuickActionModal";
import InventoryLayout from "../layouts/InventoryLayout";
import Dashboard from "../pages/Dashboard/Dashboard";
import LoadingScreen from "../components/feedback/LoadingScreen";
import Login from "../pages/Login/Login";
import NotificationDropdown from "../components/notifications/NotificationDropdown";
import StockTransactions from "../pages/StockTransactions/StockTransactions";
import InventoryCategories from "../pages/InventoryTypes/InventoryTypes";
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
import { fetchInventory } from "../utils/inventoryApi";
import {
  clearSessionTimeoutNotice,
  consumeSessionTimeoutNotice,
} from "../utils/sessionTimeoutNotice";
import { quickActions } from "../data/quickActions";
import useNotifications from "../hooks/useNotifications";
import useRealtimeClient from "../hooks/useRealtimeClient";
import useInactivityLogout from "../hooks/useInactivityLogout";

const APP_NAME = "MagicHands Inventory";
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const INACTIVITY_KEEPALIVE_MS = 60 * 1000;
const THEME_STORAGE_KEY = "inventory-portal-theme";
const THEME_MODE_STORAGE_KEY = "inventory-portal-theme-mode";
const DENSITY_STORAGE_KEY = "inventory-portal-density";
const PAGE_STORAGE_KEY = "inventory-portal-active-page";
const SEARCHABLE_PAGES = new Set([
  "inventory-records",
  "inventory-types",
  "purchase-orders",
  "stock-transactions",
  "suppliers",
  "client-items",
  "reports",
]);

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

const resolveThemeFromSetting = (value) => {
  if (typeof window === "undefined") return "light";
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "light") return "light";
  if (normalized === "dark") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

const getPreferredDensity = () => {
  if (typeof window === "undefined") return "Comfortable";
  return (
    window.localStorage.getItem(DENSITY_STORAGE_KEY) || "Comfortable"
  );
};

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", icon: DashboardIcon },
  { key: "inventory-types", label: "Inventory Categories", icon: LayersIcon },
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
  const [sessionNotice, setSessionNotice] = useState(() =>
    consumeSessionTimeoutNotice(),
  );
  const [accessDenied, setAccessDenied] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [activePage, setActivePage] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    return window.localStorage.getItem(PAGE_STORAGE_KEY) || "dashboard";
  });
  const [theme, setTheme] = useState(() => getPreferredTheme());
  const [tableDensity, setTableDensity] = useState(() => getPreferredDensity());

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
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute(
        "data-density",
        String(tableDensity || "Comfortable").toLowerCase(),
      );
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        DENSITY_STORAGE_KEY,
        String(tableDensity || "Comfortable"),
      );
    }
  }, [tableDensity]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PAGE_STORAGE_KEY, activePage);
    }
  }, [activePage]);

  useEffect(() => {
    let isMounted = true;
    const loadSettings = async () => {
      if (!user) return;
      try {
        const settings = await fetchInventory("/api/inventory/settings");
        if (!isMounted) return;
        const storedTheme =
          typeof window !== "undefined"
            ? window.localStorage.getItem(THEME_STORAGE_KEY)
            : null;
        const hasStoredTheme =
          storedTheme === "light" || storedTheme === "dark";
        const nextTheme = resolveThemeFromSetting(settings?.theme);
        const nextDensity = String(settings?.tableDensity || "Comfortable");
        if (!hasStoredTheme) {
          setTheme(nextTheme);
        }
        setTableDensity(nextDensity);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            THEME_MODE_STORAGE_KEY,
            String(settings?.theme || "System"),
          );
        }
      } catch {
        // Keep local preferences.
      }
    };

    loadSettings();
    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleAppearanceChange = (event) => {
      const nextTheme = resolveThemeFromSetting(event?.detail?.theme);
      const nextDensity = event?.detail?.tableDensity;
      if (nextTheme) {
        setTheme(nextTheme);
      }
      if (nextDensity) {
        setTableDensity(nextDensity);
      }
    };
    window.addEventListener(
      "inventory:appearance-changed",
      handleAppearanceChange,
    );
    return () =>
      window.removeEventListener(
        "inventory:appearance-changed",
        handleAppearanceChange,
      );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleNavigate = (event) => {
      const page = event?.detail?.page;
      if (page) {
        setActivePage(page);
      }
    };
    window.addEventListener("inventory:navigate", handleNavigate);
    return () =>
      window.removeEventListener("inventory:navigate", handleNavigate);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const trimmed = String(globalSearch || "").trim();
    const timer = setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("inventory:search", { detail: { term: trimmed } }),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  useEffect(() => {
    if (user) {
      clearSessionTimeoutNotice();
      setSessionNotice("");
      return;
    }

    const notice = consumeSessionTimeoutNotice();
    if (!notice) return;

    setSessionNotice(notice);
    setLoginError("");
    setAccessDenied(false);
  }, [user]);

  const logout = useCallback(async ({ reason = "manual" } = {}) => {
    if (reason !== "timeout") {
      clearSessionTimeoutNotice();
      setSessionNotice("");
    }
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
  }, []);

  useRealtimeClient(Boolean(user));
  useInactivityLogout({
    enabled: Boolean(user),
    timeout: INACTIVITY_TIMEOUT_MS,
    onLogout: logout,
    keepalive: true,
    keepaliveInterval: INACTIVITY_KEEPALIVE_MS,
  });
  const {
    notifications,
    loading: notificationsLoading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  } = useNotifications({ enabled: Boolean(user), userId: user?._id });

  useEffect(() => {
    if (!user) {
      setIsNotificationOpen(false);
    }
  }, [user]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    const nextMode = nextTheme === "dark" ? "Dark" : "Light";
    setTheme(nextTheme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, nextMode);
      window.dispatchEvent(
        new CustomEvent("inventory:appearance-changed", {
          detail: { theme: nextMode },
        }),
      );
    }
    if (user) {
      fetchInventory("/api/inventory/settings", {
        method: "PATCH",
        body: JSON.stringify({ theme: nextMode }),
        toast: { silent: true },
      }).catch(() => {
        // Keep local preference even if sync fails.
      });
    }
  };

  const handleGlobalSearchSubmit = (value) => {
    const trimmed = String(value || "").trim();
    if (trimmed && !SEARCHABLE_PAGES.has(activePage)) {
      setActivePage("inventory-records");
    }
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("inventory:search", { detail: { term: trimmed } }),
      );
    }, 0);
  };

  const handleQuickAction = (action) => {
    if (!action) return;
    if (action.target) {
      setActivePage(action.target);
    }
    setQuickActionOpen(false);
    if (typeof window === "undefined") return;
    const actionKey = action.key || action.title || "";
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("inventory:quick-action", {
          detail: { action: actionKey },
        }),
      );
    }, 0);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError("");
    setSessionNotice("");
    clearSessionTimeoutNotice();
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
      setSessionNotice("");
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
        notice={sessionNotice}
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
        return <InventoryCategories />;
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

  const notificationDropdown = (
    <NotificationDropdown
      onClose={() => setIsNotificationOpen(false)}
      notifications={notifications}
      loading={notificationsLoading}
      markAsRead={markAsRead}
      markAllAsRead={markAllAsRead}
      clearNotifications={clearNotifications}
      onNavigate={(target) => {
        if (target) {
          setActivePage(target);
        }
      }}
    />
  );

  return (
    <>
      <InventoryLayout
        navItems={NAV_ITEMS}
        user={user}
        onLogout={logout}
        onQuickAction={() => setQuickActionOpen(true)}
        notificationCount={unreadCount}
        onToggleNotification={() =>
          setIsNotificationOpen((prev) => !prev)
        }
        isNotificationOpen={isNotificationOpen}
        notificationDropdown={notificationDropdown}
        searchValue={globalSearch}
        onSearchChange={setGlobalSearch}
        onSearchSubmit={handleGlobalSearchSubmit}
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
        onAction={handleQuickAction}
      />
    </>
  );
};

export default App;
