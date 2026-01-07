import React from "react";
import "./DepartmentCard.css";

const DepartmentCard = ({ icon, label, selected, onClick }) => {
  return (
    <div
      className={`dept-card ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="dept-icon-container">{icon}</div>
      <span className="dept-label">{label}</span>

      {selected && (
        <div className="dept-check">
          <svg
            width="10"
            height="8"
            viewBox="0 0 10 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </div>
  );
};

export default DepartmentCard;
