import React, { useEffect, useState } from "react";
import "./ConfirmationModal.css";
import { XMarkIcon } from "../../icons/Icons";
import { waitForNextPaint } from "../../utils/mutationFeedback";
import { lockDocumentScroll } from "@client/utils/documentScrollLock";

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

  useEffect(() => {
    if (!isOpen) return undefined;

    const releaseScrollLock = lockDocumentScroll();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isPending) onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      releaseScrollLock();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isPending, onClose]);

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
    <div className="admin-confirmation-overlay" onClick={handleClose}>
      <div
        className="admin-confirmation-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirmation-title"
        aria-busy={isPending}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-confirmation-header">
          <h3 className="admin-confirmation-title" id="admin-confirmation-title">
            {title}
          </h3>
          <button
            type="button"
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
            type="button"
            className="admin-confirmation-btn cancel"
            onClick={handleClose}
            disabled={isPending}
          >
            {cancelText}
          </button>
          <button
            type="button"
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
