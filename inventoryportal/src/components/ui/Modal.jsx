import { useEffect } from "react";

const Modal = ({
  isOpen,
  title,
  subtitle,
  children,
  primaryText = "Confirm",
  secondaryText = "Cancel",
  onConfirm,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="modal-body">{children}</div>
        <footer className="modal-footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            {secondaryText}
          </button>
          <button type="button" className="primary-button" onClick={onConfirm}>
            {primaryText}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default Modal;
