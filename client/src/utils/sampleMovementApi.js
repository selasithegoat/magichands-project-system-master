export const SAMPLE_STATUS_LABELS = Object.freeze({
  draft: "Draft",
  awaiting_authorization: "Awaiting authorization",
  changes_requested: "Changes requested",
  authorization_rejected: "Authorization rejected",
  authorized: "Ready for release",
  dispatched: "Dispatched",
  in_client_custody: "In client custody",
  partially_returned: "Partially returned",
  ownership_transfer_pending: "Ownership decision pending",
  returned: "Returned",
  client_owned: "Client-owned",
  lost_unrecoverable: "Lost / unrecoverable",
  cancelled: "Cancelled",
});

export const SAMPLE_STATUS_TONES = Object.freeze({
  draft: "neutral",
  awaiting_authorization: "warning",
  changes_requested: "warning",
  authorization_rejected: "danger",
  authorized: "info",
  dispatched: "info",
  in_client_custody: "success",
  partially_returned: "warning",
  ownership_transfer_pending: "purple",
  returned: "success",
  client_owned: "success",
  lost_unrecoverable: "danger",
  cancelled: "neutral",
});

export const SAMPLE_PRODUCTION_TREATMENTS = Object.freeze([
  { value: "not_applicable", label: "Not part of production quantity" },
  { value: "counts_toward_order", label: "Counts toward main order" },
  { value: "additional_paid", label: "Additional paid item" },
  { value: "complimentary", label: "Complimentary item" },
  { value: "pending", label: "Decision pending" },
]);

export const formatSampleStatus = (status) =>
  SAMPLE_STATUS_LABELS[status] ||
  String(status || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const formatSampleDate = (value, options = {}) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
};

export const getProjectLabel = (project) => {
  const name =
    project?.details?.projectNameRaw ||
    project?.details?.projectName ||
    project?.projectSnapshot?.projectName ||
    "Untitled project";
  const orderId = project?.orderId || project?.projectSnapshot?.orderId || "";
  return orderId ? `${orderId} · ${name}` : name;
};

export const requestSampleMovement = async (path = "", options = {}) => {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`/api/sample-movements${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Sample custody request failed.");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};
