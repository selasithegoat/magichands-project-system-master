import AlertBanner from "../../components/ui/AlertBanner";
import NotificationItem from "../../components/ui/NotificationItem";
import {
  CheckIcon,
  ChevronDownIcon,
  TruckIcon,
  UserIcon,
  WarningIcon,
} from "../../components/icons/Icons";
import { formatCurrencyValue, useInventoryCurrency } from "../../utils/currency";
import "./Dashboard.css";

const activityFeed = [
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
];

const Dashboard = () => {
  const { currency, rate } = useInventoryCurrency();

  return (
    <>
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
          <div className="bar bar-1" />
          <div className="bar faint bar-2" />
          <div className="bar bar-3" />
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-header">
          <span>Inventory Types</span>
          <span className="delta positive">+0.5%</span>
        </div>
        <div className="stat-value">42</div>
        <div className="stat-chart bars">
          <div className="bar-stack bar-stack-1" />
          <div className="bar-stack bar-stack-2" />
          <div className="bar-stack bar-stack-3" />
          <div className="bar-stack bar-stack-4" />
          <div className="bar-stack bar-stack-5" />
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
          <div className="line-progress line-progress-1" />
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-header">
          <span>Inventory Value</span>
          <span className="delta positive">+5.1%</span>
        </div>
        <div className="stat-value">
          {formatCurrencyValue("1.24M", currency, rate)}
        </div>
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
            <div className="stock-fill in stock-fill-in-1" />
            <div className="stock-fill out stock-fill-out-1" />
          </div>
        </div>
        <div className="stock-row">
          <div>
            <strong>Week 2</strong>
            <span>64% vs 36%</span>
          </div>
          <div className="stock-bar">
            <div className="stock-fill in stock-fill-in-2" />
            <div className="stock-fill out stock-fill-out-2" />
          </div>
        </div>
        <div className="stock-row">
          <div>
            <strong>Week 3</strong>
            <span>58% vs 41%</span>
          </div>
          <div className="stock-bar">
            <div className="stock-fill in stock-fill-in-3" />
            <div className="stock-fill out stock-fill-out-3" />
          </div>
        </div>
      </div>
    </section>
  </>
  );
};

export default Dashboard;
