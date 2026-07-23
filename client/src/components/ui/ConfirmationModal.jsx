import React, { useState } from "react";
import { waitForNextPaint } from "../../utils/mutationFeedback";
import "./ConfirmationModal.css";

const ConfirmationModal = ({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = "Yes, Confirm",
  cancelText = "No, Go Back",
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
    <div className="modal-backdrop" onClick={handleCancel}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        aria-busy={isPending}
      >
        <h3 className="modal-title">{title}</h3>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn cancel"
            onClick={handleCancel}
            disabled={isPending}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="modal-btn confirm"
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending && (
              <span className="modal-btn-spinner" aria-hidden="true" />
            )}
            {isPending ? pendingText : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
