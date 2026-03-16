import { useEffect, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  WarningIcon,
} from "../icons/Icons";
import "./ToastStack.css";

const TOAST_DEFAULT_DURATION = 5000;
const CLOSE_ANIMATION_MS = 350;

const iconMap = {
  success: CheckIcon,
  error: AlertCircleIcon,
  warning: WarningIcon,
  info: AlertCircleIcon,
};

const ToastStack = () => {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  useEffect(() => {
    const handleToast = (event) => {
      const detail = event?.detail || {};
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const duration = Number.isFinite(detail.duration)
        ? detail.duration
        : TOAST_DEFAULT_DURATION;
      const nextToast = {
        id,
        type: detail.type || "info",
        title: detail.title || "",
        message: detail.message || "",
        closing: false,
      };

      setToasts((prev) => [...prev, nextToast]);

      const closeTimer = setTimeout(() => {
        setToasts((prev) =>
          prev.map((toast) =>
            toast.id === id ? { ...toast, closing: true } : toast,
          ),
        );
      }, Math.max(duration - CLOSE_ANIMATION_MS, 0));

      const removeTimer = setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        timersRef.current.delete(id);
      }, duration);

      timersRef.current.set(id, { closeTimer, removeTimer });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("inventory:toast", handleToast);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("inventory:toast", handleToast);
      }
      timersRef.current.forEach((timers) => {
        clearTimeout(timers.closeTimer);
        clearTimeout(timers.removeTimer);
      });
      timersRef.current.clear();
    };
  }, []);

  const dismissToast = (id) => {
    const timers = timersRef.current.get(id);
    if (timers) {
      clearTimeout(timers.closeTimer);
      clearTimeout(timers.removeTimer);
      timersRef.current.delete(id);
    }
    setToasts((prev) =>
      prev.map((toast) =>
        toast.id === id ? { ...toast, closing: true } : toast,
      ),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, CLOSE_ANIMATION_MS);
  };

  if (!toasts.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type] || AlertCircleIcon;
        return (
          <div
            key={toast.id}
            className={`toast ${toast.type} ${toast.closing ? "closing" : ""}`}
          >
            <div className="toast-icon">
              <Icon />
            </div>
            <div className="toast-body">
              {toast.title ? <strong>{toast.title}</strong> : null}
              <span>{toast.message || "Update completed."}</span>
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              x
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastStack;
