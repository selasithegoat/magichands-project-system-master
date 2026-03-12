import {
  BellIcon,
  BoltIcon,
  ChevronDownIcon,
  MenuIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  UserIcon,
} from "../icons/Icons";
import { formatUserName } from "../../utils/user";
import "./Topbar.css";

const Topbar = ({
  user,
  onQuickAction,
  notificationCount = 0,
  theme,
  onToggleTheme,
  onMenuClick,
}) => (
  <header className="topbar">
    <div className="topbar-left">
      <button
        type="button"
        className="icon-button menu-button"
        onClick={() => onMenuClick?.()}
        aria-label="Open navigation menu"
      >
        <MenuIcon />
      </button>
      <div className="search">
        <SearchIcon className="search-icon" />
        <input type="text" placeholder="Search inventory, records, or SKU" />
      </div>
    </div>

    <div className="topbar-actions">
      <button
        type="button"
        className="primary-button"
        onClick={() => onQuickAction?.()}
      >
        <BoltIcon className="button-icon" />
        Quick Action
      </button>
      <div className="topbar-icons">
        <button
          type="button"
          className="icon-button theme-toggle"
          onClick={() => onToggleTheme?.()}
          aria-label={
            theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
          }
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button type="button" className="icon-button" aria-label="Notifications">
          <BellIcon />
          {notificationCount > 0 ? <span className="icon-badge" /> : null}
        </button>
      </div>
      <button
        type="button"
        className="icon-button profile-avatar-button"
        aria-label="Profile"
      >
        <UserIcon />
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
);

export default Topbar;
