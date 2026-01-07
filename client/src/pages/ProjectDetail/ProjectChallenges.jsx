import React from "react";
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

const ProjectChallenges = () => {
  return (
    <div className="challenges-container">
      {/* Header */}
      <div className="challenges-header">
        <div className="flag-icon-wrapper">
          <FlagIcon color="#dc2626" width="24" height="24" />{" "}
          {/* Red-600 approx */}
        </div>
        <div className="challenges-title-group">
          <h3>
            Project Challenges <span className="challenge-count-badge">3</span>
          </h3>
          <p className="challenges-subtitle">Track issues and blockers</p>
        </div>
        <div style={{ flex: 1 }}></div> {/* Spacer */}
        <button className="report-challenge-btn">
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
        {challengesData.map((item) => (
          <div key={item.id} className="challenge-item">
            <div className="col-issue">
              <h4 className="issue-title">{item.title}</h4>
              <p className="issue-desc">{item.description}</p>
            </div>
            <div className="col-assistance">
              <p className="assistance-text">{item.assistance}</p>
            </div>
            <div className="col-status">
              <div className={`status-pill ${item.status.toLowerCase()}`}>
                <div className="status-dot"></div>
                {item.status}
              </div>
            </div>
            <div className="col-reported">
              <div
                className={`reporter-initials ${item.reporter.initialsColor}`}
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
                  {item.resolvedDate.replace(" ", "\n")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="challenges-footer">
        <p className="footer-text">
          Showing all 3 active challenges.{" "}
          <span className="view-archived-link">View archived challenges</span>
        </p>
        <div className="pagination-controls">
          <button className="pagination-btn">Previous</button>
          <button className="pagination-btn">Next</button>
        </div>
      </div>
    </div>
  );
};

export default ProjectChallenges;
