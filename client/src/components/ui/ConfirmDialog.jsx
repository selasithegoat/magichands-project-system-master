import React, { useState } from "react";
import XIcon from "../icons/XIcon";
import { waitForNextPaint } from "../../utils/mutationFeedback";
import "./ConfirmDialog.css";

const ConfirmDialog = ({
  isOpen,
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  onConfirm,
  onCancel,
  confirmText = "Delete",
  cancelText = "Cancel",
  type = "danger", // danger | primary
  pendingText = "Processing…",
}) => {
  const [isPending, setIsPending] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (isPending) return;
    setIsPending(true);
    await waitForNextPaint();

    try {
      await onConfirm?.();
    } finally {
      setIsPending(false);
    }
  };

  const handleCancel = () => {
    if (!isPending) onCancel?.();
  };

  return (
    <div className="confirm-overlay" onClick={handleCancel}>
      <div
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        aria-busy={isPending}
      >
        <div className="confirm-header">
          <h3 className="confirm-title">{title}</h3>
          <button
            className="confirm-close"
            onClick={handleCancel}
            disabled={isPending}
            aria-label="Close confirmation"
          >
            <XIcon width="20" height="20" />
          </button>
        </div>

        <div className="confirm-body">
          <p className="confirm-message">{message}</p>
        </div>

        <div className="confirm-footer">
          <button
            type="button"
            className="confirm-btn cancel"
            onClick={handleCancel}
            disabled={isPending}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`confirm-btn confirm ${
              type === "primary" ? "primary" : ""
            }`}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending && (
              <span className="confirm-btn-spinner" aria-hidden="true" />
            )}
            {isPending ? pendingText : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
