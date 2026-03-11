import { BellIcon, BoltIcon, ChevronDownIcon, SearchIcon, UserIcon } from "../icons/Icons";
import { formatUserName } from "../../utils/user";
import "./Topbar.css";

const Topbar = ({ user, onQuickAction, notificationCount = 0 }) => (
  <header className="topbar">
    <div className="search">
      <SearchIcon className="search-icon" />
      <input type="text" placeholder="Search inventory, records, or SKU" />
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
      <button type="button" className="icon-button" aria-label="Notifications">
        <BellIcon />
        {notificationCount > 0 ? <span className="icon-badge" /> : null}
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
