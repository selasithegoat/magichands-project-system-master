import React, { useState } from "react";
import "./ConfirmationModal.css";
import { XMarkIcon } from "../../icons/Icons";
import { waitForNextPaint } from "../../utils/mutationFeedback";

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDangerous = false,
  pendingText = "Processing…",
}) => {
  const [isPending, setIsPending] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    if (!isPending) onClose?.();
  };

  const handleConfirm = async () => {
    if (isPending) return;
    setIsPending(true);
    await waitForNextPaint();

    try {
      await onConfirm?.();
      onClose?.();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="admin-confirmation-overlay">
      <div className="admin-confirmation-content" aria-busy={isPending}>
        <div className="admin-confirmation-header">
          <h3 className="admin-confirmation-title">{title}</h3>
          <button
            className="admin-confirmation-close"
            onClick={handleClose}
            disabled={isPending}
            aria-label="Close confirmation"
          >
            <XMarkIcon width="20" height="20" />
          </button>
        </div>
        <div className="admin-confirmation-body">
          <p>{message}</p>
        </div>
        <div className="admin-confirmation-footer">
          <button
            className="admin-confirmation-btn cancel"
            onClick={handleClose}
            disabled={isPending}
          >
            {cancelText}
          </button>
          <button
            className={`admin-confirmation-btn ${
              isDangerous ? "danger" : "primary"
            }`}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending && (
              <span
                className="admin-confirmation-spinner"
                aria-hidden="true"
              />
            )}
            {isPending ? pendingText : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
