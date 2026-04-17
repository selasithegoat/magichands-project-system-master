import React from "react";
import XIcon from "../icons/XIcon";
import "./ProjectRouteChoiceDialog.css";

const ProjectRouteChoiceDialog = ({
  isOpen,
  title = "Choose Authorized Page",
  message = "Project Details is reserved for the assigned lead. Choose an authorized page to continue.",
  options = [],
  onSelect,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="project-route-choice-overlay" onClick={onClose}>
      <div
        className="project-route-choice-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="project-route-choice-header">
          <div>
            <h3 className="project-route-choice-title">{title}</h3>
            <p className="project-route-choice-message">{message}</p>
          </div>
          <button
            type="button"
            className="project-route-choice-close"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon width="18" height="18" />
          </button>
        </div>

        <div className="project-route-choice-options">
          {options.map((option) => (
            <button
              key={option.key || option.path}
              type="button"
              className="project-route-choice-option"
              onClick={() => onSelect(option)}
            >
              <span className="project-route-choice-option-label">
                {option.label || "Open"}
              </span>
              {option.description ? (
                <span className="project-route-choice-option-description">
                  {option.description}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="project-route-choice-footer">
          <button
            type="button"
            className="project-route-choice-cancel"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectRouteChoiceDialog;
