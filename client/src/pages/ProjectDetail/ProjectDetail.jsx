import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Link,
  useParams,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { DEPARTMENTS, getDepartmentLabel } from "../../constants/departments";
import "./ProjectDetail.css";
import UserAvatar from "../../components/ui/UserAvatar";
import BackArrow from "../../components/icons/BackArrow";
import EditIcon from "../../components/icons/EditIcon";
import LocationIcon from "../../components/icons/LocationIcon";
import CalendarIcon from "../../components/icons/CalendarIcon";
import ClockIcon from "../../components/icons/ClockIcon";
import WarningIcon from "../../components/icons/WarningIcon";
import CheckIcon from "../../components/icons/CheckIcon";
import FolderIcon from "../../components/icons/FolderIcon";
import TrashIcon from "../../components/icons/TrashIcon"; // Import TrashIcon
import Toast from "../../components/ui/Toast";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import ConfirmationModal from "../../components/ui/ConfirmationModal";
import ProjectUpdates from "./ProjectUpdates";
import ProjectChallenges from "./ProjectChallenges";
import ProjectActivity from "./ProjectActivity";
import ProgressDonutIcon from "../../components/icons/ProgressDonutIcon";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ClipboardListIcon from "../../components/icons/ClipboardListIcon";
import EyeIcon from "../../components/icons/EyeIcon";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import {
  getGroupedLeadDisplayRows,
  getLeadAvatarUrl,
  getLeadDisplay,
  getFullName,
} from "../../utils/leadDisplay";
import { renderProjectName } from "../../utils/projectName";
import {
  mergeProductionRiskSuggestions,
  requestProductionRiskSuggestions,
} from "../../utils/productionRiskAi";
import {
  normalizeReferenceAttachments,
  getReferenceFileName,
} from "../../utils/referenceAttachments";
import ProductionRiskSuggestionModal from "../../components/features/ProductionRiskSuggestionModal";
import ProjectReminderPanel from "../../components/features/ProjectReminderPanel";
// Lazy Load PDF Component
const ProjectPdfDownload = React.lazy(
  () => import("../../components/features/ProjectPdfDownload"),
);
import PaintbrushIcon from "../../components/icons/PaintbrushIcon";
import FactoryIcon from "../../components/icons/FactoryIcon";
import PackageIcon from "../../components/icons/PackageIcon";
import TruckIcon from "../../components/icons/TruckIcon";
import CheckCircleIcon from "../../components/icons/CheckCircleIcon";

const STATUS_STEPS = [
  { label: "Order Confirmed", statuses: ["Order Confirmed"] },
  {
    label: "Scope Approval",
    statuses: ["Pending Scope Approval", "Scope Approval Completed"],
  },
  {
    label: "Departmental Meeting",
    statuses: ["Pending Departmental Meeting"],
  },
  {
    label: "Departmental Engagement",
    statuses: [
      "Pending Departmental Engagement",
      "Departmental Engagement Completed",
    ],
  },
  { label: "Mockup", statuses: ["Pending Mockup", "Mockup Completed"] },
  {
    label: "Master Approval",
    statuses: ["Pending Master Approval", "Master Approval Completed"],
  },
  {
    label: "Production",
    statuses: ["Pending Production", "Production Completed"],
  },
  {
    label: "Quality Control",
    statuses: ["Pending Quality Control", "Quality Control Completed"],
  },
  {
    label: "Photography",
    statuses: ["Pending Photography", "Photography Completed"],
  },
  {
    label: "Packaging",
    statuses: ["Pending Packaging", "Packaging Completed"],
  },
  {
    label: "Delivery/Pickup",
    statuses: ["Pending Delivery/Pickup", "Delivered"],
  },
  {
    label: "Feedback",
    statuses: ["Pending Feedback", "Feedback Completed"],
  },
];

const QUOTE_STEPS = [
  { label: "Order Confirmed", statuses: ["Order Confirmed"] },
  {
    label: "Scope Approval",
    statuses: ["Pending Scope Approval", "Scope Approval Completed"],
  },
  {
    label: "Departmental Meeting",
    statuses: ["Pending Departmental Meeting"],
  },
  {
    label: "Departmental Engagement",
    statuses: [
      "Pending Departmental Engagement",
      "Departmental Engagement Completed",
    ],
  },
  {
    label: "Quote Request",
    statuses: ["Pending Quote Request", "Quote Request Completed"],
  },
  {
    label: "Send Response",
    statuses: ["Pending Send Response", "Response Sent"],
  },
];

const DEFAULT_WORKFLOW_STATUS = "Order Confirmed";

const STANDARD_WORKFLOW_STATUSES = new Set([
  "Order Confirmed",
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
]);

const DELIVERY_COMPLETED_STATUS_KEYS = new Set([
  "delivered",
  "pending feedback",
  "feedback completed",
  "completed",
  "finished",
]);

const QUOTE_WORKFLOW_STATUSES = new Set([
  "Order Confirmed",
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
  "Delivered",
]);

const resolveWorkflowStatus = (project) => {
  const isProjectOnHold = Boolean(
    project?.hold?.isOnHold || project?.status === "On Hold",
  );

  if (!isProjectOnHold) {
    return project?.status || DEFAULT_WORKFLOW_STATUS;
  }

  const previousStatus =
    typeof project?.hold?.previousStatus === "string"
      ? project.hold.previousStatus.trim()
      : "";

  if (!previousStatus || previousStatus === "On Hold") {
    return DEFAULT_WORKFLOW_STATUS;
  }

  const validStatuses =
    project?.projectType === "Quote"
      ? QUOTE_WORKFLOW_STATUSES
      : STANDARD_WORKFLOW_STATUSES;

  return validStatuses.has(previousStatus)
    ? previousStatus
    : DEFAULT_WORKFLOW_STATUS;
};

const getStatusColor = (status) => {
  switch (status) {
    case "Order Confirmed":
      return "#94a3b8"; // Slate
    case "Pending Scope Approval":
    case "Scope Approval Completed":
    case "Scope Approval":
      return "#f97316"; // Orange
    case "Pending Departmental Meeting":
    case "Departmental Meeting":
      return "#fb923c"; // Orange-light
    case "Pending Departmental Engagement":
    case "Departmental Engagement Completed":
    case "Departmental Engagement":
      return "#f59e0b"; // Amber
    case "Pending Mockup":
    case "Mockup Completed":
    case "Mockup":
      return "#a855f7"; // Purple
    case "Pending Master Approval":
    case "Master Approval Completed":
    case "Master Approval":
      return "#ec4899"; // Pink
    case "Pending Production":
    case "Production Completed":
    case "Production":
      return "#3b82f6"; // Blue
    case "Pending Quality Control":
    case "Quality Control Completed":
    case "Quality Control":
      return "#10b981"; // Emerald
    case "Pending Photography":
    case "Photography Completed":
    case "Photography":
      return "#0ea5e9"; // Sky
    case "Pending Packaging":
    case "Packaging Completed":
    case "Packaging":
      return "#6366f1"; // Indigo
    case "Pending Delivery/Pickup":
    case "Delivered":
    case "Delivery/Pickup":
      return "#14b8a6"; // Teal
    case "Pending Feedback":
    case "Feedback Completed":
    case "Feedback":
      return "#06b6d4"; // Cyan
    case "Completed":
    case "Finished":
      return "#22c55e"; // Green
    case "Pending Quote Request":
    case "Quote Request Completed":
    case "Quote Request":
      return "#eab308"; // Yellow/Gold
    case "Pending Send Response":
    case "Response Sent":
    case "Send Response":
      return "#6366f1"; // Indigo
    default:
      return "#cbd5e1"; // Grey
  }
};

const formatProjectStatusForDisplay = (status = "", projectType = "") => {
  const normalized = String(status || "").trim();
  if (projectType !== "Quote") return normalized;
  if (normalized === "Pending Feedback") return "Pending Decision";
  if (normalized === "Feedback Completed") return "Decision Completed";
  return normalized;
};

const BILLING_REQUIREMENT_LABELS = {
  invoice: "Invoice confirmation",
  payment_verification_any: "Payment method verification",
  full_payment_or_authorized:
    "Full payment or authorization verification",
};
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
    quoteDetails?.requirementItems &&
    typeof quoteDetails.requirementItems === "object"
      ? quoteDetails.requirementItems
      : {};

  return QUOTE_REQUIREMENT_KEYS.map((key) => {
    const rawItem =
      rawItems?.[key] && typeof rawItems[key] === "object" ? rawItems[key] : {};
    const isRequired = Boolean(checklist[key]);
    const normalizedStatus = String(rawItem?.status || "").trim().toLowerCase();
    const status = isRequired ? normalizedStatus || "assigned" : "not_required";

    return {
      key,
      label: QUOTE_REQUIREMENT_LABELS[key] || key,
      isRequired,
      status,
      updatedAt: rawItem?.updatedAt || null,
      note: String(rawItem?.note || "").trim(),
    };
  });
};

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

const getMockupVersions = (mockup = {}) => {
  const rawVersions = Array.isArray(mockup?.versions) ? mockup.versions : [];
  const normalized = rawVersions
    .map((entry, index) => {
      const parsedVersion = Number.parseInt(entry?.version, 10);
      const version =
        Number.isFinite(parsedVersion) && parsedVersion > 0
          ? parsedVersion
          : index + 1;
      const approvalStatus = getMockupApprovalStatus(entry?.clientApproval || {});
      return {
        entryId: entry?._id || entry?.id || null,
        version,
        fileUrl: String(entry?.fileUrl || "").trim(),
        fileName: String(entry?.fileName || "").trim(),
        fileType: String(entry?.fileType || "").trim(),
        note: String(entry?.note || "").trim(),
        uploadedAt: entry?.uploadedAt || null,
        clientApproval: {
          status: approvalStatus,
          approvedAt: entry?.clientApproval?.approvedAt || null,
          rejectedAt: entry?.clientApproval?.rejectedAt || null,
          rejectionReason: String(
            entry?.clientApproval?.rejectionReason ||
              entry?.clientApproval?.note ||
              "",
          ).trim(),
        },
      };
    })
    .filter((entry) => entry.fileUrl);

  if (normalized.length === 0 && mockup?.fileUrl) {
    const parsedVersion = Number.parseInt(mockup?.version, 10);
    const version =
      Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
    const approvalStatus = getMockupApprovalStatus(mockup?.clientApproval || {});
    normalized.push({
      entryId: mockup?._id || mockup?.id || null,
      version,
      fileUrl: String(mockup.fileUrl || "").trim(),
      fileName: String(mockup.fileName || "").trim(),
      fileType: String(mockup.fileType || "").trim(),
      note: String(mockup.note || "").trim(),
      uploadedAt: mockup.uploadedAt || null,
      clientApproval: {
        status: approvalStatus,
        approvedAt: mockup?.clientApproval?.approvedAt || null,
        rejectedAt: mockup?.clientApproval?.rejectedAt || null,
        rejectionReason: String(
          mockup?.clientApproval?.rejectionReason ||
            mockup?.clientApproval?.note ||
            "",
        ).trim(),
      },
    });
  }

  return normalized.sort((left, right) => {
    if (left.version !== right.version) return left.version - right.version;
    const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
    const rightTime = right.uploadedAt ? new Date(right.uploadedAt).getTime() : 0;
    return leftTime - rightTime;
  });
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

const BATCH_PRODUCED_STATUS_SET = new Set([
  "produced",
  "in_packaging",
  "packaged",
  "delivered",
]);
const BATCH_PACKAGED_STATUS_SET = new Set(["packaged", "delivered"]);
const BATCH_DELIVERED_STATUS_SET = new Set(["delivered"]);

const normalizeBatchStatus = (value) =>
  String(value || "").trim().toLowerCase();
const sumProjectItemQty = (items = []) =>
  (Array.isArray(items) ? items : []).reduce(
    (acc, item) => acc + (Number(item?.qty) || 0),
    0,
  );
const sumBatchItemQty = (batches = [], statusSet = null) =>
  (Array.isArray(batches) ? batches : []).reduce((acc, batch) => {
    if (!batch || batch.status === "cancelled") return acc;
    const status = normalizeBatchStatus(batch?.status);
    if (statusSet && !statusSet.has(status)) return acc;
    (Array.isArray(batch.items) ? batch.items : []).forEach((entry) => {
      acc += Number(entry?.qty) || 0;
    });
    return acc;
  }, 0);
const buildBatchProgress = (project) => {
  const items = Array.isArray(project?.items) ? project.items : [];
  const batches = Array.isArray(project?.batches) ? project.batches : [];
  const totalQty = sumProjectItemQty(items);
  const allocatedQty = sumBatchItemQty(batches);
  const producedQty = sumBatchItemQty(batches, BATCH_PRODUCED_STATUS_SET);
  const packagedQty = sumBatchItemQty(batches, BATCH_PACKAGED_STATUS_SET);
  const deliveredQty = sumBatchItemQty(batches, BATCH_DELIVERED_STATUS_SET);
  const percent = (value) =>
    totalQty > 0 ? Math.round((value / totalQty) * 100) : 0;

  return {
    totalQty,
    allocatedQty,
    producedQty,
    packagedQty,
    deliveredQty,
    allocatedPercent: percent(allocatedQty),
    producedPercent: percent(producedQty),
    packagedPercent: percent(packagedQty),
    deliveredPercent: percent(deliveredQty),
  };
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

const formatBillingRequirementLabels = (missing = []) =>
  (Array.isArray(missing) ? missing : [])
    .map((item) => BILLING_REQUIREMENT_LABELS[item] || item)
    .filter(Boolean);

const normalizeStatusKey = (value) => String(value || "")
  .trim()
  .toLowerCase();

const isDeliveryCompletedStatus = (status) => {
  const normalized = normalizeStatusKey(status);
  if (!normalized) return false;
  if (DELIVERY_COMPLETED_STATUS_KEYS.has(normalized)) return true;
  if (normalized.startsWith("delivered")) return true;
  if (normalized.startsWith("pending feedback")) return true;
  if (normalized.startsWith("feedback completed")) return true;
  if (normalized.includes("delivery") && normalized.includes("complete")) {
    return true;
  }
  return false;
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

const getPendingProductionBillingMissing = ({ invoiceSent, paymentTypes }) => {
  const missing = [];
  if (!invoiceSent) missing.push("invoice");
  if (!paymentTypes || paymentTypes.size === 0) {
    missing.push("payment_verification_any");
  }
  return missing;
};

const getPendingDeliveryBillingMissing = ({ paymentTypes }) => {
  const missing = [];
  if (!paymentTypes?.has("full_payment") && !paymentTypes?.has("authorized")) {
    missing.push("full_payment_or_authorized");
  }
  return missing;
};

const toEntityId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return "";
};

const formatMeetingStatus = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "Not Scheduled";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatMeetingDateTime = (value) => {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBD";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatMeetingOffset = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value % 1440 === 0) {
    const days = value / 1440;
    return `${days} day${days === 1 ? "" : "s"} before`;
  }
  if (value % 60 === 0) {
    const hours = value / 60;
    return `${hours} hour${hours === 1 ? "" : "s"} before`;
  }
  return `${value} mins before`;
};

const ProjectDetail = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabParam || "Overview");
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orderGroupProjects, setOrderGroupProjects] = useState([]);
  const [orderMeeting, setOrderMeeting] = useState(null);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingError, setMeetingError] = useState("");
  const [updatesCount, setUpdatesCount] = useState(0); // [New] Updates count for tab badge
  const [countdownNowMs, setCountdownNowMs] = useState(Date.now());
  const currentUserId = toEntityId(user?._id || user?.id);
  const projectLeadUserId = toEntityId(project?.projectLeadId);
  const isProjectLead = Boolean(
    currentUserId && projectLeadUserId && currentUserId === projectLeadUserId,
  );
  const isMeetingRequired = useMemo(
    () =>
      project?.projectType === "Corporate Job" || orderGroupProjects.length > 1,
    [project?.projectType, orderGroupProjects.length],
  );
  const deliveryDateValue = project?.details?.deliveryDate;
  const deliveryTimeValue = project?.details?.deliveryTime;
  const deliveryDeadline = useMemo(
    () => buildDeliveryDeadline(deliveryDateValue, deliveryTimeValue),
    [deliveryDateValue, deliveryTimeValue],
  );

  // PDF Image Processing & Form Data removed - moved to ProjectPdfDownload component
  const fetchOrderGroupProjects = async (orderNumber, fallbackProject = null) => {
    const normalizedOrder = String(orderNumber || "").trim();
    if (!normalizedOrder) {
      setOrderGroupProjects(fallbackProject ? [fallbackProject] : []);
      return;
    }

    try {
      const res = await fetch(
        `/api/projects/orders/${encodeURIComponent(normalizedOrder)}?collapseRevisions=true`,
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
    } catch (groupError) {
      console.error("Failed to load grouped order projects", groupError);
      setOrderGroupProjects(fallbackProject ? [fallbackProject] : []);
    }
  };

  const fetchOrderMeeting = async (orderNumber) => {
    const normalizedOrder = String(orderNumber || "").trim();
    if (!normalizedOrder) {
      setOrderMeeting(null);
      setMeetingError("");
      return;
    }

    setMeetingLoading(true);
    setMeetingError("");
    try {
      const res = await fetch(
        `/api/meetings/order/${encodeURIComponent(normalizedOrder)}`,
      );
      if (!res.ok) {
        if (res.status === 404) {
          setOrderMeeting(null);
          return;
        }
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to fetch meeting.");
      }
      const data = await res.json();
      setOrderMeeting(data?.meeting || null);
    } catch (meetingFetchError) {
      console.error("Failed to load meeting:", meetingFetchError);
      setMeetingError(meetingFetchError.message || "Failed to fetch meeting.");
      setOrderMeeting(null);
    } finally {
      setMeetingLoading(false);
    }
  };

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const data = await res.json();
      setProject(data);
      await fetchOrderGroupProjects(data?.orderId, data);
      await fetchOrderMeeting(data?.orderId || data?.orderRef?.orderNumber);
    } catch (err) {
      console.error(err);
      setError("Could not load project details");
    } finally {
      setLoading(false);
    }
  };

  const fetchUpdatesCount = async () => {
    try {
      const res = await fetch(`/api/updates/project/${id}`);
      if (res.ok) {
        const data = await res.json();
        setUpdatesCount(data.length);
      }
    } catch (err) {
      console.error("Error fetching updates count:", err);
    }
  };

  useEffect(() => {
    if (id) fetchProject();
  }, [id]);

  // [New] Fetch updates count
  useEffect(() => {
    if (id) fetchUpdatesCount();
  }, [id]);

  useEffect(() => {
    const activeWorkflowStatus = resolveWorkflowStatus(project);
    const hasValidDeliveryDeadline =
      deliveryDeadline && !Number.isNaN(deliveryDeadline.getTime());
    const shouldRunCountdown =
      hasValidDeliveryDeadline &&
      !isDeliveryCompletedStatus(project?.status) &&
      !isDeliveryCompletedStatus(activeWorkflowStatus);

    if (!shouldRunCountdown) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      setCountdownNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, [deliveryDeadline, project]);

  useRealtimeRefresh(
    () => {
      if (id) {
        fetchProject();
        fetchUpdatesCount();
      }
    },
    { enabled: Boolean(id) },
  );

  const handleFinishProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Finished" }),
      });

      if (res.ok) {
        // Force refresh or redirect to history
        navigate("/history");
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to finish project", errorData);
        alert(
          errorData.message ||
            "Failed to mark project as finished. Make sure it is 'Completed'.",
        );
      }
    } catch (err) {
      console.error("Error finishing project:", err);
    }
  };

  // Status update logic removed - Admin only feature now.
  // const [advancing, setAdvancing] = useState(false);

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

  if (loading)
    return (
      <div
        className="project-detail-container"
        style={{ justifyContent: "center", alignItems: "center" }}
      >
        <LoadingSpinner />
      </div>
    );
  if (error)
    return (
      <div className="project-detail-container">
        <p style={{ padding: "2rem", color: "red" }}>{error}</p>
      </div>
    );
  if (!project) return null;

  const isProjectOnHold = Boolean(
    project.hold?.isOnHold || project.status === "On Hold",
  );
  const workflowStatus = resolveWorkflowStatus(project);
  const isDeliveryCompleted =
    isDeliveryCompletedStatus(project?.status) ||
    isDeliveryCompletedStatus(workflowStatus);
  const deadlineMs = deliveryDeadline?.getTime?.();
  const deliveredAtSource = Number.isFinite(deadlineMs)
    ? deliveryDeadline
    : project?.details?.deliveryDate || project?.updatedAt;
  const deliveredAtLabel = isDeliveryCompleted
    ? formatDeliveryStatusDate(deliveredAtSource)
    : "";

  const isEmergency =
    project.priority === "Urgent" || project.projectType === "Emergency";
  const isCorporate = project.projectType === "Corporate Job";
  const isQuote = project.projectType === "Quote";
  const projectStatusDisplay = formatProjectStatusForDisplay(
    project.status,
    project.projectType,
  );
  const showFeedbackSection = [
    "Delivered",
    "Pending Feedback",
    "Feedback Completed",
    "Completed",
    "Finished",
  ].includes(project.status);
  const paymentLabels = {
    part_payment: "Part Payment",
    full_payment: "Full Payment",
    po: "P.O",
    authorized: "Authorized",
  };
  const paymentTypes = (project.paymentVerifications || []).map(
    (entry) => entry.type,
  );
  const paymentTypeSet = new Set(paymentTypes);
  const invoiceSent = Boolean(project.invoice?.sent);
  const parsedVersion = Number(project.versionNumber);
  const projectVersion =
    Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
  const showVersionTag = projectVersion > 1;
  const pendingProductionMissing = !isQuote
    ? getPendingProductionBillingMissing({
        invoiceSent,
        paymentTypes: paymentTypeSet,
      })
    : [];
  const pendingDeliveryMissing = !isQuote
    ? getPendingDeliveryBillingMissing({ paymentTypes: paymentTypeSet })
    : [];
  const pendingProductionMissingLabels = formatBillingRequirementLabels(
    pendingProductionMissing,
  );
  const pendingDeliveryMissingLabels = formatBillingRequirementLabels(
    pendingDeliveryMissing,
  );
  const showPendingProductionWarning =
    !isQuote &&
    ["Pending Master Approval", "Pending Production"].includes(project.status) &&
    pendingProductionMissing.length > 0;
  const showPendingDeliveryWarning =
    !isQuote &&
    ["Pending Packaging", "Pending Delivery/Pickup"].includes(project.status) &&
    pendingDeliveryMissing.length > 0;
  const sampleRequirementEnabled =
    !isQuote && Boolean(project?.sampleRequirement?.isRequired);
  const corporateEmergencyEnabled =
    isCorporate && Boolean(project?.corporateEmergency?.isEnabled);
  const sampleApprovalStatus = getSampleApprovalStatus(
    project?.sampleApproval || {},
  );
  const showPendingSampleApprovalWarning =
    sampleRequirementEnabled &&
    project.status === "Pending Production" &&
    sampleApprovalStatus !== "approved";
  const hasSpecialRequirementAwareness =
    sampleRequirementEnabled || corporateEmergencyEnabled;
  const specialRequirementWatermarkText = [
    corporateEmergencyEnabled ? "Corporate Emergency" : "",
    sampleRequirementEnabled ? "Sample Approval Required" : "",
  ]
    .filter(Boolean)
    .join(" • ");

  let themeClass = "";
  if (isEmergency) themeClass = "emergency-theme";
  else if (isCorporate) themeClass = "corporate-theme";
  else if (isQuote) themeClass = "quote-theme";

  return (
    <div className={`project-detail-container ${themeClass}`}>
      {hasSpecialRequirementAwareness && (
        <div className="project-special-watermark" aria-hidden="true">
          {specialRequirementWatermarkText}
        </div>
      )}
      {isEmergency && (
        <div className="project-type-banner emergency">
          🔥 EMERGENCY PROJECT
        </div>
      )}
      {isCorporate && (
        <div className="project-type-banner corporate">
          🏢 CORPORATE JOB
        </div>
      )}
      {isQuote && (
        <div className="project-type-banner quote">
          📜 QUOTE REQUEST
        </div>
      )}
      <header className="project-header">
        <div className="header-top">
          <div className="header-left">
            <button className="back-button" onClick={() => navigate(-1)}>
              <BackArrow />
            </button>
            <h1 className="project-title">
              {project.orderId || "Untitled"}
              {showVersionTag && (
                <span className="project-version-badge">v{projectVersion}</span>
              )}
                <span className="status-badge">
                  <ClockIcon width="14" height="14" />{" "}
                  {projectStatusDisplay === "Order Confirmed"
                    ? "WAITING ACCEPTANCE"
                    : projectStatusDisplay.startsWith("Pending ")
                      ? projectStatusDisplay.replace("Pending ", "")
                      : projectStatusDisplay}
                </span>
              {project.status === "Completed" && (
                <button
                  className="btn-primary"
                  onClick={() => handleFinishProject()}
                  style={{
                    marginLeft: "1rem",
                    padding: "0.4rem 0.8rem",
                    fontSize: "0.75rem",
                    backgroundColor: "var(--success)",
                  }}
                >
                  Mark as Finished
                </button>
              )}
            </h1>
          </div>

          {isDeliveryCompleted ? (
            <div
              className="delivery-countdown-badge is-delivered"
              role="status"
              aria-live="polite"
            >
              <span className="delivery-countdown-title">Delivery Completed</span>
              <span className="delivery-delivered-at">
                Delivered at {deliveredAtLabel}
              </span>
            </div>
          ) : (
            <div
              className={`delivery-countdown-badge ${deliveryCountdown.isNearDelivery ? "is-near-delivery" : ""} ${deliveryCountdown.isOverdue ? "is-overdue" : ""}`}
              role="status"
              aria-live="polite"
            >
              <span className="delivery-countdown-title">
                {deliveryCountdown.isOverdue
                  ? "Delivery Overdue"
                  : "Delivery Countdown"}
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
          )}

          <div className="header-top-actions">
            {/* PDF Download Button - Lazy Loaded */}
            {project && (
              <React.Suspense
                fallback={
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                    Loading PDF...
                  </span>
                }
              >
                <ProjectPdfDownload project={project} />
              </React.Suspense>
            )}

            {/* Only show Edit if NOT pending acceptance and NOT completed */}
          </div>
        </div>

        <div className="billing-tags">
          {corporateEmergencyEnabled && (
            <span className="billing-tag corporate-emergency">
              Corporate Emergency
            </span>
          )}
          {sampleRequirementEnabled && (
            <span
              className={`billing-tag ${
                sampleApprovalStatus === "approved" ? "invoice" : "sample-required"
              }`}
            >
              {sampleApprovalStatus === "approved"
                ? "Sample Approval Required (Approved)"
                : "Sample Approval Required"}
            </span>
          )}
          {invoiceSent && (
            <span className="billing-tag invoice">
              {isQuote ? "Quote Sent" : "Invoice Sent"}
            </span>
          )}
          {!isQuote &&
            paymentTypes.map((type) => (
              <span key={type} className="billing-tag payment">
                {paymentLabels[type] || type}
              </span>
            ))}
          {showPendingSampleApprovalWarning && (
            <span className="billing-tag caution">
              Sample Approval Pending
            </span>
          )}
          {showPendingProductionWarning && (
            <span className="billing-tag caution">
              Pending Production Blocked: {pendingProductionMissingLabels.join(", ")}
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
        {showPendingSampleApprovalWarning && (
          <div className="payment-warning critical">
            Caution: client sample approval is pending before Production can be completed.
          </div>
        )}
        {showPendingDeliveryWarning && (
          <div className="payment-warning critical">
            Caution: before moving to Pending Delivery/Pickup, confirm{" "}
            {pendingDeliveryMissingLabels.join(", ")}.
          </div>
        )}

        {/* Acceptance Banner */}
        {project.status === "Order Confirmed" && (
          <div className="acceptance-banner">
            <div>
              <h3 className="acceptance-banner-title">
                Project Waiting Acceptance
              </h3>
              <p className="acceptance-banner-subtitle">
                Review the details below. You must accept this project to start
                work.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                const route =
                  project.projectType === "Quote"
                    ? `/create/quote-wizard?edit=${project._id}`
                    : `/create/wizard?edit=${project._id}`;
                navigate(route);
              }}
              style={{ backgroundColor: "#ea580c" }}
            >
              Accept Project
            </button>
          </div>
        )}

        <div className="project-subtitle">
          {renderProjectName(project.details, null, "Untitled Project")}
        </div>
        <nav className="header-nav">
          {["Overview", "Updates", "Challenges", "Activities"].map((tab) => (
            <Link
              key={tab}
              to="#"
              className={`nav-item ${activeTab === tab ? "active" : ""}`}
              onClick={(event) => {
                event.preventDefault();
                setActiveTab(tab);
              }}
            >
              {tab}
              {tab === "Updates" && updatesCount > 0 && (
                <span
                  style={{
                    marginLeft: "0.4rem",
                    backgroundColor:
                      activeTab === "Updates" ? "white" : "#3b82f6",
                    color: activeTab === "Updates" ? "#3b82f6" : "white",
                    padding: "2px 6px",
                    borderRadius: "999px",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                  }}
                >
                  {updatesCount}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </header>

      <main className="project-content">
        {activeTab === "Overview" && (
          <>
            <div className="main-column">
              <ProjectInfoCard
                project={project}
                orderGroupProjects={orderGroupProjects}
                currentUserId={currentUserId}
              />
              {project.projectType === "Quote" && (
                <QuoteChecklistCard project={project} />
              )}
              {showFeedbackSection && (
                <FeedbackCard feedbacks={project.feedbacks} />
              )}
              <DepartmentsCard
                departments={project.departments}
                acknowledgements={project.acknowledgements}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Finished" ||
                  project.status === "Order Confirmed"
                }
              />
              <OrderItemsCard
                items={project.items}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={true}
              />
              <ReferenceMaterialsCard project={project} />
              <ApprovedMockupCard
                project={project}
                hideRejected={isProjectLead}
              />
              <RisksCard
                risks={project.uncontrollableFactors}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Finished" ||
                  project.status === "Order Confirmed"
                }
              />
              <ProductionRisksCard
                risks={project.productionRisks}
                project={project}
                projectId={project._id}
                onUpdate={fetchProject}
                readOnly={
                  project.status === "Finished" ||
                  project.status === "Order Confirmed"
                }
              />
            </div>
            <div className="side-column">
              <OrderMeetingDetailsCard
                meeting={orderMeeting}
                required={isMeetingRequired}
                loading={meetingLoading}
                error={meetingError}
              />
              <ProjectReminderPanel project={project} user={user} />
              <ProgressCard
                project={project}
                workflowStatus={workflowStatus}
                isOnHold={isProjectOnHold}
              />
              {/* Quick Actions Removed */}
              <ApprovalsCard
                project={project}
                workflowStatus={workflowStatus}
                type={project.projectType}
                isOnHold={isProjectOnHold}
              />
            </div>
          </>
        )}
        {activeTab === "Updates" && (
          <ProjectUpdates project={project} currentUser={user} />
        )}
        {activeTab === "Challenges" && (
          <ProjectChallenges project={project} onUpdate={fetchProject} />
        )}
        {activeTab === "Activities" && <ProjectActivity project={project} />}
      </main>
    </div>
  );
};

const OrderMeetingDetailsCard = ({
  meeting,
  required = false,
  loading = false,
  error = "",
}) => {
  const reminderOffsets = Array.isArray(meeting?.reminderOffsets)
    ? meeting.reminderOffsets
    : [];
  const reminderLabel = reminderOffsets
    .map(formatMeetingOffset)
    .filter(Boolean)
    .join(", ");

  return (
    <div className="detail-card meeting-details-card">
      <div className="card-header">
        <h3 className="card-title">Departmental Meeting</h3>
        {required && <span className="meeting-required-pill">Required</span>}
      </div>

      {loading && <p className="meeting-helper-text">Loading meeting details...</p>}
      {error && <p className="meeting-helper-text meeting-error">{error}</p>}

      {!loading && !meeting && !error && (
        <p className="meeting-helper-text">No meeting scheduled yet.</p>
      )}

      {meeting && (
        <div className="info-grid">
          <div className="info-item">
            <h4>Status</h4>
            <span className="info-text-bold">
              {formatMeetingStatus(meeting.status)}
            </span>
          </div>
          <div className="info-item">
            <h4>When</h4>
            <span className="info-text-bold">
              {formatMeetingDateTime(meeting.meetingAt)}
            </span>
            {meeting.timezone && (
              <div className="info-subtext">{meeting.timezone}</div>
            )}
          </div>
          {meeting.location && (
            <div className="info-item">
              <h4>Location</h4>
              <span className="info-text-bold">{meeting.location}</span>
            </div>
          )}
          {meeting.virtualLink && (
            <div className="info-item">
              <h4>Virtual Link</h4>
              <a
                className="meeting-link"
                href={meeting.virtualLink}
                target="_blank"
                rel="noreferrer"
              >
                Join meeting
              </a>
            </div>
          )}
          {meeting.agenda && (
            <div className="info-item">
              <h4>Agenda</h4>
              <div className="info-subtext" style={{ marginLeft: 0 }}>
                {meeting.agenda}
              </div>
            </div>
          )}
          {reminderLabel && (
            <div className="info-item">
              <h4>Reminders</h4>
              <div className="info-subtext" style={{ marginLeft: 0 }}>
                {reminderLabel}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ProjectInfoCard = ({ project, orderGroupProjects = [], currentUserId = "" }) => {
  const details = project.details || {};
  const lead = getLeadDisplay(project, "Unassigned");
  const groupedLeadRows = useMemo(
    () =>
      getGroupedLeadDisplayRows(
        orderGroupProjects.length > 0 ? orderGroupProjects : [project],
        {
          currentUserId,
          currentProject: project,
          prioritizeViewer: true,
          prioritizeCurrentLead: true,
        },
      ),
    [orderGroupProjects, project, currentUserId],
  );
  const leadRows =
    groupedLeadRows.length > 0
      ? groupedLeadRows
      : [{ key: "fallback", name: lead, display: lead }];
  const primaryLeadName = leadRows[0]?.name || lead;
  const primaryLeadAvatar = getLeadAvatarUrl(project);
  const leadSectionTitle =
    leadRows.length > 1 ? "ORDER GROUP LEADS" : "PROJECT LEAD";
  const briefOverview = String(details.briefOverview || "").trim();
  const lastUpdatedAt = project.sectionUpdates?.details;

  // Format Date
  const formatDate = (d) => {
    if (!d) return "TBD";
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatLastUpdated = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatContactType = (value) => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    if (!normalized) return "None";
    if (
      normalized === "mh" ||
      normalized === "magic hands" ||
      normalized === "magichands"
    ) {
      return "MH";
    }
    if (normalized === "none" || normalized === "n/a" || normalized === "na") {
      return "None";
    }
    if (
      normalized === "3rd party" ||
      normalized === "3rd-party" ||
      normalized === "3rdparty" ||
      normalized === "third party" ||
      normalized === "third-party" ||
      normalized === "thirdparty"
    ) {
      return "3rd Party";
    }
    return String(value || "").trim();
  };

  const contactTypeLabel = formatContactType(
    details.contactType || project.contactType || "",
  );

  return (
    <div className="detail-card">
      <div className="card-header project-info-header">
        <h3 className="card-title">
          <span className="project-info-icon">?</span> Project Info
        </h3>
        {lastUpdatedAt && (
          <span className="project-info-last-updated">
            Last Updated: {formatLastUpdated(lastUpdatedAt)}
          </span>
        )}
      </div>
      <div className="info-grid">
        <div className="info-item">
          <h4>{leadSectionTitle}</h4>
          <div className="lead-profile">
            <UserAvatar
              name={primaryLeadName}
              width="32px"
              height="32px"
              src={primaryLeadAvatar}
            />
            <div className="lead-group-list">
              {leadRows.map((entry) => (
                <span key={entry.key || entry.display} className="lead-group-line">
                  {entry.display}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="info-item">
          <h4>RECEIVED</h4>
          <div className="info-text-bold">
            <ClockIcon width="16" height="16" />{" "}
            {project.receivedTime
              ? project.receivedTime.includes("T")
                ? new Date(project.receivedTime).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : `${new Date(
                    project.orderDate || project.createdAt,
                  ).toLocaleDateString()} | ${project.receivedTime}`
              : "N/A"}
          </div>
        </div>
        {project.projectType !== "Quote" && (
          <div className="info-item">
            <h4>CONTACT TYPE</h4>
            <span className="info-text-bold">
              {contactTypeLabel || "None"}
            </span>
            <div className="info-subtext" style={{ marginLeft: 0 }}>
              Front Desk selection
            </div>
          </div>
        )}
        <div className="info-item">
          <h4>DELIVERY SCHEDULE</h4>
          <div className="info-text-bold">
            <CalendarIcon width="16" height="16" />{" "}
            {formatDate(details.deliveryDate)}
          </div>
          {project.projectType !== "Quote" && (
            <div className="info-subtext">
              {details.deliveryTime || "All Day"}
            </div>
          )}
        </div>
        {project.projectType !== "Quote" && (
          <div className="info-item">
            <h4>LOCATION</h4>
            <div className="info-text-bold">
              <LocationIcon width="16" height="16" />{" "}
              {details.deliveryLocation || "Unknown"}
            </div>
            <div className="info-subtext"></div>
          </div>
        )}
      </div>
      <div className="project-brief-section">
        <h4>BRIEF OVERVIEW</h4>
        <p>{briefOverview || "No brief overview provided."}</p>
      </div>
    </div>
  );
};

const QuoteChecklistCard = ({ project }) => {
  const items = getQuoteRequirementItems(project);
  const requiredItems = items.filter((item) => item.isRequired);
  const approvedCount = requiredItems.filter(
    (item) => item.status === "client_approved",
  ).length;

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    const parsed = new Date(dateString);
    if (Number.isNaN(parsed.getTime())) return "N/A";
    return parsed.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">Quote Requirements</h3>
      </div>
      <p className="info-subtext quote-requirements-summary">
        Client-approved: {approvedCount}/{requiredItems.length || 0} required items
      </p>
      <div className="checklist-grid quote-requirements-grid">
        {items.map((item) => {
          const status = String(item.status || "").toLowerCase();
          const isApproved = status === "client_approved";
          const isRevision = status === "client_revision_requested";
          const cardClassName = [
            "quote-requirement-card",
            isApproved ? "is-approved" : "",
            isRevision ? "is-revision" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const requiredBadgeClassName = [
            "quote-requirement-required-pill",
            item.isRequired ? "is-required" : "is-not-required",
          ]
            .filter(Boolean)
            .join(" ");
          const statusClassName = [
            "quote-requirement-status-line",
            isApproved ? "is-approved" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={item.key} className={cardClassName}>
              <div className="quote-requirement-card-header">
                <strong>{item.label}</strong>
                <span className={requiredBadgeClassName}>
                  {item.isRequired ? "Required" : "Not Required"}
                </span>
              </div>
              <div className={statusClassName}>
                Status: {formatQuoteRequirementStatus(status)}
              </div>
              {item.updatedAt && (
                <div className="quote-requirement-meta quote-requirement-updated">
                  Updated: {formatDateTime(item.updatedAt)}
                </div>
              )}
              {item.note && (
                <div className="quote-requirement-meta quote-requirement-note">
                  Note: {item.note}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
const FeedbackCard = ({ feedbacks = [] }) => {
  const sortedFeedbacks = [...feedbacks].sort((a, b) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });

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

  const resolveAttachmentUrl = (attachment = {}) => {
    const rawUrl = String(attachment?.fileUrl || attachment?.url || "").trim();
    if (!rawUrl) return "";
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
      return rawUrl;
    }
    if (rawUrl.startsWith("/")) return rawUrl;
    return `/${rawUrl.replace(/^\/+/, "")}`;
  };

  const getAttachmentName = (attachment = {}, index = 0) => {
    const preferredName = String(
      attachment?.fileName || attachment?.name || "",
    ).trim();
    if (preferredName) return preferredName;
    const url = resolveAttachmentUrl(attachment);
    const pathWithoutQuery = url.split("?")[0];
    const segments = pathWithoutQuery.split("/").filter(Boolean);
    return segments[segments.length - 1] || `attachment-${index + 1}`;
  };

  const getAttachmentType = (attachment = {}) => {
    const mimeType = String(
      attachment?.fileType || attachment?.type || "",
    ).toLowerCase();

    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";

    const attachmentName = getAttachmentName(attachment).toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(attachmentName)) {
      return "image";
    }
    if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(attachmentName)) {
      return "audio";
    }
    if (/\.(mp4|webm|mov|avi|mkv|m4v)$/.test(attachmentName)) {
      return "video";
    }

    return "file";
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">Feedback</h3>
      </div>
      {sortedFeedbacks.length === 0 ? (
        <div className="empty-feedback">No feedback submitted yet.</div>
      ) : (
        <div className="feedback-list">
          {sortedFeedbacks.map((feedback) => (
            <div
              className="feedback-item"
              key={feedback._id || feedback.createdAt}
            >
              <div className="feedback-meta">
                <span
                  className={`feedback-pill ${
                    feedback.type === "Positive" ? "positive" : "negative"
                  }`}
                >
                  {feedback.type || "Feedback"}
                </span>
                <span className="feedback-by">
                  {feedback.createdByName || "Unknown"}
                </span>
                <span className="feedback-date">
                  {formatFeedbackDate(feedback.createdAt)}
                </span>
              </div>
              <div className="feedback-notes">
                {feedback.notes?.trim()
                  ? feedback.notes
                  : "No notes provided."}
              </div>
              {Array.isArray(feedback.attachments) &&
                feedback.attachments.length > 0 && (
                <div className="feedback-attachments">
                  <p className="feedback-attachments-label">Client Media</p>
                  <div className="feedback-attachments-grid">
                    {feedback.attachments.map((attachment, index) => {
                      const attachmentUrl = resolveAttachmentUrl(attachment);
                      if (!attachmentUrl) return null;
                      const attachmentName = getAttachmentName(attachment, index);
                      const attachmentType = getAttachmentType(attachment);

                      return (
                        <div
                          className="feedback-attachment-card"
                          key={`${feedback._id || feedback.createdAt}-${attachmentName}-${index}`}
                        >
                          {attachmentType === "image" && (
                            <a
                              href={attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="feedback-attachment-preview-link"
                            >
                              <img
                                src={attachmentUrl}
                                alt={attachmentName}
                                className="feedback-attachment-image"
                                loading="lazy"
                              />
                            </a>
                          )}
                          {attachmentType === "audio" && (
                            <audio
                              controls
                              preload="metadata"
                              className="feedback-attachment-audio"
                            >
                              <source src={attachmentUrl} />
                              Your browser does not support audio playback.
                            </audio>
                          )}
                          {attachmentType === "video" && (
                            <video
                              controls
                              preload="metadata"
                              className="feedback-attachment-video"
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
                              className="feedback-attachment-file-link"
                            >
                              Open Attachment
                            </a>
                          )}
                          <div className="feedback-attachment-meta">
                            <span className="feedback-attachment-name" title={attachmentName}>
                              {attachmentName}
                            </span>
                            <a
                              href={attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className="feedback-attachment-download"
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
  );
};

const DepartmentsCard = ({
  departments = [],
  acknowledgements = [],
  projectId,
  onUpdate,
  readOnly = false,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (showModal) {
      setSelectedDepts(departments);
    }
  }, [showModal, departments]);

  const toggleDept = (deptId) => {
    if (selectedDepts.includes(deptId)) {
      setSelectedDepts(selectedDepts.filter((d) => d !== deptId));
    } else {
      setSelectedDepts([...selectedDepts, deptId]);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/departments`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departments: selectedDepts }),
      });

      if (res.ok) {
        setShowModal(false);
        onUpdate();
      } else {
        console.error("Failed to update departments");
      }
    } catch (err) {
      console.error("Error updating departments:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">
          👥 Departments
          {departments.length > 0 && (
            <span
              style={{
                marginLeft: "0.5rem",
                backgroundColor: "#3b82f6",
                color: "white",
                padding: "2px 8px",
                borderRadius: "999px",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              {departments.length}
            </span>
          )}
        </h3>
        {!readOnly && (
          <button
            className="edit-link"
            onClick={() => setShowModal(true)}
            style={{
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            <EditIcon width="14" height="14" /> Edit
          </button>
        )}
      </div>
      <div className="dept-list">
        {departments.length > 0 ? (
          departments.map((dept, index) => {
            const acknowledgement = acknowledgements?.find(
              (a) => a.department === dept,
            );
            const isAcknowledged = Boolean(acknowledgement);
            const acknowledgedBy = getFullName(acknowledgement?.user);
            return (
              <span key={index} className="dept-tag">
                <span
                  className="dept-dot"
                  style={{ background: isAcknowledged ? "#10b8a6" : "#3b82f6" }}
                ></span>{" "}
                {getDepartmentLabel(dept)}
                {isAcknowledged && (
                  <span
                    className="acknowledged-badge"
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.65rem",
                      fontWeight: "700",
                      background: "#10b8a6",
                      color: "#fff",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      textTransform: "uppercase",
                    }}
                  >
                    ✓ Acknowledged
                  </span>
                )}
                {isAcknowledged && acknowledgedBy && (
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.7rem",
                      fontWeight: 600,
                      color: "#0f9f8e",
                    }}
                  >
                    by {acknowledgedBy}
                  </span>
                )}
              </span>
            );
          })
        ) : (
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.875rem" }}>
            No departments assigned
          </span>
        )}
      </div>

      {/* Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div
            className="modal-content"
            style={{ width: "600px", maxWidth: "90vw" }}
          >
            <h3 className="modal-title">Manage Departments</h3>
            <div
              className="dept-selection-list"
              style={{
                maxHeight: "400px",
                overflowY: "auto",
                margin: "1rem 0",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "0.5rem",
                paddingRight: "0.5rem",
              }}
            >
              {DEPARTMENTS.map((dept) => (
                <label
                  key={dept.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    cursor: "pointer",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    backgroundColor: selectedDepts.includes(dept.id)
                      ? "#eff6ff"
                      : "transparent",
                    transition: "all 0.2s",
                    border: selectedDepts.includes(dept.id)
                      ? "1px solid #dbeafe"
                      : "1px solid transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedDepts.includes(dept.id)}
                    onChange={() => toggleDept(dept.id)}
                    style={{
                      width: "16px",
                      height: "16px",
                      accentColor: "#2563eb",
                    }}
                  />
                  <span
                    style={{
                      fontWeight: selectedDepts.includes(dept.id) ? 600 : 400,
                      color: selectedDepts.includes(dept.id)
                        ? "#1e293b"
                        : "#64748b",
                      fontSize: "0.875rem",
                    }}
                  >
                    {dept.label}
                  </span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowModal(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const OrderItemsCard = ({
  items = [],
  projectId,
  onUpdate,
  readOnly = false,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState(null); // Track item being edited
  const [newItem, setNewItem] = useState({
    description: "",
    breakdown: "",
    qty: 1,
  });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: null,
  });

  const showToast = (message, type = "info") => {
    setToast({ message, type });
  };

  const handleAddItem = async () => {
    if (!newItem.description) {
      showToast("Description is required", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });

      if (res.ok) {
        setIsAdding(false);
        setNewItem({ description: "", breakdown: "", qty: 1 });
        showToast("Item added successfully", "success");
        if (onUpdate) onUpdate();
      } else {
        showToast("Failed to add item", "error");
      }
    } catch (err) {
      console.error("Failed to add item", err);
      showToast("Server error", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateItem = async () => {
    if (!newItem.description) {
      showToast("Description is required", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/items/${editingItem._id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newItem),
        },
      );

      if (res.ok) {
        setEditingItem(null);
        setNewItem({ description: "", breakdown: "", qty: 1 });
        showToast("Item updated successfully", "success");
        if (onUpdate) onUpdate();
      } else {
        showToast("Failed to update item", "error");
      }
    } catch (err) {
      console.error("Failed to update item", err);
      showToast("Server error", "error");
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (item) => {
    setEditingItem(item);
    setNewItem({
      description: item.description,
      breakdown: item.breakdown,
      qty: item.qty,
    });
    setIsAdding(true); // Reuse the adding UI for editing
  };

  const cancelEditing = () => {
    setIsAdding(false);
    setEditingItem(null);
    setNewItem({ description: "", breakdown: "", qty: 1 });
  };

  const handleDeleteItem = (itemId) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Item",
      message:
        "Are you sure you want to remove this item? This action cannot be undone.",
      onConfirm: () => performDelete(itemId),
    });
  };

  const performDelete = async (itemId) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/items/${itemId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        showToast("Item deleted successfully", "success");
        if (onUpdate) onUpdate();
      } else {
        showToast("Failed to delete item", "error");
      }
    } catch (err) {
      console.error("Error deleting item:", err);
      showToast("Server error", "error");
    } finally {
      setConfirmDialog({ ...confirmDialog, isOpen: false });
    }
  };

  return (
    <div className="detail-card">
      {/* Toast Container */}
      {toast &&
        createPortal(
          <div className="ui-toast-container">
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          </div>,
          document.body,
        )}

      {/* Confirmation Dialog - Using ConfirmationModal for consistency */}
      <ConfirmationModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        confirmText="Yes, Delete"
        cancelText="No, Keep It"
      />

      <div className="card-header">
        <h3 className="card-title">📦 Order Items</h3>
        {!readOnly && !isAdding && (
          <button
            className="edit-link"
            onClick={() => setIsAdding(true)}
            style={{
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            + Add Item
          </button>
        )}
      </div>

      {isAdding && (
        <div className="edit-item-form">
          <div className="edit-item-grid">
            <input
              type="text"
              placeholder="Description"
              className="input-field"
              value={newItem.description}
              onChange={(e) =>
                setNewItem({ ...newItem, description: e.target.value })
              }
              autoFocus
            />
            <input
              type="text"
              placeholder="Breakdown / Details (Optional)"
              className="input-field"
              value={newItem.breakdown}
              onChange={(e) =>
                setNewItem({ ...newItem, breakdown: e.target.value })
              }
            />
            <div className="edit-item-row">
              <label style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                Qty:
              </label>
              <input
                type="number"
                min="1"
                className="input-field"
                style={{ width: "80px" }}
                value={newItem.qty}
                onChange={(e) =>
                  setNewItem({ ...newItem, qty: e.target.value })
                }
              />
              <div
                style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}
              >
                <button className="btn-secondary" onClick={cancelEditing}>
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={editingItem ? handleUpdateItem : handleAddItem}
                  disabled={loading}
                >
                  {loading ? "Saving..." : editingItem ? "Update" : "Add Item"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <table className="items-table">
          <thead>
            <tr>
              <th>DESCRIPTION</th>
              <th style={{ textAlign: "right" }}>QTY</th>
              <th style={{ width: "80px" }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td>
                  <div className="item-desc">
                    <span className="item-name">{item.description}</span>
                    <span className="item-sub">{item.breakdown}</span>
                  </div>
                </td>
                <td className="item-qty">{item.qty}</td>
                <td>
                  {!readOnly && (
                    <div
                      style={{ display: "flex", justifyContent: "flex-end" }}
                    >
                      <button
                        className="btn-icon-small"
                        onClick={() => startEditing(item)}
                        style={{ marginRight: "0.5rem" }}
                      >
                        <EditIcon width="14" height="14" color="#64748b" />
                      </button>
                      <button
                        className="btn-icon-small delete"
                        onClick={() => handleDeleteItem(item._id)}
                      >
                        <TrashIcon width="14" height="14" color="#ef4444" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !isAdding && (
          <p style={{ color: "var(--text-tertiary)", fontSize: "0.875rem" }}>
            No items listed.
          </p>
        )
      )}
    </div>
  );
};

const isImageReferenceFile = (fileUrl = "", fileType = "") => {
  const normalizedType = String(fileType || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(String(fileUrl || ""));
};

const formatRevisionDateTime = (dateStr) => {
  if (!dateStr) return "N/A";
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getRevisionMeta = (projectValue) => {
  const meta = projectValue?.orderRevisionMeta || {};
  const updatedAt = meta.updatedAt;
  if (!updatedAt) return null;
  const explicitName = String(meta.updatedByName || "").trim();
  const updatedBy = meta.updatedBy || {};
  const fallbackName = [updatedBy.firstName, updatedBy.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const updatedByName =
    explicitName || fallbackName || updatedBy.name || "Unknown";
  return { updatedAt, updatedByName };
};

const getRevisionCount = (projectValue) => {
  const rawCount = Number(projectValue?.orderRevisionCount);
  if (Number.isFinite(rawCount) && rawCount > 0) return rawCount;
  return projectValue?.orderRevisionMeta?.updatedAt ? 1 : 0;
};

const ReferenceMaterialsCard = ({ project }) => {
  const details = project.details || {};
  const sampleImage = project.sampleImage || details.sampleImage;
  const sampleImageNote = String(details.sampleImageNote || "").trim();
  const attachmentItems = normalizeReferenceAttachments(
    project.attachments || details.attachments || [],
  );
  const revisionMeta = getRevisionMeta(project);
  const revisionCount = getRevisionCount(project);

  if (!sampleImage && attachmentItems.length === 0) return null;

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">📎 Reference Materials</h3>
        {revisionMeta && revisionCount > 0 && (
          <span className="revision-badge">
            Revision v{revisionCount} by {revisionMeta.updatedByName} -{" "}
            {formatRevisionDateTime(revisionMeta.updatedAt)}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Sample Image */}
          {sampleImage && (
            <div>
            <h4
              style={{
                fontSize: "0.75rem",
                fontWeight: "600",
                color: "#64748b",
                marginBottom: "0.5rem",
                textTransform: "uppercase",
              }}
            >
              Sample Image
            </h4>
              <div
                style={{
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  maxWidth: "200px",
                }}
              >
                <Link
                  to={`${sampleImage}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  reloadDocument
                >
                  <img
                    src={`${sampleImage}`}
                    alt="Sample"
                    style={{
                      width: "100%",
                      height: "auto",
                      display: "block",
                    }}
                  />
                </Link>
              </div>
              <Link
                to={`${sampleImage}`}
                download
                reloadDocument
                style={{
                  marginTop: "0.5rem",
                  display: "inline-block",
                  fontSize: "0.75rem",
                  color: "#2563eb",
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                Download
              </Link>
              {sampleImageNote && (
                <div className="reference-note">{sampleImageNote}</div>
              )}
            </div>
          )}

        {/* Attachments */}
        {attachmentItems.length > 0 && (
          <div>
            <h4
              style={{
                fontSize: "0.75rem",
                fontWeight: "600",
                color: "#64748b",
                marginBottom: "0.5rem",
                textTransform: "uppercase",
              }}
            >
              Attachments ({attachmentItems.length})
            </h4>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                  gap: "0.5rem",
                }}
              >
                {attachmentItems.map((attachment, idx) => {
                  const fileUrl = attachment.fileUrl;
                  const fileName = getReferenceFileName(attachment);
                  const note = String(attachment.note || "").trim();
                  const isImage = isImageReferenceFile(
                    fileUrl,
                    attachment.fileType,
                  );
                  return (
                    <div
                      key={fileUrl || idx}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.35rem",
                      }}
                    >
                      <Link
                        to={`${fileUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        reloadDocument
                        style={{
                          position: "relative",
                          aspectRatio: "1",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#f8fafc", // slate-50
                          textDecoration: "none",
                        }}
                      >
                        {isImage ? (
                          <img
                            src={`${fileUrl}`}
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
                              padding: "0.5rem",
                              color: "#64748b",
                              width: "100%",
                              overflow: "hidden",
                            }}
                          >
                            <FolderIcon width="24" height="24" />
                            <div
                              style={{
                                marginTop: "0.25rem",
                                fontSize: "0.7rem",
                                whiteSpace: "nowrap",
                                textOverflow: "ellipsis",
                                overflow: "hidden",
                                color: "#334155",
                              }}
                            >
                              {fileName}
                            </div>
                          </div>
                        )}
                      </Link>
                      <Link
                        to={`${fileUrl}`}
                        download
                        reloadDocument
                        style={{
                          fontSize: "0.7rem",
                          color: "#2563eb",
                          textDecoration: "none",
                          fontWeight: 600,
                        }}
                      >
                        Download
                      </Link>
                      {note && <div className="reference-note">{note}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
        )}
      </div>
    </div>
  );
};

const ApprovedMockupCard = ({ project, hideRejected = false }) => {
  const [mockupCarouselIndex, setMockupCarouselIndex] = useState(0);
  const mockupVersions = useMemo(
    () => getMockupVersions(project?.mockup || {}),
    [project?.mockup],
  );
  const visibleMockupVersions = useMemo(() => {
    if (!hideRejected) return mockupVersions;
    return mockupVersions.filter(
      (entry) => getMockupApprovalStatus(entry.clientApproval || {}) !== "rejected",
    );
  }, [mockupVersions, hideRejected]);
  const mockupCarouselVersions = useMemo(
    () => visibleMockupVersions.slice().reverse(),
    [visibleMockupVersions],
  );

  useEffect(() => {
    if (mockupCarouselVersions.length === 0) {
      setMockupCarouselIndex(0);
      return;
    }
    setMockupCarouselIndex((prev) =>
      Math.min(Math.max(prev, 0), mockupCarouselVersions.length - 1),
    );
  }, [mockupCarouselVersions.length]);

  const latestMockupVersion =
    visibleMockupVersions.length > 0
      ? visibleMockupVersions[visibleMockupVersions.length - 1]
      : null;
  const latestMockupDecision = getMockupApprovalStatus(
    latestMockupVersion?.clientApproval || {},
  );
  const latestMockupLabel = latestMockupVersion
    ? `v${latestMockupVersion.version}`
    : "";
  const activeMockupVersion =
    mockupCarouselVersions[mockupCarouselIndex] || mockupCarouselVersions[0] || null;

  if (!activeMockupVersion) return null;

  const activeMockupDecision = getMockupApprovalStatus(
    activeMockupVersion?.clientApproval || {},
  );
  const activeMockupFileName =
    activeMockupVersion.fileName ||
    (activeMockupVersion.fileUrl
      ? activeMockupVersion.fileUrl.split("/").pop()
      : "Mockup");
  const activeMockupIsImage = isImageReferenceFile(
    activeMockupVersion.fileUrl,
    activeMockupVersion.fileType,
  );
  const activeMockupUploadedAt = activeMockupVersion.uploadedAt
    ? new Date(activeMockupVersion.uploadedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const activeMockupReason = String(
    activeMockupVersion?.clientApproval?.rejectionReason || "",
  ).trim();

  const openPreview = () => {
    if (!activeMockupVersion?.fileUrl) return;
    window.open(activeMockupVersion.fileUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="detail-card approved-mockup-card">
      <div className="card-header">
        <h3 className="card-title">Mockups</h3>
      </div>
      <div className="mockup-approval-body">
        <div
          className={`mockup-approval-status ${latestMockupDecision || "pending"}`}
        >
          Latest: {latestMockupLabel || "v1"}{" "}
          {latestMockupDecision === "approved"
            ? "Client Approved"
            : latestMockupDecision === "rejected"
              ? "Client Rejected"
              : "Pending Client Approval"}
        </div>

        <div className="mockup-carousel">
          <button
            type="button"
            className="mockup-carousel-nav"
            onClick={() =>
              setMockupCarouselIndex((previous) => Math.max(previous - 1, 0))
            }
            disabled={mockupCarouselIndex === 0}
            aria-label="Previous mockup"
          >
            {"<"}
          </button>
          <button
            type="button"
            className={`mockup-carousel-frame ${
              activeMockupIsImage ? "is-image" : "is-file"
            }`}
            onClick={openPreview}
          >
            {activeMockupIsImage ? (
              <img
                src={activeMockupVersion.fileUrl}
                alt={activeMockupFileName}
              />
            ) : (
              <span>Preview unavailable for this file type</span>
            )}
          </button>
          <button
            type="button"
            className="mockup-carousel-nav"
            onClick={() =>
              setMockupCarouselIndex((previous) =>
                Math.min(previous + 1, mockupCarouselVersions.length - 1),
              )
            }
            disabled={mockupCarouselIndex >= mockupCarouselVersions.length - 1}
            aria-label="Next mockup"
          >
            {">"}
          </button>
        </div>

        <div className="mockup-carousel-caption">
          <strong>v{activeMockupVersion.version}</strong>
          <span>{activeMockupFileName}</span>
          {activeMockupUploadedAt && <span>Uploaded: {activeMockupUploadedAt}</span>}
          {activeMockupDecision === "rejected" && activeMockupReason && (
            <span className="mockup-approval-meta rejection">
              Reason: {activeMockupReason}
            </span>
          )}
        </div>

        <div className="mockup-version-links">
          <a
            href={activeMockupVersion.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View
          </a>
          <a href={activeMockupVersion.fileUrl} download>
            Download
          </a>
        </div>

        <div className="mockup-carousel-track">
          {mockupCarouselVersions.map((version, index) => {
            const decision = getMockupApprovalStatus(version.clientApproval || {});
            return (
              <button
                key={
                  version.entryId
                    ? `mockup-version-tab-${version.entryId}`
                    : `mockup-version-tab-${version.version}-${index}`
                }
                type="button"
                className={`mockup-carousel-tab ${
                  mockupCarouselIndex === index ? "active" : ""
                }`}
                onClick={() => setMockupCarouselIndex(index)}
              >
                <span className="mockup-carousel-tab-version">
                  v{version.version}
                </span>
                <span className={`mockup-carousel-tab-status ${decision}`}>
                  {decision}
                </span>
              </button>
            );
          })}
        </div>

        {activeMockupVersion.note && (
          <div className="mockup-approval-meta">
            Note: {activeMockupVersion.note}
          </div>
        )}
      </div>
    </div>
  );
};

const RisksCard = ({ risks = [], projectId, onUpdate, readOnly = false }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState(null);
  const [formData, setFormData] = useState({
    description: "",
    responsible: "MH",
    status: "Pending",
  });
  const [loading, setLoading] = useState(false);

  // Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const getRiskEntryId = (risk) => risk?._id || risk?.id || "";

  // Reset form when modal opens
  useEffect(() => {
    if (showModal) {
      if (editingRisk) {
        setFormData({
          description: editingRisk.description,
          responsible: editingRisk.responsible?.value || "MH",
          status: editingRisk.status?.value || "Pending",
        });
      } else {
        setFormData({
          description: "",
          responsible: "MH",
          status: "Pending",
        });
      }
    }
  }, [showModal, editingRisk]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.description) return;

    setLoading(true);
    try {
      const url = editingRisk
        ? `/api/projects/${projectId}/uncontrollable-factors/${getRiskEntryId(editingRisk)}`
        : `/api/projects/${projectId}/uncontrollable-factors`;

      const method = editingRisk ? "PATCH" : "POST";

      const payload = {
        description: formData.description,
        responsible: {
          label: formData.responsible === "MH" ? "Magic Hands" : "Client",
          value: formData.responsible,
        },
        status: {
          label: formData.status,
          value: formData.status,
        },
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingRisk(null);
        onUpdate(); // Refresh project data
      } else {
        console.error("Failed to save factor");
      }
    } catch (err) {
      console.error("Error saving factor:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (factorId) => {
    setDeleteId(factorId);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/uncontrollable-factors/${deleteId}`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        onUpdate();
        setIsDeleteModalOpen(false);
        setDeleteId(null);
      }
    } catch (err) {
      console.error("Error deleting factor:", err);
    }
  };

  return (
    <div className="risk-section">
      <div className="risk-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="risk-title">
          <WarningIcon width="20" height="20" color="currentColor" /> Uncontrollable
          Factors
        </div>
        <div
          className="risk-count"
          style={{ fontSize: "0.875rem", color: "var(--danger)" }}
        >
          {risks.length} flagged items {isOpen ? "▲" : "▼"}
        </div>
      </div>
      {isOpen && (
        <>
          <div className="risk-list">
            {risks.length > 0 ? (
              risks.map((risk, i) => (
                <div className="risk-item" key={i}>
                  <div className="risk-icon-wrapper">
                    <div className="risk-dot"></div>
                  </div>
                  <div className="risk-content-main">
                    <h5>{risk.description}</h5>
                    <p>Status: {risk.status?.label || "Pending"}</p>
                  </div>
                  {!readOnly && (
                    <div className="risk-actions">
                      <button
                        className="btn-icon-small"
                        onClick={() => {
                          setEditingRisk(risk);
                          setShowModal(true);
                        }}
                      >
                        <EditIcon width="14" height="14" />
                      </button>
                      <button
                        className="btn-icon-small delete"
                        onClick={() => handleDeleteClick(getRiskEntryId(risk))}
                      >
                        <TrashIcon width="14" height="14" color="#ef4444" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <p style={{ color: "var(--text-tertiary)", margin: 0 }}>
                  No uncontrollable factors reported.
                </p>
              </div>
            )}
          </div>
          {!readOnly && (
            <div className="risk-card-footer">
              <button
                className="btn-add-risk"
                onClick={() => {
                  setEditingRisk(null);
                  setShowModal(true);
                }}
              >
                + Add Uncontrollable Factor
              </button>
            </div>
          )}
        </>
      )}

      {/* Inline Modal for adding/editing factor */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: "400px" }}>
            <h3 className="modal-title">
              {editingRisk
                ? "Edit Uncontrollable Factor"
                : "Add Uncontrollable Factor"}
            </h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                />
              </div>
              <div
                className="form-row"
                style={{ display: "flex", gap: "1rem" }}
              >
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Responsible</label>
                  <select
                    className="input-field"
                    value={formData.responsible}
                    onChange={(e) =>
                      setFormData({ ...formData, responsible: e.target.value })
                    }
                  >
                    <option value="MH">Magic Hands</option>
                    <option value="Client">Client</option>
                    <option value="3rd Party">3rd Party</option>
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Status</label>
                  <select
                    className="input-field"
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                  >
                    <option value="Pending">Pending</option>
                    <option value="Resolved">Resolved</option>
                    <option value="Escalated">Escalated</option>
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Factor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Delete Factor"
        message="Are you sure you want to delete this uncontrollable factor? This action cannot be undone."
        confirmText="Yes, Delete"
        cancelText="No, Keep"
        onConfirm={confirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
};

const ProductionRisksCard = ({
  risks = [],
  project = null,
  projectId,
  onUpdate,
  readOnly = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState(null);
  const [formData, setFormData] = useState({ description: "", preventive: "" });
  const [loading, setLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isApplyingAiSuggestions, setIsApplyingAiSuggestions] = useState(false);
  const [showAiReviewModal, setShowAiReviewModal] = useState(false);
  const [pendingAiSuggestions, setPendingAiSuggestions] = useState([]);
  const [aiNotice, setAiNotice] = useState(null);

  // Confirmation Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const getRiskEntryId = (risk) => risk?._id || risk?.id || "";

  // Reset form when modal opens
  useEffect(() => {
    if (showModal) {
      if (editingRisk) {
        setFormData({
          description: editingRisk.description,
          preventive: editingRisk.preventive,
        });
      } else {
        setFormData({ description: "", preventive: "" });
      }
    }
  }, [showModal, editingRisk]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.description) return;

    setLoading(true);
    try {
      const url = editingRisk
        ? `/api/projects/${projectId}/production-risks/${getRiskEntryId(editingRisk)}`
        : `/api/projects/${projectId}/production-risks`;

      const method = editingRisk ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowModal(false);
        setEditingRisk(null);
        onUpdate(); // Refresh project data
      } else {
        console.error("Failed to save risk");
      }
    } catch (err) {
      console.error("Error saving risk:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (riskId) => {
    setDeleteId(riskId);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/production-risks/${deleteId}`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        onUpdate();
        setIsDeleteModalOpen(false);
        setDeleteId(null);
      }
    } catch (err) {
      console.error("Error deleting risk:", err);
    }
  };

  const handleMagicAiAssistance = async () => {
    if (isAiLoading || !project || !projectId) return;

    setIsAiLoading(true);
    setAiNotice(null);

    try {
      const suggestions = await requestProductionRiskSuggestions(project);
      const { addedCount, addedSuggestions } = mergeProductionRiskSuggestions(
        risks,
        suggestions,
      );

      if (addedCount === 0) {
        setAiNotice({
          type: "info",
          text: "No new suggestions to add. Update project details and try again.",
        });
        return;
      }

      setPendingAiSuggestions(addedSuggestions);
      setShowAiReviewModal(true);
    } catch (error) {
      setAiNotice({
        type: "error",
        text: error.message || "Magic AI Assistance failed. Please try again.",
      });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleApplyAiSuggestions = async (selectedSuggestions) => {
    if (
      isApplyingAiSuggestions ||
      !projectId ||
      !Array.isArray(selectedSuggestions) ||
      selectedSuggestions.length === 0
    ) {
      return;
    }

    setIsApplyingAiSuggestions(true);
    setAiNotice(null);

    try {
      const { addedCount, addedSuggestions } = mergeProductionRiskSuggestions(
        risks,
        selectedSuggestions,
      );

      if (addedCount === 0) {
        setAiNotice({
          type: "info",
          text: "No new suggestions were added after review.",
        });
        return;
      }

      const results = await Promise.allSettled(
        addedSuggestions.map((suggestion) =>
          fetch(`/api/projects/${projectId}/production-risks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(suggestion),
          }),
        ),
      );

      let successCount = 0;
      let firstFailureMessage = "";

      for (const result of results) {
        if (result.status === "rejected") {
          if (!firstFailureMessage) {
            firstFailureMessage =
              result.reason?.message ||
              "Network error while adding suggested risks.";
          }
          continue;
        }

        if (result.value.ok) {
          successCount += 1;
          continue;
        }

        if (!firstFailureMessage) {
          const errorPayload = await result.value.json().catch(() => ({}));
          firstFailureMessage =
            errorPayload?.message || "Failed to add one or more suggestions.";
        }
      }

      if (successCount > 0) {
        await onUpdate();
      }

      if (successCount === addedCount) {
        setAiNotice({
          type: "success",
          text: `Added ${successCount} reviewed suggestion${successCount === 1 ? "" : "s"}.`,
        });
        return;
      }

      if (successCount > 0) {
        setAiNotice({
          type: "error",
          text:
            firstFailureMessage ||
            `Added ${successCount} of ${addedCount} reviewed suggestions.`,
        });
        return;
      }

      setAiNotice({
        type: "error",
        text: firstFailureMessage || "Unable to add selected suggestions.",
      });
    } catch (error) {
      setAiNotice({
        type: "error",
        text: error.message || "Failed to apply selected suggestions.",
      });
    } finally {
      setIsApplyingAiSuggestions(false);
      setShowAiReviewModal(false);
      setPendingAiSuggestions([]);
    }
  };

  return (
    <div className="detail-card" style={{ padding: "0" }}>
      <div
        className="risk-header"
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderBottom: isOpen ? "1px solid var(--border-color)" : "none" }}
      >
        <div className="risk-title" style={{ color: "var(--text-primary)" }}>
          <span style={{ color: "#eab308" }}>⚠️</span> Production Risks
        </div>
        <div
          className="risk-count"
          style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}
        >
          {risks.length} flagged items {isOpen ? "▲" : "▼"}
        </div>
      </div>
      {isOpen && (
        <>
          <div className="risk-list">
            {risks.length > 0 ? (
              risks.map((risk, i) => (
                <div className="risk-item" key={i}>
                  <div className="risk-icon-wrapper">
                    <div
                      className="risk-dot"
                      style={{ backgroundColor: "#eab308" }}
                    ></div>
                  </div>
                  <div className="risk-content-main">
                    <h5>{risk.description}</h5>
                    <p>Preventive: {risk.preventive}</p>
                  </div>
                  {!readOnly && (
                    <div className="risk-actions">
                      <button
                        className="btn-icon-small"
                        onClick={() => {
                          setEditingRisk(risk);
                          setShowModal(true);
                        }}
                      >
                        <EditIcon width="14" height="14" />
                      </button>
                      <button
                        className="btn-icon-small delete"
                        onClick={() => handleDeleteClick(getRiskEntryId(risk))}
                      >
                        <TrashIcon width="14" height="14" color="#ef4444" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div style={{ padding: "1.5rem", textAlign: "center" }}>
                <p style={{ color: "var(--text-tertiary)", margin: 0 }}>
                  No production risks reported.
                </p>
              </div>
            )}
          </div>

          {!readOnly && (
            <div className="risk-card-footer risk-card-footer-actions">
              <button
                type="button"
                className="btn-magic-ai"
                onClick={handleMagicAiAssistance}
                disabled={isAiLoading || isApplyingAiSuggestions}
              >
                {isAiLoading ? "Generating Suggestions..." : "Magic AI Assistance"}
              </button>
              {aiNotice && (
                <p className={`magic-ai-status ${aiNotice.type}`}>{aiNotice.text}</p>
              )}
              <button
                className="btn-add-risk"
                onClick={() => {
                  setEditingRisk(null);
                  setShowModal(true);
                }}
              >
                + Add Production Risk
              </button>
            </div>
          )}
        </>
      )}

      {/* Inline Modal for adding/editing risk */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ width: "400px" }}>
            <h3 className="modal-title">
              {editingRisk ? "Edit Production Risk" : "Add Production Risk"}
            </h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Preventive Measures</label>
                <textarea
                  className="input-field"
                  value={formData.preventive}
                  onChange={(e) =>
                    setFormData({ ...formData, preventive: e.target.value })
                  }
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Risk"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Delete Risk"
        message="Are you sure you want to delete this production risk? This action cannot be undone."
        confirmText="Yes, Delete"
        cancelText="No, Keep"
        onConfirm={confirmDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
      />
      <ProductionRiskSuggestionModal
        isOpen={showAiReviewModal}
        title="Review before add"
        suggestions={pendingAiSuggestions}
        onClose={() => {
          if (isApplyingAiSuggestions) return;
          setShowAiReviewModal(false);
          setPendingAiSuggestions([]);
        }}
        onConfirm={handleApplyAiSuggestions}
        isApplying={isApplyingAiSuggestions}
      />
    </div>
  );
};

const ProgressCard = ({ project, workflowStatus, isOnHold }) => {
  const calculateProgress = (status, type) => {
    if (type === "Quote") {
      switch (status) {
        case "Order Confirmed":
          return 5;
        case "Pending Scope Approval":
          return 25;
        case "Scope Approval Completed":
          return 35;
        case "Pending Departmental Meeting":
          return 38;
        case "Pending Departmental Engagement":
          return 42;
        case "Departmental Engagement Completed":
          return 48;
        case "Pending Quote Request":
          return 50;
        case "Quote Request Completed":
          return 60;
        case "Pending Send Response":
          return 75;
        case "Response Sent":
          return 90;
        case "Pending Feedback":
          return 97;
        case "Feedback Completed":
          return 99;
        case "Completed":
          return 100;
        case "Finished":
          return 100;
        case "Delivered":
          return 95;
        default:
          return 0;
      }
    }

    switch (status) {
      case "Order Confirmed":
        return 5;
      case "Pending Scope Approval":
        return 15;
      case "Scope Approval Completed":
        return 22;
      case "Pending Departmental Meeting":
        return 25;
      case "Pending Departmental Engagement":
        return 27;
      case "Departmental Engagement Completed":
        return 32;
      case "Pending Mockup":
        return 38;
      case "Mockup Completed":
        return 44;
      case "Pending Master Approval":
        return 48;
      case "Master Approval Completed":
        return 52;
      case "Pending Production":
        return 58;
      case "Production Completed":
        return 66;
      case "Pending Quality Control":
        return 72;
      case "Quality Control Completed":
        return 76;
      case "Pending Photography":
        return 80;
      case "Photography Completed":
        return 84;
      case "Pending Packaging":
        return 88;
      case "Packaging Completed":
        return 92;
      case "Pending Delivery/Pickup":
        return 95;
      case "Delivered":
        return 97;
      case "Pending Feedback":
        return 98;
      case "Feedback Completed":
        return 99;
      case "Completed":
        return 100;
      case "Finished":
        return 100;
      default:
        return 0;
    }
  };

  const progress = calculateProgress(workflowStatus, project.projectType);
  const color = getStatusColor(workflowStatus);

  return (
    <div className="detail-card progress-card">
      <div className="progress-header">
        <span>OVERALL PROGRESS</span>
        {/* Loader icon placeholder */}
        <div
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            border: "2px solid #e2e8f0",
            borderTopColor: "#cbd5e1",
          }}
        ></div>
      </div>
      <div className="chart-container">
        {/* Simple SVG Donut Chart */}
        <ProgressDonutIcon percentage={progress} color={color} />
      </div>
      {isOnHold && (
        <div className="workflow-hold-indicator">
          On Hold - Workflow paused at {workflowStatus}
        </div>
      )}
    </div>
  );
};

const ApprovalsCard = ({ project, workflowStatus, type, isOnHold }) => {
  const steps = type === "Quote" ? QUOTE_STEPS : STATUS_STEPS;
  const batchProgress = useMemo(
    () => (project ? buildBatchProgress(project) : null),
    [project],
  );
  const showBatchProgress =
    type !== "Quote" &&
    batchProgress &&
    (batchProgress.totalQty > 0 || (project?.batches || []).length > 0);

  // Find current step index
  let currentStepIndex = steps.findIndex((step) =>
    step.statuses.includes(workflowStatus),
  );

  if (currentStepIndex !== -1 && workflowStatus !== "Order Confirmed") {
    // Determine if the status represents a completed step
    const isCompletedVariant =
      workflowStatus.includes("Completed") ||
      workflowStatus === "Delivered" ||
      workflowStatus === "Response Sent";

    if (isCompletedVariant) {
      // If completed, visually move to the next step (making it "Pending")
      currentStepIndex++;
    }
  }

  // Handle global Completed/Finished status
  if (workflowStatus === "Completed" || workflowStatus === "Finished") {
    currentStepIndex = steps.length;
  }

  // Fallback
  if (
    currentStepIndex === -1 &&
    workflowStatus !== "Completed" &&
    workflowStatus !== "Finished"
  ) {
    currentStepIndex = 0;
  }

  const statusIcons = {
    "Order Confirmed": ClipboardListIcon,
    "Scope Approval": EyeIcon,
    "Departmental Engagement": CheckCircleIcon,
    Mockup: PaintbrushIcon,
    "Master Approval": EyeIcon,
    Production: FactoryIcon,
    "Quality Control": CheckCircleIcon,
    Photography: FolderIcon,
    Packaging: PackageIcon,
    "Delivery/Pickup": TruckIcon,
    Feedback: CheckCircleIcon,
    "Quote Request": ClipboardListIcon,
    "Send Response": ClockIcon,
  };

  return (
    <div className="detail-card">
      <div className="card-header">
        <h3 className="card-title">✅ Approvals</h3>
      </div>
      {isOnHold && (
        <div className="workflow-hold-indicator approvals-hold-indicator">
          On Hold - Workflow paused at {workflowStatus}
        </div>
      )}
      {showBatchProgress && (
        <div className="approval-batch-progress">
          <div className="approval-batch-header">Batch Progress</div>
          {batchProgress.totalQty === 0 ? (
            <div className="approval-batch-empty">
              No items available for batch progress.
            </div>
          ) : (
            <>
              <div className="approval-batch-summary">
                Assigned to batches:{" "}
                <strong>
                  {batchProgress.allocatedQty}/{batchProgress.totalQty}
                </strong>{" "}
                ({batchProgress.allocatedPercent}%)
              </div>
              <div className="approval-batch-row">
                <span>Produced</span>
                <div className="approval-batch-bar">
                  <span
                    style={{ width: `${batchProgress.producedPercent}%` }}
                  />
                </div>
                <strong>
                  {batchProgress.producedQty}/{batchProgress.totalQty} (
                  {batchProgress.producedPercent}%)
                </strong>
              </div>
              <div className="approval-batch-row">
                <span>Packaged</span>
                <div className="approval-batch-bar">
                  <span
                    style={{ width: `${batchProgress.packagedPercent}%` }}
                  />
                </div>
                <strong>
                  {batchProgress.packagedQty}/{batchProgress.totalQty} (
                  {batchProgress.packagedPercent}%)
                </strong>
              </div>
              <div className="approval-batch-row">
                <span>Delivered</span>
                <div className="approval-batch-bar">
                  <span
                    style={{ width: `${batchProgress.deliveredPercent}%` }}
                  />
                </div>
                <strong>
                  {batchProgress.deliveredQty}/{batchProgress.totalQty} (
                  {batchProgress.deliveredPercent}%)
                </strong>
              </div>
            </>
          )}
        </div>
      )}
      <div className="approval-list">
        {steps.map((step, index) => {
          // Status States:
          // 1. Completed: index < currentStepIndex
          // 2. Active: index === currentStepIndex
          // 3. Pending: index > currentStepIndex

          const isCompleted = index < currentStepIndex;
          const isActive = index === currentStepIndex;
          const stepColor = getStatusColor(step.label); // Get color for this step label
          const IconComponent = statusIcons[step.label] || CheckCircleIcon;

          let subText = "Pending";
          if (isCompleted) {
            subText = "Completed";
          } else if (isActive) {
            const stepStatuses = step.statuses || [];
            const pendingStatus = stepStatuses[0];
            const completedStatus = stepStatuses[stepStatuses.length - 1];

            if (step.label === "Feedback") {
              subText =
                workflowStatus === "Feedback Completed"
                  ? "Completed"
                  : "Pending";
            } else if (workflowStatus === "Order Confirmed") {
              subText = "Confirmed";
            } else if (
              stepStatuses.includes(workflowStatus) &&
              workflowStatus === completedStatus &&
              completedStatus !== pendingStatus
            ) {
              subText = "Completed";
            } else {
              subText = "Pending";
            }
          }

          return (
            <div
              key={step.label}
              className={`approval-item ${isActive ? "active" : ""}`}
            >
              <div
                className={`approval-status ${
                  isCompleted ? "completed" : isActive ? "active" : "pending"
                }`}
                style={{
                  // Override background/border colors with specific step color
                  backgroundColor: isCompleted
                    ? stepColor
                    : "var(--bg-card)",
                  borderColor: isCompleted
                    ? stepColor
                    : isActive
                      ? stepColor
                      : "var(--border-color)",
                  boxShadow: isActive
                    ? `0 0 0 4px ${stepColor}33` // Add a subtle glow for active
                    : "none",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  borderWidth: "2px",
                  borderStyle: "solid",
                  transition: "all 0.3s ease",
                  zIndex: "1",
                }}
              >
                <IconComponent
                  width="16"
                  height="16"
                  color={
                    isCompleted ? "#fff" : isActive ? stepColor : "var(--text-tertiary)"
                  }
                  strokeWidth={isActive ? "2.5" : "2"}
                />
              </div>
              <div className="approval-content">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    className={`approval-title ${
                      isCompleted
                        ? ""
                        : isActive
                          ? "active-text"
                          : "pending-text"
                    }`}
                    style={{
                      color: isActive
                        ? stepColor
                        : isCompleted
                          ? "var(--text-primary)"
                          : "var(--text-tertiary)",
                      fontWeight: isActive ? "600" : "500",
                    }}
                  >
                    {step.label}
                  </span>
                  {isActive &&
                    subText === "Pending" &&
                    workflowStatus !== "Order Confirmed"}
                </div>

                <span className="approval-sub">{subText}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ProjectDetail;

