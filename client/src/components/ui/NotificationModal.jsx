import React from "react";
import "./NotificationModal.css";
// Icons
import XIcon from "../icons/XIcon"; // Using Close icon
import SearchIcon from "../icons/SearchIcon";
import AlertTriangleIcon from "../icons/AlertTriangleIcon";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import ClockIcon from "../icons/ClockIcon";
import CalendarIcon from "../icons/CalendarIcon";

// Mock Data
const notifications = {
  urgent: [
    {
      id: 1,
      title: "System Downtime Alert",
      desc: "Maintenance scheduled for 12:00 PM today.",
      time: "5m",
      type: "alert",
    },
    {
      id: 2,
      title: "Server Overload",
      desc: "Project Alpha server reaching capacity limits.",
      time: "12m",
      type: "warning",
    },
  ],
  approvals: [
    {
      id: 3,
      title: "Budget Approval Required",
      desc: "MagicHands Q3 Marketing Campaign budget.",
      time: "2h",
      type: "approval",
    },
  ],
  today: [
    {
      id: 4,
      title: "Sarah commented",
      desc: '"The design specs for project Alpha are ready."',
      time: "4h",
      type: "comment",
    },
    {
      id: 5,
      title: "Task Completed",
      desc: "MagicHands Website: Mobile responsiveness...",
      time: "6h",
      type: "success",
    },
    {
      id: 6,
      title: "New Team Member",
      desc: "John Doe joined the MagicHands development...",
      time: "8h",
      type: "user",
    },
    {
      id: 7,
      title: "Meeting Reminder",
      desc: "Sprint Planning starts in 15 minutes.",
      time: "9h",
      type: "event",
    },
  ],
};

const NotificationModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="notif-modal-overlay" onClick={onClose}>
      <div
        className="notif-modal-content"
        onClick={(e) => e.stopPropagation()} // Prevent close on click inside
      >
        {/* Header */}
        <div className="notif-header">
          <button className="notif-close-btn" onClick={onClose}>
            <XIcon width="20" height="20" />
          </button>
          <h2 className="notif-title">Notifications</h2>
          <button className="notif-mark-read">Mark all as read</button>
        </div>

        {/* Search */}
        <div className="notif-search-container">
          <SearchIcon style={{ width: 16, height: 16, color: "#94a3b8" }} />
          <input
            type="text"
            className="notif-search-input"
            placeholder="Search project updates"
          />
        </div>

        {/* Scrollable List */}
        <div className="notif-list-container">
          {/* URGENT */}
          <div className="notif-section">
            <div className="notif-section-header">
              <span className="section-dot red"></span>
              <span className="section-label">URGENT (2)</span>
              <span className="section-collapse-icon">^</span>
            </div>
            {notifications.urgent.map((n) => (
              <div key={n.id} className="notif-item highlight-red">
                <div className="notif-icon-wrapper red-bg">
                  {n.type === "alert" ? (
                    <span style={{ fontSize: 16, fontWeight: "bold" }}>*</span>
                  ) : (
                    <span style={{ fontSize: 16, fontWeight: "bold" }}>!</span>
                  )}
                </div>
                <div className="notif-content">
                  <div className="notif-row-top">
                    <span className="notif-item-title">{n.title}</span>
                    <span className="notif-time">{n.time}</span>
                  </div>
                  <p className="notif-item-desc">{n.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* APPROVALS */}
          <div className="notif-section">
            <div className="notif-section-header">
              <span className="section-dot yellow"></span>
              <span className="section-label">APPROVALS (1)</span>
              <span className="section-collapse-icon">^</span>
            </div>
            {notifications.approvals.map((n) => (
              <div key={n.id} className="notif-item">
                <div className="notif-icon-wrapper yellow-bg">
                  <span style={{ fontSize: 14 }}>📋</span>
                </div>
                <div className="notif-content">
                  <div className="notif-row-top">
                    <span className="notif-item-title">{n.title}</span>
                    <span className="notif-time">{n.time}</span>
                  </div>
                  <p className="notif-item-desc">{n.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* TODAY */}
          <div className="notif-section">
            <div className="notif-section-header">
              <span className="section-dot blue"></span>
              <span className="section-label">TODAY (4)</span>
              <span className="section-collapse-icon">^</span>
            </div>
            {notifications.today.map((n) => {
              let icon = null;
              if (n.type === "comment") icon = "💬";
              if (n.type === "success") icon = <CheckCircleIcon width={16} />;
              if (n.type === "user") icon = "👤";
              if (n.type === "event") icon = <CalendarIcon width={16} />;

              return (
                <div key={n.id} className="notif-item">
                  <div className="notif-icon-wrapper blue-light-bg">{icon}</div>
                  <div className="notif-content">
                    <div className="notif-row-top">
                      <span className="notif-item-title">{n.title}</span>
                      <span className="notif-time">{n.time}</span>
                    </div>
                    <p className="notif-item-desc">{n.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="notif-footer">
          <button className="notif-clear-btn">Clear all notifications</button>
        </div>
      </div>
    </div>
  );
};

export default NotificationModal;
