import React, { useRef, useState } from "react";
import XIcon from "../icons/XIcon";
import CheckIcon from "../icons/CheckIcon";
import WarningIcon from "../icons/WarningIcon";
import AlertTriangleIcon from "../icons/AlertTriangleIcon";
import "./Toast.css";

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 10.7v5.2M12 7.7h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const ProductionIcon = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true">
    <path d="M9.6 3.3h4.8l.7 2.2 2 .8 2-1.1 2.4 4.1-1.8 1.5.3 2.2 1.8 1.5-2.4 4.1-2-1.1-2 .8-.7 2.2H9.6l-.7-2.2-2-.8-2 1.1-2.4-4.1L4.3 13 4 10.8 2.2 9.3l2.4-4.1 2 1.1 2-.8.7-2.2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const Toast = ({
  title,
  message,
  type = "info",
  onClose,
  onClick,
  duration = 10000,
  persistent = false,
  missed = false,
  kind = "",
  actionLabel = "",
  onAction,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const hasClosedRef = useRef(false);

  const handleClose = () => {
    if (hasClosedRef.current) return;
    setIsExiting(true);
  };

  const handleAnimationEnd = (event) => {
    if (hasClosedRef.current) return;
    if (isExiting || event.animationName === "toastLifecycle") {
      hasClosedRef.current = true;
      onClose?.();
    }
  };

  const getIcon = () => {
    if (kind === "production") return <ProductionIcon />;
    switch (type) {
      case "success":
        return <CheckIcon width="20" height="20" color="currentColor" />;
      case "error":
        return <AlertTriangleIcon width="20" height="20" color="currentColor" />;
      case "warning":
        return <WarningIcon width="20" height="20" color="currentColor" />;
      default:
        return <InfoIcon />;
    }
  };

  return (
    <div
      className={`ui-toast ${type} ${kind ? `kind-${kind}` : ""} ${persistent ? "persistent" : ""} ${isExiting ? "exiting" : ""}`}
      onClick={onClick}
      onAnimationEnd={handleAnimationEnd}
      style={{
        cursor: onClick ? "pointer" : "default",
        "--toast-duration": `${duration}ms`,
      }}
      role={type === "error" ? "alert" : "status"}
    >
      <div className="ui-toast-glow" aria-hidden="true" />
      <div className="ui-toast-icon">{getIcon()}</div>
      <div className="ui-toast-content">
        {missed ? <span className="ui-toast-kicker">While you were away</span> : null}
        {title ? <strong className="ui-toast-title">{title}</strong> : null}
        <div className="ui-toast-message">{message}</div>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="ui-toast-action"
            onClick={(event) => {
              event.stopPropagation();
              onAction();
            }}
          >
            {actionLabel}
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="ui-toast-close"
        onClick={(event) => {
          event.stopPropagation();
          handleClose();
        }}
        aria-label="Dismiss notification"
      >
        <XIcon width="16" height="16" />
      </button>
    </div>
  );
};

export default Toast;
