import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./StageBottleneckAlert.css";

const DEFAULT_THRESHOLD_DAYS = 14;
const POLL_INTERVAL_MS = 60 * 1000;
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DISMISS_STORAGE_KEY = "admin_stage_bottleneck_dismissed_at_v1";

const formatStageDate = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const toSafeList = (value) => (Array.isArray(value) ? value : []);
const toStageLabel = (value) => {
  const label = String(value || "").trim();
  return label || "Unknown Stage";
};
const toBottleneckKey = (item = {}) =>
  [
    String(item?.projectId || ""),
    String(item?.status || ""),
    String(item?.stageEnteredAt || ""),
  ].join("|");
const toBottleneckOptionLabel = (item = {}, index = 0) => {
  const orderId = String(item?.orderId || "").trim() || `Project ${index + 1}`;
  const projectName = String(item?.projectName || "").trim() || "Unnamed Project";
  const stage = toStageLabel(item?.status);
  const daysInStage = Number.isFinite(Number(item?.daysInStage))
    ? `${item.daysInStage}d`
    : "N/A";
  return `${orderId} - ${projectName} (${stage}, ${daysInStage})`;
};

const buildAlertSignature = (items = []) =>
  toSafeList(items)
    .map((item) =>
      [
        String(item?.projectId || ""),
        String(item?.status || ""),
        String(item?.stageEnteredAt || ""),
      ].join("|"),
    )
    .join("::");

const loadDismissedAtMap = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
};

const StageBottleneckAlert = () => {
  const [bottlenecks, setBottlenecks] = useState([]);
  const [thresholdDays, setThresholdDays] = useState(DEFAULT_THRESHOLD_DAYS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBottleneckKey, setSelectedBottleneckKey] = useState("");
  const [dismissedAtMap, setDismissedAtMap] = useState(() =>
    loadDismissedAtMap(),
  );
  const [loading, setLoading] = useState(true);

  const fetchBottlenecks = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/bottlenecks/stage?source=admin&days=${DEFAULT_THRESHOLD_DAYS}`,
        {
          credentials: "include",
          cache: "no-store",
        },
      );

      if (!res.ok) {
        throw new Error("Failed to load stage bottlenecks.");
      }

      const data = await res.json();
      const incoming = toSafeList(data?.bottlenecks);
      const parsedDays = Number.parseInt(data?.thresholdDays, 10);

      setThresholdDays(
        Number.isFinite(parsedDays) && parsedDays > 0
          ? parsedDays
          : DEFAULT_THRESHOLD_DAYS,
      );
      setBottlenecks(incoming);
    } catch (error) {
      console.error("Stage bottleneck fetch error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBottlenecks();
    const intervalId = window.setInterval(fetchBottlenecks, POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchBottlenecks]);

  const alertSignature = useMemo(
    () => buildAlertSignature(bottlenecks),
    [bottlenecks],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        DISMISS_STORAGE_KEY,
        JSON.stringify(dismissedAtMap),
      );
    } catch {
      // Ignore storage errors.
    }
  }, [dismissedAtMap]);

  useEffect(() => {
    if (bottlenecks.length === 0) {
      setIsModalOpen(false);
      return;
    }

    if (!alertSignature) return;

    const lastDismissedAt = Number(dismissedAtMap[alertSignature] || 0);
    const reminderDue =
      !lastDismissedAt || Date.now() - lastDismissedAt >= REMINDER_INTERVAL_MS;

    if (reminderDue) {
      setIsModalOpen(true);
    }
  }, [bottlenecks.length, alertSignature, dismissedAtMap]);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (bottlenecks.length === 0) {
      setSelectedBottleneckKey("");
      return;
    }

    const selectedStillExists = bottlenecks.some(
      (item) => toBottleneckKey(item) === selectedBottleneckKey,
    );

    if (!selectedStillExists) {
      setSelectedBottleneckKey(toBottleneckKey(bottlenecks[0]));
    }
  }, [bottlenecks, selectedBottleneckKey]);

  const selectedBottleneck = useMemo(() => {
    const found = bottlenecks.find(
      (item) => toBottleneckKey(item) === selectedBottleneckKey,
    );
    return found || bottlenecks[0] || null;
  }, [bottlenecks, selectedBottleneckKey]);

  const closeModal = () => {
    if (alertSignature) {
      setDismissedAtMap((prev) => ({
        ...prev,
        [alertSignature]: Date.now(),
      }));
    }
    setIsModalOpen(false);
  };

  if (loading && bottlenecks.length === 0) return null;
  if (bottlenecks.length === 0) return null;

  const mostUrgent = bottlenecks[0];
  const primary = selectedBottleneck || mostUrgent;
  const totalLabel = bottlenecks.length === 1 ? "project is" : "projects are";
  const primaryStage = toStageLabel(primary?.status);
  const mostUrgentStage = toStageLabel(mostUrgent?.status);

  return (
    <>
      <section className="stage-bottleneck-banner" role="alert">
        <div className="stage-bottleneck-banner-main">
          <h4>Stage Bottleneck Caution</h4>
          <p>
            {bottlenecks.length} {totalLabel} bottlenecked for {thresholdDays}+
            {" "}days. Most urgent stage: <strong>{mostUrgentStage}</strong>.
            {" "}Should this be cancelled, or placed on hold?
          </p>
          <p className="stage-bottleneck-banner-note">
            On-hold projects are excluded from this alert.
          </p>
          <p className="stage-bottleneck-banner-note">
            This popup will reappear every 24 hours until progression, hold, or cancellation.
          </p>
        </div>
        <div className="stage-bottleneck-banner-actions">
          {bottlenecks.length > 1 && (
            <label className="stage-bottleneck-select">
              <span>Choose bottleneck to review</span>
              <select
                value={selectedBottleneckKey}
                onChange={(event) => setSelectedBottleneckKey(event.target.value)}
              >
                {bottlenecks.map((item, index) => (
                  <option
                    key={toBottleneckKey(item)}
                    value={toBottleneckKey(item)}
                  >
                    {toBottleneckOptionLabel(item, index)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="stage-bottleneck-primary-project">
            <strong>{primary.orderId || "N/A"}</strong>
            <span>{primary.projectName || "Unnamed Project"}</span>
            <span>
              Bottlenecked at {primaryStage} ({primary.daysInStage} days)
            </span>
          </div>
          <button
            type="button"
            className="stage-bottleneck-btn view"
            onClick={() => setIsModalOpen(true)}
          >
            View Alert
          </button>
          <Link
            className="stage-bottleneck-btn open"
            to={`/projects/${primary.projectId}`}
          >
            Open Selected Project
          </Link>
        </div>
      </section>

      {isModalOpen && (
        <div className="stage-bottleneck-modal-overlay">
          <div
            className="stage-bottleneck-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stage-bottleneck-title"
          >
            <h3 id="stage-bottleneck-title">Stage Bottleneck Caution</h3>
            <p>
              These projects are bottlenecked for at least {thresholdDays} days.
              {" "}Most urgent stage right now: <strong>{mostUrgentStage}</strong>.
              {" "}Should they be cancelled? If not, place them on hold to suspend
              the cancellation alert.
            </p>
            <p>
              Reminder: this caution popup will return every 24 hours until action is taken.
            </p>
            {bottlenecks.length > 1 && (
              <label className="stage-bottleneck-modal-select">
                <span>Choose project to focus</span>
                <select
                  value={selectedBottleneckKey}
                  onChange={(event) => setSelectedBottleneckKey(event.target.value)}
                >
                  {bottlenecks.map((item, index) => (
                    <option
                      key={toBottleneckKey(item)}
                      value={toBottleneckKey(item)}
                    >
                      {toBottleneckOptionLabel(item, index)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {primary?.projectId && (
              <div className="stage-bottleneck-modal-focus">
                <p>
                  Viewing: <strong>{primary.orderId || "N/A"}</strong> -{" "}
                  {primary.projectName || "Unnamed Project"} ({primaryStage},{" "}
                  {primary.daysInStage} days)
                </p>
                <Link
                  className="stage-bottleneck-item-link"
                  to={`/projects/${primary.projectId}`}
                >
                  Review Selected Project
                </Link>
              </div>
            )}

            <div className="stage-bottleneck-modal-list">
              {bottlenecks.map((item) => (
                <article
                  key={`${item.projectId}|${item.status}|${item.stageEnteredAt}`}
                  className={`stage-bottleneck-item ${
                    toBottleneckKey(item) === toBottleneckKey(primary)
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => setSelectedBottleneckKey(toBottleneckKey(item))}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedBottleneckKey(toBottleneckKey(item));
                    }
                  }}
                >
                  <p>
                    <strong>Project:</strong> {item.orderId || "N/A"} -{" "}
                    {item.projectName || "Unnamed Project"}
                  </p>
                  <p>
                    <strong>Bottleneck stage:</strong> {toStageLabel(item.status)}
                  </p>
                  <p>
                    <strong>Days in stage:</strong> {item.daysInStage}
                  </p>
                  <p>
                    <strong>Stage since:</strong>{" "}
                    {formatStageDate(item.stageEnteredAt)}
                  </p>
                  <Link
                    className="stage-bottleneck-item-link"
                    to={`/projects/${item.projectId}`}
                  >
                    Review Project
                  </Link>
                </article>
              ))}
            </div>

            <div className="stage-bottleneck-modal-actions">
              <button
                type="button"
                className="stage-bottleneck-btn close"
                onClick={closeModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StageBottleneckAlert;
