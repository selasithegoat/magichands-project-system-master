import React, { useState, useEffect, useMemo } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";

import "./ProjectDetails.css";
import {
  ProjectsIcon,
  PencilIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "../../icons/Icons";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getGroupedLeadDisplayRows } from "../../utils/leadDisplay";
import ProjectHoldModal from "../../components/ProjectHoldModal/ProjectHoldModal";
import BillingGuardModal from "../../components/BillingGuardModal/BillingGuardModal";
import ProjectCancelModal from "../../components/ProjectCancelModal/ProjectCancelModal";
import ProjectReactivateModal from "../../components/ProjectReactivateModal/ProjectReactivateModal";
import ProjectTypeChangeModal from "../../components/ProjectTypeChangeModal/ProjectTypeChangeModal";
import ProjectRemindersCard from "../../components/ProjectReminders/ProjectRemindersCard";

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

const normalizeSupplySourceList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const formatSupplySource = (value) => {
  const list = normalizeSupplySourceList(value);
  if (!list.length) return "N/A";
  return list.join(", ");
};

const STATUS_AUTO_ADVANCE_TARGETS = {
  "Proof Reading Completed": "Pending Production",
  "Packaging Completed": "Pending Delivery/Pickup",
};
const QUOTE_STATUS_DECISION_DISPLAY_MAP = {
  "Pending Feedback": "Pending Decision",
  "Feedback Completed": "Decision Completed",
};
const QUOTE_STATUS_DECISION_STORAGE_MAP = {
  "Pending Decision": "Pending Feedback",
  "Decision Completed": "Feedback Completed",
};

const mapQuoteStatusForDisplay = (status, isQuoteProject = false) => {
  const normalized = String(status || "").trim();
  if (!isQuoteProject) return normalized;
  return QUOTE_STATUS_DECISION_DISPLAY_MAP[normalized] || normalized;
};

const mapQuoteStatusForStorage = (status) => {
  const normalized = String(status || "").trim();
  return QUOTE_STATUS_DECISION_STORAGE_MAP[normalized] || normalized;
};

const BILLING_REQUIREMENT_LABELS = {
  invoice: "Invoice confirmation",
  payment_verification_any: "Payment method verification",
  full_payment_or_authorized:
    "Full payment or authorization verification",
};
const SAMPLE_APPROVAL_MISSING_LABEL = "Client sample approval";
const QUOTE_REQUIREMENT_KEYS = [
  "cost",
  "mockup",
  "previousSamples",
  "sampleProduction",
  "bidSubmission",
];
const QUOTE_REQUIREMENT_LABELS = {
  cost: "Cost",
  mockup: "Mockup",
  previousSamples: "Previous Sample / Jobs Done",
  sampleProduction: "Sample Production",
  bidSubmission: "Bid Submission / Documents",
};
const QUOTE_REQUIREMENT_STATUS_OPTIONS = [
  "assigned",
  "in_progress",
  "dept_submitted",
  "frontdesk_review",
  "sent_to_client",
  "client_approved",
  "client_revision_requested",
  "blocked",
  "cancelled",
];
const getQuoteRequirementStatusOptionsByKey = (key, selectedStatus) => {
  if (key !== "bidSubmission") return QUOTE_REQUIREMENT_STATUS_OPTIONS;

  if (selectedStatus === "sent_to_client") {
    return ["sent_to_client", "assigned"];
  }

  return Array.from(new Set([selectedStatus, "sent_to_client"]));
};

const normalizeQuoteChecklist = (checklist = {}) =>
  QUOTE_REQUIREMENT_KEYS.reduce((accumulator, key) => {
    accumulator[key] = Boolean(checklist?.[key]);
    return accumulator;
  }, {});

const formatQuoteRequirementStatus = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "Assigned";
  return normalized
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
};

const getQuoteRequirementItems = (project = {}) => {
  const quoteDetails = project?.quoteDetails || {};
  const checklist = normalizeQuoteChecklist(quoteDetails?.checklist || {});
  const rawItems =
    quoteDetails?.requirementItems && typeof quoteDetails.requirementItems === "object"
      ? quoteDetails.requirementItems
      : {};

  return QUOTE_REQUIREMENT_KEYS.map((key) => {
    const rawItem =
      rawItems?.[key] && typeof rawItems[key] === "object" ? rawItems[key] : {};
    const isRequired = Boolean(checklist[key]);
    const normalizedStatus = String(rawItem?.status || "").trim().toLowerCase();
    const resolvedStatus = isRequired
      ? normalizedStatus || "assigned"
      : "not_required";

    return {
      key,
      label: QUOTE_REQUIREMENT_LABELS[key] || key,
      isRequired,
      status: resolvedStatus,
      note: String(rawItem?.note || "").trim(),
      updatedAt: rawItem?.updatedAt || null,
    };
  });
};

const normalizeQuoteDecisionStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    [
      "go_ahead",
      "go-ahead",
      "goahead",
      "proceed",
      "accepted",
      "approved",
      "yes",
    ].includes(normalized)
  ) {
    return "go_ahead";
  }
  if (
    ["declined", "rejected", "cancelled", "cancel", "no"].includes(
      normalized,
    )
  ) {
    return "declined";
  }
  return "pending";
};

const getQuoteDecisionState = (project = {}) => {
  const decision = project?.quoteDetails?.decision || {};
  return {
    status: normalizeQuoteDecisionStatus(decision?.status),
    note: String(decision?.note || "").trim(),
    validatedAt: decision?.validatedAt || null,
    convertedAt: decision?.convertedAt || null,
    convertedToType: String(decision?.convertedToType || "").trim(),
  };
};

const formatQuoteDecisionStatus = (value) => {
  const status = normalizeQuoteDecisionStatus(value);
  if (status === "go_ahead") return "Go Ahead";
  if (status === "declined") return "Declined";
  return "Pending Decision";
};

const getPaymentTypeSet = (project) =>
  new Set(
    (project?.paymentVerifications || [])
      .map((entry) => String(entry?.type || "").trim())
      .filter(Boolean),
  );

const getPendingProductionBillingMissing = (project) => {
  const missing = [];
  const paymentTypes = getPaymentTypeSet(project);

  if (!project?.invoice?.sent) missing.push("invoice");
  if (paymentTypes.size === 0) missing.push("payment_verification_any");

  return missing;
};

const getPendingDeliveryBillingMissing = (project) => {
  const missing = [];
  const paymentTypes = getPaymentTypeSet(project);

  if (!paymentTypes.has("full_payment") && !paymentTypes.has("authorized")) {
    missing.push("full_payment_or_authorized");
  }

  return missing;
};

const formatBillingMissingLabels = (missing = []) =>
  (Array.isArray(missing) ? missing : [])
    .map((key) => BILLING_REQUIREMENT_LABELS[key] || key)
    .filter(Boolean);

const getMockupApprovalStatus = (approval = {}) => {
  const explicit = String(approval?.status || "")
    .trim()
    .toLowerCase();
  if (explicit === "pending" || explicit === "approved" || explicit === "rejected") {
    return explicit;
  }
  if (approval?.isApproved) return "approved";
  if (approval?.rejectedAt || approval?.rejectedBy || approval?.rejectionReason) {
    return "rejected";
  }
  return "pending";
};

const getSampleApprovalStatus = (sampleApproval = {}) => {
  const explicit = String(sampleApproval?.status || "")
    .trim()
    .toLowerCase();
  if (explicit === "pending" || explicit === "approved") {
    return explicit;
  }
  if (sampleApproval?.approvedAt || sampleApproval?.approvedBy) {
    return "approved";
  }
  return "pending";
};

const SECOND_IN_MS = 1000;
const DAY_IN_SECONDS = 24 * 60 * 60;
const COUNTDOWN_RING_SIZE = 104;
const COUNTDOWN_RING_STROKE_WIDTH = 5;
const COUNTDOWN_RING_RADIUS = (COUNTDOWN_RING_SIZE - COUNTDOWN_RING_STROKE_WIDTH) / 2;
const COUNTDOWN_RING_CIRCUMFERENCE = 2 * Math.PI * COUNTDOWN_RING_RADIUS;
const TWO_WEEKS_IN_SECONDS = 14 * 24 * 60 * 60;

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

const parseDeliveryTimeParts = (value) => {
  if (!value) return { hours: 23, minutes: 59, seconds: 59 };
  const raw = String(value).trim();
  if (!raw) return { hours: 23, minutes: 59, seconds: 59 };

  if (raw.includes("T")) {
    const parsedIso = new Date(raw);
    if (!Number.isNaN(parsedIso.getTime())) {
      return {
        hours: parsedIso.getHours(),
        minutes: parsedIso.getMinutes(),
        seconds: parsedIso.getSeconds(),
      };
    }
  }

  const match12h = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (match12h) {
    let hours = Number.parseInt(match12h[1], 10);
    const minutes = Number.parseInt(match12h[2], 10);
    const seconds = Number.parseInt(match12h[3] || "0", 10);
    const period = match12h[4].toUpperCase();
    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return { hours, minutes, seconds };
  }

  const match24h = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match24h) {
    const hours = Number.parseInt(match24h[1], 10);
    const minutes = Number.parseInt(match24h[2], 10);
    const seconds = Number.parseInt(match24h[3] || "0", 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes, seconds };
    }
  }

  return null;
};

const buildDeliveryDeadline = (deliveryDate, deliveryTime) => {
  if (!deliveryDate) return null;
  const parsedDate = new Date(deliveryDate);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const timeParts = parseDeliveryTimeParts(deliveryTime);
  if (!timeParts) return null;

  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
    timeParts.hours,
    timeParts.minutes,
    timeParts.seconds,
    0,
  );
};

// Add missing icons locally
const DownloadIcon = ({ width = 14, height = 14, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const SystemIcon = ({ width = 16, height = 16, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <line x1="8" y1="21" x2="16" y2="21"></line>
    <line x1="12" y1="17" x2="12" y2="21"></line>
  </svg>
);

const FolderIcon = ({ width = 24, height = 24, color = "currentColor" }) => (
  <svg
    width={width}
    height={height}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

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

const ProjectDetails = ({ user }) => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orderGroupProjects, setOrderGroupProjects] = useState([]);
  const [updates, setUpdates] = useState([]); // New state for updates
  const [undoingDept, setUndoingDept] = useState(null);
  const [isTogglingHold, setIsTogglingHold] = useState(false);
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [holdReasonDraft, setHoldReasonDraft] = useState("");
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReasonDraft, setCancelReasonDraft] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);
  const [isReactivateModalOpen, setIsReactivateModalOpen] = useState(false);
  const [reactivateError, setReactivateError] = useState("");
  const [billingGuardModal, setBillingGuardModal] = useState({
    open: false,
    title: "Billing Caution",
    message: "",
    missingLabels: [],
    nextStatus: "",
    canOverride: false,
    overrideButtonText: "Continue with Override",
  });
  const [billingGuardSubmitting, setBillingGuardSubmitting] = useState(false);
  const [dismissedGuardKey, setDismissedGuardKey] = useState("");
  const [countdownNowMs, setCountdownNowMs] = useState(Date.now());
  const [isTogglingSampleRequirement, setIsTogglingSampleRequirement] =
    useState(false);
  const [isTogglingCorporateEmergency, setIsTogglingCorporateEmergency] =
    useState(false);
  const [isProjectTypeModalOpen, setIsProjectTypeModalOpen] = useState(false);
  const [isChangingProjectType, setIsChangingProjectType] = useState(false);
  const [projectTypeChangeError, setProjectTypeChangeError] = useState("");
  const [activeContentTab, setActiveContentTab] = useState("overview");
  const [quoteRequirementSubmittingKey, setQuoteRequirementSubmittingKey] =
    useState("");
  const [quoteDecisionSubmitting, setQuoteDecisionSubmitting] = useState(false);
  const [quoteDecisionNoteDraft, setQuoteDecisionNoteDraft] = useState("");

  const currentUserId = toEntityId(user?._id || user?.id);
  const projectLeadUserId = toEntityId(project?.projectLeadId);
  const isLeadUser = Boolean(
    currentUserId && projectLeadUserId && currentUserId === projectLeadUserId,
  );
  const groupedLeadRows = useMemo(
    () =>
      getGroupedLeadDisplayRows(
        orderGroupProjects.length > 0
          ? orderGroupProjects
          : project
            ? [project]
            : [],
        {
          currentProject: project,
          prioritizeViewer: false,
          prioritizeCurrentLead: false,
        },
      ),
    [orderGroupProjects, project],
  );

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCountdownNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const ensureProjectIsEditable = () => {
    const isAdminLeadOnProject = Boolean(user?.role === "admin" && isLeadUser);
    if (isAdminLeadOnProject) {
      alert(
        "You cannot modify a project where you are the assigned Project Lead. Ask another admin to make this change.",
      );
      return false;
    }

    const currentlyCancelled = Boolean(project?.cancellation?.isCancelled);
    if (currentlyCancelled) {
      alert(
        "This project is cancelled and frozen. Reactivate it before making changes.",
      );
      return false;
    }

    const currentlyOnHold =
      project?.hold?.isOnHold || project?.status === "On Hold";
    if (currentlyOnHold) {
      alert("This project is on hold. Release hold before making changes.");
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (project?.projectType !== "Quote") {
      setQuoteDecisionNoteDraft("");
      return;
    }

    setQuoteDecisionNoteDraft(getQuoteDecisionState(project).note);
  }, [
    project,
    project?._id,
    project?.projectType,
    project?.quoteDetails?.decision?.note,
  ]);

  const closeBillingGuardModal = () => {
    if (billingGuardSubmitting) return;
    const missingKey = (billingGuardModal.missingLabels || []).join("|");
    if (project?._id) {
      setDismissedGuardKey(`${project._id}|${project.status}|${missingKey}`);
    }
    setBillingGuardModal({
      open: false,
      title: "Billing Caution",
      message: "",
      missingLabels: [],
      nextStatus: "",
      canOverride: false,
      overrideButtonText: "Continue with Override",
    });
  };

  const openBillingGuardModal = (guard, nextStatus, options = {}) => {
    const missingLabels = Array.isArray(options.missingLabels)
      ? options.missingLabels
      : formatBillingMissingLabels(guard?.missing || []);
    const allowOverride =
      options.canOverride !== undefined
        ? Boolean(options.canOverride)
        : Boolean(user?.role === "admin");

    setBillingGuardModal({
      open: true,
      title: options.title || "Billing Caution",
      message:
        guard?.message ||
        options.fallbackMessage ||
        "Billing prerequisites are required for this step.",
      missingLabels,
      nextStatus: nextStatus || "",
      canOverride: allowOverride,
      overrideButtonText:
        options.overrideButtonText || "Continue with Override",
    });
  };

  const submitStatusChange = async (
    newStatus,
    { allowBillingOverride = false } = {},
  ) => {
    if (!project) return false;
    const normalizedStatusForApi =
      project.projectType === "Quote"
        ? mapQuoteStatusForStorage(newStatus)
        : newStatus;
    const oldStatus = project.status;

    // Optimistic update
    setProject({ ...project, status: normalizedStatusForApi });

    try {
      const res = await fetch(`/api/projects/${id}/status?source=admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: normalizedStatusForApi,
          allowBillingOverride: allowBillingOverride && user?.role === "admin",
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setProject({ ...project, status: oldStatus });

        if (errorData?.code === "BILLING_PREREQUISITE_MISSING") {
          openBillingGuardModal(errorData, newStatus);
          return false;
        }

        if (
          errorData?.code === "MOCKUP_CLIENT_APPROVAL_REQUIRED" ||
          errorData?.code === "MOCKUP_FILE_REQUIRED" ||
          errorData?.code === "MOCKUP_CLIENT_REJECTED"
        ) {
          const latestVersionNumber = Number.parseInt(
            errorData?.latestVersion?.version,
            10,
          );
          const hasVersion =
            Number.isFinite(latestVersionNumber) && latestVersionNumber > 0;

          openBillingGuardModal(
            {
              message:
                errorData?.message ||
                "Mockup requirements must be satisfied before this stage can be completed.",
            },
            "",
            {
              title: "Mockup Caution",
              canOverride: false,
              missingLabels:
                errorData?.code === "MOCKUP_CLIENT_APPROVAL_REQUIRED"
                  ? [
                      hasVersion
                        ? `Client approval for mockup v${latestVersionNumber}`
                        : "Client approval for latest mockup",
                    ]
                  : errorData?.code === "MOCKUP_CLIENT_REJECTED"
                    ? [
                        hasVersion
                          ? `Client rejected mockup v${latestVersionNumber}`
                          : "Latest mockup was rejected",
                      ]
                  : ["Uploaded mockup file"],
              fallbackMessage:
                "Mockup requirements must be satisfied before this stage can be completed.",
            },
          );
          return false;
        }

        if (errorData?.code === "PRODUCTION_SAMPLE_CLIENT_APPROVAL_REQUIRED") {
          openBillingGuardModal(
            {
              message:
                errorData?.message ||
                "Client sample approval is required before Production can be completed.",
            },
            "",
            {
              title: "Sample Caution",
              canOverride: false,
              missingLabels: [SAMPLE_APPROVAL_MISSING_LABEL],
              fallbackMessage:
                "Client sample approval is required before Production can be completed.",
            },
          );
          return false;
        }

        throw new Error(errorData.message || "Failed to update status");
      }

      await fetchProject();
      return true;
    } catch (err) {
      console.error("Error updating status:", err);
      // Revert on error
      setProject({ ...project, status: oldStatus });
      alert(err.message || "Failed to update status");
      return false;
    }
  };

  // Status handling
  const handleStatusChange = async (newStatus) => {
    if (!project) return;
    if (!ensureProjectIsEditable()) return;

    await submitStatusChange(newStatus);
  };

  const handleBillingGuardOverride = async () => {
    if (!billingGuardModal.nextStatus || user?.role !== "admin") return;
    setBillingGuardSubmitting(true);
    const changed = await submitStatusChange(billingGuardModal.nextStatus, {
      allowBillingOverride: true,
    });
    setBillingGuardSubmitting(false);
    if (changed) {
      closeBillingGuardModal();
    }
  };

  const handleToggleSampleRequirement = async (nextRequired) => {
    if (!project || user?.role !== "admin" || isLeadUser) return;
    if (isTogglingSampleRequirement) return;
    if (!ensureProjectIsEditable()) return;

    setIsTogglingSampleRequirement(true);
    try {
      const res = await fetch(
        `/api/projects/${id}/sample-requirement?source=admin`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ isRequired: Boolean(nextRequired) }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update sample requirement.");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
    } catch (error) {
      console.error("Error toggling sample requirement:", error);
      openBillingGuardModal(
        {
          message: error.message || "Failed to update sample requirement.",
        },
        "",
        {
          title: "Sample Caution",
          canOverride: false,
          missingLabels: [],
          fallbackMessage: "Failed to update sample requirement.",
        },
      );
    } finally {
      setIsTogglingSampleRequirement(false);
    }
  };

  const handleToggleCorporateEmergency = async (nextEnabled) => {
    if (!project || user?.role !== "admin" || isLeadUser) return;
    if (isTogglingCorporateEmergency) return;
    if (!ensureProjectIsEditable()) return;
    if (project.projectType !== "Corporate Job") return;

    setIsTogglingCorporateEmergency(true);
    try {
      const res = await fetch(
        `/api/projects/${id}/corporate-emergency?source=admin`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ isEnabled: Boolean(nextEnabled) }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update corporate emergency.");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
    } catch (error) {
      console.error("Error toggling corporate emergency:", error);
      openBillingGuardModal(
        {
          message: error.message || "Failed to update corporate emergency.",
        },
        "",
        {
          title: "Corporate Emergency",
          canOverride: false,
          missingLabels: [],
          fallbackMessage: "Failed to update corporate emergency.",
        },
      );
    } finally {
      setIsTogglingCorporateEmergency(false);
    }
  };

  const openProjectTypeModal = () => {
    if (!project || user?.role !== "admin" || isLeadUser) return;
    if (!ensureProjectIsEditable()) return;
    setProjectTypeChangeError("");
    setIsProjectTypeModalOpen(true);
  };

  const closeProjectTypeModal = () => {
    if (isChangingProjectType) return;
    setIsProjectTypeModalOpen(false);
    setProjectTypeChangeError("");
  };

  const handleProjectTypeChange = async (payload) => {
    if (!project || user?.role !== "admin" || isLeadUser) return;
    if (isChangingProjectType) return;

    setIsChangingProjectType(true);
    setProjectTypeChangeError("");

    try {
      const res = await fetch(`/api/projects/${id}/project-type?source=admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload || {}),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to change project type.");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
      setIsProjectTypeModalOpen(false);
      setProjectTypeChangeError("");
    } catch (error) {
      console.error("Error changing project type:", error);
      setProjectTypeChangeError(
        error.message || "Failed to change project type.",
      );
    } finally {
      setIsChangingProjectType(false);
    }
  };

  const handleProjectHoldToggle = async (nextOnHold, reason = "") => {
    if (!project || isTogglingHold) return;

    setIsTogglingHold(true);
    try {
      const res = await fetch(`/api/projects/${id}/hold`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          nextOnHold ? { onHold: true, reason } : { onHold: false },
        ),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update hold state.");
      }

      const updatedProject = await res.json();
      setProject(updatedProject);
      setHoldReasonDraft(updatedProject.hold?.reason || "");
      setIsEditing(false);
      setIsEditingLead(false);
      setIsHoldModalOpen(false);
    } catch (error) {
      console.error("Error toggling project hold:", error);
      alert(error.message || "Failed to update hold state.");
    } finally {
      setIsTogglingHold(false);
    }
  };

  const handleHoldActionClick = () => {
    if (!project || isTogglingHold) return;

    if (isProjectOnHold) {
      handleProjectHoldToggle(false);
      return;
    }

    setHoldReasonDraft(project.hold?.reason || "");
    setIsHoldModalOpen(true);
  };

  const closeCancelModal = () => {
    if (isCancelling) return;
    setIsCancelModalOpen(false);
    setCancelError("");
  };

  const closeReactivateModal = () => {
    if (isReactivating) return;
    setIsReactivateModalOpen(false);
    setReactivateError("");
  };

  const handleCancelActionClick = () => {
    if (!project || isCancelling || isReactivating) return;
    if (!ensureProjectIsEditable()) return;
    setCancelReasonDraft(project.cancellation?.reason || "");
    setCancelError("");
    setIsCancelModalOpen(true);
  };

  const handleReactivateActionClick = () => {
    if (!project || isReactivating || isCancelling) return;
    setReactivateError("");
    setIsReactivateModalOpen(true);
  };

  const handleCancelProject = async (reason = "") => {
    if (!project || isCancelling) return;
    setIsCancelling(true);
    setCancelError("");
    try {
      const res = await fetch(`/api/projects/${id}/cancel?source=admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to cancel project.");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
      setIsEditing(false);
      setIsEditingLead(false);
      setIsHoldModalOpen(false);
      setIsCancelModalOpen(false);
      setCancelError("");
      navigate("/cancelled-orders");
    } catch (error) {
      console.error("Error cancelling project:", error);
      setCancelError(error.message || "Failed to cancel project.");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReactivateProject = async () => {
    if (!project || isReactivating || isCancelling) return;

    setIsReactivating(true);
    setReactivateError("");
    try {
      const res = await fetch(`/api/projects/${id}/reactivate?source=admin`, {
        method: "PATCH",
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to reactivate project.");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
      setIsEditing(false);
      setIsEditingLead(false);
      setIsHoldModalOpen(false);
      setIsCancelModalOpen(false);
      setIsReactivateModalOpen(false);
      setReactivateError("");
    } catch (error) {
      console.error("Error reactivating project:", error);
      setReactivateError(error.message || "Failed to reactivate project.");
    } finally {
      setIsReactivating(false);
    }
  };

  // Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const applyProjectToState = (data) => {
    if (!data) return;
    setProject(data);
    setCancelReasonDraft(data.cancellation?.reason || "");
    setEditForm({
      orderId: data.orderId || "",
      client: data.details?.client || "",
      clientEmail: data.details?.clientEmail || "", // [NEW]
      clientPhone: data.details?.clientPhone || "", // [NEW]
      briefOverview: data.details?.briefOverview || "", // [New]
      orderDate: data.orderDate
        ? data.orderDate.split("T")[0]
        : data.createdAt
          ? data.createdAt.split("T")[0]
          : "",
      receivedTime: data.receivedTime || "",
      deliveryDate: data.details?.deliveryDate
        ? data.details.deliveryDate.split("T")[0]
        : "",
      deliveryTime: data.details?.deliveryTime || "",
      deliveryLocation: data.details?.deliveryLocation || "",
      contactType: data.details?.contactType || "None",
      supplySource: formatSupplySource(data.details?.supplySource),
      packagingType: data.details?.packagingType || "",
    });
  };

  const fetchOrderGroupProjects = async (orderNumber, fallbackProject = null) => {
    const normalizedOrder = String(orderNumber || "").trim();
    if (!normalizedOrder) {
      setOrderGroupProjects(fallbackProject ? [fallbackProject] : []);
      return;
    }

    try {
      const res = await fetch(
        `/api/projects/orders/${encodeURIComponent(normalizedOrder)}?source=admin&collapseRevisions=true`,
        {
          credentials: "include",
        },
      );
      if (!res.ok) throw new Error("Failed to fetch grouped order projects");

      const group = await res.json();
      const projects = Array.isArray(group?.projects) ? group.projects : [];
      setOrderGroupProjects(
        projects.length > 0 ? projects : fallbackProject ? [fallbackProject] : [],
      );
    } catch (error) {
      console.error("Failed to load grouped order projects:", error);
      setOrderGroupProjects(fallbackProject ? [fallbackProject] : []);
    }
  };

  const fetchProject = async ({ showLoading = true, retries = 1 } = {}) => {
    if (showLoading) setLoading(true);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch project");
      }

      const data = await res.json();
      applyProjectToState(data);
      await fetchOrderGroupProjects(data?.orderId, data);
    } catch (err) {
      console.error("Error fetching project:", err);
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return fetchProject({ showLoading: false, retries: retries - 1 });
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchUpdates = async () => {
    try {
      const res = await fetch(`/api/updates/project/${id}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUpdates(data);
      }
    } catch (err) {
      console.error("Error fetching updates:", err);
    }
  };

  useEffect(() => {
    const stateProject = location.state?.project;
    if (
      stateProject &&
      String(stateProject._id || "") === String(id || "")
    ) {
      applyProjectToState(stateProject);
      setLoading(false);
      fetchProject({ showLoading: false, retries: 1 });
    } else {
      fetchProject({ showLoading: true, retries: 1 });
    }

    fetchUpdates();

    // Fetch users for Lead Edit
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/auth/users", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          setAvailableUsers(data);
        }
      } catch (err) {
        console.error("Failed to fetch users", err);
      }
    };
    fetchUsers();
  }, [id, location.state]);

  useRealtimeRefresh(
    () => {
      fetchProject();
      fetchUpdates();
    },
    { enabled: Boolean(id) },
  );

  // Lead Edit State
  const [isEditingLead, setIsEditingLead] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [leadForm, setLeadForm] = useState("");
  const [assistantLeadForm, setAssistantLeadForm] = useState("");

  // Sync leadForm when project loads
  useEffect(() => {
    if (project) {
      setLeadForm(project.projectLeadId?._id || project.projectLeadId || "");
      setAssistantLeadForm(
        project.assistantLeadId?._id || project.assistantLeadId || "",
      );
    }
  }, [project]);

  const handleSaveLead = async () => {
    if (!ensureProjectIsEditable()) return;
    try {
      // Find selected user object for optimistic update (optional but good)
      const selectedUser = availableUsers.find((u) => u._id === leadForm);
      const leadLabel = selectedUser
        ? `${selectedUser.firstName || ""} ${selectedUser.lastName || ""}`.trim() ||
          selectedUser.name ||
          ""
        : "";

      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectLeadId: leadForm,
          assistantLeadId: assistantLeadForm,
          lead: leadLabel, // Also update duplicate lead name in details if needed
        }),
      });

      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setIsEditingLead(false);
      } else {
        alert("Failed to update Project Lead");
      }
    } catch (error) {
      console.error("Error updating lead:", error);
      alert("Error updating lead");
    }
  };

  const handleEditToggle = () => {
    if (!project) return;
    if (!isEditing && !ensureProjectIsEditable()) return;
    // Reset form to current project state when opening edit
    if (!isEditing) {
      setEditForm({
        orderId: project.orderId || "",
        client: project.details?.client || "",
        clientEmail: project.details?.clientEmail || "", // [NEW]
        clientPhone: project.details?.clientPhone || "", // [NEW]
        orderDate: project.orderDate
          ? project.orderDate.split("T")[0]
          : project.createdAt
            ? project.createdAt.split("T")[0]
            : "",
        receivedTime: project.receivedTime || "",
        deliveryDate: project.details?.deliveryDate
          ? project.details.deliveryDate.split("T")[0]
          : "",
        deliveryTime: project.details?.deliveryTime || "",
        deliveryLocation: project.details?.deliveryLocation || "",
        contactType: project.details?.contactType || "None",
        supplySource: project.details?.supplySource || "",
        packagingType: project.details?.packagingType || "",
      });
    }
    setIsEditing(!isEditing);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (!ensureProjectIsEditable()) return;
    try {
      // Construct payload with flattened fields as expected by the controller
      const payload = {
        orderId: editForm.orderId,
        client: editForm.client,
        clientEmail: editForm.clientEmail, // [NEW]
        clientPhone: editForm.clientPhone, // [NEW]
        briefOverview: editForm.briefOverview, // [New]
        orderDate: editForm.orderDate,
        receivedTime: editForm.receivedTime,
        deliveryDate: editForm.deliveryDate,
        deliveryTime: editForm.deliveryTime,
        deliveryLocation: editForm.deliveryLocation,
        contactType: editForm.contactType,
        supplySource: editForm.supplySource,
        packagingType: editForm.packagingType,
      };

      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setIsEditing(false);
      } else {
        console.error("Failed to update project");
        alert("Failed to save changes.");
      }
    } catch (err) {
      console.error("Error saving project:", err);
      alert("Error saving changes.");
    }
  };

  const handleChecklistToggle = async (key, val) => {
    if (!ensureProjectIsEditable()) return;
    if (!project || !project.quoteDetails) return;

    const currentChecklist = project.quoteDetails.checklist || {};
    const updatedChecklist = { ...currentChecklist, [key]: !val };

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          quoteDetails: {
            ...project.quoteDetails,
            checklist: updatedChecklist,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update checklist");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
    } catch (err) {
      console.error("Error updating checklist:", err);
      alert("Failed to update checklist");
    }
  };

  const handleQuoteRequirementTransition = async (requirementKey, toStatus) => {
    if (!ensureProjectIsEditable()) return;
    if (!project || project.projectType !== "Quote") return;

    const pendingKey = `${requirementKey}:${toStatus}`;
    setQuoteRequirementSubmittingKey(pendingKey);

    try {
      const res = await fetch(
        `/api/projects/${id}/quote-requirements/${requirementKey}/transition?source=admin`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            toStatus,
          }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update quote requirement.");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
    } catch (error) {
      console.error("Error updating quote requirement:", error);
      alert(error.message || "Failed to update quote requirement.");
    } finally {
      setQuoteRequirementSubmittingKey("");
    }
  };

  const handleQuoteDecisionValidation = async (decision) => {
    if (!ensureProjectIsEditable()) return;
    if (!project || project.projectType !== "Quote") return;
    if (quoteDecisionSubmitting) return;

    setQuoteDecisionSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${id}/quote-decision?source=admin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          decision,
          note: quoteDecisionNoteDraft,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to validate quote decision.");
      }

      const updatedProject = await res.json();
      applyProjectToState(updatedProject);
    } catch (error) {
      console.error("Error validating quote decision:", error);
      alert(error.message || "Failed to validate quote decision.");
    } finally {
      setQuoteDecisionSubmitting(false);
    }
  };

  const handleUndoAcknowledgement = async (department) => {
    if (!project) return;
    if (!ensureProjectIsEditable()) return;
    setUndoingDept(department);
    try {
      const res = await fetch(`/api/projects/${id}/acknowledge`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ department }),
      });

      if (!res.ok) {
        throw new Error("Failed to undo acknowledgement");
      }

      const updatedProject = await res.json();
      setProject(updatedProject);
    } catch (err) {
      console.error("Error undoing acknowledgement:", err);
      alert("Failed to undo acknowledgement");
    } finally {
      setUndoingDept(null);
    }
  };

  const deliveryDateValue = project?.details?.deliveryDate;
  const deliveryTimeValue = project?.details?.deliveryTime;
  const deliveryDeadline = useMemo(
    () => buildDeliveryDeadline(deliveryDateValue, deliveryTimeValue),
    [deliveryDateValue, deliveryTimeValue],
  );
  const deliveryCountdown = useMemo(() => {
    if (!deliveryDeadline || Number.isNaN(deliveryDeadline.getTime())) {
      return {
        days: "--",
        hours: "--",
        minutes: "--",
        seconds: "--",
        totalSeconds: 0,
        isNearDelivery: false,
        isOverdue: false,
      };
    }

    const deltaMs = deliveryDeadline.getTime() - countdownNowMs;
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
  }, [countdownNowMs, deliveryDeadline]);

  useEffect(() => {
    if (!project?._id || billingGuardModal.open) return;

    const quoteProject = project.projectType === "Quote";
    const pendingProductionMissing = quoteProject
      ? []
      : getPendingProductionBillingMissing(project);
    const pendingDeliveryMissing = quoteProject
      ? []
      : getPendingDeliveryBillingMissing(project);
    const pendingProductionMissingLabels = formatBillingMissingLabels(
      pendingProductionMissing,
    );
    const pendingDeliveryMissingLabels = formatBillingMissingLabels(
      pendingDeliveryMissing,
    );
    const showPendingProductionWarning =
      !quoteProject &&
      ["Pending Proof Reading", "Pending Production"].includes(project.status) &&
      pendingProductionMissing.length > 0;
    const showPendingDeliveryWarning =
      !quoteProject &&
      ["Pending Packaging", "Pending Delivery/Pickup"].includes(project.status) &&
      pendingDeliveryMissing.length > 0;

    const sampleRequirementEnabled =
      !quoteProject && Boolean(project?.sampleRequirement?.isRequired);
    const sampleApprovalStatus = getSampleApprovalStatus(
      project?.sampleApproval || {},
    );
    const showPendingProductionSampleWarning =
      sampleRequirementEnabled &&
      project.status === "Pending Production" &&
      sampleApprovalStatus !== "approved";
    const sampleMissingLabels = showPendingProductionSampleWarning
      ? [SAMPLE_APPROVAL_MISSING_LABEL]
      : [];

    const guardKey = `${project._id}|${project.status}|${
      showPendingProductionSampleWarning
        ? sampleMissingLabels.join("|")
        : showPendingProductionWarning
          ? pendingProductionMissingLabels.join("|")
          : showPendingDeliveryWarning
            ? pendingDeliveryMissingLabels.join("|")
            : ""
    }`;

    if (
      showPendingProductionSampleWarning &&
      guardKey !== dismissedGuardKey
    ) {
      openBillingGuardModal(
        {
          message:
            "Client sample approval is pending. Confirm approval before Production can be completed.",
          missing: ["client_sample_approval"],
        },
        "Production Completed",
        {
          title: "Sample Caution",
          canOverride: false,
          missingLabels: sampleMissingLabels,
          fallbackMessage:
            "Client sample approval is pending. Confirm approval before Production can be completed.",
        },
      );
      return;
    }

    if (showPendingProductionWarning && guardKey !== dismissedGuardKey) {
      openBillingGuardModal(
        {
          message:
            "Billing prerequisites are required before moving to Pending Production.",
          missing: pendingProductionMissing,
        },
        "Pending Production",
      );
      return;
    }

    if (showPendingDeliveryWarning && guardKey !== dismissedGuardKey) {
      openBillingGuardModal(
        {
          message:
            "Billing prerequisites are required before moving to Pending Delivery/Pickup.",
          missing: pendingDeliveryMissing,
        },
        "Pending Delivery/Pickup",
      );
    }
  }, [project, billingGuardModal.open, dismissedGuardKey]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
        Loading details...
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>
        Project not found.
      </div>
    );
  }

  const isProjectOnHold = Boolean(
    project.hold?.isOnHold || project.status === "On Hold",
  );
  const isCancelledProject = Boolean(project.cancellation?.isCancelled);

  // Helpers
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    // ISO string
    if (timeStr.includes("T")) {
      return new Date(timeStr).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    // Check for 12-hour format (e.g. 02:30 PM)
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
    if (match) {
      let [_, h, m, period] = match;
      h = parseInt(h);
      if (period.toUpperCase() === "PM" && h < 12) h += 12;
      if (period.toUpperCase() === "AM" && h === 12) h = 0;
      return `${h.toString().padStart(2, "0")}:${m}`;
    }
    return timeStr;
  };

  const formatReceivedTime = () => {
    if (!project.receivedTime) return "N/A";
    const time = formatTime(project.receivedTime);

    // If original was ISO, formatTime returns just the time.
    // If it was just time string, formatTime returns just the time (converted).
    // We want to show Date + Time if possible.

    if (project.receivedTime.includes("T")) {
      return new Date(project.receivedTime).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }

    const dateBase = project.orderDate || project.createdAt;
    return `${new Date(dateBase).toLocaleDateString()} at ${time}`;
  };

  const formatLastUpdated = (dateString) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const formatFeedbackDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const resolveFeedbackAttachmentUrl = (attachment = {}) => {
    const rawUrl = String(
      attachment?.fileUrl || attachment?.url || attachment?.path || "",
    ).trim();
    if (!rawUrl) return "";
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      return rawUrl;
    }
    if (rawUrl.startsWith("/")) return rawUrl;
    return `/${rawUrl.replace(/^\/+/, "")}`;
  };

  const getFeedbackAttachmentName = (attachment = {}, index = 0) => {
    const preferredName = String(
      attachment?.fileName || attachment?.name || "",
    ).trim();
    if (preferredName) return preferredName;
    const url = resolveFeedbackAttachmentUrl(attachment);
    const pathWithoutQuery = url.split("?")[0];
    const segments = pathWithoutQuery.split("/").filter(Boolean);
    return segments[segments.length - 1] || `attachment-${index + 1}`;
  };

  const getFeedbackAttachmentType = (attachment = {}, index = 0) => {
    const mimeType = String(
      attachment?.fileType || attachment?.type || "",
    ).toLowerCase();
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";

    const attachmentName = getFeedbackAttachmentName(attachment, index).toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(attachmentName)) {
      return "image";
    }
    if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(attachmentName)) {
      return "audio";
    }
    if (/\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(attachmentName)) {
      return "video";
    }

    return "file";
  };

  const details = project.details || {};
  const clientEmail = (details.clientEmail || "").trim();
  const clientPhone = (details.clientPhone || "").trim();
  const clientContactDisplay =
    clientEmail && clientPhone
      ? `${clientEmail} / ${clientPhone}`
      : clientEmail || clientPhone || "N/A";
  const mockup = project.mockup || {};
  const mockupUrl = mockup.fileUrl;
  const mockupName =
    mockup.fileName || (mockupUrl ? mockupUrl.split("/").pop() : "");
  const parsedMockupVersion = Number.parseInt(mockup.version, 10);
  const mockupVersion =
    Number.isFinite(parsedMockupVersion) && parsedMockupVersion > 0
      ? parsedMockupVersion
      : null;
  const mockupVersionLabel = mockupVersion ? `v${mockupVersion}` : "";
  const mockupApprovalStatus = getMockupApprovalStatus(
    mockup?.clientApproval || {},
  );
  const isMockupClientApproved = mockupApprovalStatus === "approved";
  const isMockupClientRejected = mockupApprovalStatus === "rejected";
  const mockupApprovedAtLabel = mockup?.clientApproval?.approvedAt
    ? formatLastUpdated(mockup.clientApproval.approvedAt)
    : null;
  const mockupRejectedAtLabel = mockup?.clientApproval?.rejectedAt
    ? formatLastUpdated(mockup.clientApproval.rejectedAt)
    : null;
  const mockupRejectionReason = String(
    mockup?.clientApproval?.rejectionReason ||
      mockup?.clientApproval?.note ||
      "",
  ).trim();
  const paymentLabels = {
    part_payment: "Part Payment",
    full_payment: "Full Payment",
    po: "P.O",
    authorized: "Authorized",
  };
  const paymentTypes = (project.paymentVerifications || []).map((entry) => entry.type);
  const isQuoteProject = project.projectType === "Quote";
  const quoteRequirementItems = isQuoteProject
    ? getQuoteRequirementItems(project)
    : [];
  const quoteDecisionState = isQuoteProject
    ? getQuoteDecisionState(project)
    : { status: "pending", note: "", validatedAt: null };
  const quoteDecisionTaken =
    isQuoteProject &&
    ["go_ahead", "declined"].includes(quoteDecisionState.status);
  const canValidateQuoteDecision =
    isQuoteProject && project.status === "Response Sent";
  const convertedFromQuoteAt =
    !isQuoteProject && project?.quoteDetails?.decision?.convertedAt
      ? project.quoteDetails.decision.convertedAt
      : null;
  const convertedFromQuoteType =
    !isQuoteProject && project?.quoteDetails?.decision?.convertedToType
      ? String(project.quoteDetails.decision.convertedToType)
      : "";
  const hasConvertedQuoteReference = Boolean(convertedFromQuoteAt);
  const isCorporateProject = project.projectType === "Corporate Job";
  const corporateEmergencyEnabled =
    isCorporateProject && Boolean(project?.corporateEmergency?.isEnabled);
  const invoiceSent = Boolean(project.invoice?.sent);
  const pendingProductionMissing = isQuoteProject
    ? []
    : getPendingProductionBillingMissing(project);
  const pendingDeliveryMissing = isQuoteProject
    ? []
    : getPendingDeliveryBillingMissing(project);
  const showPendingProductionWarning =
    !isQuoteProject &&
    ["Pending Proof Reading", "Pending Production"].includes(project.status) &&
    pendingProductionMissing.length > 0;
  const showPendingDeliveryWarning =
    !isQuoteProject &&
    ["Pending Packaging", "Pending Delivery/Pickup"].includes(project.status) &&
    pendingDeliveryMissing.length > 0;
  const pendingProductionMissingLabels = formatBillingMissingLabels(
    pendingProductionMissing,
  );
  const pendingDeliveryMissingLabels = formatBillingMissingLabels(
    pendingDeliveryMissing,
  );
  const sampleRequirementEnabled =
    !isQuoteProject && Boolean(project?.sampleRequirement?.isRequired);
  const sampleApprovalStatus = getSampleApprovalStatus(project?.sampleApproval || {});
  const hasSpecialRequirementAwareness =
    sampleRequirementEnabled || corporateEmergencyEnabled;
  const specialRequirementWatermarkText = [
    corporateEmergencyEnabled ? "Corporate Emergency" : "",
    sampleRequirementEnabled ? "Sample Approval Required" : "",
  ]
    .filter(Boolean)
    .join(" • ");
  const showPendingProductionSampleWarning =
    sampleRequirementEnabled &&
    project.status === "Pending Production" &&
    sampleApprovalStatus !== "approved";
  const parsedVersion = Number(project.versionNumber);
  const projectVersion =
    Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
  const showVersionTag = projectVersion > 1;
  const feedbacksSorted = (project.feedbacks || []).slice().sort((a, b) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  const showFeedbackSection = [
    "Delivered",
    "Pending Feedback",
    "Feedback Completed",
    "Completed",
    "Finished",
  ].includes(project.status);
  const contentTabs = [
    { key: "overview", label: "Overview" },
    { key: "order", label: "Order & Files" },
    { key: "updates", label: "Updates" },
  ];
  const hasHeaderAlerts = Boolean(
    (isCorporateProject && corporateEmergencyEnabled) ||
      invoiceSent ||
      (!isQuoteProject && paymentTypes.length > 0) ||
      hasConvertedQuoteReference ||
      sampleRequirementEnabled ||
      showPendingProductionWarning ||
      showPendingProductionSampleWarning ||
      showPendingDeliveryWarning ||
      isCancelledProject ||
      isProjectOnHold,
  );

  const normalizeAttachment = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      return value.url || value.path || value.location || value.filename || null;
    }
    return null;
  };

  return (
    <div
      className={`project-details-page ${
        project &&
        (project.priority === "Urgent" || project.projectType === "Emergency")
          ? "emergency-theme"
          : ""
      }`}
    >
      {hasSpecialRequirementAwareness && (
        <div className="project-special-watermark" aria-hidden="true">
          {specialRequirementWatermarkText}
        </div>
      )}
      <Link to="/projects" className="back-link">
        ← Back to Projects
      </Link>

      {project &&
        (project.priority === "Urgent" ||
          project.projectType === "Emergency") && (
          <div className="emergency-banner mb-6">
            <span style={{ fontSize: "1.5rem" }}>🔥</span>
            <span>EMERGENCY PROJECT - URGENT</span>
          </div>
        )}

      <div className="details-header">
        <div className="header-left header-left-vertical">
          <h1 className="header-order">
            {project.orderId || "Order #..."}
            {showVersionTag && (
              <span className="project-version-badge">v{projectVersion}</span>
            )}
          </h1>
          <p className="header-project-name">{details.projectName}</p>
        </div>

        <div
          className={`delivery-countdown-badge ${deliveryCountdown.isNearDelivery ? "is-near-delivery" : ""} ${deliveryCountdown.isOverdue ? "is-overdue" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="delivery-countdown-title">
            {deliveryCountdown.isOverdue ? "Delivery Overdue" : "Delivery Countdown"}
          </span>
          <div className="delivery-countdown-rings">
            <RingCountdownUnit
              value={deliveryCountdown.days}
              label="Days"
              progress={getCountdownRingProgress("days", deliveryCountdown)}
            />
            <RingCountdownUnit
              value={deliveryCountdown.hours}
              label="Hours"
              progress={getCountdownRingProgress("hours", deliveryCountdown)}
            />
            <RingCountdownUnit
              value={deliveryCountdown.minutes}
              label="Minutes"
              progress={getCountdownRingProgress("minutes", deliveryCountdown)}
            />
          </div>
        </div>

        <div className="header-right-panel">
          <div className="header-status-row">
            <select
              className={`status-badge-select ${project.status
                ?.toLowerCase()
                .replace(" ", "-")}`}
              value={mapQuoteStatusForDisplay(project.status, isQuoteProject)}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={
                loading ||
                isLeadUser ||
                isProjectOnHold ||
                isCancelledProject ||
                isTogglingHold ||
                isCancelling ||
                isReactivating
              }
              style={{
                marginLeft: 0,
                padding: "0.25rem 0.5rem",
                borderRadius: "999px",
                border: "1px solid transparent",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                backgroundColor: "rgba(255, 255, 255, 0.2)",
                color: "inherit",
              }}
            >
              {(project.projectType === "Quote"
                ? [
                    "Order Confirmed",
                    "Pending Scope Approval",
                    "Scope Approval Completed",
                    "Pending Departmental Engagement",
                    "Departmental Engagement Completed",
                    "Pending Quote Request",
                    "Quote Request Completed",
                    "Pending Send Response",
                    "Response Sent",
                    "Pending Decision",
                    "Decision Completed",
                    "Completed",
                    ...(isProjectOnHold ? ["On Hold"] : []),
                  ]
                : [
                    "Order Confirmed",
                    "Pending Scope Approval",
                    "Scope Approval Completed",
                    "Pending Departmental Engagement",
                    "Departmental Engagement Completed",
                    "Pending Mockup",
                    "Mockup Completed",
                    "Pending Proof Reading",
                    "Proof Reading Completed",
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
                    ...(isProjectOnHold ? ["On Hold"] : []),
                  ]
              ).map((status) => (
                <option
                  key={status}
                  value={status}
                  style={{ color: "#1e293b" }}
                >
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="header-actions-row">
            {user?.role === "admin" &&
              !isLeadUser &&
              (isCancelledProject ? (
                <button
                  type="button"
                  className="hold-toggle-btn reactivate"
                  onClick={handleReactivateActionClick}
                  disabled={isReactivating || isCancelling}
                >
                  {isReactivating ? "Reactivating..." : "Reactivate Project"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`hold-toggle-btn sample ${
                      sampleRequirementEnabled ? "sample-on" : "sample-off"
                    }`}
                    onClick={() =>
                      handleToggleSampleRequirement(!sampleRequirementEnabled)
                    }
                    disabled={isTogglingSampleRequirement || isTogglingHold}
                  >
                    {isTogglingSampleRequirement
                      ? "Updating Sample..."
                      : sampleRequirementEnabled
                        ? "Sample Required: ON"
                        : "Sample Required: OFF"}
                  </button>
                  <button
                    type="button"
                    className="hold-toggle-btn type-change"
                    onClick={openProjectTypeModal}
                    disabled={
                      isChangingProjectType ||
                      isTogglingHold ||
                      isCancelling ||
                      isReactivating
                    }
                  >
                    {isChangingProjectType ? "Changing Type..." : "Change Type"}
                  </button>
                  {isCorporateProject && (
                    <button
                      type="button"
                      className={`hold-toggle-btn corporate ${
                        corporateEmergencyEnabled
                          ? "corporate-on"
                          : "corporate-off"
                      }`}
                      onClick={() =>
                        handleToggleCorporateEmergency(!corporateEmergencyEnabled)
                      }
                      disabled={
                        isTogglingCorporateEmergency || isTogglingHold
                      }
                    >
                      {isTogglingCorporateEmergency
                        ? "Updating Emergency..."
                        : corporateEmergencyEnabled
                          ? "Corporate Emergency: ON"
                          : "Corporate Emergency: OFF"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`hold-toggle-btn ${isProjectOnHold ? "release" : "hold"}`}
                    onClick={handleHoldActionClick}
                    disabled={isTogglingHold || isCancelling}
                  >
                    {isTogglingHold
                      ? isProjectOnHold
                        ? "Releasing..."
                        : "Holding..."
                      : isProjectOnHold
                        ? "Release Hold"
                        : "Put On Hold"}
                  </button>
                  <button
                    type="button"
                    className="hold-toggle-btn cancel-project"
                    onClick={handleCancelActionClick}
                    disabled={isTogglingHold || isCancelling || isReactivating}
                  >
                    {isCancelling ? "Cancelling..." : "Cancel Project"}
                  </button>
                </>
              ))}
          </div>
        </div>
      </div>

      {hasHeaderAlerts && (
        <div className="details-alert-strip">
          <div className="billing-tags">
            {isCorporateProject && corporateEmergencyEnabled && (
              <span className="billing-tag corporate-emergency">
                Corporate Emergency
              </span>
            )}
            {invoiceSent && (
              <span className="billing-tag invoice">
                {isQuoteProject ? "Quote Sent" : "Invoice Sent"}
              </span>
            )}
            {!isQuoteProject &&
              paymentTypes.map((type) => (
                <span key={type} className="billing-tag payment">
                  {paymentLabels[type] || type}
                </span>
              ))}
            {hasConvertedQuoteReference && (
              <span className="billing-tag payment">
                Converted from Quote
                {convertedFromQuoteType ? ` -> ${convertedFromQuoteType}` : ""}
                {` (${formatLastUpdated(convertedFromQuoteAt)})`}
              </span>
            )}
            {sampleRequirementEnabled && (
              <span
                className={`billing-tag sample-requirement ${
                  showPendingProductionSampleWarning ? "caution" : "invoice"
                }`}
              >
                {sampleApprovalStatus === "approved"
                  ? "Sample Approval Required (Approved)"
                  : "Sample Approval Required"}
              </span>
            )}
            {showPendingProductionWarning && (
              <span className="billing-tag caution">
                Pending Production Blocked:{" "}
                {pendingProductionMissingLabels.join(", ")}
              </span>
            )}
            {showPendingDeliveryWarning && (
              <span className="billing-tag caution">
                Pending Delivery Blocked: {pendingDeliveryMissingLabels.join(", ")}
              </span>
            )}
          </div>
          {showPendingProductionWarning && (
            <div className="payment-warning critical">
              Caution: before moving to Pending Production, confirm{" "}
              {pendingProductionMissingLabels.join(", ")}.
            </div>
          )}
          {showPendingProductionSampleWarning && (
            <div className="payment-warning critical">
              Caution: client sample approval is pending. Confirm approval before
              Production can be completed.
            </div>
          )}
          {showPendingDeliveryWarning && (
            <div className="payment-warning critical">
              Caution: before moving to Pending Delivery/Pickup, confirm{" "}
              {pendingDeliveryMissingLabels.join(", ")}.
            </div>
          )}
          {isCancelledProject && (
            <div className="cancelled-alert">
              This project is cancelled and frozen at{" "}
              <strong>
                {project.cancellation?.resumedStatus || project.status || "N/A"}
              </strong>
              {project.cancellation?.cancelledAt
                ? ` since ${formatLastUpdated(project.cancellation.cancelledAt)}`
                : ""}
              .
              {project.cancellation?.reason
                ? ` Reason: ${project.cancellation.reason}`
                : ""}
            </div>
          )}
          {isProjectOnHold && (
            <div className="hold-alert">
              This project is on hold
              {project.hold?.reason ? `: ${project.hold.reason}` : "."}
            </div>
          )}
        </div>
      )}

      <div className="details-grid">
        {/* Left Column */}
        <div className="main-info">
          <div
            className="detail-content-tabs"
            role="tablist"
            aria-label="Project detail sections"
          >
            {contentTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeContentTab === tab.key}
                className={`detail-content-tab ${
                  activeContentTab === tab.key ? "active" : ""
                }`}
                onClick={() => setActiveContentTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeContentTab === "overview" && (
            <>
          {/* General Info */}
          <div className="detail-card">
            <h3
              className="card-title"
              style={{ justifyContent: "space-between" }}
            >
              <span>
                General Information
                {project.sectionUpdates?.details && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: "normal",
                      marginLeft: "0.75rem",
                    }}
                  >
                    (Last Updated:{" "}
                    {formatLastUpdated(project.sectionUpdates.details)})
                  </span>
                )}
              </span>
              {!isEditing ? (
                !isLeadUser && !isProjectOnHold && !isCancelledProject && (
                  <button
                    onClick={handleEditToggle}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                    title="Edit Info"
                  >
                    <PencilIcon width="18" height="18" />
                  </button>
                )
              ) : (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleSave}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#22c55e",
                      cursor: "pointer",
                    }}
                    title="Save"
                  >
                    <CheckCircleIcon width="20" height="20" />
                  </button>
                  <button
                    onClick={handleEditToggle}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                    }}
                    title="Cancel"
                  >
                    <XMarkIcon width="20" height="20" />
                  </button>
                </div>
              )}
            </h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Order Number</label>
                {isEditing ? (
                  <input
                    className="edit-input"
                    name="orderId"
                    value={editForm.orderId || ""}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{project.orderId || "N/A"}</p>
                )}
              </div>
              <div className="info-item">
                <label>Client</label>
                {isEditing ? (
                  <input
                    className="edit-input"
                    name="client"
                    value={editForm.client}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{details.client || "N/A"}</p>
                )}
              </div>
              <div className="info-item">
                <label>Client Contact / Email</label>
                {isEditing ? (
                  <div style={{ display: "grid", gap: "0.5rem" }}>
                    <input
                      className="edit-input"
                      name="clientEmail"
                      value={editForm.clientEmail}
                      onChange={handleChange}
                      placeholder="Email"
                    />
                    <input
                      className="edit-input"
                      name="clientPhone"
                      value={editForm.clientPhone}
                      onChange={handleChange}
                      placeholder="Phone"
                    />
                  </div>
                ) : (
                  <p>{clientContactDisplay}</p>
                )}
              </div>
              <div className="info-item">
                <label>Order Date</label>
                {isEditing ? (
                  <input
                    type="date"
                    className="edit-input"
                    name="orderDate"
                    value={editForm.orderDate}
                    onChange={handleChange}
                  />
                ) : (
                  <p>{formatDate(project.orderDate || project.createdAt)}</p>
                )}
              </div>
              <div className="info-item">
                <label>Received Time</label>
                {isEditing ? (
                  <input
                    type="time"
                    className="edit-input"
                    name="receivedTime"
                    value={
                      editForm.receivedTime?.includes("T")
                        ? ""
                        : editForm.receivedTime || ""
                    }
                    onChange={handleChange}
                  />
                ) : (
                  <p>{formatReceivedTime()}</p>
                )}
              </div>
              {project.projectType !== "Quote" && (
                <>
                  <div className="info-item">
                    <label>Delivery</label>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input
                          type="date"
                          className="edit-input"
                          name="deliveryDate"
                          value={editForm.deliveryDate}
                          onChange={handleChange}
                        />
                        <input
                          type="time"
                          className="edit-input"
                          name="deliveryTime"
                          value={editForm.deliveryTime}
                          onChange={handleChange}
                        />
                      </div>
                    ) : (
                      <p>
                        {formatDate(details.deliveryDate)}
                        {details.deliveryTime
                          ? ` @ ${formatTime(details.deliveryTime)}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Location</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="deliveryLocation"
                        value={editForm.deliveryLocation}
                        onChange={handleChange}
                      />
                    ) : (
                      <p>{details.deliveryLocation || "N/A"}</p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Contact Type</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="contactType"
                        value={editForm.contactType}
                        onChange={handleChange}
                      />
                    ) : (
                      <p>{details.contactType || "None"}</p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Supply Source</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="supplySource"
                        value={editForm.supplySource}
                        onChange={handleChange}
                      />
                    ) : (
                      <p>{formatSupplySource(details.supplySource)}</p>
                    )}
                  </div>
                  <div className="info-item">
                    <label>Packaging Type</label>
                    {isEditing ? (
                      <input
                        className="edit-input"
                        name="packagingType"
                        value={editForm.packagingType || ""}
                        onChange={handleChange}
                        placeholder="e.g. Carton box with inserts"
                      />
                    ) : (
                      <p>{details.packagingType || "N/A"}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Brief Overview Section (Moved from General Info) */}
          <div className="detail-card">
              <h3 className="card-title">Brief Overview</h3>
              <div style={{ marginTop: "1rem" }}>
                {isEditing ? (
                  <textarea
                    className="edit-input"
                    name="briefOverview"
                    value={editForm.briefOverview || ""}
                    onChange={handleChange}
                    rows={4}
                    style={{
                      resize: "vertical",
                      width: "100%",
                      padding: "0.75rem",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                      fontSize: "0.95rem",
                    }}
                  />
                ) : (
                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      color: "var(--text-secondary)",
                      lineHeight: "1.6",
                      fontSize: "0.95rem",
                    }}
                  >
                    {details.briefOverview || "No overview provided."}
                  </p>
                )}
              </div>
            </div>

          {/* Feedback */}
          {showFeedbackSection && (
            <div className="detail-card">
              <h3 className="card-title">Feedback</h3>
              {feedbacksSorted.length === 0 ? (
                <p style={{ color: "var(--text-secondary)" }}>
                  No feedback submitted yet.
                </p>
              ) : (
                <div className="feedback-list">
                  {feedbacksSorted.map((feedback) => (
                    <div className="feedback-item" key={feedback._id}>
                      <div className="feedback-meta">
                        <span
                          className={`feedback-pill ${
                            feedback.type === "Positive"
                              ? "positive"
                              : "negative"
                          }`}
                        >
                          {feedback.type}
                        </span>
                        <span className="feedback-by">
                          {feedback.createdByName || "Unknown"}
                        </span>
                        <span className="feedback-date">
                          {formatFeedbackDate(feedback.createdAt)}
                        </span>
                      </div>
                      <p className="feedback-notes">
                        {feedback.notes?.trim()
                          ? feedback.notes
                          : "No notes provided."}
                      </p>
                      {Array.isArray(feedback.attachments) &&
                        feedback.attachments.length > 0 && (
                        <div className="feedback-media-section">
                          <p className="feedback-media-label">Client Media</p>
                          <div className="feedback-media-grid">
                            {feedback.attachments.map((attachment, index) => {
                              const attachmentUrl = resolveFeedbackAttachmentUrl(attachment);
                              if (!attachmentUrl) return null;
                              const attachmentName = getFeedbackAttachmentName(
                                attachment,
                                index,
                              );
                              const attachmentType = getFeedbackAttachmentType(
                                attachment,
                                index,
                              );

                              return (
                                <div
                                  className="feedback-media-card"
                                  key={`${feedback._id || feedback.createdAt}-${attachmentName}-${index}`}
                                >
                                  {attachmentType === "image" && (
                                    <a
                                      href={attachmentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="feedback-media-preview-link"
                                    >
                                      <img
                                        src={attachmentUrl}
                                        alt={attachmentName}
                                        className="feedback-media-image"
                                        loading="lazy"
                                      />
                                    </a>
                                  )}
                                  {attachmentType === "audio" && (
                                    <audio
                                      controls
                                      preload="metadata"
                                      className="feedback-media-audio"
                                    >
                                      <source src={attachmentUrl} />
                                      Your browser does not support audio playback.
                                    </audio>
                                  )}
                                  {attachmentType === "video" && (
                                    <video
                                      controls
                                      preload="metadata"
                                      className="feedback-media-video"
                                    >
                                      <source src={attachmentUrl} />
                                      Your browser does not support video playback.
                                    </video>
                                  )}
                                  {attachmentType === "file" && (
                                    <a
                                      href={attachmentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="feedback-media-file-link"
                                    >
                                      Open Attachment
                                    </a>
                                  )}
                                  <div className="feedback-media-meta">
                                    <span
                                      className="feedback-media-name"
                                      title={attachmentName}
                                    >
                                      {attachmentName}
                                    </span>
                                    <a
                                      href={attachmentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      download
                                      className="feedback-media-download"
                                    >
                                      Download
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quote Checklist (Only for Quote projects) */}
          {project.projectType === "Quote" && (
            <div className="detail-card">
              <h3 className="card-title">Quote Requirements</h3>
              <div className="quote-decision-admin-panel">
                <div
                  className={`quote-decision-admin-status ${
                    quoteDecisionState.status === "go_ahead"
                      ? "is-go-ahead"
                      : quoteDecisionState.status === "declined"
                        ? "is-declined"
                        : "is-pending"
                  }`}
                >
                  Decision: {formatQuoteDecisionStatus(quoteDecisionState.status)}
                </div>

                {quoteDecisionState.validatedAt && (
                  <div className="quote-decision-admin-meta">
                    Validated {formatLastUpdated(quoteDecisionState.validatedAt)}
                  </div>
                )}

                <label className="quote-decision-admin-note">
                  <span>Front Desk / Admin Note (Optional)</span>
                  <textarea
                    rows={2}
                    value={quoteDecisionNoteDraft}
                    onChange={(event) =>
                      setQuoteDecisionNoteDraft(event.target.value)
                    }
                    disabled={quoteDecisionSubmitting}
                    placeholder="Client decision context..."
                  />
                </label>

                <div className="quote-decision-admin-actions">
                  <button
                    type="button"
                    className="quote-decision-admin-btn go-ahead"
                    onClick={() => handleQuoteDecisionValidation("go_ahead")}
                    disabled={
                      quoteDecisionSubmitting || !canValidateQuoteDecision
                    }
                  >
                    {quoteDecisionSubmitting ? "Saving..." : "Client Go Ahead"}
                  </button>
                  <button
                    type="button"
                    className="quote-decision-admin-btn declined"
                    onClick={() => handleQuoteDecisionValidation("declined")}
                    disabled={
                      quoteDecisionSubmitting || !canValidateQuoteDecision
                    }
                  >
                    {quoteDecisionSubmitting ? "Saving..." : "Client Declined"}
                  </button>
                  {quoteDecisionTaken && (
                    <button
                      type="button"
                      className="quote-decision-admin-btn reset"
                      onClick={() => handleQuoteDecisionValidation("pending")}
                      disabled={quoteDecisionSubmitting}
                    >
                      {quoteDecisionSubmitting ? "Saving..." : "Reset"}
                    </button>
                  )}
                </div>

                {!canValidateQuoteDecision && (
                  <div className="quote-decision-admin-meta">
                    Quote decision can only be validated after status reaches
                    Response Sent.
                  </div>
                )}

                {quoteDecisionState.status === "go_ahead" && (
                  <div className="quote-decision-admin-meta">
                    Use <strong>Change Type</strong> in the header to convert this
                    quote to the preferred project type.
                  </div>
                )}
              </div>
              <div className="checklist-admin-grid quote-requirements-admin-grid">
                {quoteRequirementItems.length > 0 ? (
                  quoteRequirementItems.map((item) => {
                    const submittingThisRequirement = quoteRequirementSubmittingKey
                      .startsWith(`${item.key}:`);
                    const selectedStatus =
                      item.status === "not_required" ? "assigned" : item.status;
                    const statusOptions = Array.from(
                      new Set([
                        ...getQuoteRequirementStatusOptionsByKey(
                          item.key,
                          selectedStatus,
                        ),
                        selectedStatus,
                      ]),
                    );
                    const itemClassName = [
                      "checklist-admin-item",
                      "quote-requirement-admin-item",
                      item.isRequired ? "is-required" : "is-not-required",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const toggleClassName = [
                      "quote-requirement-admin-toggle",
                      item.isRequired ? "is-required" : "is-not-required",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <div key={item.key} className={itemClassName}>
                        <div className="quote-requirement-admin-header">
                          <span className="quote-requirement-admin-title">{item.label}</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleChecklistToggle(item.key, item.isRequired)
                            }
                            disabled={submittingThisRequirement}
                            className={toggleClassName}
                          >
                            {item.isRequired ? "Required" : "Not Required"}
                          </button>
                        </div>

                        <div className="quote-requirement-admin-status">
                          Status: {formatQuoteRequirementStatus(item.status)}
                        </div>

                        {item.updatedAt && (
                          <div className="quote-requirement-admin-updated">
                            Updated {formatLastUpdated(item.updatedAt)}
                          </div>
                        )}

                        {item.isRequired ? (
                          <select
                            value={selectedStatus}
                            onChange={(event) =>
                              handleQuoteRequirementTransition(
                                item.key,
                                event.target.value,
                              )
                            }
                            disabled={submittingThisRequirement}
                            className="quote-requirement-admin-select"
                          >
                            {statusOptions.map((statusOption) => (
                              <option key={statusOption} value={statusOption}>
                                {formatQuoteRequirementStatus(statusOption)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="quote-requirement-admin-helper">
                            Enable this requirement to start its workflow.
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="quote-requirement-admin-empty">
                    No checklist requirements.
                  </p>
                )}
              </div>
            </div>
          )}
            </>
          )}

          {activeContentTab === "order" && (
            <>
          {/* Reference Material / Image */}
          {(project.sampleImage ||
            details.sampleImage ||
            (project.attachments && project.attachments.length > 0) ||
            (details.attachments && details.attachments.length > 0)) && (
            <div className="detail-card">
              <h3 className="card-title">Reference Material</h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.5rem",
                  marginTop: "1rem",
                }}
              >
                {/* Unified Attachments Grid */}
                <div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(120px, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    {[
                      // Combine sampleImage (if exists) + all attachments
                      ...(project.sampleImage || details.sampleImage
                        ? [project.sampleImage || details.sampleImage]
                        : []),
                      ...(project.attachments || []),
                      ...(details.attachments || []),
                    ]
                      .map(normalizeAttachment)
                      .filter(Boolean)
                      // Filter out duplicates if any (by path string)
                      .filter(
                        (value, index, self) => self.indexOf(value) === index,
                      )
                      .map((path, idx) => {
                        const isImage =
                          typeof path === "string" &&
                          /\.(jpg|jpeg|png|gif|webp)$/i.test(path);
                        // Safe check for path being a string before split
                        const fileName =
                          typeof path === "string"
                            ? path.split("/").pop()
                            : "File";

                        // Debug log for path issues if any
                        // console.log("Rendering attachment path:", path);

                          return (
                            <div
                              key={idx}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "0.4rem",
                              }}
                            >
                              <Link
                                to={path}
                                target="_blank"
                                rel="noopener noreferrer"
                                reloadDocument
                                style={{
                                  position: "relative",
                                  aspectRatio: "1",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: "10px",
                                  overflow: "hidden",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(255, 255, 255, 0.03)",
                                  textDecoration: "none",
                                  transition: "transform 0.2s",
                                }}
                                onMouseOver={(e) =>
                                  (e.currentTarget.style.transform =
                                    "scale(1.02)")
                                }
                                onMouseOut={(e) =>
                                  (e.currentTarget.style.transform = "scale(1)")
                                }
                                title={fileName}
                              >
                                {isImage ? (
                                  <img
                                    src={path}
                                    alt="attachment"
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      textAlign: "center",
                                      padding: "0.75rem",
                                      color: "var(--text-secondary)",
                                      width: "100%",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <FolderIcon width="28" height="28" />
                                    <div
                                      style={{
                                        marginTop: "0.5rem",
                                        fontSize: "0.75rem",
                                        whiteSpace: "nowrap",
                                        textOverflow: "ellipsis",
                                        overflow: "hidden",
                                        color: "#f8fafc",
                                      }}
                                    >
                                      {fileName}
                                    </div>
                                  </div>
                                )}
                              </Link>
                              <Link
                                to={path}
                                download
                                reloadDocument
                                style={{
                                  fontSize: "0.75rem",
                                  color: "#38bdf8",
                                  textDecoration: "none",
                                  fontWeight: 600,
                                }}
                              >
                                Download
                              </Link>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
          )}

          {mockupUrl && (
            <div className="detail-card">
              <h3 className="card-title">
                Approved Mockup{" "}
                {mockupVersionLabel && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#7c3aed",
                      fontWeight: 700,
                    }}
                  >
                    {mockupVersionLabel}
                  </span>
                )}
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                {mockupApprovalStatus === "pending" && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#9f1239",
                      background: "#fff1f2",
                      border: "1px solid #fda4af",
                      borderRadius: "8px",
                      padding: "0.45rem 0.6rem",
                    }}
                  >
                    Pending client approval.
                  </div>
                )}
                {isMockupClientApproved && mockupApprovedAtLabel && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#166534",
                      background: "#f0fdf4",
                      border: "1px solid #86efac",
                      borderRadius: "8px",
                      padding: "0.45rem 0.6rem",
                    }}
                  >
                    Client approved: {mockupApprovedAtLabel}
                  </div>
                )}
                {isMockupClientRejected && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "#991b1b",
                      background: "#fef2f2",
                      border: "1px solid #fca5a5",
                      borderRadius: "8px",
                      padding: "0.45rem 0.6rem",
                    }}
                  >
                    Client rejected
                    {mockupRejectedAtLabel
                      ? `: ${mockupRejectedAtLabel}`
                      : " this mockup version."}
                  </div>
                )}
                {isMockupClientRejected && mockupRejectionReason && (
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#fca5a5",
                    }}
                  >
                    Reason: {mockupRejectionReason}
                  </div>
                )}
                <div
                  style={{
                    borderRadius: "10px",
                    border: "1px solid var(--border-color)",
                    padding: "0.75rem",
                    background: "rgba(255, 255, 255, 0.03)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <Link
                    to={mockupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    reloadDocument
                    style={{
                      color: "#38bdf8",
                      textDecoration: "none",
                      fontWeight: 600,
                      fontSize: "0.85rem",
                    }}
                  >
                    {mockupName || "View Mockup"}
                  </Link>
                  <Link
                    to={mockupUrl}
                    download
                    reloadDocument
                    style={{
                      fontSize: "0.8rem",
                      color: "#22d3ee",
                      textDecoration: "none",
                      fontWeight: 600,
                    }}
                  >
                    Download
                  </Link>
                </div>
                {mockup.note && (
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Note: {mockup.note}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order Items */}
          <div className="detail-card">
            <h3 className="card-title">
              {/* ... (Header content unchanged) */}
              <span>
                Order Items
                {project.sectionUpdates?.items && (
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: "normal",
                      marginLeft: "0.75rem",
                    }}
                  >
                    (Last Updated:{" "}
                    {formatLastUpdated(project.sectionUpdates.items)})
                  </span>
                )}
              </span>
            </h3>
            <div className="card-scroll-area">
              {project.items && project.items.length > 0 ? (
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Detailed Specs</th>
                      <th>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.items.map((item, i) => (
                      <tr key={i}>
                        <td>{item.description}</td>
                        <td>{item.breakdown || "-"}</td>
                        <td>{item.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>
                  No items listed.
                </p>
              )}
            </div>
          </div>
            </>
          )}

          {activeContentTab === "updates" && (
            <>
          {/* Project Updates */}
          <div className="detail-card">
            <h3 className="card-title">Project Updates</h3>
            <div
              className="updates-list card-scroll-area"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                marginTop: "1rem",
              }}
            >
              {updates && updates.length > 0 ? (
                updates.map((update) => (
                  <div
                    key={update._id}
                    style={{
                      padding: "1rem",
                      background: "rgba(255, 255, 255, 0.03)",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {update.author
                            ? `${update.author.firstName} ${update.author.lastName}`
                            : "System"}
                        </span>
                        <span
                          style={{
                            fontSize: "0.8rem",
                            color: "var(--text-secondary)",
                            background: "rgba(255,255,255,0.1)",
                            padding: "2px 6px",
                            borderRadius: "4px",
                          }}
                        >
                          {update.author?.role || "System"}
                        </span>
                        {update.category && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              border: "1px solid var(--border-color)",
                              padding: "2px 6px",
                              borderRadius: "10px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {update.category}
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {formatLastUpdated(update.createdAt)}
                      </span>
                    </div>

                    <p
                      style={{
                        color: "var(--text-secondary)",
                        fontSize: "0.95rem",
                        whiteSpace: "pre-wrap",
                        margin: 0,
                      }}
                    >
                      {update.content}
                    </p>

                    {update.attachments && update.attachments.length > 0 && (
                      <div
                        style={{
                          marginTop: "0.75rem",
                          paddingTop: "0.75rem",
                          borderTop: "1px solid var(--border-color)",
                        }}
                      >
                        <Link
                          to={update.attachments[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          reloadDocument
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            color: "#6366f1",
                            textDecoration: "none",
                            fontSize: "0.9rem",
                          }}
                        >
                          <DownloadIcon /> {update.attachments[0].name}
                        </Link>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p style={{ color: "var(--text-secondary)" }}>
                  No updates posted yet.
                </p>
              )}
            </div>
          </div>

          {/* Challenges (if any) */}
          {project.challenges && project.challenges.length > 0 && (
            <div className="detail-card">
              <h3 className="card-title">
                <span>
                  Project Challenges
                  {project.sectionUpdates?.challenges && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        fontWeight: "normal",
                        marginLeft: "0.75rem",
                      }}
                    >
                      (Last Updated:{" "}
                      {formatLastUpdated(project.sectionUpdates.challenges)})
                    </span>
                  )}
                </span>
              </h3>
              <div
                className="card-scroll-area"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
              >
                {project.challenges.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "0.5rem",
                      background: "rgba(239, 68, 68, 0.1)",
                      borderRadius: "6px",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                    }}
                  >
                    <p style={{ fontWeight: 600, color: "#fca5a5" }}>
                      {c.title}
                    </p>
                    <p style={{ fontSize: "0.9rem", color: "#f8fafc" }}>
                      {c.description}
                    </p>
                    <span style={{ fontSize: "0.8rem", color: "#fca5a5" }}>
                      Status: {c.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
            </>
          )}
        </div>

        {/* Right Column */}
        <div className="side-info">
          <ProjectRemindersCard project={project} user={user} />
          <div className="detail-card">
            <h3
              className="card-title"
              style={{ justifyContent: "space-between" }}
            >
              <span>People & Departments</span>
              {!isEditingLead ? (
                !isLeadUser && !isProjectOnHold && (
                  <button
                    onClick={() => setIsEditingLead(true)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                    title="Edit Lead"
                  >
                    <PencilIcon width="18" height="18" />
                  </button>
                )
              ) : (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleSaveLead}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#22c55e",
                      cursor: "pointer",
                    }}
                    title="Save"
                  >
                    <CheckCircleIcon width="20" height="20" />
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingLead(false);
                      setLeadForm(
                        project.projectLeadId?._id ||
                          project.projectLeadId ||
                          "",
                      );
                      setAssistantLeadForm(
                        project.assistantLeadId?._id ||
                          project.assistantLeadId ||
                          "",
                      );
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                    }}
                    title="Cancel"
                  >
                    <XMarkIcon width="20" height="20" />
                  </button>
                </div>
              )}
            </h3>
            <div className="info-item" style={{ marginBottom: "1.5rem" }}>
              <label>Project Lead</label>
              {isEditingLead ? (
                <select
                  className="edit-input" // Reuse existing class for styling
                  value={leadForm}
                  onChange={(e) => setLeadForm(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem" }}
                >
                  <option value="">Select a Lead</option>
                  {availableUsers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {`${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                        u.name ||
                        "Unnamed User"}
                    </option>
                  ))}
                </select>
              ) : (
                <p>
                  {project.projectLeadId
                    ? `${project.projectLeadId.firstName} ${project.projectLeadId.lastName}`
                    : details.lead || "Unassigned"}
                </p>
              )}
            </div>

            <div className="info-item" style={{ marginBottom: "1.5rem" }}>
              <label>Assistant Lead</label>
              {isEditingLead ? (
                <select
                  className="edit-input"
                  value={assistantLeadForm}
                  onChange={(e) => setAssistantLeadForm(e.target.value)}
                  style={{ width: "100%", padding: "0.5rem" }}
                >
                  <option value="">None</option>
                  {availableUsers
                    .filter((u) => u._id !== leadForm)
                    .map((u) => (
                      <option key={u._id} value={u._id}>
                        {`${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                          u.name ||
                          "Unnamed User"}
                      </option>
                    ))}
                </select>
              ) : (
                <p>
                  {project.assistantLeadId
                    ? `${project.assistantLeadId.firstName} ${project.assistantLeadId.lastName}`
                    : "None"}
                </p>
              )}
            </div>

            <div className="info-item" style={{ marginBottom: "1.5rem" }}>
              <label>Order Group Leads</label>
              {groupedLeadRows.length > 0 ? (
                <div style={{ display: "grid", gap: "0.35rem", marginTop: "0.5rem" }}>
                  {groupedLeadRows.map((entry) => (
                    <p key={entry.key} style={{ margin: 0 }}>
                      {entry.display}
                    </p>
                  ))}
                </div>
              ) : (
                <p>Unassigned</p>
              )}
            </div>

            <div className="info-item">
              <label>
                Engaged Departments
                {project.sectionUpdates?.departments && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: "normal",
                      marginTop: "0.25rem",
                      marginBottom: "0.5rem",
                      textTransform: "none",
                      letterSpacing: 0,
                    }}
                  >
                    Updated:{" "}
                    {formatLastUpdated(project.sectionUpdates.departments)}
                  </div>
                )}
              </label>
              <div style={{ marginTop: "0.5rem" }}>
                {project.departments && project.departments.length > 0 ? (
                  project.departments.map((dept, i) => {
                    const isAcknowledged = project.acknowledgements?.some(
                      (a) => a.department === dept,
                    );
                    return (
                      <span
                        key={i}
                        className={`dept-tag ${isAcknowledged ? "acknowledged" : ""}`}
                      >
                        {dept}
                        {isAcknowledged && (
                          <span
                            style={{ marginLeft: "4px", fontSize: "0.7rem" }}
                          >
                            ✓
                          </span>
                        )}
                        {isAcknowledged && user?.role === "admin" && !isLeadUser && (
                          <button
                            type="button"
                            className="dept-undo-btn"
                            onClick={() => handleUndoAcknowledgement(dept)}
                            disabled={undoingDept === dept}
                            title="Undo acknowledgement"
                          >
                            {undoingDept === dept ? "Undoing..." : "Undo"}
                          </button>
                        )}
                      </span>
                    );
                  })
                ) : (
                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    None
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Risks / Factors */}
          {(project.uncontrollableFactors?.length > 0 ||
            project.productionRisks?.length > 0) && (
            <div className="detail-card">
              <h3 className="card-title">Risks & Factors</h3>
              {project.uncontrollableFactors?.length > 0 && (
                <div style={{ marginBottom: "1rem" }}>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Uncontrollable Factors
                    {project.sectionUpdates?.uncontrollableFactors && (
                      <span
                        style={{
                          fontWeight: "normal",
                          marginLeft: "0.5rem",
                          opacity: 0.8,
                        }}
                      >
                        (
                        {formatLastUpdated(
                          project.sectionUpdates.uncontrollableFactors,
                        )}
                        )
                      </span>
                    )}
                  </label>
                  <ul
                    style={{
                      paddingLeft: "1.2rem",
                      margin: "0.5rem 0",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {project.uncontrollableFactors.map((f, i) => (
                      <li key={i}>{f.description}</li>
                    ))}
                  </ul>
                </div>
              )}
              {project.productionRisks?.length > 0 && (
                <div>
                  <label
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    Production Risks
                    {project.sectionUpdates?.productionRisks && (
                      <span
                        style={{
                          fontWeight: "normal",
                          marginLeft: "0.5rem",
                          opacity: 0.8,
                        }}
                      >
                        (
                        {formatLastUpdated(
                          project.sectionUpdates.productionRisks,
                        )}
                        )
                      </span>
                    )}
                  </label>
                  <ul
                    style={{
                      paddingLeft: "1.2rem",
                      margin: "0.5rem 0",
                      color: "var(--text-primary)",
                      fontSize: "0.9rem",
                    }}
                  >
                    {project.productionRisks.map((r, i) => (
                      <li key={i}>{r.description}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <BillingGuardModal
        isOpen={billingGuardModal.open}
        onClose={closeBillingGuardModal}
        onOverride={handleBillingGuardOverride}
        canOverride={billingGuardModal.canOverride}
        isSubmitting={billingGuardSubmitting}
        title={billingGuardModal.title}
        overrideButtonText={billingGuardModal.overrideButtonText}
        message={billingGuardModal.message}
        missingLabels={billingGuardModal.missingLabels}
        orderId={project?.orderId}
        projectName={details?.projectName}
      />

      <ProjectHoldModal
        isOpen={isHoldModalOpen}
        onClose={() => {
          if (!isTogglingHold) {
            setIsHoldModalOpen(false);
          }
        }}
        onConfirm={(reason) => {
          setHoldReasonDraft(reason);
          handleProjectHoldToggle(true, reason);
        }}
        defaultReason={holdReasonDraft}
        isSubmitting={isTogglingHold}
      />

      <ProjectCancelModal
        isOpen={isCancelModalOpen}
        onClose={closeCancelModal}
        onConfirm={handleCancelProject}
        reason={cancelReasonDraft}
        onReasonChange={setCancelReasonDraft}
        isSubmitting={isCancelling}
        errorMessage={cancelError}
      />

      <ProjectReactivateModal
        isOpen={isReactivateModalOpen}
        onClose={closeReactivateModal}
        onConfirm={handleReactivateProject}
        isSubmitting={isReactivating}
        orderId={project?.orderId}
        projectName={project?.details?.projectName}
        frozenStage={project?.cancellation?.resumedStatus || project?.status}
        errorMessage={reactivateError}
      />

      <ProjectTypeChangeModal
        isOpen={isProjectTypeModalOpen}
        onClose={closeProjectTypeModal}
        onConfirm={handleProjectTypeChange}
        isSubmitting={isChangingProjectType}
        errorMessage={projectTypeChangeError}
        orderId={project?.orderId}
        projectName={project?.details?.projectName}
        currentType={project?.projectType}
        currentStatus={project?.status}
        currentPriority={project?.priority}
        currentSampleRequired={Boolean(project?.sampleRequirement?.isRequired)}
        currentCorporateEmergency={Boolean(project?.corporateEmergency?.isEnabled)}
      />
    </div>
  );
};

export default ProjectDetails;
