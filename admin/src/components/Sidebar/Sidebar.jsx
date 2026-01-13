import React from "react";
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

const Sidebar = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon-wrapper">
          <RocketIcon className="w-5 h-5" />
        </div>
        <div className="logo-text">
          <h1>Project Manager</h1>
          <span>Admin Dashboard</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <a href="#" className="nav-item">
          <DashboardIcon className="nav-icon" />
          Dashboard
        </a>
        <a href="#" className="nav-item">
          <ProjectsIcon className="nav-icon" />
          Projects
        </a>
        <a href="#" className="nav-item active">
          <AssignIcon className="nav-icon" />
          Assign Projects
        </a>
        <a href="#" className="nav-item">
          <ClientsIcon className="nav-icon" />
          Clients
        </a>
        <a href="#" className="nav-item">
          <TeamsIcon className="nav-icon" />
          Teams
        </a>
        <a href="#" className="nav-item">
          <ReportsIcon className="nav-icon" />
          Reports
        </a>
      </nav>
    </aside>
  );
};

export default Sidebar;
