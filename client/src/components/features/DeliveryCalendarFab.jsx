import React, { useCallback, useEffect, useMemo, useState } from "react";
import CalendarIcon from "../icons/CalendarIcon";
import ChevronLeftIcon from "../icons/ChevronLeftIcon";
import ChevronRightIcon from "../icons/ChevronRightIcon";
import XIcon from "../icons/XIcon";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import "./DeliveryCalendarFab.css";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "urgent", label: "Urgent" },
  { key: "corporate", label: "Corporate" },
];

const toDateKey = (dateValue) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfDay = (dateValue) => {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (dateValue) => {
  const date = new Date(dateValue);
  date.setHours(23, 59, 59, 999);
  return date;
};

const buildCalendarDays = (monthDate) => {
  const firstOfMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth(),
    1,
  );
  const gridStart = startOfDay(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
};

const getVisibleRange = (monthDate) => {
  const days = buildCalendarDays(monthDate);
  return {
    from: startOfDay(days[0]),
    to: endOfDay(days[days.length - 1]),
  };
};

const formatMonthLabel = (dateValue) =>
  dateValue.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

const formatDayTitle = (dateValue) =>
  dateValue.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

const formatEventTime = (event) => {
  if (event?.deliveryTime) return event.deliveryTime;
  const parsed = new Date(event?.dueAt || event?.deliveryDate);
  if (Number.isNaN(parsed.getTime())) return "Any time";
  return parsed.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getEventDateKey = (event) => toDateKey(event?.dueAt || event?.deliveryDate);

const matchesFilter = (event, filter) => {
  if (filter === "overdue") return Boolean(event?.isOverdue);
  if (filter === "urgent") return Boolean(event?.isUrgent);
  if (filter === "corporate") return Boolean(event?.isCorporate);
  return true;
};

const getEventTone = (event) => {
  if (event?.isOverdue) return "overdue";
  if (event?.isUrgent) return "urgent";
  if (event?.isCorporate) return "corporate";
  return "normal";
};

const DeliveryCalendarFab = ({
  hasFrontDeskFab = false,
  onOpenProject,
  requestSource = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()));
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    overdue: 0,
    urgent: 0,
    corporate: 0,
    today: 0,
  });
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const calendarDays = useMemo(
    () => buildCalendarDays(currentMonth),
    [currentMonth],
  );

  const fetchCalendar = useCallback(async () => {
    const { from, to } = getVisibleRange(currentMonth);
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        includeOverdue: "true",
        limit: "1000",
      });
      if (requestSource) params.set("source", requestSource);
      const response = await fetch(`/api/projects/delivery-calendar?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Failed to load calendar.");
      }
      setEvents(Array.isArray(payload?.events) ? payload.events : []);
      setSummary({
        total: Number(payload?.summary?.total) || 0,
        overdue: Number(payload?.summary?.overdue) || 0,
        urgent: Number(payload?.summary?.urgent) || 0,
        corporate: Number(payload?.summary?.corporate) || 0,
        today: Number(payload?.summary?.today) || 0,
      });
    } catch (calendarError) {
      setEvents([]);
      setSummary({ total: 0, overdue: 0, urgent: 0, corporate: 0, today: 0 });
      setError(calendarError.message || "Failed to load calendar.");
    } finally {
      setLoading(false);
    }
  }, [currentMonth, requestSource]);

  useEffect(() => {
    if (isOpen) fetchCalendar();
  }, [fetchCalendar, isOpen]);

  useRealtimeRefresh(
    () => {
      if (isOpen) fetchCalendar();
    },
    {
      enabled: isOpen,
      paths: ["/api/projects"],
      excludePaths: ["/api/projects/activities", "/api/projects/ai"],
    },
  );

  const filteredEvents = useMemo(
    () => events.filter((event) => matchesFilter(event, activeFilter)),
    [activeFilter, events],
  );

  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    filteredEvents.forEach((event) => {
      const key = getEventDateKey(event);
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(event);
    });
    return grouped;
  }, [filteredEvents]);

  const selectedDate = useMemo(() => {
    const parsed = selectedDateKey ? new Date(`${selectedDateKey}T00:00:00`) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  }, [selectedDateKey]);

  const selectedEvents = eventsByDate.get(selectedDateKey) || [];
  const overdueEvents = useMemo(
    () =>
      filteredEvents
        .filter((event) => event?.isOverdue)
        .sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt))
        .slice(0, 8),
    [filteredEvents],
  );

  const goToPreviousMonth = () => {
    setCurrentMonth((previous) => {
      const next = new Date(previous);
      next.setMonth(previous.getMonth() - 1, 1);
      return next;
    });
  };

  const goToNextMonth = () => {
    setCurrentMonth((previous) => {
      const next = new Date(previous);
      next.setMonth(previous.getMonth() + 1, 1);
      return next;
    });
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentMonth(today);
    setSelectedDateKey(toDateKey(today));
  };

  const openEvent = (event) => {
    if (!event?.projectId || typeof onOpenProject !== "function") return;
    setIsOpen(false);
    onOpenProject({
      _id: event.projectId,
      departments: event.departments || [],
      projectLeadId: event.projectLeadId,
      assistantLeadId: event.assistantLeadId,
    });
  };

  const renderEventRow = (event) => (
    <button
      key={event.id}
      type="button"
      className={`delivery-calendar-event-row ${getEventTone(event)}`}
      onClick={() => openEvent(event)}
    >
      <span className="delivery-calendar-event-time">{formatEventTime(event)}</span>
      <span className="delivery-calendar-event-copy">
        <strong>{event.orderId}</strong>
        <span>{event.projectName}</span>
        <em>
          {event.client}
          {event.deliveryLocation ? ` - ${event.deliveryLocation}` : ""}
        </em>
      </span>
    </button>
  );

  return (
    <>
      <button
        type="button"
        className={`delivery-calendar-fab ${
          hasFrontDeskFab ? "with-frontdesk-fab" : ""
        }`}
        onClick={() => setIsOpen(true)}
        aria-label="Open delivery calendar"
      >
        <span className="delivery-calendar-fab-icon">
          <CalendarIcon width={20} height={20} color="currentColor" />
        </span>
        <span className="delivery-calendar-fab-label">Calendar</span>
      </button>

      {isOpen && (
        <div className="delivery-calendar-overlay" onClick={() => setIsOpen(false)}>
          <section
            className="delivery-calendar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-calendar-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="delivery-calendar-header">
              <div>
                <span className="delivery-calendar-kicker">Planning</span>
                <h2 id="delivery-calendar-title">Delivery Calendar</h2>
              </div>
              <button
                type="button"
                className="delivery-calendar-icon-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close calendar"
              >
                <XIcon width={18} height={18} />
              </button>
            </header>

            <div className="delivery-calendar-stats">
              <span>
                <strong>{summary.today}</strong>
                Today
              </span>
              <span>
                <strong>{summary.overdue}</strong>
                Overdue
              </span>
              <span>
                <strong>{summary.urgent}</strong>
                Urgent
              </span>
              <span>
                <strong>{summary.corporate}</strong>
                Corporate
              </span>
            </div>

            <div className="delivery-calendar-toolbar">
              <div className="delivery-calendar-month-controls">
                <button
                  type="button"
                  className="delivery-calendar-icon-btn"
                  onClick={goToPreviousMonth}
                  aria-label="Previous month"
                >
                  <ChevronLeftIcon width={18} height={18} />
                </button>
                <strong>{formatMonthLabel(currentMonth)}</strong>
                <button
                  type="button"
                  className="delivery-calendar-icon-btn"
                  onClick={goToNextMonth}
                  aria-label="Next month"
                >
                  <ChevronRightIcon width={18} height={18} />
                </button>
                <button
                  type="button"
                  className="delivery-calendar-today-btn"
                  onClick={goToToday}
                >
                  Today
                </button>
              </div>

              <div className="delivery-calendar-filters" aria-label="Calendar filter">
                {FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={activeFilter === option.key ? "active" : ""}
                    onClick={() => setActiveFilter(option.key)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="delivery-calendar-body">
              <div className="delivery-calendar-grid-wrap">
                <div className="delivery-calendar-weekdays">
                  {WEEKDAY_LABELS.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
                <div className="delivery-calendar-grid">
                  {calendarDays.map((day) => {
                    const dateKey = toDateKey(day);
                    const dayEvents = eventsByDate.get(dateKey) || [];
                    const isMuted = day.getMonth() !== currentMonth.getMonth();
                    const isToday = dateKey === toDateKey(new Date());
                    const isSelected = dateKey === selectedDateKey;
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        className={[
                          "delivery-calendar-day",
                          isMuted ? "muted" : "",
                          isToday ? "today" : "",
                          isSelected ? "selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => setSelectedDateKey(dateKey)}
                      >
                        <span className="delivery-calendar-day-number">
                          {day.getDate()}
                        </span>
                        <span className="delivery-calendar-day-events">
                          {dayEvents.slice(0, 3).map((event) => (
                            <span
                              key={event.id}
                              className={`delivery-calendar-dot ${getEventTone(event)}`}
                              title={`${event.orderId} - ${event.projectName}`}
                            />
                          ))}
                          {dayEvents.length > 3 && (
                            <span className="delivery-calendar-more">
                              +{dayEvents.length - 3}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className="delivery-calendar-side">
                <div className="delivery-calendar-side-section">
                  <div className="delivery-calendar-side-title">
                    <span>{formatDayTitle(selectedDate)}</span>
                    <strong>{selectedEvents.length}</strong>
                  </div>
                  {loading ? (
                    <p className="delivery-calendar-muted">Loading...</p>
                  ) : error ? (
                    <p className="delivery-calendar-error">{error}</p>
                  ) : selectedEvents.length ? (
                    <div className="delivery-calendar-event-list">
                      {selectedEvents.map(renderEventRow)}
                    </div>
                  ) : (
                    <p className="delivery-calendar-muted">No jobs scheduled.</p>
                  )}
                </div>

                <div className="delivery-calendar-side-section overdue">
                  <div className="delivery-calendar-side-title">
                    <span>Overdue</span>
                    <strong>{overdueEvents.length}</strong>
                  </div>
                  {overdueEvents.length ? (
                    <div className="delivery-calendar-event-list compact">
                      {overdueEvents.map(renderEventRow)}
                    </div>
                  ) : (
                    <p className="delivery-calendar-muted">No overdue jobs.</p>
                  )}
                </div>
              </aside>
            </div>
          </section>
        </div>
      )}
    </>
  );
};

export default DeliveryCalendarFab;
