import React, { useState } from "react";
import "./Profile.css";
// Icons
import UserAvatar from "../../components/ui/UserAvatar";
import EditIcon from "../../components/icons/EditIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import FolderIcon from "../../components/icons/FolderIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import UploadIcon from "../../components/icons/UploadIcon";
import HelpIcon from "../../components/icons/HelpIcon";
import LogOutIcon from "../../components/icons/LogOutIcon";

const Profile = ({ onSignOut }) => {
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(false);
  const [contact, setContact] = useState("+233 (0) XX XXX XXXX");
  const [employeeType, setEmployeeType] = useState("Staff");

  return (
    <div className="profile-container">
      {/* Top Section: Header & Stats */}
      <div className="profile-top-grid">
        {/* Profile Card */}
        <div className="profile-header-card">
          <div className="profile-wrapper">
            <div className="profile-avatar-large">
              AJ
              <button className="edit-avatar-btn">
                <EditIcon width="12" height="12" />
              </button>
            </div>
            <div className="profile-info-main">
              <div className="profile-name-row">
                <h1>Akwasi John</h1>
                <span className="role-badge">{employeeType}</span>
              </div>
              <p className="profile-handle">Graphics Dept</p>
              <p className="profile-bio">
                Senior Project Lead specializing in visual design and team
                management. Passionate about creating seamless user experiences
                and optimizing workflow efficiency.
              </p>
              <label>Contact (phone)</label>
              <div className="contact-value">
                <span>📞</span> {contact}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Column */}
        <div className="profile-stats-column">
          <div className="stat-card-row">
            <div>
              <span className="stat-label">Total Projects</span>
              <h2 className="stat-value">14</h2>
            </div>
            <div className="stat-icon-box blue">
              <FolderIcon />
            </div>
          </div>
          <div className="stat-card-row">
            <div>
              <span className="stat-label">Tasks Completed</span>
              <h2 className="stat-value">32</h2>
            </div>
            <div className="stat-icon-box green">
              <CheckCircleIcon />
            </div>
          </div>
          <div className="stat-card-row">
            <div>
              <span className="stat-label">Hours Logged</span>
              <h2 className="stat-value">128</h2>
            </div>
            <div className="stat-icon-box purple">
              <ClockIcon />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid: Form, Activity, Settings */}
      <div className="profile-content-grid">
        {/* Left Column: Form & Settings */}
        <div className="profile-left-col">
          {/* My Profile Form */}
          <div className="content-card">
            <div className="card-header">
              <h3>
                <span style={{ marginRight: "0.5rem" }}>👤</span> My Profile
              </h3>
              <span className="completion-badge">85% Complete</span>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label>First Name</label>
                <input type="text" defaultValue="Akwasi" />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input type="text" defaultValue="John" />
              </div>
              <div className="form-group full-width">
                <label>Email Address</label>
                <input type="email" defaultValue="akwasi.john@magichands.co" />
              </div>
              <div className="form-group">
                <label>Employee Type</label>
                <div className="select-wrapper">
                  <select
                    value={employeeType}
                    onChange={(e) => setEmployeeType(e.target.value)}
                  >
                    <option>Staff</option>
                    <option>NSP</option>
                    <option>Intern</option>
                    <option>Trainee</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Department</label>
                <input type="text" defaultValue="Graphics Dept" />
              </div>
              <div className="form-group">
                <label>Contact</label>
                <input
                  type="text"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                />
              </div>
            </div>
            <div className="form-actions">
              <button className="save-btn">Save Changes</button>
            </div>
          </div>

          {/* Settings - Notifications */}
          <div className="content-card">
            <div className="card-header">
              <h3>
                <span style={{ marginRight: "0.5rem" }}>⚙️</span> Settings
              </h3>
            </div>
            <div className="settings-section">
              <h4>Notifications</h4>

              <div className="setting-row">
                <div>
                  <div className="setting-title">Email Notifications</div>
                  <div className="setting-desc">
                    Receive daily summaries and alerts
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={emailNotif}
                    onChange={() => setEmailNotif(!emailNotif)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-title">Push Notifications</div>
                  <div className="setting-desc">
                    Receive alerts on mobile devices
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={pushNotif}
                    onChange={() => setPushNotif(!pushNotif)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Activity & Support */}
        <div className="profile-right-col">
          {/* Activity */}
          <div className="content-card">
            <div className="card-header">
              <h3>
                <span style={{ marginRight: "0.5rem" }}>⏱️</span> Activity
              </h3>
              <a href="#" className="view-all-link">
                View All
              </a>
            </div>
            <div className="activity-list">
              <div className="activity-item">
                <div className="activity-icon blue">💬</div>
                <div className="activity-content">
                  <p>
                    Commented on <strong>"Q4 Marketing Strategy"</strong>
                  </p>
                  <span className="time">2 hours ago</span>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon green">
                  <CheckCircleIcon width="14" height="14" />
                </div>
                <div className="activity-content">
                  <p>
                    Completed task <strong>"Update Homepage Hero"</strong>
                  </p>
                  <span className="time">5 hours ago</span>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon purple">
                  <UploadIcon width="14" height="14" />
                </div>
                <div className="activity-content">
                  <p>
                    Uploaded 3 files to <strong>"Assets Folder"</strong>
                  </p>
                  <span className="time">Yesterday</span>
                </div>
              </div>
              <div className="activity-item">
                <div className="activity-icon orange">✏️</div>
                <div className="activity-content">
                  <p>Updated profile picture</p>
                  <span className="time">2 days ago</span>
                </div>
              </div>
            </div>
          </div>

          {/* Help & Support */}
          <div className="content-card">
            <div className="card-header">
              <h3>
                <span style={{ marginRight: "0.5rem" }}>❓</span> Help & Support
              </h3>
            </div>
            <div className="support-list">
              <button className="support-btn">
                <HelpIcon /> Browse FAQs <span className="arrow">›</span>
              </button>
              <button className="support-btn">
                <span style={{ fontSize: "1.2rem", lineHeight: 0 }}>🎧</span>{" "}
                Contact Support <span className="arrow">›</span>
              </button>
            </div>
            <div className="support-tip">
              <strong>Tip:</strong> You can find more detailed documentation in
              the Knowledge Base accessible from the main dashboard.
            </div>
          </div>

          {/* Sign Out */}
          <button className="sign-out-btn" onClick={onSignOut}>
            <LogOutIcon /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
