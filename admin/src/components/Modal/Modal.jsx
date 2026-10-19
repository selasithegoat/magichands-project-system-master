import React, { useEffect } from "react";
import { lockDocumentScroll } from "@client/utils/documentScrollLock";
import "./Modal.css";

const Modal = ({ isOpen, onClose, title, children, maxWidth = "600px" }) => {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return undefined;

    const releaseScrollLock = lockDocumentScroll();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      releaseScrollLock();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal-content"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()} // Prevent click from closing modal
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
      >
        <div className="admin-modal-header">
          <h2 className="admin-modal-title" id="admin-modal-title">
            {title}
          </h2>
          <button
            type="button"
            className="admin-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
