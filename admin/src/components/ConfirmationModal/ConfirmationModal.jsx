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
    <div className="modal-overlay">
      <div className="modal-content" aria-busy={isPending}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button
            className="close-btn"
            onClick={handleClose}
            disabled={isPending}
            aria-label="Close confirmation"
          >
            <XMarkIcon width="20" height="20" />
          </button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
        </div>
        <div className="modal-footer">
          <button
            className="btn-cancel"
            onClick={handleClose}
            disabled={isPending}
          >
            {cancelText}
          </button>
          <button
            className={`btn-confirm ${isDangerous ? "danger" : "primary"}`}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending && (
              <span className="btn-confirm-spinner" aria-hidden="true" />
            )}
            {isPending ? pendingText : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
