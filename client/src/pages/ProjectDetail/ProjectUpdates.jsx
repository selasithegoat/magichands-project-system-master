import React from "react";
import "./ProjectUpdates.css";
// We can reuse icons if available, or just SVGs inline for simplicity now
const PlusIcon = ({ width = 16, height = 16, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M8 3.33334V12.6667M3.33334 8H12.6667"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ImageIcon = ({ width = 14, height = 14, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);

const SystemIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#64748b"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const updatesData = [
  {
    id: 1,
    user: {
      name: "Sarah Jenkins",
      role: "Project Lead",
      avatarType: "image",
      avatarUrl: "https://i.pravatar.cc/150?u=sarah",
    },
    time: "10 mins ago",
    content:
      "The LED wall modules have been delivered to the loading dock. Installation team has begun the assembly process on the main stage.",
    attachment: "delivery_proof.jpg",
    tag: "Production",
  },
  {
    id: 2,
    user: {
      name: "Mike Thompson",
      role: "Client Rep",
      avatarType: "initials",
      initials: "MT",
      initialsColor: "purple",
    },
    time: "2 hours ago",
    content:
      "Updated the guest list for the VIP section. Please verify the new seating chart matches the updated floor plan.",
    tag: "Client",
  },
  {
    id: 3,
    user: {
      name: "System",
      role: "Automated",
      avatarType: "system",
    },
    time: "Yesterday, 4:30 PM",
    isSystemMessage: true,
    contentHTML:
      "Project status changed from <strong>Planning</strong> to <span class='status-link'>In Progress</span> following Scope Approval.",
    tag: "General",
  },
  {
    id: 4,
    user: {
      name: "David Lee",
      role: "AV Technician",
      avatarType: "initials",
      initials: "DL",
      initialsColor: "blue",
    },
    time: "Yesterday, 2:15 PM",
    content:
      "Initial sound check equipment has been staged. We will need access to the main power distribution board by 8 AM tomorrow.",
    tag: "Production",
  },
  {
    id: 5,
    user: {
      name: "Sarah Jenkins",
      role: "Project Lead",
      avatarType: "image",
      avatarUrl: "https://i.pravatar.cc/150?u=sarah",
    },
    time: "Oct 20, 9:00 AM",
    content:
      'Kick-off meeting notes have been uploaded to the shared drive. Please review the "Risks" section before EOD.',
    tag: "General",
  },
];

const ProjectUpdates = () => {
  return (
    <div className="updates-container">
      <div className="updates-header">
        <div className="updates-title-group">
          <h3 className="updates-title">Latest Activity</h3>
          <span className="count-badge">5</span>
        </div>
        <button className="add-update-btn">
          <PlusIcon width="16" height="16" color="#fff" /> Add Update
        </button>
      </div>

      <div className="updates-list">
        {updatesData.map((update) => (
          <div key={update.id} className="update-card">
            <div className="update-header">
              <div className="user-info">
                {/* Avatar Logic */}
                {update.user.avatarType === "image" && (
                  <img
                    src={update.user.avatarUrl}
                    alt={update.user.name}
                    className="user-avatar-updates"
                  />
                )}
                {update.user.avatarType === "initials" && (
                  <div
                    className={`user-initials ${
                      update.user.initialsColor === "blue" ? "blue" : ""
                    }`}
                  >
                    {update.user.initials}
                  </div>
                )}
                {update.user.avatarType === "system" && (
                  <div className="system-icon-wrapper">
                    <SystemIcon />
                  </div>
                )}

                <div className="user-text-col">
                  <div className="user-name-row">
                    <span className="user-name">{update.user.name}</span>
                    <span className="user-role">{update.user.role}</span>
                  </div>
                  <span className="update-time">{update.time}</span>
                </div>
              </div>

              {/* Tag */}
              {update.tag && (
                <div className={`update-tag ${update.tag.toLowerCase()}`}>
                  {update.tag}
                </div>
              )}
            </div>

            <div className="update-content">
              {update.isSystemMessage ? (
                <p
                  className="update-content-text"
                  dangerouslySetInnerHTML={{ __html: update.contentHTML }}
                />
              ) : (
                <p className="update-content-text">{update.content}</p>
              )}
            </div>

            {update.attachment && (
              <div className="update-attachment">
                <ImageIcon width="14" height="14" color="#64748b" />
                {update.attachment}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="caught-up-message">You're all caught up!</p>
    </div>
  );
};

export default ProjectUpdates;
