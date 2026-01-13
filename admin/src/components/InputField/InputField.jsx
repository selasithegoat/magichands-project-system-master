import React, { useState } from "react";
import "./InputField.css";
import { EyeIcon } from "../../icons/Icons";

const InputField = ({
  label,
  type = "text",
  placeholder,
  icon: Icon,
  showForgot = false,
  onForgot,
}) => {
  const [inputType, setInputType] = useState(type);

  const togglePassword = () => {
    setInputType((prev) => (prev === "password" ? "text" : "password"));
  };

  return (
    <div className="input-group">
      <div className="input-header">
        {label && <label className="input-label">{label}</label>}
        {showForgot && (
          <span className="forgot-link" onClick={onForgot}>
            Forgot?
          </span>
        )}
      </div>

      <div className="input-wrapper">
        {Icon && (
          <div className="input-icon-left">
            <Icon className="w-5 h-5" />
          </div>
        )}

        <input
          type={inputType}
          className={`input-control ${
            type === "password" ? "input-control-password" : ""
          }`}
          placeholder={placeholder}
        />

        {type === "password" && (
          <div className="input-icon-right" onClick={togglePassword}>
            <EyeIcon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
};

export default InputField;
