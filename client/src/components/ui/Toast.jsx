import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        onClose();
      }, 300); // Match animation duration
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      onClose();
    }, 300);
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
      style={{ cursor: onClick ? "pointer" : "default" }}
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
