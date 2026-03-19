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
  onToggleNotification,
  isNotificationOpen = false,
  notificationDropdown,
  searchValue = "",
  onSearchChange,
  onSearchSubmit,
  theme,
  onToggleTheme,
  onMenuClick,
}) => {
  const avatarAlt = `${formatUserName(user) || "User"} avatar`;
  const avatarUrl = user?.avatarUrl || "";

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    onSearchSubmit?.(searchValue);
  };

  return (
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
        <form className="search" onSubmit={handleSearchSubmit}>
          <SearchIcon className="search-icon" />
          <input
            type="text"
            placeholder="Search inventory, records, or Item ID"
            value={searchValue}
            onChange={(event) => onSearchChange?.(event.target.value)}
          />
        </form>
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
            {theme === "dark" ? <SunIcon size={40} /> : <MoonIcon size={40} />}
          </button>
          <div className="notification-wrapper" data-notification-root>
            <button
              type="button"
              className="icon-button"
              aria-label="Notifications"
              aria-expanded={isNotificationOpen}
              aria-haspopup="dialog"
              onClick={() => onToggleNotification?.()}
            >
              <BellIcon size={40} />
              {notificationCount > 0 ? <span className="icon-badge" /> : null}
            </button>
            {isNotificationOpen ? notificationDropdown : null}
          </div>
        </div>
        <div className="user-pill">
          <div className="user-avatar">
            {avatarUrl ? <img src={avatarUrl} alt={avatarAlt} /> : <UserIcon />}
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
};

export default Topbar;
