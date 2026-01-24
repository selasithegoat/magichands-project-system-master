import React, { useState } from "react";
import "./Select.css";

const Select = ({
  label,
  options,
  value,
  onChange,
  placeholder,
  renderOption,
  renderValue,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when clicking outside would be handled by a global listener in a real app,
  // but for this demo, we'll keep it simple or use a blur handler if needed.

  const handleSelect = (option) => {
    onChange(option);
    setIsOpen(false);
  };

  return (
    <div className="select-wrapper">
      {label && <label className="select-label">{label}</label>}
      <div
        className={`select-container ${isOpen ? "open" : ""} ${disabled ? "disabled" : ""}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="select-value">
          {value ? (
            renderValue ? (
              renderValue(value)
            ) : (
              value.label
            )
          ) : (
            <span className="placeholder">{placeholder}</span>
          )}
        </div>
        <div className="select-chevron">
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M5 7.5L10 12.5L15 7.5"
              stroke="#64748B"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {isOpen && (
          <div className="select-dropdown">
            {options.map((option) => (
              <div
                key={option.value}
                className={`select-option ${
                  value?.value === option.value ? "selected" : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(option);
                }}
              >
                {renderOption ? renderOption(option) : option.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Select;
