import React, { useState } from "react";
import "./ProjectChallenges.css";

const FlagIcon = ({ width = 24, height = 24, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4 15C4 15 5 14 8 14C11 14 13 16 16 16C19 16 20 15 20 15V3C20 3 19 4 16 4C13 4 11 2 8 2C5 2 4 3 4 3V15Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4 22V15"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BellIcon = ({ width = 20, height = 20, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M18 8A6 6 0 0 0 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13.73 21A2 2 0 0 1 10.27 21"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const challengesData = [
  {
    id: 1,
    title: "LED Wall P3 Flickering",
    description:
      "Main stage center screen showing intermittent signal loss during test pattern.",
    assistance:
      "Requested onsite technician immediately. Contacted vendor support (Ticket #9921).",
    status: "Escalated",
    reporter: {
      name: "John Doe",
      initials: "JD",
      initialsColor: "gray",
      date: "Oct 24, 09:15 AM",
    },
    resolvedDate: "--",
  },
  {
    id: 2,
    title: "Incorrect Carpet Color",
    description:
      "VIP Lounge area setup with standard grey instead of requested royal blue.",
    assistance:
      "Checking inventory for replacement availability. Awaiting client decision.",
    status: "Open",
    reporter: {
      name: "Mike T.",
      initials: "MT",
      initialsColor: "purple",
      date: "Oct 23, 04:30 PM",
    },
    resolvedDate: "--",
  },
  {
    id: 3,
    title: "Missing Power Cables",
    description:
      "Booth #12 (Exhibitor X) lacking required 10m extension cords.",
    assistance:
      "Dispatched logistics runner with spare cables kit #4. Verified by booth manager.",
    status: "Resolved",
    reporter: {
      name: "Sarah J.",
      initials: "SJ",
      initialsColor: "pink",
      date: "Oct 23, 10:00 AM",
    },
    resolvedDate: "Oct 23, 2023 10:45 AM",
  },
];

const ProjectChallenges = ({ project, onUpdate }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newChallenge, setNewChallenge] = useState({
    title: "",
    description: "",
    assistance: "",
    status: "Open",
  });
  const [submitting, setSubmitting] = useState(false);

  // Safely access challenges
  const challenges = project?.challenges || [];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewChallenge((prev) => ({ ...prev, [name]: value }));
  };

  const handleReportChallenge = async () => {
    if (!newChallenge.title || !newChallenge.description) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${project._id}/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newChallenge),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewChallenge({
          title: "",
          description: "",
          assistance: "",
          status: "Open",
        });
        if (onUpdate) onUpdate();
      } else {
        console.error("Failed to add challenge");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="challenges-container">
      {/* Header */}
      <div className="challenges-header">
        <div className="flag-icon-wrapper">
          <FlagIcon color="#dc2626" width="24" height="24" />{" "}
        </div>
        <div className="challenges-title-group">
          <h3>
            Project Challenges{" "}
            <span className="challenge-count-badge">{challenges.length}</span>
          </h3>
          <p className="challenges-subtitle">Track issues and blockers</p>
        </div>
        <div style={{ flex: 1 }}></div> {/* Spacer */}
        <button
          className="report-challenge-btn"
          onClick={() => setIsModalOpen(true)}
        >
          <BellIcon width="18" height="18" color="#fff" /> Report Challenge
        </button>
      </div>

      {/* List Headers */}
      <div className="list-header">
        <div className="header-label col-issue">ISSUE DESCRIPTION</div>
        <div className="header-label col-assistance">ASSISTANCE PROVIDED</div>
        <div className="header-label col-status">STATUS</div>
        <div className="header-label col-reported">REPORTED BY</div>
        <div className="header-label col-resolved">RESOLVED DATE</div>
      </div>

      {/* List Items */}
      <div className="challenges-list">
        {challenges.length === 0 ? (
          <div className="no-challenges">No challenges reported yet.</div>
        ) : (
          challenges.map((item, index) => (
            <div key={item._id || index} className="challenge-item">
              <div className="col-issue">
                <h4 className="issue-title">{item.title}</h4>
                <p className="issue-desc">{item.description}</p>
              </div>
              <div className="col-assistance">
                <p className="assistance-text">{item.assistance || "--"}</p>
              </div>
              <div className="col-status">
                <div className={`status-pill ${item.status.toLowerCase()}`}>
                  <div className="status-dot"></div>
                  {item.status}
                </div>
              </div>
              <div className="col-reported">
                <div
                  className={`reporter-initials ${
                    item.reporter.initialsColor || "blue"
                  }`}
                >
                  {item.reporter.initials}
                </div>
                <div className="reporter-info">
                  <span className="reporter-name">{item.reporter.name}</span>
                  <span className="reporter-date">{item.reporter.date}</span>
                </div>
              </div>
              <div className="col-resolved">
                {item.resolvedDate === "--" ? (
                  <span className="resolved-placeholder">--</span>
                ) : (
                  <span className="resolved-date-text">
                    {item.resolvedDate.replace(",", "\n")}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="challenges-footer">
        <p className="footer-text">
          Showing all {challenges.length} active challenges.{" "}
        </p>
      </div>

      {/* Simple Modal for Reporting Challenge */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content challenges-modal">
            <h3>Report New Challenge</h3>
            <div className="form-group">
              <label>Issue Title</label>
              <input
                type="text"
                name="title"
                value={newChallenge.title}
                onChange={handleInputChange}
                placeholder="e.g. LED Wall Flickering"
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                name="description"
                value={newChallenge.description}
                onChange={handleInputChange}
                placeholder="Describe the issue..."
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>Assistance Provided / Action Taken</label>
              <textarea
                name="assistance"
                value={newChallenge.assistance}
                onChange={handleInputChange}
                placeholder="What action was taken?"
                rows={2}
              />
            </div>
            <div className="form-group">
              <label>Initial Status</label>
              <select
                name="status"
                value={newChallenge.status}
                onChange={handleInputChange}
              >
                <option value="Open">Open</option>
                <option value="Escalated">Escalated</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn-submit"
                onClick={handleReportChallenge}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectChallenges;
