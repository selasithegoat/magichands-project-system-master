import React, { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmationModal from "../ConfirmationModal/ConfirmationModal";
import { PencilIcon, TrashIcon } from "../../icons/Icons";
import "./ProjectRemindersCard.css";

const REMINDER_TEMPLATE_OPTIONS = [
  {
    key: "custom",
    label: "Custom Reminder",
    title: "",
    message: "",
    triggerMode: "absolute_time",
    watchStatus: "",
    delayMinutes: 0,
    offsetHours: 24,
  },
  {
    key: "mockup_follow_up",
    label: "Mockup Follow-up",
    title: "Follow up on mockup design",
    message: "Check if mockup is still pending and follow up with the team/client.",
    triggerMode: "stage_based",
    watchStatus: "Pending Mockup",
    delayMinutes: 0,
    offsetHours: 24,
  },
  {
    key: "production_progress",
    label: "Production Progress Check",
    title: "Check production progress",
    message: "Confirm production progress and update blockers if any.",
    triggerMode: "stage_based",
    watchStatus: "Pending Production",
    delayMinutes: 0,
    offsetHours: 24,
  },
  {
    key: "delivery_readiness",
    label: "Delivery Readiness",
    title: "Confirm delivery readiness",
    message: "Verify packaging, logistics, and final readiness before delivery.",
    triggerMode: "stage_based",
    watchStatus: "Pending Delivery/Pickup",
    delayMinutes: 0,
    offsetHours: 12,
  },
];

const TEMPLATE_RECIPIENT_GROUPS = {
  mockup_follow_up: ["graphics"],
  production_progress: ["production"],
  delivery_readiness: ["stores"],
};

const REMINDER_REPEAT_OPTIONS = [
  { value: "none", label: "One-time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const STANDARD_STATUS_OPTIONS = [
  "Order Created",
  "Pending Scope Approval",
  "Scope Approval Completed",
  "Pending Departmental Meeting",
  "Pending Departmental Engagement",
  "Departmental Engagement Completed",
  "Pending Mockup",
  "Mockup Completed",
  "Pending Master Approval",
  "Master Approval Completed",
  "Pending Production",
  "Production Completed",
  "Pending Quality Control",
  "Quality Control Completed",
  "Pending Photography",
  "Photography Completed",
  "Pending Packaging",
  "Packaging Completed",
  "Pending Delivery/Pickup",
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
];

const QUOTE_STATUS_OPTIONS = [
  "Order Created",
  "Pending Scope Approval",
  "Scope Approval Completed",
  "Pending Departmental Meeting",
  "Pending Departmental Engagement",
  "Departmental Engagement Completed",
  "Pending Quote Request",
  "Quote Request Completed",
  "Pending Send Response",
  "Response Sent",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
];

const ENGAGED_DEPARTMENT_GROUPS = [
  { id: "graphics", label: "Graphics" },
  { id: "production", label: "Production" },
  { id: "stores", label: "Stores" },
  { id: "photography", label: "Photography" },
];

const PRODUCTION_SUB_DEPARTMENT_OPTIONS = [
  { id: "dtf", label: "DTF Printing" },
  { id: "uv-dtf", label: "UV DTF Printing" },
  { id: "uv-printing", label: "UV Printing" },
  { id: "engraving", label: "Engraving" },
  { id: "large-format", label: "Large Format" },
  { id: "digital-press", label: "Digital Press" },
  { id: "digital-heat-press", label: "Digital Heat Press" },
  { id: "offset-press", label: "Offset Press" },
  { id: "screen-printing", label: "Screen Printing" },
  { id: "embroidery", label: "Embroidery" },
  { id: "sublimation", label: "Sublimation" },
  { id: "digital-cutting", label: "Digital Cutting" },
  { id: "pvc-id", label: "PVC ID Cards" },
  { id: "business-cards", label: "Business Cards" },
  { id: "installation", label: "Installation" },
  { id: "overseas", label: "Overseas" },
  { id: "woodme", label: "Woodme" },
  { id: "fabrication", label: "Fabrication" },
  { id: "signage", label: "Signage" },
  { id: "outside-production", label: "Outside Production" },
];

const PRODUCTION_SUB_DEPARTMENT_IDS = new Set(
  PRODUCTION_SUB_DEPARTMENT_OPTIONS.map((entry) => entry.id),
);

const PRODUCTION_DEPARTMENTS = new Set([
  "production",
  "dtf",
  "uv-dtf",
  "uv-printing",
  "engraving",
  "large-format",
  "digital-press",
  "digital-heat-press",
  "offset-press",
  "screen-printing",
  "embroidery",
  "sublimation",
  "digital-cutting",
  "pvc-id",
  "business-cards",
  "installation",
  "overseas",
  "woodme",
  "fabrication",
  "signage",
  "outside-production",
]);

const GRAPHICS_DEPARTMENT_TOKENS = new Set([
  "graphics/design",
  "graphics",
  "design",
]);
const STORES_DEPARTMENT_TOKENS = new Set(["stores", "stock", "packaging"]);
const PHOTOGRAPHY_DEPARTMENT_TOKENS = new Set(["photography"]);

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    if (value._id) return toEntityId(value._id);
    if (value.id) return String(value.id);
  }
  return "";
};

const getUserDepartmentTokens = (value) =>
  toDepartmentArray(value).map(normalizeDepartmentValue).filter(Boolean);

const toDepartmentArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
};

const normalizeDepartmentValue = (value) => {
  if (value && typeof value === "object") {
    const optionValue = value.value || value.label || "";
    return String(optionValue).trim().toLowerCase();
  }
  return String(value || "")
    .trim()
    .toLowerCase();
};

const canonicalizeDepartment = (value) => {
  const token = normalizeDepartmentValue(value);
  if (!token) return "";
  if (PRODUCTION_DEPARTMENTS.has(token)) return "production";
  if (GRAPHICS_DEPARTMENT_TOKENS.has(token)) return "graphics";
  if (STORES_DEPARTMENT_TOKENS.has(token)) return "stores";
  if (PHOTOGRAPHY_DEPARTMENT_TOKENS.has(token)) return "photography";
  return token;
};

const getCanonicalDepartmentSet = (value) =>
  new Set(
    toDepartmentArray(value)
      .map(canonicalizeDepartment)
      .filter(Boolean),
  );

const getSubDepartmentTokens = (value) =>
  new Set(
    getUserDepartmentTokens(value).filter((token) =>
      PRODUCTION_SUB_DEPARTMENT_IDS.has(token),
    ),
  );

const hasDepartmentOverlap = (userDepartments, projectDepartments) => {
  const userCanonical = getCanonicalDepartmentSet(userDepartments);
  if (userCanonical.size === 0) return false;

  const projectCanonical = getCanonicalDepartmentSet(projectDepartments);
  if (projectCanonical.size === 0) return false;

  for (const dept of userCanonical) {
    if (projectCanonical.has(dept)) return true;
  }
  return false;
};

const getRecipientGroupsFromRecipients = (recipients = []) => {
  const groups = new Set();
  (Array.isArray(recipients) ? recipients : []).forEach((entry) => {
    const departments = entry?.user?.department || entry?.department;
    toDepartmentArray(departments).forEach((dept) => {
      const canonical = canonicalizeDepartment(dept);
      if (canonical) groups.add(canonical);
    });
  });
  return Array.from(groups);
};

const getRecipientSubDepartmentsFromRecipients = (recipients = []) => {
  const subDepartments = new Set();
  (Array.isArray(recipients) ? recipients : []).forEach((entry) => {
    const departments = entry?.user?.department || entry?.department;
    getUserDepartmentTokens(departments).forEach((token) => {
      if (PRODUCTION_SUB_DEPARTMENT_IDS.has(token)) {
        subDepartments.add(token);
      }
    });
  });
  return Array.from(subDepartments);
};

const toDateTimeLocalValue = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const timezoneOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
  return new Date(parsed.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
};

const buildReminderDefaultDateTimeValue = (offsetHours = 24) => {
  const next = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  next.setSeconds(0, 0);
  return toDateTimeLocalValue(next);
};

const formatReminderTime = (value) => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatDelayMinutes = (value) => {
  const minutes = Math.max(0, Number.parseInt(value, 10) || 0);
  if (minutes === 0) return "Immediately";
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(" ");
};

const getReminderTemplate = (templateKey = "custom") =>
  REMINDER_TEMPLATE_OPTIONS.find((item) => item.key === templateKey) ||
  REMINDER_TEMPLATE_OPTIONS[0];

const normalizeReminderStatus = (value) => {
  const status = String(value || "").trim().toLowerCase();
  if (status === "completed") return "completed";
  if (status === "cancelled") return "cancelled";
  return "scheduled";
};

const isReminderScheduled = (reminder) =>
  normalizeReminderStatus(reminder?.status) === "scheduled" &&
  reminder?.isActive !== false;

const parseReminderTime = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getTime();
};

const isReminderEditable = (reminder) => {
  if (!isReminderScheduled(reminder)) return false;

  const nextTriggerTime = parseReminderTime(reminder?.nextTriggerAt);
  if (nextTriggerTime !== null) return nextTriggerTime > Date.now();

  if (reminder?.triggerMode === "stage_based") return true;

  const remindAtTime = parseReminderTime(reminder?.remindAt);
  return remindAtTime !== null ? remindAtTime > Date.now() : false;
};

const canActReminder = (reminder, userId, role) => {
  if (!userId || !reminder) return false;
  if (role === "admin") return true;
  if (toEntityId(reminder?.createdBy) === userId) return true;

  return (Array.isArray(reminder?.recipients) ? reminder.recipients : []).some(
    (entry) => toEntityId(entry?.user) === userId,
  );
};

const canManageReminder = (reminder, userId, role) => {
  if (!userId || !reminder) return false;
  if (role === "admin") return true;
  return toEntityId(reminder?.createdBy) === userId;
};

const getReminderStatusLabel = (status) => {
  const normalized = normalizeReminderStatus(status);
  if (normalized === "completed") return "Completed";
  if (normalized === "cancelled") return "Cancelled";
  return "Scheduled";
};

const ProjectRemindersCard = ({ project, user }) => {
  const projectId = toEntityId(project?._id);
  const userId = toEntityId(user?._id || user?.id);
  const userRole = String(user?.role || "").trim().toLowerCase();

  const buildInitialForm = useCallback((templateKey = "custom") => {
    const template = getReminderTemplate(templateKey);
    const isCustom = templateKey === "custom";
    return {
      templateKey,
      title: isCustom ? "" : template.title,
      message: isCustom ? "" : template.message,
      triggerMode: isCustom ? "absolute_time" : template.triggerMode || "stage_based",
      watchStatus: isCustom ? "" : template.watchStatus || "",
      delayMinutes: isCustom ? 0 : template.delayMinutes || 0,
      remindAt: buildReminderDefaultDateTimeValue(template.offsetHours || 24),
      repeat: "none",
      inApp: true,
      email: false,
      recipientGroups: [],
      recipientSubDepartments: [],
      includeSelf: true,
    };
  }, []);

  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [editingReminderId, setEditingReminderId] = useState("");
  const [showDeleteReminderModal, setShowDeleteReminderModal] = useState(false);
  const [deleteReminderTarget, setDeleteReminderTarget] = useState(null);
  const [form, setForm] = useState(() => buildInitialForm("custom"));
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [recipientTouched, setRecipientTouched] = useState(false);

  const statusOptions = useMemo(
    () =>
      project?.projectType === "Quote"
        ? QUOTE_STATUS_OPTIONS
        : STANDARD_STATUS_OPTIONS,
    [project?.projectType],
  );
  const engagedGroupIds = useMemo(() => {
    const canonical = getCanonicalDepartmentSet(project?.departments);
    const engaged = new Set();
    ENGAGED_DEPARTMENT_GROUPS.forEach((group) => {
      if (canonical.has(group.id)) engaged.add(group.id);
    });
    return engaged;
  }, [project?.departments]);
  const engagedGroupLabelMap = useMemo(
    () => new Map(ENGAGED_DEPARTMENT_GROUPS.map((group) => [group.id, group.label])),
    [],
  );
  const engagedProductionSubDepartmentOptions = useMemo(() => {
    const projectTokens = new Set(getUserDepartmentTokens(project?.departments));
    return PRODUCTION_SUB_DEPARTMENT_OPTIONS.filter((option) =>
      projectTokens.has(option.id),
    );
  }, [project?.departments]);
  const engagedSubDepartmentIds = useMemo(
    () => engagedProductionSubDepartmentOptions.map((option) => option.id),
    [engagedProductionSubDepartmentOptions],
  );
  const productionSubDeptLabelMap = useMemo(
    () =>
      new Map(
        PRODUCTION_SUB_DEPARTMENT_OPTIONS.map((option) => [option.id, option.label]),
      ),
    [],
  );
  const recipientCounts = useMemo(() => {
    const counts = new Map();
    ENGAGED_DEPARTMENT_GROUPS.forEach((group) => counts.set(group.id, 0));
    (Array.isArray(directoryUsers) ? directoryUsers : []).forEach((entry) => {
      const userGroups = getCanonicalDepartmentSet(entry?.department);
      ENGAGED_DEPARTMENT_GROUPS.forEach((group) => {
        if (!userGroups.has(group.id)) return;
        counts.set(group.id, (counts.get(group.id) || 0) + 1);
      });
    });
    return counts;
  }, [directoryUsers]);
  const recipientSubDepartmentCounts = useMemo(() => {
    const counts = new Map();
    PRODUCTION_SUB_DEPARTMENT_OPTIONS.forEach((option) => counts.set(option.id, 0));
    (Array.isArray(directoryUsers) ? directoryUsers : []).forEach((entry) => {
      const tokens = getUserDepartmentTokens(entry?.department);
      tokens.forEach((token) => {
        if (!counts.has(token)) return;
        counts.set(token, (counts.get(token) || 0) + 1);
      });
    });
    return counts;
  }, [directoryUsers]);
  const allSubDepartmentsSelected = useMemo(() => {
    if (engagedSubDepartmentIds.length === 0) return false;
    const selected = new Set(form.recipientSubDepartments || []);
    return engagedSubDepartmentIds.every((id) => selected.has(id));
  }, [engagedSubDepartmentIds, form.recipientSubDepartments]);

  const fetchReminders = useCallback(async () => {
    if (!projectId) {
      setReminders([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        projectId,
        includeCompleted: "true",
      });
      const res = await fetch(`/api/reminders?${query.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load reminders.");
      }
      const data = await res.json();
      setReminders(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error("Failed to fetch reminders:", fetchError);
      setError(fetchError.message || "Failed to load reminders.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchDirectoryUsers = useCallback(async () => {
    if (userRole !== "admin") return;
    if (directoryLoading) return;
    setDirectoryLoading(true);
    setDirectoryError("");
    try {
      const res = await fetch("/api/auth/users", { credentials: "include" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to load recipients.");
      }
      const data = await res.json();
      setDirectoryUsers(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error("Failed to fetch recipients:", fetchError);
      setDirectoryError(fetchError.message || "Failed to load recipients.");
    } finally {
      setDirectoryLoading(false);
    }
  }, [directoryLoading, userRole]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  useEffect(() => {
    if (!showModal || userRole !== "admin") return;
    if (directoryUsers.length > 0 || directoryLoading) return;
    fetchDirectoryUsers();
  }, [
    showModal,
    userRole,
    directoryUsers.length,
    directoryLoading,
    fetchDirectoryUsers,
  ]);

  const scheduledReminders = useMemo(
    () => reminders.filter((item) => isReminderScheduled(item)),
    [reminders],
  );

  const historyReminders = useMemo(
    () =>
      reminders
        .filter((item) => !isReminderScheduled(item))
        .sort(
          (a, b) =>
            new Date(b?.createdAt || 0).getTime() -
            new Date(a?.createdAt || 0).getTime(),
        ),
    [reminders],
  );

  const applyReminder = (updatedReminder) => {
    if (!updatedReminder?._id) return;
    setReminders((prev) => {
      const existingIndex = prev.findIndex((item) => item._id === updatedReminder._id);
      if (existingIndex === -1) return [updatedReminder, ...prev];
      const next = [...prev];
      next[existingIndex] = updatedReminder;
      return next;
    });
  };

  const removeReminder = (reminderId) => {
    if (!reminderId) return;
    setReminders((prev) => prev.filter((item) => item._id !== reminderId));
  };

  const resolveRecipientIds = useCallback(
    (groups = [], subDepartments = [], includeSelf = true) => {
      const selectedGroups = Array.isArray(groups)
        ? groups.map((entry) => String(entry || "").trim())
        : [];
      const selectedSubDepartments = Array.isArray(subDepartments)
        ? subDepartments.map((entry) => String(entry || "").trim())
        : [];
      const uniqueRecipients = new Set();

      if (selectedGroups.length > 0 || selectedSubDepartments.length > 0) {
        directoryUsers.forEach((userEntry) => {
          if (!userEntry?._id) return;
          if (!hasDepartmentOverlap(userEntry?.department, project?.departments)) {
            return;
          }
          const userGroups = getCanonicalDepartmentSet(userEntry?.department);
          const userTokens = getUserDepartmentTokens(userEntry?.department);
          const matchesGroup = selectedGroups.some((group) => userGroups.has(group));
          const matchesSubDepartment = selectedSubDepartments.some((dept) =>
            userTokens.includes(dept),
          );
          if (!matchesGroup && !matchesSubDepartment) return;
          uniqueRecipients.add(String(userEntry._id));
        });
      }

      if (includeSelf && userId) {
        uniqueRecipients.add(String(userId));
      }

      return Array.from(uniqueRecipients);
    },
    [directoryUsers, project?.departments, userId],
  );

  const handleTemplateChange = (templateKey) => {
    const template = getReminderTemplate(templateKey);
    const isCustom = templateKey === "custom";
    const suggestedGroups = TEMPLATE_RECIPIENT_GROUPS[templateKey] || [];
    const nextRecipientGroups =
      form.recipientGroups && form.recipientGroups.length > 0
        ? form.recipientGroups
        : suggestedGroups.filter(
            (group) => engagedGroupIds.size === 0 || engagedGroupIds.has(group),
          );

    if ((form.recipientGroups || []).length === 0 && nextRecipientGroups.length > 0) {
      setRecipientTouched(true);
    }

    setForm((prev) => ({
      ...prev,
      templateKey,
      title: isCustom ? prev.title : template.title,
      message: isCustom ? prev.message : template.message,
      triggerMode: isCustom
        ? prev.triggerMode || "absolute_time"
        : template.triggerMode || "stage_based",
      watchStatus: isCustom ? prev.watchStatus : template.watchStatus || "",
      delayMinutes: isCustom ? prev.delayMinutes : template.delayMinutes || 0,
      remindAt: buildReminderDefaultDateTimeValue(template.offsetHours || 24),
      recipientGroups: nextRecipientGroups,
    }));
  };

  const handleTriggerModeChange = (value) => {
    const mode = value === "stage_based" ? "stage_based" : "absolute_time";
    setForm((prev) => ({
      ...prev,
      triggerMode: mode,
      remindAt:
        mode === "absolute_time"
          ? prev.remindAt || buildReminderDefaultDateTimeValue(24)
          : prev.remindAt,
      watchStatus: mode === "stage_based" ? prev.watchStatus || project?.status || "" : "",
      delayMinutes: mode === "stage_based" ? prev.delayMinutes || 0 : 0,
    }));
  };

  const openModal = () => {
    setError("");
    setDirectoryError("");
    setEditingReminderId("");
    setForm(buildInitialForm("custom"));
    setRecipientTouched(false);
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setError("");
    setDirectoryError("");
    setEditingReminderId("");
    setRecipientTouched(false);
  };

  const openEditModal = (reminder) => {
    if (!reminder?._id || !isReminderEditable(reminder)) return;
    const reminderTemplate = getReminderTemplate(reminder.templateKey || "custom");
    const triggerMode =
      reminder.triggerMode === "stage_based" ? "stage_based" : "absolute_time";
    const remindAtValue = reminder.nextTriggerAt || reminder.remindAt;
    const rawRecipientGroups = getRecipientGroupsFromRecipients(reminder?.recipients);
    const recipientGroups = rawRecipientGroups.filter(
      (group) => engagedGroupIds.size === 0 || engagedGroupIds.has(group),
    );
    const rawRecipientSubDepartments = getRecipientSubDepartmentsFromRecipients(
      reminder?.recipients,
    );
    const recipientSubDepartments = rawRecipientSubDepartments.filter(
      (dept) =>
        engagedProductionSubDepartmentOptions.length === 0 ||
        engagedProductionSubDepartmentOptions.some((option) => option.id === dept),
    );
    const includeSelf = (Array.isArray(reminder?.recipients) ? reminder.recipients : [])
      .map((entry) => toEntityId(entry?.user?._id || entry?.user))
      .some((id) => id && id === userId);

    setError("");
    setEditingReminderId(reminder._id);
    setForm({
      templateKey: reminderTemplate.key || "custom",
      title: String(reminder.title || ""),
      message: String(reminder.message || ""),
      triggerMode,
      watchStatus:
        triggerMode === "stage_based"
          ? String(reminder.watchStatus || reminder.conditionStatus || "")
          : "",
      delayMinutes:
        triggerMode === "stage_based"
          ? Math.max(0, Number.parseInt(reminder.delayMinutes, 10) || 0)
          : 0,
      remindAt:
        triggerMode === "absolute_time"
          ? toDateTimeLocalValue(remindAtValue) || buildReminderDefaultDateTimeValue(24)
          : buildReminderDefaultDateTimeValue(reminderTemplate.offsetHours || 24),
      repeat: String(reminder.repeat || "none"),
      inApp: Boolean(reminder.channels?.inApp),
      email: Boolean(reminder.channels?.email),
      recipientGroups,
      recipientSubDepartments,
      includeSelf,
    });
    setRecipientTouched(false);
    setShowModal(true);
  };

  const submitReminder = async (event) => {
    event.preventDefault();
    setError("");

    const trimmedTitle = String(form.title || "").trim();
    if (!trimmedTitle) {
      setError("Reminder title is required.");
      return;
    }

    if (!form.inApp && !form.email) {
      setError("Select at least one delivery channel.");
      return;
    }

    const normalizedTriggerMode =
      form.triggerMode === "stage_based" ? "stage_based" : "absolute_time";

    let remindAtIso = null;
    if (normalizedTriggerMode === "absolute_time") {
      const parsedRemindAt = new Date(form.remindAt);
      if (Number.isNaN(parsedRemindAt.getTime())) {
        setError("Select a valid reminder time.");
        return;
      }
      remindAtIso = parsedRemindAt.toISOString();
    } else if (!String(form.watchStatus || "").trim()) {
      setError("Select the project stage to watch.");
      return;
    }

    const selectedRecipientGroups = Array.isArray(form.recipientGroups)
      ? form.recipientGroups.filter(
          (group) => group && (engagedGroupIds.size === 0 || engagedGroupIds.has(group)),
        )
      : [];
    const selectedRecipientSubDepartments = Array.isArray(form.recipientSubDepartments)
      ? form.recipientSubDepartments.filter((dept) =>
          engagedProductionSubDepartmentOptions.length > 0
            ? engagedProductionSubDepartmentOptions.some(
                (option) => option.id === dept,
              )
            : false,
        )
      : [];
    const includeSelf = Boolean(form.includeSelf);
    let recipientIds = [];
    const shouldUpdateRecipients = !editingReminderId || recipientTouched;

    if (userRole === "admin" && shouldUpdateRecipients) {
      if (
        (selectedRecipientGroups.length > 0 ||
          selectedRecipientSubDepartments.length > 0) &&
        directoryLoading
      ) {
        setError("Recipients are still loading. Please try again.");
        return;
      }
      if (
        (selectedRecipientGroups.length > 0 ||
          selectedRecipientSubDepartments.length > 0) &&
        directoryUsers.length === 0
      ) {
        setError(directoryError || "Recipient list is unavailable. Please try again.");
        return;
      }

      const departmentRecipients =
        selectedRecipientGroups.length > 0 || selectedRecipientSubDepartments.length > 0
          ? resolveRecipientIds(
              selectedRecipientGroups,
              selectedRecipientSubDepartments,
              false,
            )
          : [];

      if (
        (selectedRecipientGroups.length > 0 ||
          selectedRecipientSubDepartments.length > 0) &&
        departmentRecipients.length === 0
      ) {
        setError("No users found in the selected departments.");
        return;
      }

      if (includeSelf && userId) {
        recipientIds = Array.from(new Set([...departmentRecipients, userId]));
      } else {
        recipientIds = departmentRecipients;
      }

      if (recipientIds.length === 0) {
        setError("Select at least one recipient department or include yourself.");
        return;
      }
    }

    setSaving(true);

    try {
      const payload = {
        title: trimmedTitle,
        message: String(form.message || "").trim(),
        triggerMode: normalizedTriggerMode,
        remindAt: remindAtIso,
        repeat: form.repeat,
        watchStatus:
          normalizedTriggerMode === "stage_based" ? String(form.watchStatus || "").trim() : "",
        delayMinutes:
          normalizedTriggerMode === "stage_based"
            ? Math.max(0, Number.parseInt(form.delayMinutes, 10) || 0)
            : 0,
        templateKey: form.templateKey,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        channels: {
          inApp: Boolean(form.inApp),
          email: Boolean(form.email),
        },
      };

      if (userRole === "admin" && shouldUpdateRecipients && recipientIds.length > 0) {
        payload.recipientIds = recipientIds;
      }

      if (!editingReminderId) {
        payload.projectId = projectId;
      }

      const res = await fetch(
        editingReminderId ? `/api/reminders/${editingReminderId}` : "/api/reminders",
        {
          method: editingReminderId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            (editingReminderId
              ? "Failed to update reminder."
              : "Failed to create reminder."),
        );
      }

      const savedReminder = await res.json();
      applyReminder(savedReminder);
      setShowModal(false);
      setEditingReminderId("");
      setForm(buildInitialForm("custom"));
    } catch (submitError) {
      console.error(
        editingReminderId ? "Failed to update reminder:" : "Failed to create reminder:",
        submitError,
      );
      setError(
        submitError.message ||
          (editingReminderId
            ? "Failed to update reminder."
            : "Failed to create reminder."),
      );
    } finally {
      setSaving(false);
    }
  };

  const runReminderAction = async (reminderId, endpoint, body = {}) => {
    if (!reminderId) return;
    setActionId(reminderId);
    setError("");

    try {
      const res = await fetch(`/api/reminders/${reminderId}${endpoint}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update reminder.");
      }

      const updatedReminder = await res.json();
      applyReminder(updatedReminder);
    } catch (actionError) {
      console.error("Failed to update reminder:", actionError);
      setError(actionError.message || "Failed to update reminder.");
    } finally {
      setActionId("");
    }
  };

  const requestDeleteHistoryReminder = (reminder) => {
    if (!reminder?._id) return;
    setDeleteReminderTarget(reminder);
    setShowDeleteReminderModal(true);
  };

  const closeDeleteReminderModal = () => {
    if (actionId && actionId === deleteReminderTarget?._id) {
      return;
    }
    setShowDeleteReminderModal(false);
    setDeleteReminderTarget(null);
  };

  const deleteHistoryReminder = async () => {
    const reminderId = deleteReminderTarget?._id;
    if (!reminderId) return;

    setActionId(reminderId);
    setError("");

    try {
      const res = await fetch(`/api/reminders/${reminderId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete reminder.");
      }

      removeReminder(reminderId);
      setShowDeleteReminderModal(false);
      setDeleteReminderTarget(null);
      if (editingReminderId === reminderId) {
        setShowModal(false);
        setEditingReminderId("");
      }
    } catch (deleteError) {
      console.error("Failed to delete reminder:", deleteError);
      setError(deleteError.message || "Failed to delete reminder.");
    } finally {
      setActionId("");
    }
  };

  const renderReminder = (item) => {
    const canAct = canActReminder(item, userId, userRole);
    const canManage = canManageReminder(item, userId, userRole);
    const isScheduled = isReminderScheduled(item);
    const isActionLoading = actionId === item._id;
    const isStageBased = item.triggerMode === "stage_based";
    const hasConcreteTrigger = Boolean(item.nextTriggerAt || item.remindAt);
    const canEditReminder = canManage && isReminderEditable(item);
    const recipientGroups = getRecipientGroupsFromRecipients(item?.recipients)
      .filter((group) => engagedGroupLabelMap.has(group))
      .map((group) => engagedGroupLabelMap.get(group));
    const recipientSubDepartments = getRecipientSubDepartmentsFromRecipients(
      item?.recipients,
    )
      .filter((dept) => productionSubDeptLabelMap.has(dept))
      .map((dept) => productionSubDeptLabelMap.get(dept));
    const recipientCount = Array.isArray(item?.recipients) ? item.recipients.length : 0;

    return (
      <div key={item._id} className="admin-reminder-item">
        <div className="admin-reminder-item-head">
          <p className="admin-reminder-item-title">{item.title || "Reminder"}</p>
          <span
            className={`admin-reminder-status ${normalizeReminderStatus(item.status)}`}
          >
            {getReminderStatusLabel(item.status)}
          </span>
        </div>

        {item.message ? <p className="admin-reminder-message">{item.message}</p> : null}

        <div className="admin-reminder-meta">
          <span>{isStageBased ? "Type: Stage-based" : "Type: Date/Time"}</span>
          {isStageBased ? (
            <span>
              {hasConcreteTrigger
                ? `Next: ${formatReminderTime(item.nextTriggerAt || item.remindAt)}`
                : `Awaiting stage: ${item.watchStatus || "N/A"}`}
            </span>
          ) : (
            <span>Next: {formatReminderTime(item.nextTriggerAt || item.remindAt)}</span>
          )}
          {isStageBased ? <span>Delay: {formatDelayMinutes(item.delayMinutes)}</span> : null}
          {isStageBased && item.stageMatchedAt ? (
            <span>Stage reached: {formatReminderTime(item.stageMatchedAt)}</span>
          ) : null}
          {item.repeat && item.repeat !== "none" ? <span>Repeats: {item.repeat}</span> : null}
          {!isStageBased && item.conditionStatus ? (
            <span>Condition: {item.conditionStatus}</span>
          ) : null}
          {recipientGroups.length > 0 ? (
            <span>
              Recipients: {recipientGroups.join(", ")}
              {recipientCount ? ` (${recipientCount})` : ""}
            </span>
          ) : recipientCount > 0 ? (
            <span>Recipients: {recipientCount} users</span>
          ) : null}
          {recipientSubDepartments.length > 0 ? (
            <span>Prod sub-depts: {recipientSubDepartments.join(", ")}</span>
          ) : null}
        </div>

        {isScheduled && canAct ? (
          <div className="admin-reminder-actions">
            {canEditReminder ? (
              <button
                type="button"
                className="admin-reminder-btn icon primary"
                onClick={() => openEditModal(item)}
                disabled={isActionLoading || saving}
                aria-label="Edit reminder"
                title="Edit reminder"
              >
                <PencilIcon />
              </button>
            ) : null}
            <button
              type="button"
              className="admin-reminder-btn"
              onClick={() => runReminderAction(item._id, "/snooze", { minutes: 60 })}
              disabled={isActionLoading || !hasConcreteTrigger}
            >
              {isActionLoading ? "Saving..." : "Snooze 1h"}
            </button>
            <button
              type="button"
              className="admin-reminder-btn success"
              onClick={() => runReminderAction(item._id, "/complete")}
              disabled={isActionLoading}
            >
              {isActionLoading ? "Saving..." : "Complete"}
            </button>
            {canManage ? (
              <button
                type="button"
                className="admin-reminder-btn danger"
                onClick={() => runReminderAction(item._id, "/cancel")}
                disabled={isActionLoading}
              >
                {isActionLoading ? "Saving..." : "Cancel"}
              </button>
            ) : null}
          </div>
        ) : !isScheduled && canManage ? (
          <div className="admin-reminder-actions">
            <button
              type="button"
              className="admin-reminder-btn icon danger"
              onClick={() => requestDeleteHistoryReminder(item)}
              disabled={isActionLoading}
              aria-label="Delete reminder"
              title="Delete reminder"
            >
              <TrashIcon width="16" height="16" />
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="detail-card admin-reminder-card">
      <h3 className="card-title admin-reminder-card-title">
        <span>Reminders</span>
        <div className="admin-reminder-head-actions">
          <button
            type="button"
            className="admin-reminder-btn"
            onClick={fetchReminders}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="admin-reminder-btn primary"
            onClick={openModal}
          >
            Set Reminder
          </button>
        </div>
      </h3>

      {error ? (
        <p className="admin-reminder-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="admin-reminder-empty">Loading reminders...</p>
      ) : scheduledReminders.length > 0 ? (
        <div className="admin-reminder-list">
          {scheduledReminders.map((item) => renderReminder(item))}
        </div>
      ) : (
        <p className="admin-reminder-empty">No active reminders for this project.</p>
      )}

      {historyReminders.length > 0 ? (
        <details className="admin-reminder-history">
          <summary>History ({historyReminders.length})</summary>
          <div className="admin-reminder-list">
            {historyReminders.slice(0, 8).map((item) => renderReminder(item))}
          </div>
        </details>
      ) : null}

      {showModal ? (
        <div className="admin-reminder-modal-overlay" role="presentation">
          <div
            className="admin-reminder-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingReminderId ? "Edit reminder" : "Set reminder"}
          >
            <h3 className="admin-reminder-modal-title">
              {editingReminderId ? "Edit Reminder" : "Set Reminder"}
            </h3>
            <form onSubmit={submitReminder}>
              <div className="admin-reminder-field">
                <label htmlFor="admin-reminder-template">Template</label>
                <select
                  id="admin-reminder-template"
                  className="admin-reminder-input"
                  value={form.templateKey}
                  onChange={(event) => handleTemplateChange(event.target.value)}
                >
                  {REMINDER_TEMPLATE_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="admin-reminder-field">
                <label htmlFor="admin-reminder-trigger-mode">Trigger mode</label>
                <select
                  id="admin-reminder-trigger-mode"
                  className="admin-reminder-input"
                  value={form.triggerMode}
                  onChange={(event) => handleTriggerModeChange(event.target.value)}
                >
                  <option value="absolute_time">Specific date/time</option>
                  <option value="stage_based">When project reaches a stage</option>
                </select>
              </div>

              <div className="admin-reminder-field">
                <label htmlFor="admin-reminder-title">Title</label>
                <input
                  id="admin-reminder-title"
                  className="admin-reminder-input"
                  type="text"
                  maxLength={140}
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, title: event.target.value }))
                  }
                />
              </div>

              <div className="admin-reminder-field">
                <label htmlFor="admin-reminder-message">Message</label>
                <textarea
                  id="admin-reminder-message"
                  className="admin-reminder-input"
                  rows="3"
                  maxLength={800}
                  value={form.message}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, message: event.target.value }))
                  }
                />
              </div>

              {form.triggerMode === "absolute_time" ? (
                <div className="admin-reminder-row">
                  <div className="admin-reminder-field">
                    <label htmlFor="admin-reminder-time">Remind at</label>
                    <input
                      id="admin-reminder-time"
                      className="admin-reminder-input"
                      type="datetime-local"
                      required
                      value={form.remindAt}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, remindAt: event.target.value }))
                      }
                    />
                  </div>
                  <div className="admin-reminder-field">
                    <label htmlFor="admin-reminder-repeat">Repeat</label>
                    <select
                      id="admin-reminder-repeat"
                      className="admin-reminder-input"
                      value={form.repeat}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, repeat: event.target.value }))
                      }
                    >
                      {REMINDER_REPEAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <div className="admin-reminder-row">
                    <div className="admin-reminder-field">
                      <label htmlFor="admin-reminder-watch-status">Watch status</label>
                      <select
                        id="admin-reminder-watch-status"
                        className="admin-reminder-input"
                        value={form.watchStatus}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, watchStatus: event.target.value }))
                        }
                      >
                        <option value="">Select status</option>
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="admin-reminder-field">
                      <label htmlFor="admin-reminder-delay">Delay after stage (minutes)</label>
                      <input
                        id="admin-reminder-delay"
                        className="admin-reminder-input"
                        type="number"
                        min="0"
                        max={String(60 * 24 * 90)}
                        value={form.delayMinutes}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, delayMinutes: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="admin-reminder-field">
                    <label htmlFor="admin-reminder-repeat-stage">Repeat</label>
                    <select
                      id="admin-reminder-repeat-stage"
                      className="admin-reminder-input"
                      value={form.repeat}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, repeat: event.target.value }))
                      }
                    >
                      {REMINDER_REPEAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {userRole === "admin" ? (
                <div className="admin-reminder-field">
                  <label>Recipients (Engaged Departments)</label>
                  <div className="admin-reminder-recipient-grid">
                    {ENGAGED_DEPARTMENT_GROUPS.map((group) => {
                      const engaged = engagedGroupIds.has(group.id);
                      const count = recipientCounts.get(group.id) || 0;
                      return (
                        <label
                          key={group.id}
                          className={`admin-reminder-recipient-option ${
                            engaged ? "" : "disabled"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={form.recipientGroups.includes(group.id)}
                            onChange={() => {
                              setRecipientTouched(true);
                              setForm((prev) => {
                                const current = prev.recipientGroups || [];
                                const next = current.includes(group.id)
                                  ? current.filter((entry) => entry !== group.id)
                                  : [...current, group.id];
                                return { ...prev, recipientGroups: next };
                              });
                            }}
                            disabled={!engaged}
                          />
                          <span className="admin-reminder-recipient-label">
                            {group.label}
                          </span>
                          <span className="admin-reminder-recipient-count">
                            {directoryLoading ? "..." : `${count} users`}
                          </span>
                          {!engaged ? (
                            <span className="admin-reminder-recipient-note">
                              Not engaged
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                  {engagedGroupIds.has("production") &&
                  engagedProductionSubDepartmentOptions.length > 0 ? (
                    <>
                      <p className="admin-reminder-recipient-subtitle">
                        Production sub-departments
                      </p>
                      <div className="admin-reminder-subdept-actions">
                        <button
                          type="button"
                          className="admin-reminder-subdept-btn"
                          onClick={() => {
                            setRecipientTouched(true);
                            setForm((prev) => {
                              const current = prev.recipientSubDepartments || [];
                              const next = allSubDepartmentsSelected
                                ? current.filter(
                                    (entry) => !engagedSubDepartmentIds.includes(entry),
                                  )
                                : Array.from(
                                    new Set([...current, ...engagedSubDepartmentIds]),
                                  );
                              return { ...prev, recipientSubDepartments: next };
                            });
                          }}
                        >
                          {allSubDepartmentsSelected
                            ? "Clear all"
                            : "Select all engaged"}
                        </button>
                      </div>
                      <div className="admin-reminder-recipient-grid">
                        {engagedProductionSubDepartmentOptions.map((option) => {
                          const count = recipientSubDepartmentCounts.get(option.id) || 0;
                          return (
                            <label
                              key={option.id}
                              className="admin-reminder-recipient-option"
                            >
                              <input
                                type="checkbox"
                                checked={form.recipientSubDepartments.includes(option.id)}
                                onChange={() => {
                                  setRecipientTouched(true);
                                  setForm((prev) => {
                                    const current = prev.recipientSubDepartments || [];
                                    const next = current.includes(option.id)
                                      ? current.filter((entry) => entry !== option.id)
                                      : [...current, option.id];
                                    return { ...prev, recipientSubDepartments: next };
                                  });
                                }}
                              />
                              <span className="admin-reminder-recipient-label">
                                {option.label}
                              </span>
                              <span className="admin-reminder-recipient-count">
                                {directoryLoading ? "..." : `${count} users`}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                  {directoryError ? (
                    <p className="admin-reminder-recipient-error" role="alert">
                      {directoryError}
                    </p>
                  ) : null}
                  <label className="admin-reminder-channel-option admin-reminder-recipient-self">
                    <input
                      type="checkbox"
                      checked={form.includeSelf}
                      onChange={(event) => {
                        setRecipientTouched(true);
                        setForm((prev) => ({
                          ...prev,
                          includeSelf: event.target.checked,
                        }));
                      }}
                    />
                    Include me
                  </label>
                  <p className="admin-reminder-recipient-help">
                    Reminders will appear for selected departments (or sub-departments)
                    when the stage is reached.
                  </p>
                </div>
              ) : null}

              <div className="admin-reminder-channel-grid">
                <label className="admin-reminder-channel-option">
                  <input
                    type="checkbox"
                    checked={form.inApp}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, inApp: event.target.checked }))
                    }
                  />
                  In-app notification
                </label>
                <label className="admin-reminder-channel-option">
                  <input
                    type="checkbox"
                    checked={form.email}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, email: event.target.checked }))
                    }
                  />
                  Email notification
                </label>
              </div>

              <div className="admin-reminder-modal-actions">
                <button
                  type="button"
                  className="admin-reminder-btn"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-reminder-btn primary"
                  disabled={
                    saving ||
                    (userRole === "admin" &&
                      directoryLoading &&
                      ((form.recipientGroups || []).length > 0 ||
                        (form.recipientSubDepartments || []).length > 0))
                  }
                >
                  {saving
                    ? "Saving..."
                    : editingReminderId
                      ? "Save Changes"
                      : "Save Reminder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmationModal
        isOpen={showDeleteReminderModal}
        onClose={closeDeleteReminderModal}
        onConfirm={deleteHistoryReminder}
        title="Delete Reminder"
        message={`Delete "${
          deleteReminderTarget?.title || "this reminder"
        }" from history? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous
      />
    </div>
  );
};

export default ProjectRemindersCard;

