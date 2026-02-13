import React, { useEffect, useState } from "react";
import Modal from "../Modal/Modal";
import "./ProjectHoldModal.css";

const ProjectHoldModal = ({
  isOpen,
  onClose,
  onConfirm,
  defaultReason = "",
  isSubmitting = false,
}) => {
  const [reason, setReason] = useState(defaultReason);

  useEffect(() => {
    if (isOpen) {
      setReason(defaultReason ?? "");
    }
  }, [defaultReason, isOpen]);

  const handleConfirm = () => {
    onConfirm(reason.trim());
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Put Project On Hold" maxWidth="520px">
      <div className="hold-modal-content">
        <p className="hold-modal-description">
          This will pause all project processes until the hold is released.
        </p>
        <label className="hold-modal-label" htmlFor="hold-reason">
          Reason (Optional)
        </label>
        <textarea
          id="hold-reason"
          className="hold-modal-textarea"
          placeholder="Add context for why this project is on hold..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          disabled={isSubmitting}
        />

        <div className="hold-modal-actions">
          <button
            type="button"
            className="hold-modal-btn cancel"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hold-modal-btn confirm"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Putting On Hold..." : "Put On Hold"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProjectHoldModal;
