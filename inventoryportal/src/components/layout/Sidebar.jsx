import { LogoutIcon, PlusIcon } from "../icons/Icons";
import "./Sidebar.css";

const Sidebar = ({ navItems, onLogout, activeKey, onNavigate }) => (
  <aside className="sidebar">
    <div className="brand">
      <img src="/mhlogo.png" alt="MagicHands Logo" />
      <div className="brand-text">
        <span className="brand-title">MagicHands</span>
        <span className="brand-subtitle">Inventory Portal</span>
      </div>
    </div>

    <nav className="nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${isActive ? "active" : ""}`}
            aria-label={item.label}
            title={item.label}
            onClick={() => onNavigate?.(item.key)}
          >
            <Icon className="nav-icon" />
            <span className="nav-text">{item.label}</span>
          </button>
        );
      })}
    </nav>

    <div className="sidebar-footer">
      <button
        type="button"
        className="primary-button full-width"
        aria-label="New record"
        title="New record"
      >
        <PlusIcon className="button-icon" />
        <span className="button-text">New Record</span>
      </button>
      <button
        type="button"
        className="ghost-button full-width"
        onClick={onLogout}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogoutIcon className="button-icon" />
        <span className="button-text">Sign out</span>
      </button>
    </div>
  </aside>
);

export default Sidebar;
