import React from "react";
import "./Header.css";
import { SearchIcon, BellIcon } from "../../icons/Icons"; // Ensure these exist

const Header = ({ onMenuClick }) => {
  return (
    <header className="header">
      <div className="header-left">
        <button className="menu-btn" onClick={onMenuClick}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
            />
          </svg>
        </button>
        <div className="breadcrumbs">
          <span>Assign Projects</span>
          <span className="breadcrumb-separator">{">"}</span>
          <span className="breadcrumb-current">New Assignment</span>
        </div>
      </div>

      <div className="header-actions">
        <div className="search-bar">
          <SearchIcon className="search-icon" />
          <input
            type="text"
            placeholder="Search projects..."
            className="search-input"
          />
        </div>

        <button className="notification-btn">
          <BellIcon className="w-5 h-5" />
          <span className="notification-badge"></span>
        </button>
      </div>
    </header>
  );
};

export default Header;
