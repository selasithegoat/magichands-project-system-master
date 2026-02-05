import React from "react";
import "./Checkbox.css";

const Checkbox = ({ label, checked, onChange }) => {
  return (
    <label className="checkbox-group">
      <input
        type="checkbox"
        className="checkbox-input"
        checked={checked}
        onChange={onChange}
      />
      <span className="checkbox-label">{label}</span>
    </label>
  );
};

export default Checkbox;
