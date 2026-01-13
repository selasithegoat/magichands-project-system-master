import React from "react";
import "./FormElements.css";

const Select = ({
  label,
  options,
  value,
  onChange,
  placeholder = "Select option",
}) => {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      <div className="select-wrapper">
        <select
          className="form-control form-select"
          value={value}
          onChange={onChange}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default Select;
