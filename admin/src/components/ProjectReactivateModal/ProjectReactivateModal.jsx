import React from "react";
import Modal from "../Modal/Modal";
import "./ProjectReactivateModal.css";

const ProjectReactivateModal = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting = false,
  orderId = "",
  projectName = "",
  frozenStage = "",
  errorMessage = "",
}) => {
  const handleClose = () => {
    if (!isSubmitting) {
      onClose?.();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Reactivate Project"
      maxWidth="520px"
    >
      <div className="reactivate-project-modal-content">
        <p className="reactivate-project-modal-description">
          This project will leave <strong>Cancelled Orders</strong> and resume
          work from its frozen stage.
        </p>

        <div className="reactivate-project-modal-meta">
          <p>
            <strong>Order:</strong> {orderId || "N/A"}
          </p>
          <p>
            <strong>Project:</strong> {projectName || "Unnamed Project"}
          </p>
          <p>
            <strong>Resume Stage:</strong> {frozenStage || "N/A"}
          </p>
        </div>

        {errorMessage ? (
          <p className="reactivate-project-modal-error">{errorMessage}</p>
        ) : null}

        <div className="reactivate-project-modal-actions">
          <button
            type="button"
            className="reactivate-project-modal-btn back"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Back
          </button>
          <button
            type="button"
            className="reactivate-project-modal-btn confirm"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Reactivating..." : "Reactivate Project"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProjectReactivateModal;
