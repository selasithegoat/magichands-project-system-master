import React from "react";
import "./Badge.css";

const priorities = [
  { id: "low", label: "LOW", color: "#10b981", icon: "◺" }, // Green
  { id: "med", label: "MED", color: "#3b82f6", icon: "◺" }, // Blue
  { id: "high", label: "HIGH", color: "#ef4444", icon: "▲" }, // Red
];

const PrioritySelector = ({ selected, onSelect }) => {
  return (
    <div className="priority-container">
      <label className="form-label">Priority Level</label>
      <div className="priority-options">
        {priorities.map((p) => (
          <div
            key={p.id}
            className={`priority-card ${selected === p.id ? "active" : ""}`}
            onClick={() => onSelect(p.id)}
            style={{ "--accent-color": p.color }}
          >
            <div className="priority-icon" style={{ color: p.color }}>
              {p.icon}
            </div>
            <span className="priority-label">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PrioritySelector;
