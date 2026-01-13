import React from "react";
import "./Header.css";
import { SearchIcon, BellIcon } from "../../icons/Icons"; // Ensure these exist

const Header = () => {
  return (
    <header className="header">
      <div className="breadcrumbs">
        <span>Assign Projects</span>
        <span className="breadcrumb-separator">{">"}</span>
        <span className="breadcrumb-current">New Assignment</span>
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
