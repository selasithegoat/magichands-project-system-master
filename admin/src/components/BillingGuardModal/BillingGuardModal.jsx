import React, { useEffect } from "react";
import "./BillingGuardModal.css";

const BillingGuardModal = ({
  isOpen,
  onClose,
  onOverride,
  canOverride = false,
  isSubmitting = false,
  message = "",
  missingLabels = [],
  orderId = "",
  projectName = "",
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
        <h3>Billing Caution</h3>
        {(orderId || projectName) && (
          <p className="billing-guard-project">
            <strong>Project:</strong> {orderId || "N/A"}
            {projectName ? ` - ${projectName}` : ""}
          </p>
        )}
        <p>{message || "Billing prerequisites are required for this action."}</p>
        {missingLabels.length > 0 && (
          <p>
            <strong>Missing:</strong> {missingLabels.join(", ")}
          </p>
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
              disabled={isSubmitting}
            >
              {isSubmitting ? "Applying..." : "Continue with Override"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingGuardModal;
