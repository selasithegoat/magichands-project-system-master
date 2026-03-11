import { useEffect, useMemo, useState } from "react";
import {
  BellIcon,
  BoltIcon,
  ChevronDownIcon,
  ClientIcon,
  DashboardIcon,
  LayersIcon,
  PlusIcon,
  PurchaseOrderIcon,
  RecordsIcon,
  ReportIcon,
  SearchIcon,
  SettingsIcon,
  SuppliersIcon,
  SwapIcon,
  TruckIcon,
  UserIcon,
  WarningIcon,
  CheckIcon,
} from "../components/icons/Icons";
import Modal from "../components/ui/Modal";
import AlertBanner from "../components/ui/AlertBanner";
import NotificationItem from "../components/ui/NotificationItem";

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

const normalizeDepartments = (value) => {
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
};

const hasInventoryPortalAccess = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  const departments = normalizeDepartments(user.department).map((dept) =>
    String(dept || "").trim().toLowerCase(),
  );
  return departments.some((dept) =>
    ["front desk", "stores", "stock", "packaging"].includes(dept),
  );
};

const formatUserName = (user) => {
  const firstName = String(user?.firstName || "").trim();
  const lastName = String(user?.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || user?.name || "Inventory User";
};

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

  const quickActions = useMemo(
    () => [
      {
        title: "Add Inventory Item",
        description: "Create a new SKU and assign it to a location.",
      },
      {
        title: "Receive Shipment",
        description: "Log supplier deliveries and update stock counts.",
      },
      {
        title: "Adjust Stock",
        description: "Record cycle count adjustments and variances.",
      },
    ],
    [],
  );

  const activityFeed = useMemo(
    () => [
      {
        icon: <CheckIcon />,
        title: "Inventory updated",
        badge: "Verified",
        description: "500 units of CPU Air Cooler X1 were received in Stores A.",
        meta: "12 minutes ago",
      },
      {
        icon: <WarningIcon />,
        title: "Low stock alert",
        badge: "Critical",
        description: "SSD 1TB NVMe dropped below threshold (12 left).",
        meta: "2 hours ago",
      },
      {
        icon: <TruckIcon />,
        title: "Shipment received",
        badge: "PO-89231",
        description: "Bulk order from TechSupply Co. delivered to main hub.",
        meta: "5 hours ago",
      },
      {
        icon: <UserIcon />,
        title: "Profile updated",
        badge: "Staff",
        description: "Alex Rivera updated item properties for Mechanical Keyboard K2.",
        meta: "Yesterday at 4:15 PM",
      },
    ],
    [],
  );

  if (checking) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <div className="loading-bar" />
          <span>Loading inventory workspace...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <img src="/mhlogo.png" alt="MagicHands Logo" />
            <div>
              <h1>{APP_NAME}</h1>
              <p>Enterprise Inventory Portal</p>
            </div>
          </div>

          {accessDenied ? (
            <AlertBanner
              variant="warning"
              title="Access restricted"
              description="Only Admin, Front Desk, and Stores users can access the inventory portal."
            />
          ) : null}

          <form className="login-form" onSubmit={handleLogin}>
            <label>
              Employee ID
              <input name="employeeId" type="text" placeholder="Enter employee ID" />
            </label>
            <label>
              Password
              <input name="password" type="password" placeholder="Enter password" />
            </label>
            {loginError ? <div className="form-error">{loginError}</div> : null}
            <button type="submit" className="primary-button">
              Sign in
            </button>
          </form>
          <div className="login-footer">
            <span>Need access?</span>
            <button type="button" className="ghost-button">
              Contact admin
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inventory-app">
      <aside className="sidebar">
        <div className="brand">
          <img src="/mhlogo.png" alt="MagicHands Logo" />
          <div>
            <span className="brand-title">MagicHands</span>
            <span className="brand-subtitle">Inventory Portal</span>
          </div>
        </div>

        <nav className="nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                className={`nav-item ${item.active ? "active" : ""}`}
              >
                <Icon className="nav-icon" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="primary-button full-width">
            <PlusIcon className="button-icon" />
            New Record
          </button>
          <button type="button" className="ghost-button full-width" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="search">
            <SearchIcon className="search-icon" />
            <input
              type="text"
              placeholder="Search inventory, records, or SKU"
            />
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setQuickActionOpen(true)}
            >
              <BoltIcon className="button-icon" />
              Quick Action
            </button>
            <button type="button" className="icon-button">
              <BellIcon />
              <span className="icon-badge">3</span>
            </button>
            <div className="user-pill">
              <div className="user-avatar">
                <UserIcon />
              </div>
              <div>
                <strong>{formatUserName(user)}</strong>
                <span>{user?.role === "admin" ? "System Admin" : "Staff"}</span>
              </div>
              <ChevronDownIcon className="chevron" />
            </div>
          </div>
        </header>

        <div className="page-header">
          <div>
            <div className="breadcrumb">System / Dashboard</div>
            <h2>Inventory Dashboard</h2>
            <p>Real-time snapshots for stock health, usage, and purchasing activity.</p>
          </div>
          <AlertBanner
            variant="warning"
            title="Low stock summary"
            description="5 critical items need reorder approval today."
            actions={<button className="ghost-button">Review now</button>}
          />
        </div>

        <section className="stat-grid">
          <div className="stat-card">
            <div className="stat-header">
              <span>Total Items</span>
              <span className="delta positive">+2.4%</span>
            </div>
            <div className="stat-value">12,840</div>
            <div className="stat-chart">
              <div className="bar" style={{ width: "70%" }} />
              <div className="bar faint" style={{ width: "44%" }} />
              <div className="bar" style={{ width: "62%" }} />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-header">
              <span>Inventory Types</span>
              <span className="delta positive">+0.5%</span>
            </div>
            <div className="stat-value">42</div>
            <div className="stat-chart bars">
              <div style={{ height: "40%" }} />
              <div style={{ height: "55%" }} />
              <div style={{ height: "70%" }} />
              <div style={{ height: "86%" }} />
              <div style={{ height: "60%" }} />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-header">
              <span>Low Stock Alerts</span>
              <span className="delta negative">-12%</span>
            </div>
            <div className="stat-value">15</div>
            <div className="stat-chart">
              <div className="line-track" />
              <div className="line-progress" style={{ width: "35%" }} />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-header">
              <span>Inventory Value</span>
              <span className="delta positive">+5.1%</span>
            </div>
            <div className="stat-value">$1.24M</div>
            <div className="stat-chart value">
              <div className="value-tag">Growth trend</div>
            </div>
          </div>
        </section>

        <section className="panel-grid">
          <div className="panel">
            <div className="panel-header">
              <div>
                <h3>Inventory Movement</h3>
                <p>Unit movements over the last 7 days</p>
              </div>
              <button type="button" className="ghost-button">
                Last 7 Days
                <ChevronDownIcon className="chevron" />
              </button>
            </div>
            <div className="panel-body">
              <div className="line-chart">
                <div className="line-chart-grid" />
                <svg viewBox="0 0 600 180" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 120 C60 80, 120 140, 180 100 C240 60, 300 120, 360 70 C420 20, 480 90, 540 60 C570 45, 585 60, 600 50 L600 180 L0 180 Z"
                    fill="url(#lineFill)"
                  />
                  <path
                    d="M0 120 C60 80, 120 140, 180 100 C240 60, 300 120, 360 70 C420 20, 480 90, 540 60 C570 45, 585 60, 600 50"
                    fill="none"
                    stroke="#1d4ed8"
                    strokeWidth="3"
                  />
                </svg>
              </div>
              <div className="chart-labels">
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
                <span>Sun</span>
              </div>
            </div>
          </div>

          <div className="panel activity">
            <div className="panel-header">
              <div>
                <h3>Activity Feed</h3>
                <p>Latest inventory changes</p>
              </div>
              <button type="button" className="ghost-button">
                View all
              </button>
            </div>
            <div className="panel-body activity-list">
              {activityFeed.map((item) => (
                <NotificationItem key={item.title} {...item} />
              ))}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Stock In vs Stock Out</h3>
              <p>Weekly comparison of stock flow</p>
            </div>
            <div className="legend">
              <span className="legend-dot stock-in" />
              Stock In
              <span className="legend-dot stock-out" />
              Stock Out
            </div>
          </div>
          <div className="panel-body">
            <div className="stock-row">
              <div>
                <strong>Week 1</strong>
                <span>72% vs 48%</span>
              </div>
              <div className="stock-bar">
                <div className="stock-fill in" style={{ width: "72%" }} />
                <div className="stock-fill out" style={{ width: "48%" }} />
              </div>
            </div>
            <div className="stock-row">
              <div>
                <strong>Week 2</strong>
                <span>64% vs 36%</span>
              </div>
              <div className="stock-bar">
                <div className="stock-fill in" style={{ width: "64%" }} />
                <div className="stock-fill out" style={{ width: "36%" }} />
              </div>
            </div>
            <div className="stock-row">
              <div>
                <strong>Week 3</strong>
                <span>58% vs 41%</span>
              </div>
              <div className="stock-bar">
                <div className="stock-fill in" style={{ width: "58%" }} />
                <div className="stock-fill out" style={{ width: "41%" }} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <Modal
        isOpen={quickActionOpen}
        title="Quick Actions"
        subtitle="Run common inventory workflows without leaving the dashboard."
        primaryText="Start action"
        secondaryText="Close"
        onConfirm={() => setQuickActionOpen(false)}
        onClose={() => setQuickActionOpen(false)}
      >
        <div className="quick-actions">
          {quickActions.map((action) => (
            <div key={action.title} className="quick-action-card">
              <h4>{action.title}</h4>
              <p>{action.description}</p>
              <button type="button" className="ghost-button">
                Open
              </button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};

export default App;
