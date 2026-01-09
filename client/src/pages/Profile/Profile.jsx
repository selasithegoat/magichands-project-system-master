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

const Profile = ({ onSignOut, user, onUpdateProfile }) => {
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(false);

  // User Data State
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    employeeType: "Staff",
    department: "",
    contact: "",
  });
  const [loading, setLoading] = useState(!user); // If user prop exists, not loading
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'success' | 'error', text: '' }
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Sync state with user prop when it changes
  React.useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        employeeType: user.employeeType || "Staff",
        department: user.department || "",
        contact: user.contact || "",
      });
      setLoading(false);
    }
  }, [user]);

  // Handle Toast Timeout
  React.useEffect(() => {
    if (message) {
      // Start fade out after 4.5s
      const fadeTimer = setTimeout(() => {
        setIsFadingOut(true);
      }, 4500);

      // Remove after 5s
      const removeTimer = setTimeout(() => {
        setMessage(null);
        setIsFadingOut(false);
      }, 5000);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
      };
    }
  }, [message]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setIsFadingOut(false);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Profile updated successfully!" });
        if (onUpdateProfile) onUpdateProfile(); // Refresh app state
      } else {
        setMessage({ type: "error", text: "Failed to update profile." });
      }
    } catch (error) {
      console.error("Error updating profile", error);
      setMessage({ type: "error", text: "An error occurred." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="profile-container">Loading...</div>;

  return (
    <div className="profile-container">
      {/* Top Section: Header & Stats */}
      <div className="profile-top-grid">
        {/* ... (rest of top grid remains same) ... */}
        {/* Profile Card */}
        <div className="profile-header-card">
          <div className="profile-wrapper">
            <div className="profile-avatar-large">
              {formData.firstName ? formData.firstName[0] : "U"}
              {formData.lastName ? formData.lastName[0] : ""}
              <button className="edit-avatar-btn">
                <EditIcon width="12" height="12" />
              </button>
            </div>
            <div className="profile-info-main">
              <div className="profile-name-row">
                <h1>
                  {formData.firstName} {formData.lastName}
                </h1>
                <span className="role-badge">{formData.employeeType}</span>
              </div>
              <p className="profile-handle">{formData.department}</p>
              <p className="profile-bio">
                Senior Project Lead specializing in visual design and team
                management. Passionate about creating seamless user experiences
                and optimizing workflow efficiency.
              </p>
              <label>Contact (phone)</label>
              <div className="contact-value">
                <span>📞</span> {formData.contact || "Not set"}
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

            {message && (
              <div
                className={`toast-message ${message.type} ${
                  isFadingOut ? "fading-out" : ""
                }`}
              >
                {message.type === "success" ? (
                  <CheckCircleIcon width="16" height="16" />
                ) : (
                  "⚠️"
                )}
                {message.text}
              </div>
            )}

            <div className="form-grid">
              <div className="form-group">
                <label>First Name</label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group full-width">
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Employee Type</label>
                <div className="select-wrapper">
                  <select
                    name="employeeType"
                    value={formData.employeeType}
                    onChange={handleChange}
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
                <input
                  type="text"
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label>Contact</label>
                <input
                  type="text"
                  name="contact"
                  value={formData.contact}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="form-actions">
              <button
                className="save-btn"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
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
