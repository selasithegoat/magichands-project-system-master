import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import CalendarIcon from "../icons/CalendarIcon";
import ChevronLeftIcon from "../icons/ChevronLeftIcon";
import ChevronRightIcon from "../icons/ChevronRightIcon";
import CheckIcon from "../icons/CheckIcon";
import ClockIcon from "../icons/ClockIcon";
import EditIcon from "../icons/EditIcon";
import ReminderBellIcon from "../icons/ReminderBellIcon";
import XIcon from "../icons/XIcon";
import Toast from "../ui/Toast";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { appendPortalSource, resolvePortalSource } from "../../utils/portalSource";
import "./DeliveryCalendarFab.css";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "urgent", label: "Urgent" },
  { key: "corporate", label: "Corporate" },
];
const DELIVERY_CONFIRM_PHRASE = "I confirm this order has been delivered";

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

const formatDateInputValue = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  if (raw.includes("T")) return raw.split("T")[0];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().split("T")[0];
};

const parseTimeParts = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (raw.includes("T")) {
    const parsedIso = new Date(raw);
    if (!Number.isNaN(parsedIso.getTime())) {
      return {
        hours: parsedIso.getHours(),
        minutes: parsedIso.getMinutes(),
      };
    }
  }

  const match12h = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12h) {
    let hours = Number.parseInt(match12h[1], 10);
    const minutes = Number.parseInt(match12h[2], 10);
    const period = match12h[4].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  const match24h = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24h) {
    const hours = Number.parseInt(match24h[1], 10);
    const minutes = Number.parseInt(match24h[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  return null;
};

const toTimeInputValue = (value) => {
  const parts = parseTimeParts(value);
  if (!parts) return "";
  return `${String(parts.hours).padStart(2, "0")}:${String(
    parts.minutes,
  ).padStart(2, "0")}`;
};

const toDateTimeLocalValue = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const timezoneOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const buildDefaultReminderDateTime = (event) => {
  const dueAtTime = event?.dueAt ? new Date(event.dueAt).getTime() : NaN;
  const oneHourMs = 60 * 60 * 1000;
  const now = Date.now();
  const baseTime =
    Number.isFinite(dueAtTime) && dueAtTime - now > oneHourMs
      ? dueAtTime - oneHourMs
      : now + oneHourMs;
  const next = new Date(baseTime);
  next.setSeconds(0, 0);
  return toDateTimeLocalValue(next);
};

const buildReminderTitle = (event) => {
  const orderRef = String(event?.orderId || "").trim();
  if (orderRef) return `Follow up on ${orderRef} delivery`;
  return "Delivery follow-up";
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
  const [actionModal, setActionModal] = useState({ type: "", event: null });
  const [deliveryInput, setDeliveryInput] = useState("");
  const [scheduleForm, setScheduleForm] = useState({
    deliveryDate: "",
    deliveryTime: "",
  });
  const [noteContent, setNoteContent] = useState("");
  const [reminderForm, setReminderForm] = useState({
    title: "",
    message: "",
    remindAt: "",
  });
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });
  const toastTimeoutRef = useRef(null);

  const portalSource = useMemo(
    () => requestSource || resolvePortalSource(),
    [requestSource],
  );
  const withPortalSource = useCallback(
    (url) => appendPortalSource(url, portalSource),
    [portalSource],
  );

  const resetActionModalState = useCallback(() => {
    setActionModal({ type: "", event: null });
    setDeliveryInput("");
    setScheduleForm({ deliveryDate: "", deliveryTime: "" });
    setNoteContent("");
    setReminderForm({ title: "", message: "", remindAt: "" });
    setActionError("");
  }, []);

  const showToast = useCallback((message, type = "success") => {
    setToast({ show: true, message, type });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToast((previous) => ({ ...previous, show: false }));
    }, 10000);
  }, []);

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
      const response = await fetch(
        withPortalSource(`/api/projects/delivery-calendar?${params}`),
        {
          credentials: "include",
          cache: "no-store",
        },
      );
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
  }, [currentMonth, withPortalSource]);

  useEffect(() => {
    if (isOpen) fetchCalendar();
  }, [fetchCalendar, isOpen]);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    },
    [],
  );

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

    grouped.forEach((groupedEvents, key) => {
      grouped.set(
        key,
        groupedEvents.slice().sort((left, right) => {
          const leftTime = left?.dueAt ? new Date(left.dueAt).getTime() : 0;
          const rightTime = right?.dueAt ? new Date(right.dueAt).getTime() : 0;
          return leftTime - rightTime;
        }),
      );
    });

    return grouped;
  }, [filteredEvents]);

  const selectedDate = useMemo(() => {
    const parsed = selectedDateKey ? new Date(`${selectedDateKey}T00:00:00`) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  }, [selectedDateKey]);

  const selectedEvents = useMemo(
    () => eventsByDate.get(selectedDateKey) || [],
    [eventsByDate, selectedDateKey],
  );
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

  const closeActionModal = () => {
    if (actionSubmitting) return;
    resetActionModalState();
  };

  const closeCalendar = () => {
    if (actionSubmitting) return;
    resetActionModalState();
    setIsOpen(false);
  };

  const openEvent = (event) => {
    if (!event?.projectId || typeof onOpenProject !== "function") return;
    setIsOpen(false);
    resetActionModalState();
    onOpenProject({
      _id: event.projectId,
      departments: event.departments || [],
      projectLeadId: event.projectLeadId,
      assistantLeadId: event.assistantLeadId,
    });
  };

  const openDeliveryModal = (event) => {
    setActionModal({ type: "deliver", event });
    setDeliveryInput("");
    setActionError("");
  };

  const openScheduleModal = (event) => {
    setActionModal({ type: "schedule", event });
    setScheduleForm({
      deliveryDate: formatDateInputValue(event?.deliveryDate),
      deliveryTime: toTimeInputValue(event?.deliveryTime),
    });
    setActionError("");
  };

  const openNoteModal = (event) => {
    setActionModal({ type: "note", event });
    setNoteContent("");
    setActionError("");
  };

  const openReminderModal = (event) => {
    setActionModal({ type: "reminder", event });
    setReminderForm({
      title: buildReminderTitle(event),
      message: "",
      remindAt: buildDefaultReminderDateTime(event),
    });
    setActionError("");
  };

  const handleConfirmDelivered = async () => {
    const targetEvent = actionModal.event;
    if (!targetEvent?.projectId) return;
    if (deliveryInput.trim() !== DELIVERY_CONFIRM_PHRASE) return;

    let shouldRefresh = false;
    setActionSubmitting(true);
    setActionError("");

    try {
      const response = await fetch(
        withPortalSource(`/api/projects/${targetEvent.projectId}/status`),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "Delivered",
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.message || "Failed to mark delivery complete.";
        setActionError(message);
        showToast(message, "error");
        return;
      }

      shouldRefresh = true;
      resetActionModalState();
      showToast("Order delivered. Feedback is now pending.", "success");
    } catch (calendarError) {
      const message = "Network error. Please try again.";
      setActionError(message);
      showToast(message, "error");
    } finally {
      setActionSubmitting(false);
    }

    if (shouldRefresh) {
      await fetchCalendar();
    }
  };

  const handleSaveSchedule = async () => {
    const targetEvent = actionModal.event;
    if (!targetEvent?.projectId) return;

    const trimmedDate = String(scheduleForm.deliveryDate || "").trim();
    const trimmedTime = String(scheduleForm.deliveryTime || "").trim();

    if (!trimmedDate) {
      setActionError("Delivery date is required.");
      return;
    }

    let shouldRefresh = false;
    setActionSubmitting(true);
    setActionError("");

    try {
      const response = await fetch(
        withPortalSource(
          `/api/projects/${targetEvent.projectId}/delivery-schedule`,
        ),
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deliveryDate: trimmedDate,
            deliveryTime: trimmedTime,
          }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.message || "Failed to update delivery schedule.";
        setActionError(message);
        showToast(message, "error");
        return;
      }

      const nextDate = new Date(`${trimmedDate}T00:00:00`);
      if (!Number.isNaN(nextDate.getTime())) {
        const monthChanged =
          nextDate.getFullYear() !== currentMonth.getFullYear() ||
          nextDate.getMonth() !== currentMonth.getMonth();
        shouldRefresh = !monthChanged;
        if (monthChanged) {
          setCurrentMonth(
            new Date(nextDate.getFullYear(), nextDate.getMonth(), 1),
          );
        }
        setSelectedDateKey(toDateKey(nextDate));
      } else {
        shouldRefresh = true;
      }
      resetActionModalState();
      showToast("Delivery schedule updated.", "success");
    } catch (calendarError) {
      const message = "Network error. Please try again.";
      setActionError(message);
      showToast(message, "error");
    } finally {
      setActionSubmitting(false);
    }

    if (shouldRefresh) {
      await fetchCalendar();
    }
  };

  const handleSaveNote = async () => {
    const targetEvent = actionModal.event;
    if (!targetEvent?.projectId) return;

    const trimmedContent = noteContent.trim();
    if (!trimmedContent) {
      setActionError("Note content cannot be empty.");
      return;
    }

    setActionSubmitting(true);
    setActionError("");

    try {
      const data = new FormData();
      data.append("content", trimmedContent);
      data.append("category", "General");

      const response = await fetch(
        withPortalSource(`/api/updates/project/${targetEvent.projectId}`),
        {
          method: "POST",
          credentials: "include",
          body: data,
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.message || "Failed to add note.";
        setActionError(message);
        showToast(message, "error");
        return;
      }

      resetActionModalState();
      showToast("Note added to project updates.", "success");
    } catch (calendarError) {
      const message = "Network error. Please try again.";
      setActionError(message);
      showToast(message, "error");
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleSaveReminder = async () => {
    const targetEvent = actionModal.event;
    if (!targetEvent?.projectId) return;

    const trimmedTitle = reminderForm.title.trim();
    const trimmedRemindAt = reminderForm.remindAt.trim();
    if (!trimmedTitle) {
      setActionError("Reminder title is required.");
      return;
    }
    if (!trimmedRemindAt) {
      setActionError("Reminder date and time are required.");
      return;
    }

    const parsedRemindAt = new Date(trimmedRemindAt);
    if (Number.isNaN(parsedRemindAt.getTime())) {
      setActionError("Reminder date and time are invalid.");
      return;
    }

    setActionSubmitting(true);
    setActionError("");

    try {
      const response = await fetch(withPortalSource("/api/reminders"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: targetEvent.projectId,
          title: trimmedTitle,
          message: reminderForm.message.trim(),
          remindAt: parsedRemindAt.toISOString(),
          repeat: "none",
          triggerMode: "absolute_time",
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          templateKey: "custom",
          channels: {
            inApp: true,
            email: false,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.message || "Failed to create reminder.";
        setActionError(message);
        showToast(message, "error");
        return;
      }

      resetActionModalState();
      showToast("Reminder created.", "success");
    } catch (calendarError) {
      const message = "Network error. Please try again.";
      setActionError(message);
      showToast(message, "error");
    } finally {
      setActionSubmitting(false);
    }
  };

  const renderActionModal = () => {
    if (!actionModal.type || !actionModal.event) return null;

    const targetEvent = actionModal.event;
    const orderLabel = targetEvent.orderId || targetEvent.projectName || "Project";

    return (
      <div
        className="delivery-calendar-action-overlay"
        onClick={(event) => {
          event.stopPropagation();
          closeActionModal();
        }}
      >
        <section
          className="delivery-calendar-action-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delivery-calendar-action-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="delivery-calendar-action-header">
            <div>
              <span className="delivery-calendar-action-kicker">Quick Action</span>
              <h3 id="delivery-calendar-action-title">
                {actionModal.type === "deliver"
                  ? "Confirm Delivery"
                  : actionModal.type === "schedule"
                    ? "Edit Delivery Schedule"
                    : actionModal.type === "note"
                      ? "Add Note"
                      : "Add Reminder"}
              </h3>
            </div>
            <button
              type="button"
              className="delivery-calendar-icon-btn"
              onClick={closeActionModal}
              aria-label="Close quick action"
            >
              <XIcon width={18} height={18} />
            </button>
          </header>

          <div className="delivery-calendar-action-body">
            <p className="delivery-calendar-action-summary">
              <strong>{orderLabel}</strong>
              <span>{targetEvent.projectName}</span>
            </p>

            {actionModal.type === "deliver" && (
              <>
                <p className="delivery-calendar-action-copy">
                  This will move the order to delivered and remove it from the
                  delivery calendar.
                </p>
                <div className="delivery-calendar-confirm-phrase">
                  {DELIVERY_CONFIRM_PHRASE}
                </div>
                <label className="delivery-calendar-action-field">
                  <span>Confirmation</span>
                  <input
                    type="text"
                    value={deliveryInput}
                    onChange={(event) => {
                      setDeliveryInput(event.target.value);
                      if (actionError) setActionError("");
                    }}
                    placeholder="Type the confirmation phrase"
                  />
                </label>
              </>
            )}

            {actionModal.type === "schedule" && (
              <div className="delivery-calendar-action-form">
                <label className="delivery-calendar-action-field">
                  <span>Delivery Date</span>
                  <input
                    type="date"
                    value={scheduleForm.deliveryDate}
                    onChange={(event) => {
                      setScheduleForm((previous) => ({
                        ...previous,
                        deliveryDate: event.target.value,
                      }));
                      if (actionError) setActionError("");
                    }}
                  />
                </label>
                <label className="delivery-calendar-action-field">
                  <span>Delivery Time</span>
                  <input
                    type="time"
                    value={scheduleForm.deliveryTime}
                    onChange={(event) => {
                      setScheduleForm((previous) => ({
                        ...previous,
                        deliveryTime: event.target.value,
                      }));
                      if (actionError) setActionError("");
                    }}
                  />
                </label>
              </div>
            )}

            {actionModal.type === "note" && (
              <label className="delivery-calendar-action-field">
                <span>Note</span>
                <textarea
                  rows="5"
                  value={noteContent}
                  onChange={(event) => {
                    setNoteContent(event.target.value);
                    if (actionError) setActionError("");
                  }}
                  placeholder="Add a delivery note for the team..."
                />
              </label>
            )}

            {actionModal.type === "reminder" && (
              <div className="delivery-calendar-action-form">
                <label className="delivery-calendar-action-field">
                  <span>Title</span>
                  <input
                    type="text"
                    value={reminderForm.title}
                    onChange={(event) => {
                      setReminderForm((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }));
                      if (actionError) setActionError("");
                    }}
                    placeholder="Reminder title"
                  />
                </label>
                <label className="delivery-calendar-action-field">
                  <span>Reminder Time</span>
                  <input
                    type="datetime-local"
                    value={reminderForm.remindAt}
                    onChange={(event) => {
                      setReminderForm((previous) => ({
                        ...previous,
                        remindAt: event.target.value,
                      }));
                      if (actionError) setActionError("");
                    }}
                  />
                </label>
                <label className="delivery-calendar-action-field full-width">
                  <span>Message (optional)</span>
                  <textarea
                    rows="4"
                    value={reminderForm.message}
                    onChange={(event) => {
                      setReminderForm((previous) => ({
                        ...previous,
                        message: event.target.value,
                      }));
                      if (actionError) setActionError("");
                    }}
                    placeholder="Add a short reminder note..."
                  />
                </label>
              </div>
            )}

            {actionError && (
              <p className="delivery-calendar-action-error">{actionError}</p>
            )}
          </div>

          <footer className="delivery-calendar-action-footer">
            <button
              type="button"
              className="delivery-calendar-secondary-btn"
              onClick={closeActionModal}
            >
              Cancel
            </button>
            <button
              type="button"
              className="delivery-calendar-primary-btn"
              onClick={
                actionModal.type === "deliver"
                  ? handleConfirmDelivered
                  : actionModal.type === "schedule"
                    ? handleSaveSchedule
                    : actionModal.type === "note"
                      ? handleSaveNote
                      : handleSaveReminder
              }
              disabled={
                actionSubmitting ||
                (actionModal.type === "deliver" &&
                  deliveryInput.trim() !== DELIVERY_CONFIRM_PHRASE)
              }
            >
              {actionSubmitting
                ? actionModal.type === "deliver"
                  ? "Confirming..."
                  : actionModal.type === "schedule"
                    ? "Saving..."
                    : actionModal.type === "note"
                      ? "Posting..."
                      : "Creating..."
                : actionModal.type === "deliver"
                  ? "Confirm Delivery"
                  : actionModal.type === "schedule"
                    ? "Save Schedule"
                    : actionModal.type === "note"
                      ? "Post Note"
                      : "Create Reminder"}
            </button>
          </footer>
        </section>
      </div>
    );
  };

  const renderEventRow = (event) => {
    const canMarkDelivered = event?.status === "Pending Delivery/Pickup";

    return (
      <div
        key={event.id}
        className={`delivery-calendar-event-row ${getEventTone(event)}`}
      >
        <button
          type="button"
          className="delivery-calendar-event-main"
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

        <div className="delivery-calendar-event-actions">
          {canMarkDelivered && (
            <button
              type="button"
              className="delivery-calendar-event-action"
              onClick={() => openDeliveryModal(event)}
            >
              <CheckIcon width={14} height={14} />
              <span>Delivered</span>
            </button>
          )}
          <button
            type="button"
            className="delivery-calendar-event-action"
            onClick={() => openScheduleModal(event)}
          >
            <ClockIcon width={14} height={14} />
            <span>Schedule</span>
          </button>
          <button
            type="button"
            className="delivery-calendar-event-action"
            onClick={() => openNoteModal(event)}
          >
            <EditIcon width={14} height={14} />
            <span>Note</span>
          </button>
          <button
            type="button"
            className="delivery-calendar-event-action"
            onClick={() => openReminderModal(event)}
          >
            <ReminderBellIcon width={14} height={14} />
            <span>Reminder</span>
          </button>
        </div>
      </div>
    );
  };

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

      {toast.show && (
        <div className="ui-toast-container delivery-calendar-toast-container">
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast((previous) => ({ ...previous, show: false }))}
          />
        </div>
      )}

      {isOpen && (
        <div className="delivery-calendar-overlay" onClick={closeCalendar}>
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
                onClick={closeCalendar}
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

          {renderActionModal()}
        </div>
      )}
    </>
  );
};

export default DeliveryCalendarFab;
