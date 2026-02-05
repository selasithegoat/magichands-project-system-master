import React from "react";
import "./Input.css";

const Input = ({
  label,
  placeholder,
  icon,
  type = "text",
  value,
  onChange,
  className = "",
  ...rest
}) => {
  return (
    <div className={`input-wrapper ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <div className="input-container">
        {icon && <span className="input-icon">{icon}</span>}
        <input
          type={type}
          className={`input-field ${icon ? "has-icon" : ""}`}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          {...rest}
        />
      </div>
    </div>
  );
};

export default Input;
