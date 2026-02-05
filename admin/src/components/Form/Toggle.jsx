import React from "react";
import "./Toggle.css";

const Toggle = ({ label, checked, onChange }) => {
  return (
    <div className="toggle-wrapper">
      {label && <span className="toggle-label">{label}</span>}
      <label className="switch">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="slider round"></span>
      </label>
    </div>
  );
};

export default Toggle;
