import React from "react";
import "./TextArea.css";

const TextArea = ({ label, placeholder, value, onChange, className = "" }) => {
  return (
    <div className={`textarea-wrapper ${className}`}>
      {label && <label className="textarea-label">{label}</label>}
      <div className="textarea-container">
        <textarea
          className="textarea-field"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          rows={3}
        />
        <div className="resize-handle">
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M7 1L1 7"
              stroke="#CBD5E1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M7 5L5 7"
              stroke="#CBD5E1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default TextArea;
