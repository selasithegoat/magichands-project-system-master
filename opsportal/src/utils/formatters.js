const numberFormatter = new Intl.NumberFormat("en-US");

export const formatNumber = (value) => numberFormatter.format(Number(value || 0));

export const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

export const formatClock = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatTimestamp = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatDeadlineTimestamp = (value, deliveryTime) => {
  const normalizedTime =
    typeof deliveryTime === "string" ? deliveryTime.trim() : "";

  if (!normalizedTime) {
    return formatTimestamp(value);
  }

  if (!value) return normalizedTime;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizedTime;

  const dateLabel = date.toLocaleDateString([], {
    month: "short",
    day: "2-digit",
  });

  return `${dateLabel}, ${normalizedTime}`;
};

export const formatRelativeHours = (hoursRemaining) => {
  if (!Number.isFinite(hoursRemaining)) return "No deadline";
  if (hoursRemaining < 0) {
    const lateBy = Math.abs(hoursRemaining);
    if (lateBy < 1) return "Overdue <1h";
    if (lateBy < 24) return `Overdue ${Math.round(lateBy)}h`;
    return `Overdue ${Math.ceil(lateBy / 24)}d`;
  }
  if (hoursRemaining < 1) return "Due <1h";
  if (hoursRemaining < 24) return `Due in ${Math.round(hoursRemaining)}h`;
  return `Due in ${Math.ceil(hoursRemaining / 24)}d`;
};
