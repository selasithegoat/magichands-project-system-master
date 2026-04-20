import React from "react";
import { createPortal } from "react-dom";
import CheckCircleIcon from "../icons/CheckCircleIcon";
import AlertTriangleIcon from "../icons/AlertTriangleIcon";
import "./FloatingMessageToast.css";

const FloatingMessageToast = ({
  show,
  message,
  type = "info",
  fading = false,
  icon,
}) => {
  if (!show || !message || typeof document === "undefined") {
    return null;
  }

  const resolvedIcon =
    icon !== undefined
      ? icon
      : type === "success"
        ? <CheckCircleIcon width="18" height="18" />
        : type === "error" || type === "warning"
          ? <AlertTriangleIcon width="18" height="18" />
          : (
              <span
                className="floating-message-toast__info"
                aria-hidden="true"
              >
                i
              </span>
            );

  return createPortal(
    <div
      className={`floating-message-toast ${type} ${
        fading ? "fading-out" : ""
      }`}
      role="status"
      aria-live="polite"
    >
      {resolvedIcon ? (
        <span className="floating-message-toast__icon">{resolvedIcon}</span>
      ) : null}
      <span className="floating-message-toast__message">{message}</span>
    </div>,
    document.body,
  );
};

export default FloatingMessageToast;
