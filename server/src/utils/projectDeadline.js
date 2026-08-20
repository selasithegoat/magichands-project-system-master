const DEADLINE_BUSINESS_TIME_ZONE = "Africa/Accra";
const DEADLINE_WARNING_WINDOW_MS = 72 * 60 * 60 * 1000;
const DEADLINE_CLOSED_STATUSES = [
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
  "Declined",
];

const datePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEADLINE_BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const toValidDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getBusinessDateParts = (value = new Date()) => {
  const date = toValidDate(value);
  if (!date) return null;

  const parts = datePartsFormatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number.parseInt(parts.year, 10),
    month: Number.parseInt(parts.month, 10),
    day: Number.parseInt(parts.day, 10),
  };
};

const parseDateKey = (value) => {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const toBusinessDateKey = (value = new Date()) => {
  const parts = getBusinessDateParts(value);
  if (!parts) return "";
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
};

const getBusinessDayBounds = (value = new Date()) => {
  const parts = parseDateKey(value) || getBusinessDateParts(value);
  if (!parts) return null;

  return {
    start: new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0, 0)),
    end: new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999),
    ),
  };
};

const parseDeliveryTime = (value) => {
  const deliveryTime = String(value || "").trim();
  if (!deliveryTime) return { hours: 23, minutes: 59, seconds: 59, millis: 999 };

  const match24h = deliveryTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const match12h = deliveryTime.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i,
  );
  const match = match24h || match12h;
  if (!match) return { hours: 23, minutes: 59, seconds: 59, millis: 999 };

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3] || "0", 10);
  if (match12h) {
    const period = match[4].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
  }

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return { hours: 23, minutes: 59, seconds: 59, millis: 999 };
  }

  return { hours, minutes, seconds, millis: 0 };
};

const parseProjectDeliveryDeadline = (project = {}) => {
  const deliveryDate = toValidDate(project?.details?.deliveryDate);
  const dateParts = getBusinessDateParts(deliveryDate);
  if (!dateParts) return null;

  const timeParts = parseDeliveryTime(project?.details?.deliveryTime);
  return new Date(
    Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      timeParts.hours,
      timeParts.minutes,
      timeParts.seconds,
      timeParts.millis,
    ),
  );
};

const isSameBusinessDay = (left, right) => {
  const leftKey = toBusinessDateKey(left);
  return Boolean(leftKey && leftKey === toBusinessDateKey(right));
};

const isActiveDeadlineProject = (project = {}) => {
  if (!project?.details?.deliveryDate) return false;
  if (project?.cancellation?.isCancelled) return false;
  if (project?.isLatestVersion === false) return false;
  if (["superseded", "archived"].includes(project?.versionState)) return false;
  return !DEADLINE_CLOSED_STATUSES.includes(project?.status || "");
};

const getProjectDeadlineFlags = (project = {}, nowValue = new Date()) => {
  const now = toValidDate(nowValue) || new Date();
  const dueAt = parseProjectDeliveryDeadline(project);
  if (!dueAt) {
    return {
      dueAt: null,
      isOverdue: false,
      isToday: false,
      isUrgent: false,
      hoursUntilDue: null,
    };
  }

  const diffMs = dueAt.getTime() - now.getTime();
  const isPriorityUrgent =
    project?.priority === "Urgent" || project?.projectType === "Emergency";

  return {
    dueAt,
    isOverdue: diffMs < 0,
    isToday: isSameBusinessDay(dueAt, now),
    isUrgent:
      isPriorityUrgent ||
      (diffMs >= 0 && diffMs <= DEADLINE_WARNING_WINDOW_MS),
    hoursUntilDue: Number.isFinite(diffMs)
      ? Math.round((diffMs / (60 * 60 * 1000)) * 10) / 10
      : null,
  };
};

module.exports = {
  DEADLINE_BUSINESS_TIME_ZONE,
  DEADLINE_CLOSED_STATUSES,
  DEADLINE_WARNING_WINDOW_MS,
  getBusinessDayBounds,
  getProjectDeadlineFlags,
  isActiveDeadlineProject,
  isSameBusinessDay,
  parseProjectDeliveryDeadline,
  toBusinessDateKey,
};
