import React from "react";
import { NavLink } from "react-router-dom";
import "./Sidebar.css";
import {
  DashboardIcon,
  ProjectsIcon,
  AssignIcon,
  ClientsIcon,
  TeamsIcon,
  ReportsIcon,
  RocketIcon,
} from "../../icons/Icons";

const Sidebar = ({ isOpen, onClose, user }) => {
  return (
    <aside className={`sidebar ${isOpen ? "sidebar-mobile-open" : ""}`}>
      <div className="sidebar-logo">
        <div className="logo-icon-wrapper">
          <RocketIcon className="w-5 h-5" />
        </div>
        <div className="logo-text">
          <h1>{user?.name || user?.firstName || "Project Manager"}</h1>
          <span>Admin Dashboard</span>
        </div>
        {/* Close button for mobile */}
        <button className="mobile-close-btn" onClick={onClose}>
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <a href="#" className="nav-item">
          <DashboardIcon className="nav-icon" />
          Dashboard
        </a>
        <NavLink
          to="/projects"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <ProjectsIcon className="nav-icon" />
          Projects
        </NavLink>
        <NavLink
          to="/assign"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <AssignIcon className="nav-icon" />
          Assign Projects
        </NavLink>
        <a href="#" className="nav-item">
          <ClientsIcon className="nav-icon" />
          Clients
        </a>
        <NavLink
          to="/teams"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <TeamsIcon className="nav-icon" />
          Teams
        </NavLink>
        <a href="#" className="nav-item">
          <ReportsIcon className="nav-icon" />
          Reports
        </a>
      </nav>
    </aside>
  );
};

export default Sidebar;
