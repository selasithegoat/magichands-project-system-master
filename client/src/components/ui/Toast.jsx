import React, { useRef, useState } from "react";
import XIcon from "../icons/XIcon";
import CheckIcon from "../icons/CheckIcon";
import WarningIcon from "../icons/WarningIcon";
import AlertTriangleIcon from "../icons/AlertTriangleIcon";
import "./Toast.css";

const Toast = ({
  message,
  type = "info",
  onClose,
  onClick,
  duration = 5000,
}) => {
  const [isExiting, setIsExiting] = useState(false);
  const hasClosedRef = useRef(false);

  const handleClose = () => {
    if (hasClosedRef.current) return;
    setIsExiting(true);
  };

  const handleAnimationEnd = (e) => {
    if (hasClosedRef.current) return;

    if (isExiting || e.animationName === "toastLifecycle") {
      hasClosedRef.current = true;
      onClose();
    }
  };

  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckIcon width="20" height="20" color="#22c55e" />;
      case "error":
        return <AlertTriangleIcon width="20" height="20" color="#ef4444" />; // Using AlertTriangle as error icon mostly
      case "warning":
        return <WarningIcon width="20" height="20" color="#f59e0b" />;
      default:
        return <span style={{ fontSize: "20px" }}>ℹ️</span>;
    }
  };

  return (
    <div
      className={`ui-toast ${type} ${isExiting ? "exiting" : ""}`}
      onClick={onClick}
      onAnimationEnd={handleAnimationEnd}
      style={{
        cursor: onClick ? "pointer" : "default",
        "--toast-duration": `${duration}ms`,
      }}
    >
      <div className="ui-toast-icon">{getIcon()}</div>
      <div className="ui-toast-message">{message}</div>
      <button
        className="ui-toast-close"
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
      >
        <XIcon width="16" height="16" />
      </button>
    </div>
  );
};

export default Toast;
