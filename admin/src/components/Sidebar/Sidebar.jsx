import React from "react";
import { NavLink } from "react-router-dom";
import "./Sidebar.css";
import {
  DashboardIcon,
  ProjectsIcon,
  ClientsIcon,
  TeamsIcon,
  ReportsIcon,
  RocketIcon,
  LogoutIcon,
} from "../../icons/Icons";
import { useNavigate } from "react-router-dom";

const Sidebar = ({ isOpen, onClose, user }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        window.location.href = "/login"; // Redirect to login
      }
    } catch (err) {
      console.error("Logout failed", err);
    }
  };
  return (
    <aside className={`sidebar ${isOpen ? "sidebar-mobile-open" : ""}`}>
      <div className="sidebar-logo">
 
        <div className="logo-text">
          <h1>
            {user?.name ||
              user?.firstName + " " + user?.lastName ||
              "Project Manager"}
          </h1>
          <span>Admin Dashboard</span>
        </div>
        {/* Close button for mobile */}
        <button className="mobile-close-btn" onClick={onClose}>
          &times;
        </button>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <DashboardIcon className="nav-icon" />
          Dashboard
        </NavLink>
        <NavLink
          to="/projects"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <ProjectsIcon className="nav-icon" />
          Projects
        </NavLink>
        <NavLink
          to="/clients"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <ClientsIcon className="nav-icon" />
          Clients
        </NavLink>
        <NavLink
          to="/teams"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <TeamsIcon className="nav-icon" />
          Team
        </NavLink>
        <NavLink
          to="/analytics"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <ReportsIcon className="nav-icon" />
          Analytics
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <button className="nav-item logout-btn" onClick={handleLogout}>
          <LogoutIcon className="nav-icon" />
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
