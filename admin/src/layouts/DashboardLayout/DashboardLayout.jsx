import React, { useState } from "react";
import "./DashboardLayout.css";
import Sidebar from "../../components/Sidebar/Sidebar";
import Header from "../../components/Header/Header";
import StageBottleneckAlert from "../../components/StageBottleneckAlert/StageBottleneckAlert";
import ChatDock from "@client/components/chat/ChatDock";
import DeliveryCalendarFab from "@client/components/features/DeliveryCalendarFab";
import { useNavigate } from "react-router-dom";

const DashboardLayout = ({ children, user, onLogout }) => {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isAdminUser = user?.role === "admin";

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);
  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="dashboard-layout">
      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar}></div>
      )}

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
        user={user}
        onLogout={onLogout}
      />

      <div className="dashboard-main">
        <Header onMenuClick={toggleSidebar} user={user} />
        <StageBottleneckAlert />
        <main className="dashboard-page-content">{children}</main>
      </div>

      {user?._id && <ChatDock user={user} />}
      {isAdminUser && (
        <DeliveryCalendarFab
          requestSource="admin"
          onOpenProject={(project) => navigate(`/projects/${project?._id}`)}
        />
      )}
    </div>
  );
};

export default DashboardLayout;
