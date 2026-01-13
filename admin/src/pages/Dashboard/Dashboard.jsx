import React from "react";
import "./Dashboard.css";

const Dashboard = ({ user, onLogout }) => {
  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Admin Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user?.name || "Admin"}</span>
          <button onClick={onLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>
      <main className="dashboard-content">
        <div className="dashboard-card">
          <h2>Overview</h2>
          <p>You have successfully logged in as an Administrator.</p>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
