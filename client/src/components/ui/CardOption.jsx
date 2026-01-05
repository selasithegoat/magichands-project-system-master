import React from "react";
import "./CardOption.css";

const CardOption = ({ icon, label, checked, onChange }) => {
  return (
    <div
      className={`card-option ${checked ? "checked" : ""}`}
      onClick={onChange}
    >
      <div className="card-option-left">
        <div className="card-option-icon">{icon}</div>
        <span className="card-option-label">{label}</span>
      </div>
      <div className={`card-option-checkbox ${checked ? "checked" : ""}`}>
        {checked && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M10 3L4.5 8.5L2 6"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
};

export default CardOption;
