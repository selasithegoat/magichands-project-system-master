import React from "react";
import Modal from "../Modal/Modal";
import "./ProjectCancelModal.css";

const ProjectCancelModal = ({
  isOpen,
  onClose,
  onConfirm,
  reason = "",
  onReasonChange,
  isSubmitting = false,
  errorMessage = "",
}) => {
  const handleConfirm = () => {
    onConfirm(String(reason || "").trim());
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cancel Project"
      maxWidth="520px"
    >
      <div className="cancel-project-modal-content">
        <p className="cancel-project-modal-description">
          This will move the project to <strong>Cancelled Orders</strong> and
          freeze all edits/actions until it is reactivated.
        </p>
        <label className="cancel-project-modal-label" htmlFor="cancel-reason">
          Reason (Optional)
        </label>
        <textarea
          id="cancel-reason"
          className="cancel-project-modal-textarea"
          placeholder="Why is this project being cancelled?"
          value={reason}
          onChange={(e) => onReasonChange?.(e.target.value)}
          rows={4}
          disabled={isSubmitting}
        />

        {errorMessage ? (
          <p className="cancel-project-modal-error">{errorMessage}</p>
        ) : null}

        <div className="cancel-project-modal-actions">
          <button
            type="button"
            className="cancel-project-modal-btn back"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Back
          </button>
          <button
            type="button"
            className="cancel-project-modal-btn confirm"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Cancelling..." : "Cancel Project"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProjectCancelModal;
