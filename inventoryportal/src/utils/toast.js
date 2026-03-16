const DEFAULT_DURATION = 5000;

export const showToast = ({
  type = "info",
  title = "",
  message = "",
  duration = DEFAULT_DURATION,
} = {}) => {
  if (typeof window === "undefined") return;
  const detail = {
    type,
    title,
    message,
    duration: Number.isFinite(duration) ? duration : DEFAULT_DURATION,
  };
  window.dispatchEvent(new CustomEvent("inventory:toast", { detail }));
};

export const toastSuccess = (message, title) =>
  showToast({ type: "success", title, message });
export const toastError = (message, title) =>
  showToast({ type: "error", title, message });
export const toastInfo = (message, title) =>
  showToast({ type: "info", title, message });
