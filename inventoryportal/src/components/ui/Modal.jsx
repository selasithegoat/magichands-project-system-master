import { useEffect, useState } from "react";

const Modal = ({
  isOpen,
  title,
  subtitle,
  children,
  primaryText = "Confirm",
  secondaryText = "Cancel",
  onConfirm,
  onClose,
  variant = "center",
}) => {
  const [isVisible, setIsVisible] = useState(isOpen);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let closeTimer;
    let openFrame;
    let openFrame2;

    if (isOpen) {
      setIsVisible(true);
      setIsActive(false);
      openFrame = requestAnimationFrame(() => {
        openFrame2 = requestAnimationFrame(() => {
          setIsActive(true);
        });
      });
    } else if (isVisible) {
      setIsActive(false);
      closeTimer = setTimeout(() => {
        setIsVisible(false);
      }, 220);
    }

    return () => {
      if (openFrame) cancelAnimationFrame(openFrame);
      if (openFrame2) cancelAnimationFrame(openFrame2);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [isOpen, isVisible]);

  useEffect(() => {
    if (!isVisible) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  return (
    <div
      className={`modal-overlay${variant === "side" ? " modal-overlay--side" : ""}${
        isActive ? " is-active" : ""
      }`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`modal-card${variant === "side" ? " modal-card--side" : ""}`}
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
