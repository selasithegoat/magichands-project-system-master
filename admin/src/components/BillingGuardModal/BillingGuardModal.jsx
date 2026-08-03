import React, { useEffect } from "react";
import "./BillingGuardModal.css";

const BillingGuardModal = ({
  isOpen,
  onClose,
  onOverride,
  canOverride = false,
  isSubmitting = false,
  title = "Billing Caution",
  overrideButtonText = "Continue with Override",
  message = "",
  missingLabels = [],
  orderId = "",
  projectName = "",
  overrideReason = "",
  onOverrideReasonChange,
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="billing-guard-modal-overlay">
      <div className="billing-guard-modal" role="dialog" aria-modal="true">
        <h3>{title}</h3>
        {(orderId || projectName) && (
          <p className="billing-guard-project">
            <strong>Project:</strong> {orderId || "N/A"}
            {projectName ? (
              <>
                {" "}
                - {projectName}
              </>
            ) : null}
          </p>
        )}
        <p>{message || "Billing prerequisites are required for this action."}</p>
        {missingLabels.length > 0 && (
          <p>
            <strong>Missing:</strong> {missingLabels.join(", ")}
          </p>
        )}
        {canOverride && (
          <label className="billing-guard-reason">
            <span>Reason for override</span>
            <textarea
              value={overrideReason}
              onChange={(event) => onOverrideReasonChange?.(event.target.value)}
              placeholder="Explain why this project may continue before billing is cleared"
              maxLength={500}
              rows={3}
              disabled={isSubmitting}
            />
            <small>This reason stays visible in the billing attention queue.</small>
          </label>
        )}
        <div className="billing-guard-modal-actions">
          <button
            type="button"
            className="billing-guard-btn cancel"
            onClick={onClose}
            disabled={isSubmitting}
          >
            {canOverride ? "Cancel" : "Close"}
          </button>
          {canOverride && (
            <button
              type="button"
              className="billing-guard-btn override"
              onClick={onOverride}
              disabled={isSubmitting || overrideReason.trim().length < 5}
            >
              {isSubmitting ? "Applying..." : overrideButtonText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingGuardModal;
