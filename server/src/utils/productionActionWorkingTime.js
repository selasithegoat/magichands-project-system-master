const { DEADLINE_BUSINESS_TIME_ZONE } = require("./projectDeadline");

// Africa/Accra is UTC+00:00; use UTC fields so server-local time never
// changes the Monday-Saturday, 09:00-18:00 working schedule.
const PRODUCTION_ACTION_TIME_ZONE = DEADLINE_BUSINESS_TIME_ZONE;
const OPEN_HOUR = 9;
const CLOSE_HOUR = 18;
const HOUR_MS = 60 * 60 * 1000;

const nextWorkingInstant = (value) => {
  const date = new Date(value);
  while (true) {
    const day = date.getUTCDay();
    if (day !== 0 && date.getUTCHours() < OPEN_HOUR) {
      date.setUTCHours(OPEN_HOUR, 0, 0, 0);
      return date;
    }
    if (day !== 0 && date.getUTCHours() < CLOSE_HOUR) return date;
    date.setUTCDate(date.getUTCDate() + 1);
    date.setUTCHours(OPEN_HOUR, 0, 0, 0);
  }
};

const addProductionWorkingHours = (value, hours) => {
  const start = new Date(value);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(hours) || hours < 0) {
    return null;
  }
  let cursor = nextWorkingInstant(start);
  let remaining = hours * HOUR_MS;
  while (remaining > 0) {
    const close = new Date(cursor);
    close.setUTCHours(CLOSE_HOUR, 0, 0, 0);
    const available = close.getTime() - cursor.getTime();
    if (remaining <= available) {
      const dueAt = new Date(cursor.getTime() + remaining);
      return dueAt.getTime() === close.getTime()
        ? nextWorkingInstant(new Date(close.getTime() + 1))
        : dueAt;
    }
    remaining -= available;
    cursor = nextWorkingInstant(new Date(close.getTime() + 1));
  }
  return cursor;
};

module.exports = {
  PRODUCTION_ACTION_TIME_ZONE,
  addProductionWorkingHours,
};
