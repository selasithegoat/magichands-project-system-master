import { showToast } from "./toast";

export const fetchInventory = async (path, options = {}) => {
  const { toast, ...fetchOptions } = options;
  const method = String(fetchOptions.method || "GET").toUpperCase();
  const toastOptions = toast || {};
  const shouldToast = method !== "GET" && toastOptions.silent !== true;

  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(fetchOptions.headers || {}),
    },
    ...fetchOptions,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.message || "Request failed.";
    if (shouldToast) {
      showToast({
        type: "error",
        title: "Update failed",
        message: toastOptions.error || message,
      });
    }
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  if (shouldToast) {
    const successMessage =
      toastOptions.success ||
      payload?.message ||
      (method === "POST"
        ? "Created successfully."
        : method === "DELETE"
          ? "Deleted successfully."
          : "Updated successfully.");
    showToast({
      type: "success",
      title: "Success",
      message: successMessage,
    });
  }

  return payload;
};

export const parseListResponse = (payload) => {
  if (Array.isArray(payload)) {
    return {
      data: payload,
      page: 1,
      limit: payload.length,
      total: payload.length,
      totalPages: payload.length ? 1 : 0,
    };
  }

  const data = Array.isArray(payload?.data) ? payload.data : [];
  const total = Number.isFinite(payload?.total) ? payload.total : data.length;
  const page = Number.isFinite(payload?.page) ? payload.page : 1;
  const limit = Number.isFinite(payload?.limit) ? payload.limit : data.length;
  const totalPages = Number.isFinite(payload?.totalPages)
    ? payload.totalPages
    : limit
      ? Math.ceil(total / limit)
      : total
        ? 1
        : 0;

  return {
    data,
    page,
    limit,
    total,
    totalPages,
  };
};

export const formatShortDate = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatShortDateTime = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);

  const date = parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${date} ${time}`;
};
