import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./Profile.css";
import EditIcon from "../../components/icons/EditIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";
import FolderIcon from "../../components/icons/FolderIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import HelpIcon from "../../components/icons/HelpIcon";
import LogOutIcon from "../../components/icons/LogOutIcon";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PATTERN = /^\+?[0-9()\-\s]{7,20}$/;
const MAX_AVATAR_SIZE_MB = 5;

const DEFAULT_FORM_DATA = {
  firstName: "",
  lastName: "",
  email: "",
  employeeType: "Staff",
  department: "",
  contact: "",
  avatarUrl: "",
};

const normalizeDepartmentInput = (value) => {
  if (!value) return "";
  return value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(", ");
};

const buildComparableProfileState = (formData, emailNotif, pushNotif) => ({
  firstName: formData.firstName.trim(),
  lastName: formData.lastName.trim(),
  email: formData.email.trim().toLowerCase(),
  employeeType: formData.employeeType || "Staff",
  department: normalizeDepartmentInput(formData.department),
  contact: formData.contact.trim(),
  avatarUrl: formData.avatarUrl || "",
  notificationSettings: {
    email: Boolean(emailNotif),
    push: Boolean(pushNotif),
  },
});

const validateProfile = (formData) => {
  const errors = {};

  if (!formData.firstName.trim()) {
    errors.firstName = "First name is required.";
  }

  if (!formData.lastName.trim()) {
    errors.lastName = "Last name is required.";
  }

  const emailValue = formData.email.trim();
  if (!emailValue) {
    errors.email = "Email is required.";
  } else if (!EMAIL_PATTERN.test(emailValue)) {
    errors.email = "Enter a valid email address.";
  }

  const contactValue = formData.contact.trim();
  if (!contactValue) {
    errors.contact = "Contact is required.";
  } else if (!CONTACT_PATTERN.test(contactValue)) {
    errors.contact = "Enter a valid phone number.";
  }

  return errors;
};

const Profile = ({ onSignOut, user, onUpdateProfile }) => {
  const [emailNotif, setEmailNotif] = useState(
    user?.notificationSettings?.email ?? false,
  );
  const [pushNotif, setPushNotif] = useState(
    user?.notificationSettings?.push ?? true,
  );
  const [notificationHint, setNotificationHint] = useState("");

  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [fieldTouched, setFieldTouched] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [stats, setStats] = useState({
    totalProjects: 0,
    completedProjects: 0,
    hoursLogged: 0,
  });
  const [loading, setLoading] = useState(!user);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [isFadingOut, setIsFadingOut] = useState(false);

  const [activities, setActivities] = useState([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const avatarInputRef = useRef(null);

  useEffect(() => {
    if (!avatarPreviewUrl) return undefined;
    return () => {
      URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (!user) return;

    const nextFormData = {
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      employeeType: user.employeeType || "Staff",
      department: Array.isArray(user.department)
        ? user.department.join(", ")
        : user.department || "",
      contact: user.contact || "",
      avatarUrl: user.avatarUrl || "",
    };

    const nextEmailNotif = user.notificationSettings?.email ?? false;
    const nextPushNotif = user.notificationSettings?.push ?? true;

    setFormData(nextFormData);
    setEmailNotif(nextEmailNotif);
    setPushNotif(nextPushNotif);
    setFieldTouched({});
    setSubmitAttempted(false);
    setAvatarError("");
    setNotificationHint("");
    setInitialSnapshot(
      buildComparableProfileState(nextFormData, nextEmailNotif, nextPushNotif),
    );
    setLoading(false);
  }, [user]);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/projects/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!message) return undefined;

    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 4500);

    const removeTimer = setTimeout(() => {
      setMessage(null);
      setIsFadingOut(false);
    }, 5000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [message]);

  const fetchActivities = async () => {
    try {
      const res = await fetch("/api/projects/activities/me?limit=5", {
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error("Error fetching activities:", error);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  useRealtimeRefresh(() => {
    fetchStats();
    fetchActivities();
  });

  const validationErrors = useMemo(() => validateProfile(formData), [formData]);

  const currentComparableState = useMemo(
    () => buildComparableProfileState(formData, emailNotif, pushNotif),
    [formData, emailNotif, pushNotif],
  );

  const hasChanges = useMemo(() => {
    if (!initialSnapshot) return false;
    return JSON.stringify(initialSnapshot) !== JSON.stringify(currentComparableState);
  }, [initialSnapshot, currentComparableState]);

  const canSave =
    hasChanges &&
    !saving &&
    !avatarUploading &&
    Object.keys(validationErrors).length === 0;

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600)
      return `${Math.floor(diffInSeconds / 60)} mins ago`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800)
      return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return date.toLocaleDateString();
  };

  const getActivityIcon = (action) => {
    const lowerAction = String(action || "").toLowerCase();
    if (lowerAction.includes("create")) return { icon: "📁", color: "blue" };
    if (lowerAction.includes("update") || lowerAction.includes("status")) {
      return { icon: "✏️", color: "orange" };
    }
    if (lowerAction.includes("delete")) return { icon: "🗑️", color: "red" };
    if (lowerAction.includes("add")) return { icon: "➕", color: "green" };
    if (lowerAction.includes("approval")) return { icon: "✅", color: "green" };
    return { icon: "📝", color: "gray" };
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFieldTouched((prev) => ({ ...prev, [name]: true }));
  };

  const handleBlur = (event) => {
    const { name } = event.target;
    setFieldTouched((prev) => ({ ...prev, [name]: true }));
  };

  const getFieldError = (name) => {
    if (!submitAttempted && !fieldTouched[name]) return "";
    return validationErrors[name] || "";
  };

  const handleToggleEmailNotif = () => {
    if (emailNotif && !pushNotif) {
      setNotificationHint("At least one notification channel must stay enabled.");
      return;
    }
    setNotificationHint("");
    setEmailNotif((prev) => !prev);
  };

  const handleTogglePushNotif = () => {
    if (pushNotif && !emailNotif) {
      setNotificationHint("At least one notification channel must stay enabled.");
      return;
    }
    setNotificationHint("");
    setPushNotif((prev) => !prev);
  };

  const openAvatarSelector = () => {
    if (avatarUploading) return;
    avatarInputRef.current?.click();
  };

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setAvatarError("");
    setMessage(null);

    if (!file.type || !file.type.startsWith("image/")) {
      setAvatarError("Please select a valid image file.");
      return;
    }

    const maxBytes = MAX_AVATAR_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      setAvatarError(`Image must be ${MAX_AVATAR_SIZE_MB}MB or less.`);
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setAvatarPreviewUrl(localPreview);

    try {
      setAvatarUploading(true);
      const payload = new FormData();
      payload.append("avatar", file);

      const res = await fetch("/api/auth/profile/avatar", {
        method: "POST",
        credentials: "include",
        body: payload,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to upload avatar.");
      }

      const nextAvatarUrl = data.avatarUrl || "";
      setFormData((prev) => ({ ...prev, avatarUrl: nextAvatarUrl }));
      setInitialSnapshot((prev) =>
        prev
          ? { ...prev, avatarUrl: nextAvatarUrl }
          : buildComparableProfileState(
              { ...formData, avatarUrl: nextAvatarUrl },
              emailNotif,
              pushNotif,
            ),
      );
      setAvatarPreviewUrl("");
      setMessage({ type: "success", text: "Avatar updated successfully!" });
      if (onUpdateProfile) onUpdateProfile();
    } catch (error) {
      const errorMessage = error.message || "Failed to upload avatar.";
      setAvatarError(errorMessage);
      setAvatarPreviewUrl("");
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    setSubmitAttempted(true);
    setMessage(null);
    setIsFadingOut(false);

    if (Object.keys(validationErrors).length > 0) {
      setMessage({
        type: "error",
        text: "Please correct the highlighted fields before saving.",
      });
      return;
    }

    if (!hasChanges) {
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          email: formData.email.trim(),
          contact: formData.contact.trim(),
          notificationSettings: {
            email: emailNotif,
            push: pushNotif,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMessage({ type: "success", text: "Profile updated successfully!" });
        setFieldTouched({});
        setSubmitAttempted(false);
        setInitialSnapshot(currentComparableState);
        if (onUpdateProfile) onUpdateProfile();
      } else {
        setMessage({
          type: "error",
          text: data.message || "Failed to update profile.",
        });
      }
    } catch (error) {
      console.error("Error updating profile", error);
      setMessage({ type: "error", text: "An error occurred." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="profile-container">Loading...</div>;

  const avatarDisplaySrc = avatarPreviewUrl || formData.avatarUrl;

  return (
    <div className="profile-container">
      <div className="profile-top-grid">
        <div className="profile-header-card">
          <div className="profile-wrapper">
            <div className="profile-avatar-large">
              {avatarDisplaySrc ? (
                <img
                  src={avatarDisplaySrc}
                  alt={`${formData.firstName} ${formData.lastName}`.trim() || "User avatar"}
                  className="profile-avatar-image"
                />
              ) : (
                <>
                  {formData.firstName ? formData.firstName[0] : "U"}
                  {formData.lastName ? formData.lastName[0] : ""}
                </>
              )}
              <button
                className="edit-avatar-btn"
                type="button"
                onClick={openAvatarSelector}
                disabled={avatarUploading}
                title="Upload avatar"
              >
                <EditIcon width="12" height="12" />
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                style={{ display: "none" }}
              />
            </div>
            <div className="profile-info-main">
              <div className="profile-name-row">
                <h1>
                  {formData.firstName} {formData.lastName}
                </h1>
                <span className="role-badge">{formData.employeeType}</span>
              </div>
              <p className="profile-handle">{formData.department}</p>
              <p className="avatar-helper-text">
                {avatarUploading
                  ? "Uploading avatar..."
                  : `Upload a JPG/PNG image up to ${MAX_AVATAR_SIZE_MB}MB.`}
              </p>
              {avatarError && <p className="field-error avatar-error">{avatarError}</p>}

              <label>Contact (phone)</label>
              <div className="contact-value">
                <span>Tel</span> {formData.contact || "Not set"}
              </div>
            </div>
          </div>
        </div>

        <div className="profile-stats-column">
          <div className="stat-card-row">
            <div>
              <span className="stat-label">Total Projects</span>
              <h2 className="stat-value">{stats.totalProjects}</h2>
            </div>
            <div className="stat-icon-box blue">
              <FolderIcon />
            </div>
          </div>
          <div className="stat-card-row">
            <div>
              <span className="stat-label">Tasks Completed</span>
              <h2 className="stat-value">{stats.completedProjects}</h2>
            </div>
            <div className="stat-icon-box green">
              <CheckCircleIcon />
            </div>
          </div>
          <div className="stat-card-row">
            <div>
              <span className="stat-label">Hours Logged</span>
              <h2 className="stat-value">{stats.hoursLogged}</h2>
            </div>
            <div className="stat-icon-box purple">
              <ClockIcon />
            </div>
          </div>
        </div>
      </div>

      <div className="profile-content-grid">
        <div className="profile-left-col">
          <div className="content-card">
            <div className="card-header">
              <h3>My Profile</h3>
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
                  "!"
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
                  onBlur={handleBlur}
                  className={getFieldError("firstName") ? "has-error" : ""}
                />
                {getFieldError("firstName") && (
                  <p className="field-error">{getFieldError("firstName")}</p>
                )}
              </div>
              <div className="form-group">
                <label>Last Name</label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={getFieldError("lastName") ? "has-error" : ""}
                />
                {getFieldError("lastName") && (
                  <p className="field-error">{getFieldError("lastName")}</p>
                )}
              </div>
              <div className="form-group full-width">
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={getFieldError("email") ? "has-error" : ""}
                />
                {getFieldError("email") && (
                  <p className="field-error">{getFieldError("email")}</p>
                )}
              </div>
              <div className="form-group full-width">
                <label>Contact</label>
                <input
                  type="text"
                  name="contact"
                  value={formData.contact}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={getFieldError("contact") ? "has-error" : ""}
                />
                {getFieldError("contact") && (
                  <p className="field-error">{getFieldError("contact")}</p>
                )}
              </div>
            </div>
          </div>

          <div className="content-card">
            <div className="card-header">
              <h3>Settings</h3>
            </div>
            <div className="settings-section">
              <h4>Notifications</h4>
              <p className="setting-helper">
                At least one notification channel must stay enabled.
              </p>

              <div className="setting-row">
                <div>
                  <div className="setting-title">Email Notifications</div>
                  <div className="setting-desc">
                    Receive email alerts for assignments and updates
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={emailNotif}
                    onChange={handleToggleEmailNotif}
                    aria-label="Toggle email notifications"
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-title">Push Notifications</div>
                  <div className="setting-desc">
                    Receive real-time push alerts on mobile devices
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={pushNotif}
                    onChange={handleTogglePushNotif}
                    aria-label="Toggle push notifications"
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              {notificationHint && (
                <p className="setting-warning" role="status">
                  {notificationHint}
                </p>
              )}
            </div>
          </div>

          <div className="form-actions">
            <button className="save-btn" onClick={handleSave} disabled={!canSave}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>

        <div className="profile-right-col">
          <div className="content-card">
            <div className="card-header">
              <h3>Activity</h3>
              <Link to="/my-activities" className="view-all-link">
                View All
              </Link>
            </div>
            <div className="activity-list">
              {isLoadingActivities ? (
                <div
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  Loading activity...
                </div>
              ) : activities.length > 0 ? (
                activities.map((activity) => {
                  const { icon, color } = getActivityIcon(activity.action);
                  return (
                    <div className="activity-item" key={activity._id}>
                      <div className={`activity-icon ${color}`}>{icon}</div>
                      <div className="activity-content">
                        <p>{activity.description}</p>
                        <span className="time">{formatTimeAgo(activity.createdAt)}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    padding: "1rem",
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  No recent activity
                </div>
              )}
            </div>
          </div>

          <div className="content-card">
            <div className="card-header">
              <h3>Help & Support</h3>
            </div>
            <div className="support-list">
              <button className="support-btn" type="button">
                <HelpIcon /> Browse FAQs <span className="arrow">&gt;</span>
              </button>
              <button className="support-btn" type="button">
                Contact Support <span className="arrow">&gt;</span>
              </button>
            </div>
            <div className="support-tip">
              <strong>Tip:</strong> You can find more detailed documentation in
              the Knowledge Base accessible from the main dashboard.
            </div>
          </div>

          <button className="sign-out-btn" onClick={onSignOut}>
            <LogOutIcon /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
