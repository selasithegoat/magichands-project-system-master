import { useEffect, useMemo, useState } from "react";

const SECOND_IN_MS = 1000;
const DAY_IN_SECONDS = 24 * 60 * 60;
const COUNTDOWN_RING_SIZE = 104;
const COUNTDOWN_RING_STROKE_WIDTH = 5;
const COUNTDOWN_RING_RADIUS = (COUNTDOWN_RING_SIZE - COUNTDOWN_RING_STROKE_WIDTH) / 2;
const COUNTDOWN_RING_CIRCUMFERENCE = 2 * Math.PI * COUNTDOWN_RING_RADIUS;
const TWO_WEEKS_IN_SECONDS = 14 * 24 * 60 * 60;

const EMPTY_COUNTDOWN = {
  days: "--",
  hours: "--",
  minutes: "--",
  seconds: "--",
  totalSeconds: 0,
  isNearDelivery: false,
  isOverdue: false,
};

const clampProgress = (value) => Math.max(0, Math.min(1, value));

const getCountdownRingProgress = (unit, countdown) => {
  const unitValue = Number.parseInt(countdown?.[unit], 10);
  if (!Number.isFinite(unitValue)) return 0;

  if (unit === "days") {
    const totalSeconds = Number(countdown?.totalSeconds) || 0;
    return clampProgress(totalSeconds / TWO_WEEKS_IN_SECONDS);
  }

  if (unit === "hours") {
    return clampProgress(unitValue / 24);
  }

  if (unit === "minutes") {
    return clampProgress(unitValue / 60);
  }

  return 0;
};

const buildDeliveryCountdown = (deadline, nowMs) => {
  if (!deadline || Number.isNaN(deadline.getTime())) {
    return EMPTY_COUNTDOWN;
  }

  const deltaMs = deadline.getTime() - nowMs;
  const isOverdue = deltaMs < 0;
  const totalSeconds = Math.floor(Math.abs(deltaMs) / SECOND_IN_MS);
  const isNearDelivery = !isOverdue && totalSeconds <= DAY_IN_SECONDS;
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  return {
    days: String(days).padStart(2, "0"),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
    totalSeconds,
    isNearDelivery,
    isOverdue,
  };
};

const formatDeliveryStatusDate = (value) => {
  if (!value) return "Unknown date";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown date";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const RingCountdownUnit = ({ value, label, progress }) => {
  const normalizedValue = String(value).padStart(2, "0");
  const strokeDashoffset = COUNTDOWN_RING_CIRCUMFERENCE * (1 - clampProgress(progress));

  return (
    <div className="delivery-countdown-ring-unit">
      <div className="delivery-countdown-ring-shell">
        <svg
          className="delivery-countdown-ring-svg"
          viewBox={`0 0 ${COUNTDOWN_RING_SIZE} ${COUNTDOWN_RING_SIZE}`}
          aria-hidden="true"
          focusable="false"
        >
          <circle
            className="delivery-countdown-ring-track"
            cx={COUNTDOWN_RING_SIZE / 2}
            cy={COUNTDOWN_RING_SIZE / 2}
            r={COUNTDOWN_RING_RADIUS}
          />
          <circle
            className="delivery-countdown-ring-progress"
            cx={COUNTDOWN_RING_SIZE / 2}
            cy={COUNTDOWN_RING_SIZE / 2}
            r={COUNTDOWN_RING_RADIUS}
            strokeDasharray={COUNTDOWN_RING_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
          />
        </svg>
        <div className="delivery-countdown-ring-content">
          <span className="delivery-countdown-ring-value">{normalizedValue}</span>
          <span className="delivery-countdown-ring-label">
            {String(label).toLowerCase()}
          </span>
        </div>
      </div>
    </div>
  );
};

const DeliveryCountdownBadge = ({ deadline, isCompleted = false, completedAt }) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasValidDeadline = Boolean(deadline && !Number.isNaN(deadline.getTime()));

  useEffect(() => {
    if (!hasValidDeadline || isCompleted) return undefined;

    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, SECOND_IN_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [deadline, hasValidDeadline, isCompleted]);

  const countdown = useMemo(
    () => buildDeliveryCountdown(deadline, nowMs),
    [deadline, nowMs],
  );

  if (isCompleted) {
    return (
      <div
        className="delivery-countdown-badge is-delivered"
        role="status"
        aria-live="polite"
      >
        <span className="delivery-countdown-title">Delivery Completed</span>
        <span className="delivery-delivered-at">
          Delivered at {formatDeliveryStatusDate(completedAt || deadline)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`delivery-countdown-badge ${
        countdown.isNearDelivery ? "is-near-delivery" : ""
      } ${countdown.isOverdue ? "is-overdue" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="delivery-countdown-title">
        {countdown.isOverdue ? "Delivery Overdue" : "Delivery Countdown"}
      </span>
      <div className="delivery-countdown-rings">
        <RingCountdownUnit
          value={countdown.days}
          label="Days"
          progress={getCountdownRingProgress("days", countdown)}
        />
        <RingCountdownUnit
          value={countdown.hours}
          label="Hours"
          progress={getCountdownRingProgress("hours", countdown)}
        />
        <RingCountdownUnit
          value={countdown.minutes}
          label="Minutes"
          progress={getCountdownRingProgress("minutes", countdown)}
        />
      </div>
    </div>
  );
};

export default DeliveryCountdownBadge;
