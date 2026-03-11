import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const wrapperRef = useRef(null);

  // Close dropdown when clicking outside would be handled by a global listener in a real app,
  // but for this demo, we'll keep it simple or use a blur handler if needed.

  const handleSelect = (option) => {
    onChange(option);
    setIsOpen(false);
  };

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return undefined;
    const section = wrapper.closest(".form-section");
    if (!section) return undefined;

    if (isOpen) {
      section.classList.add("select-open");
    } else {
      section.classList.remove("select-open");
    }

    return () => {
      section.classList.remove("select-open");
    };
  }, [isOpen]);

  const updateDropdownPosition = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const container = wrapper.querySelector(".select-container");
    if (!container) return;
    const rect = container.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      right: "auto",
      marginTop: 0,
      zIndex: 2000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
  }, [isOpen, updateDropdownPosition]);

  useEffect(() => {
    if (!isOpen) {
      setDropdownStyle(null);
      return undefined;
    }
    const handleReposition = () => updateDropdownPosition();
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [isOpen, updateDropdownPosition]);

  return (
    <div className="select-wrapper" ref={wrapperRef}>
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

        {isOpen &&
          createPortal(
            <div className="select-dropdown" style={dropdownStyle || undefined}>
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
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
};

export default Select;
