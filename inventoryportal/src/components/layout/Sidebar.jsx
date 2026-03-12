import { LogoutIcon, MoonIcon, PlusIcon, SunIcon, UserIcon } from "../icons/Icons";
import { formatUserName } from "../../utils/user";
import "./Sidebar.css";

const Sidebar = ({
  navItems,
  onLogout,
  activeKey,
  onNavigate,
  isMobileOpen = false,
  onCloseMobile,
  user,
  theme,
  onToggleTheme,
}) => (
  <aside className={`sidebar ${isMobileOpen ? "is-open" : ""}`}>
    <div className="brand">
      <img src="/icon-192.png" alt="MagicHands Logo" />
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
            onClick={() => {
              onNavigate?.(item.key);
              onCloseMobile?.();
            }}
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
        onClick={onCloseMobile}
      >
        <PlusIcon className="button-icon" />
        <span className="button-text">New Record</span>
      </button>
      <button
        type="button"
        className="ghost-button full-width"
        onClick={() => {
          onLogout?.();
          onCloseMobile?.();
        }}
        aria-label="Sign out"
        title="Sign out"
      >
        <LogoutIcon className="button-icon" />
        <span className="button-text">Sign out</span>
      </button>
    </div>
     <div className="mobile-profile">
      <div className="mobile-avatar">
        <UserIcon />
      </div>
      <div>
        <strong>{formatUserName(user)}</strong>
        <span>{user?.role === "admin" ? "System Admin" : "Staff"}</span>
      </div>
      <button
        type="button"
        className="ghost-button full-width mobile-theme-toggle"
        onClick={() => onToggleTheme?.()}
      >
        {theme === "dark" ? <SunIcon className="button-icon" /> : <MoonIcon className="button-icon" />}
        {theme === "dark" ? "Light Mode" : "Dark Mode"}
      </button>
    </div>
  </aside>
);

export default Sidebar;
