import Modal from "./Modal";

const ConfirmDialog = ({
  isOpen,
  title = "Confirm",
  message = "Are you sure?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onClose,
  variant = "center",
}) => (
  <Modal
    isOpen={isOpen}
    title={title}
    primaryText={confirmText}
    secondaryText={cancelText}
    onConfirm={onConfirm}
    onClose={onClose}
    variant={variant}
  >
    <p className="modal-help">{message}</p>
  </Modal>
);

export default ConfirmDialog;
