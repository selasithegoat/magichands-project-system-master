import React, { useState } from "react";
import "./DashboardLayout.css";
import Sidebar from "../../components/Sidebar/Sidebar";
import Header from "../../components/Header/Header";

const DashboardLayout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="dashboard-layout">
      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar}></div>
      )}

      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      <div className="dashboard-main">
        <Header onMenuClick={toggleSidebar} />
        <main className="dashboard-page-content">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
