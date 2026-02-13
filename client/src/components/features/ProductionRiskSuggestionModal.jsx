import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./ProductionRiskSuggestionModal.css";

const ProductionRiskSuggestionModal = ({
  isOpen,
  suggestions = [],
  onClose,
  onConfirm,
  isApplying = false,
  title = "Review before add",
}) => {
  const [selectedMap, setSelectedMap] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    const initial = {};
    suggestions.forEach((_, index) => {
      initial[index] = true;
    });
    setSelectedMap(initial);
  }, [isOpen, suggestions]);

  const selectedSuggestions = useMemo(
    () => suggestions.filter((_, index) => selectedMap[index]),
    [suggestions, selectedMap],
  );

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const handleSelectAll = (checked) => {
    const nextState = {};
    suggestions.forEach((_, index) => {
      nextState[index] = checked;
    });
    setSelectedMap(nextState);
  };

  const handleToggle = (index) => {
    setSelectedMap((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleClose = () => {
    if (isApplying) return;
    onClose?.();
  };

  const handleConfirm = () => {
    if (isApplying || selectedSuggestions.length === 0) return;
    onConfirm?.(selectedSuggestions);
  };

  return createPortal(
    <div className="ai-suggest-modal-overlay" onClick={handleClose}>
      <div
        className="ai-suggest-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ai-suggest-modal-header">
          <h3>{title}</h3>
          <button
            type="button"
            className="ai-suggest-close-btn"
            onClick={handleClose}
            disabled={isApplying}
            aria-label="Close"
          >
            x
          </button>
        </div>

        <p className="ai-suggest-modal-subtitle">
          Pick which suggestions you want to add.
        </p>

        <div className="ai-suggest-selection-tools">
          <button
            type="button"
            className="ai-suggest-select-link"
            onClick={() => handleSelectAll(true)}
            disabled={isApplying}
          >
            Select all
          </button>
          <button
            type="button"
            className="ai-suggest-select-link"
            onClick={() => handleSelectAll(false)}
            disabled={isApplying}
          >
            Clear all
          </button>
        </div>

        <div className="ai-suggest-list">
          {suggestions.map((suggestion, index) => (
            <label key={`${suggestion.description}-${index}`} className="ai-suggest-item">
              <input
                type="checkbox"
                checked={Boolean(selectedMap[index])}
                onChange={() => handleToggle(index)}
                disabled={isApplying}
              />
              <div className="ai-suggest-item-content">
                <h4>{suggestion.description}</h4>
                <p>{suggestion.preventive}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="ai-suggest-modal-actions">
          <button
            type="button"
            className="ai-suggest-cancel-btn"
            onClick={handleClose}
            disabled={isApplying}
          >
            Cancel
          </button>
          <button
            type="button"
            className="ai-suggest-confirm-btn"
            onClick={handleConfirm}
            disabled={isApplying || selectedSuggestions.length === 0}
          >
            {isApplying
              ? "Adding..."
              : `Add Selected (${selectedSuggestions.length})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProductionRiskSuggestionModal;
