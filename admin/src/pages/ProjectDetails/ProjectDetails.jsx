import React, { useState, useEffect, useMemo } from "react";
import { useParams, useLocation, Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import "./ProjectDetails.css";
import {
  ProjectsIcon,
  PencilIcon,
  CheckCircleIcon,
  XMarkIcon,
} from "../../icons/Icons";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getGroupedLeadDisplayRows } from "../../utils/leadDisplay";
import { renderProjectName } from "../../utils/projectName";
import ProjectHoldModal from "../../components/ProjectHoldModal/ProjectHoldModal";
import BillingGuardModal from "../../components/BillingGuardModal/BillingGuardModal";
import ProjectCancelModal from "../../components/ProjectCancelModal/ProjectCancelModal";
import ProjectReactivateModal from "../../components/ProjectReactivateModal/ProjectReactivateModal";
import ProjectTypeChangeModal from "../../components/ProjectTypeChangeModal/ProjectTypeChangeModal";
import ProjectRemindersCard from "../../components/ProjectReminders/ProjectRemindersCard";
import OrderMeetingCard from "../../components/OrderMeetingCard/OrderMeetingCard";
import Modal from "../../components/Modal/Modal";
import {
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
  normalizeQuoteStatus,
} from "@client/utils/quoteStatus";

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

const getPersonName = (value) => {
  if (!value || typeof value !== "object") return "";
  const firstName = String(value.firstName || "").trim();
  const lastName = String(value.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  if (fullName) return fullName;
  return String(value.name || value.fullName || value.displayName || "").trim();
};

const mergeAcknowledgementUsers = (previous, next) => {
  const previousAcks = Array.isArray(previous?.acknowledgements)
    ? previous.acknowledgements
    : [];
  const nextAcks = Array.isArray(next?.acknowledgements)
    ? next.acknowledgements
    : [];

  if (!previousAcks.length || !nextAcks.length) return next;

  const hasUserName = (user) => {
    if (!user || typeof user !== "object") return false;
    return Boolean(
      String(user.firstName || "").trim() ||
        String(user.lastName || "").trim() ||
        String(user.name || "").trim() ||
        String(user.fullName || "").trim() ||
        String(user.displayName || "").trim(),
    );
  };

  const previousByDepartment = new Map(
    previousAcks
      .filter((ack) => ack && ack.department)
      .map((ack) => [ack.department, ack]),
  );

  const mergedAcks = nextAcks.map((ack) => {
    const previousAck = previousByDepartment.get(ack.department);
    if (!previousAck) return ack;
    if (hasUserName(ack.user)) return ack;
    if (previousAck.user) {
      return { ...ack, user: previousAck.user };
    }
    return ack;
  });

  return { ...next, acknowledgements: mergedAcks };
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

const formatAmountLabel = (amount, currency = "") => {
  if (!Number.isFinite(amount) || amount <= 0) return "-";
  const formattedAmount = amount.toLocaleString("en-US");
  const trimmedCurrency = String(currency || "").trim();
  return trimmedCurrency ? `${trimmedCurrency} ${formattedAmount}` : formattedAmount;
};

const STATUS_AUTO_ADVANCE_TARGETS = {
  "Master Approval Completed": "Pending Production",
  "Packaging Completed": "Pending Delivery/Pickup",
};
const mapQuoteStatusForDisplay = (
  status,
  isQuoteProject = false,
  requirementMode = "",
) => {
  const normalized = String(status || "").trim();
  if (!isQuoteProject) return normalized;
  const normalizedQuote = getQuoteStatusDisplay(normalized, requirementMode);
  if (normalizedQuote === "Pending Client Decision") return "Pending Decision";
  return normalizedQuote;
};

const mapQuoteStatusForStorage = (status) => {
  const normalized = String(status || "").trim();
  if (normalized === "Pending Decision") return "Pending Client Decision";
  if (normalized === "Cost Verified") return "Cost Verification Completed";
  if (normalized === "Pending Sample / Work done Retrieval") {
    return "Pending Sample Retrieval";
  }
  if (normalized === "Pending Sample / Work done Sent") {
    return "Pending Quote Submission";
  }
  if (normalized === "Pending Sample Production") {
    return "Pending Production";
  }
  if (normalized === "Quote Submitted") return "Quote Submission Completed";
  return normalized;
};

const STANDARD_STATUS_FLOW = [
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

const QUOTE_STATUS_FLOW_BY_MODE = {
  cost: [
    "Quote Created",
    "Pending Scope Approval",
    "Scope Approval Completed",
    "Pending Cost Verification",
    "Cost Verification Completed",
    "Pending Quote Submission",
    "Quote Submission Completed",
    "Pending Client Decision",
    "Completed",
    "Finished",
  ],
  mockup: [
    "Quote Created",
    "Pending Scope Approval",
    "Scope Approval Completed",
    "Pending Mockup",
    "Mockup Completed",
    "Pending Quote Submission",
    "Quote Submission Completed",
    "Pending Client Decision",
    "Completed",
    "Finished",
  ],
  previousSamples: [
    "Quote Created",
    "Pending Scope Approval",
    "Scope Approval Completed",
    "Pending Sample Retrieval",
    "Pending Quote Submission",
    "Quote Submission Completed",
    "Pending Client Decision",
    "Completed",
    "Finished",
  ],
  sampleProduction: [
    "Quote Created",
    "Pending Scope Approval",
    "Scope Approval Completed",
    "Pending Mockup",
    "Mockup Completed",
    "Pending Sample Production",
    "Pending Quote Submission",
    "Quote Submission Completed",
    "Pending Client Decision",
    "Completed",
    "Finished",
  ],
};

const getQuoteStatusFlow = (mode) =>
  QUOTE_STATUS_FLOW_BY_MODE[mode] || QUOTE_STATUS_FLOW_BY_MODE.cost;

const getStatusFlow = (isQuoteProject, requirementMode = "") =>
  isQuoteProject ? getQuoteStatusFlow(requirementMode) : STANDARD_STATUS_FLOW;

const buildStatusConfirmPhrase = (status, projectId) => {
  const normalizedStatus = String(status || "").trim();
  const normalizedProjectId = String(projectId || "").trim();
  const projectLabel = normalizedProjectId
    ? `Project ${normalizedProjectId}`
    : "this project";

  if (!normalizedStatus) return "";

  return `I agree to change the status of ${projectLabel} to ${normalizedStatus}`;
};

const getStatusMovementNote = (
  currentStatus,
  targetStatus,
  isQuoteProject,
  requirementMode = "",
) => {
  if (!currentStatus || !targetStatus) return "";

  const flow = getStatusFlow(isQuoteProject, requirementMode);
  const currentIndex = flow.indexOf(currentStatus);
  const targetIndex = flow.indexOf(targetStatus);

  if (currentIndex === -1 || targetIndex === -1) {
    return "Note: This status change does not map to the standard workflow.";
  }

  if (targetIndex < currentIndex) {
    const diff = currentIndex - targetIndex;
    return `Warning: This moves the project backward by ${diff} stage${
      diff === 1 ? "" : "s"
    }.`;
  }

  if (targetIndex > currentIndex + 1) {
    const skipped = targetIndex - currentIndex - 1;
    return `Warning: This skips ${skipped} stage${skipped === 1 ? "" : "s"} in the workflow.`;
  }

  return "";
};

const BILLING_REQUIREMENT_LABELS = {
  invoice: "Invoice confirmation",
  payment_verification_any: "Payment method verification",
  full_payment_or_authorized:
    "Full payment or authorization verification",
};
const SMS_TYPE_LABELS = {
  status_update: "Status Update",
  custom: "Custom Message",
  feedback_appreciation: "Appreciation",
};
const SMS_STATE_LABELS = {
  pending: "Pending",
  sent: "Sent",
  skipped: "Skipped",
  failed: "Failed",
};
const SAMPLE_APPROVAL_MISSING_LABEL = "Client sample approval";

const BATCH_STATUS_OPTIONS = [
  "planned",
  "in_production",
  "produced",
  "in_packaging",
  "packaged",
  "delivered",
  "cancelled",
];
const BATCH_STATUS_LABELS = {
  planned: "Planned",
  in_production: "In Production",
  produced: "Produced",
  in_packaging: "In Packaging",
  packaged: "Packaged",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
const getBatchStatusLabel = (status) =>
  BATCH_STATUS_LABELS[status] || status || "Unknown";
const BATCH_PRODUCED_STATUS_SET = new Set([
  "produced",
  "in_packaging",
  "packaged",
  "delivered",
]);
const BATCH_PACKAGED_STATUS_SET = new Set(["packaged", "delivered"]);
const BATCH_DELIVERED_STATUS_SET = new Set(["delivered"]);
const normalizeBatchStatus = (value) => String(value || "").trim().toLowerCase();
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
const buildProjectItemMap = (items = []) =>
  new Map(
    (Array.isArray(items) ? items : []).map((item) => [
      String(item?._id || ""),
      item,
    ]),
  );
const buildBatchItemSummary = (batch, itemMap) => {
  const entries = (Array.isArray(batch?.items) ? batch.items : [])
    .map((entry) => {
      const itemId = String(entry?.itemId || entry?._id || "");
      const item = itemMap.get(itemId);
      const qty = Number(entry?.qty) || 0;
      if (!item || qty <= 0) return "";
      const desc = item.description || "Item";
      const breakdown = String(item.breakdown || "").trim();
      const label = breakdown ? `${desc} - ${breakdown}` : desc;
      return `${label} (${qty})`;
    })
    .filter(Boolean);
  return entries.length > 0 ? entries.join(", ") : "No items assigned.";
};
const getBatchTotalQty = (batch) =>
  (Array.isArray(batch?.items) ? batch.items : []).reduce(
    (acc, entry) => acc + (Number(entry?.qty) || 0),
    0,
  );
const formatBatchQty = (qty, totalQty) => {
  if (!Number.isFinite(qty)) return "";
  const suffix = totalQty > 0 ? `/${totalQty}` : "";
  return `${qty}${suffix}`;
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
  const [smsPrompts, setSmsPrompts] = useState([]);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsModal, setSmsModal] = useState({
    open: false,
    mode: "custom",
    prompt: null,
    message: "",
  });
  const [smsSubmitting, setSmsSubmitting] = useState(false);
  const [smsSendingId, setSmsSendingId] = useState("");
  const [smsSkippingId, setSmsSkippingId] = useState("");
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
  const [quoteDecisionSubmitting, setQuoteDecisionSubmitting] = useState(false);
  const [quoteDecisionNoteDraft, setQuoteDecisionNoteDraft] = useState("");
  const [statusConfirmModal, setStatusConfirmModal] = useState({
    open: false,
    targetStatus: "",
    phrase: "",
  });
  const [statusConfirmInput, setStatusConfirmInput] = useState("");
  const [statusConfirmSubmitting, setStatusConfirmSubmitting] = useState(false);
  const [mockupCarouselIndex, setMockupCarouselIndex] = useState(0);
  const [batchStatusSelections, setBatchStatusSelections] = useState({});
  const [batchDeliveryRecipients, setBatchDeliveryRecipients] = useState({});
  const [batchDeliveryNotes, setBatchDeliveryNotes] = useState({});
  const [batchCancelReasons, setBatchCancelReasons] = useState({});
  const [batchPackagingQty, setBatchPackagingQty] = useState({});
  const [batchDeliveryQty, setBatchDeliveryQty] = useState({});
  const [batchStatusUpdatingId, setBatchStatusUpdatingId] = useState("");

  const currentUserId = toEntityId(user?._id || user?.id);
  const projectLeadUserId = toEntityId(project?.projectLeadId);
  const isLeadUser = Boolean(
    currentUserId && projectLeadUserId && currentUserId === projectLeadUserId,
  );
  const isGroupedOrder = orderGroupProjects.length > 1;
  const orderNumber = String(
    project?.orderId || project?.orderRef?.orderNumber || "",
  ).trim();
  const canManageSms =
    user?.role === "admin" &&
    Boolean(project) &&
    project?.projectType !== "Quote";
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
  const mockupVersions = useMemo(
    () => getMockupVersions(project?.mockup || {}),
    [project?.mockup],
  );
  const visibleMockupVersions = useMemo(() => {
    if (!isLeadUser) return mockupVersions;
    return mockupVersions.filter(
      (entry) => getMockupApprovalStatus(entry.clientApproval || {}) !== "rejected",
    );
  }, [mockupVersions, isLeadUser]);
  const mockupCarouselVersions = useMemo(
    () => visibleMockupVersions.slice().reverse(),
    [visibleMockupVersions],
  );
  const batches = useMemo(
    () => (Array.isArray(project?.batches) ? project.batches : []),
    [project?.batches],
  );
  const batchItemMap = useMemo(
    () => buildProjectItemMap(project?.items || []),
    [project?.items],
  );
  const batchProgress = useMemo(
    () => (project ? buildBatchProgress(project) : null),
    [project],
  );
  const showBatchProgress =
    project?.projectType !== "Quote" &&
    batchProgress &&
    (batchProgress.totalQty > 0 || batches.length > 0);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCountdownNowMs(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    if (mockupCarouselVersions.length === 0) {
      setMockupCarouselIndex(0);
      return;
    }
    setMockupCarouselIndex((prev) =>
      Math.min(Math.max(prev, 0), mockupCarouselVersions.length - 1),
    );
  }, [mockupCarouselVersions.length]);


  const ensureProjectIsEditable = () => {
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

  useEffect(() => {
    if (!batches.length) {
      setBatchStatusSelections({});
      setBatchDeliveryRecipients({});
      setBatchDeliveryNotes({});
      setBatchCancelReasons({});
      return;
    }

    setBatchStatusSelections(() => {
      const next = {};
      batches.forEach((batch) => {
        const batchId = String(batch?.batchId || "");
        if (!batchId) return;
        next[batchId] = String(batch?.status || "planned");
      });
      return next;
    });
    setBatchDeliveryRecipients((prev) => {
      const next = { ...prev };
      batches.forEach((batch) => {
        const batchId = String(batch?.batchId || "");
        if (!batchId) return;
        if (!(batchId in next)) {
          next[batchId] = batch?.delivery?.recipient || "";
        }
      });
      return next;
    });
    setBatchDeliveryNotes((prev) => {
      const next = { ...prev };
      batches.forEach((batch) => {
        const batchId = String(batch?.batchId || "");
        if (!batchId) return;
        if (!(batchId in next)) {
          next[batchId] = batch?.delivery?.notes || "";
        }
      });
      return next;
    });
    setBatchCancelReasons((prev) => {
      const next = { ...prev };
      batches.forEach((batch) => {
        const batchId = String(batch?.batchId || "");
        if (!batchId) return;
        if (!(batchId in next)) {
          next[batchId] = batch?.cancellation?.reason || "";
        }
      });
      return next;
    });
    setBatchPackagingQty((prev) => {
      const next = { ...prev };
      batches.forEach((batch) => {
        const batchId = String(batch?.batchId || "");
        if (!batchId) return;
        if (!(batchId in next)) {
          const fallbackQty = (Array.isArray(batch?.items) ? batch.items : []).reduce(
            (acc, item) => acc + (Number(item?.qty) || 0),
            0,
          );
          next[batchId] = batch?.packaging?.receivedQty ?? fallbackQty;
        }
      });
      return next;
    });
    setBatchDeliveryQty((prev) => {
      const next = { ...prev };
      batches.forEach((batch) => {
        const batchId = String(batch?.batchId || "");
        if (!batchId) return;
        if (!(batchId in next)) {
          const fallbackQty = (Array.isArray(batch?.items) ? batch.items : []).reduce(
            (acc, item) => acc + (Number(item?.qty) || 0),
            0,
          );
          next[batchId] = batch?.delivery?.deliveredQty ?? fallbackQty;
        }
      });
      return next;
    });
  }, [batches]);

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

  const handleBatchStatusUpdate = async (batch) => {
    if (!project || !batch) return;
    const batchId = String(batch?.batchId || "");
    if (!batchId) return;
    const selectedStatus =
      batchStatusSelections[batchId] || String(batch?.status || "planned");

    setBatchStatusUpdatingId(batchId);
    try {
      const payload = { status: selectedStatus };
      if (selectedStatus === "in_packaging") {
        payload.receivedQty = batchPackagingQty[batchId];
      }
      if (selectedStatus === "delivered") {
        payload.recipient = batchDeliveryRecipients[batchId] || "";
        payload.notes = batchDeliveryNotes[batchId] || "";
        payload.deliveredQty = batchDeliveryQty[batchId];
      }
      if (selectedStatus === "cancelled") {
        payload.reason = batchCancelReasons[batchId] || "";
      }

      const res = await fetch(
        `/api/projects/${id}/batches/${batchId}/status?source=admin`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        toast.success("Batch status updated.");
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast.error(errorData.message || "Failed to update batch status.");
      }
    } catch (error) {
      console.error("Batch status update error:", error);
      toast.error("Network error while updating batch.");
    } finally {
      setBatchStatusUpdatingId("");
    }
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

  const openStatusConfirmModal = (nextStatus) => {
    if (!project) return;
    const projectId = project?.orderId || project?._id || id;
    const phrase = buildStatusConfirmPhrase(nextStatus, projectId);
    setStatusConfirmModal({
      open: true,
      targetStatus: nextStatus,
      phrase,
    });
    setStatusConfirmInput("");
  };

  const closeStatusConfirmModal = ({ force = false } = {}) => {
    if (statusConfirmSubmitting && !force) return;
    setStatusConfirmModal({
      open: false,
      targetStatus: "",
      phrase: "",
    });
    setStatusConfirmInput("");
  };

  const handleConfirmStatusChange = async () => {
    if (!statusConfirmModal.open || !statusConfirmModal.targetStatus) return;
    if (statusConfirmInput.trim() !== statusConfirmModal.phrase) return;

    setStatusConfirmSubmitting(true);
    await submitStatusChange(statusConfirmModal.targetStatus);
    setStatusConfirmSubmitting(false);
    closeStatusConfirmModal({ force: true });
  };

  // Status handling
  const handleStatusChange = (newStatus) => {
    if (!project) return;
    if (!ensureProjectIsEditable()) return;

    const currentDisplayStatus = mapQuoteStatusForDisplay(
      project.status,
      project.projectType === "Quote",
      getQuoteRequirementMode(project?.quoteDetails?.checklist || {}),
    );
    if (String(newStatus) === String(currentDisplayStatus)) return;

    openStatusConfirmModal(newStatus);
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
      applyProjectToState(updatedProject);
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
    const nextProject = mergeAcknowledgementUsers(project, data);
    setProject(nextProject);
    setCancelReasonDraft(nextProject.cancellation?.reason || "");
    setEditForm({
      orderId: nextProject.orderId || "",
      client: nextProject.details?.client || "",
      clientEmail: nextProject.details?.clientEmail || "", // [NEW]
      clientPhone: nextProject.details?.clientPhone || "", // [NEW]
      briefOverview: nextProject.details?.briefOverview || "", // [New]
      orderDate: nextProject.orderDate
        ? nextProject.orderDate.split("T")[0]
        : nextProject.createdAt
          ? nextProject.createdAt.split("T")[0]
          : "",
      receivedTime: nextProject.receivedTime || "",
      deliveryDate: nextProject.details?.deliveryDate
        ? nextProject.details.deliveryDate.split("T")[0]
        : "",
      deliveryTime: nextProject.details?.deliveryTime || "",
      deliveryLocation: nextProject.details?.deliveryLocation || "",
      contactType: nextProject.details?.contactType || "None",
      supplySource: formatSupplySource(nextProject.details?.supplySource),
      packagingType: nextProject.details?.packagingType || "",
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
      if (!res.ok) {
        if (res.status === 404) {
          setOrderGroupProjects(fallbackProject ? [fallbackProject] : []);
          return;
        }
        throw new Error("Failed to fetch grouped order projects");
      }

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
      await fetchOrderGroupProjects(
        data?.orderRef?.orderNumber || data?.orderId,
        data,
      );
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

  const fetchSmsPrompts = async () => {
    if (!canManageSms || !project || project.projectType === "Quote") {
      setSmsPrompts([]);
      return;
    }
    try {
      setSmsLoading(true);
      const res = await fetch(`/api/projects/${id}/sms-prompts`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch SMS prompts.");
      const data = await res.json();
      setSmsPrompts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching SMS prompts:", err);
      setSmsPrompts([]);
    } finally {
      setSmsLoading(false);
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
    fetchSmsPrompts();

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
      fetchSmsPrompts();
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

  const openSmsModal = (mode, prompt = null) => {
    setSmsModal({
      open: true,
      mode,
      prompt,
      message: prompt?.message || "",
    });
  };

  const closeSmsModal = () => {
    setSmsModal({
      open: false,
      mode: "custom",
      prompt: null,
      message: "",
    });
  };

  const handleSaveSmsPrompt = async ({ sendAfterSave = false } = {}) => {
    if (!project?._id) return;
    const trimmedMessage = smsModal.message.trim();
    if (!trimmedMessage) {
      toast.error("SMS message cannot be empty.");
      return;
    }

    setSmsSubmitting(true);
    try {
      let promptId = smsModal.prompt?._id || "";
      if (smsModal.mode === "custom") {
        const res = await fetch(`/api/projects/${project._id}/sms-prompts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: trimmedMessage }),
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to create SMS prompt.");
        }
        const created = await res.json();
        promptId = created?._id || "";
      } else if (smsModal.mode === "edit" && smsModal.prompt?._id) {
        const res = await fetch(
          `/api/projects/${project._id}/sms-prompts/${smsModal.prompt._id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ message: trimmedMessage }),
          },
        );
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to update SMS prompt.");
        }
        const updated = await res.json();
        promptId = updated?._id || promptId;
      }

      if (sendAfterSave && promptId) {
        await handleSendSmsPrompt(promptId, trimmedMessage);
      } else {
        await fetchSmsPrompts();
        toast.success("SMS prompt saved.");
      }

      closeSmsModal();
    } catch (err) {
      console.error("Error saving SMS prompt:", err);
      toast.error(err.message || "Failed to save SMS prompt.");
      await fetchSmsPrompts();
    } finally {
      setSmsSubmitting(false);
    }
  };

  const handleSendSmsPrompt = async (promptId, messageOverride = "") => {
    if (!project?._id || !promptId) return;
    setSmsSendingId(promptId);
    try {
      const res = await fetch(
        `/api/projects/${project._id}/sms-prompts/${promptId}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            messageOverride ? { message: messageOverride } : {},
          ),
        },
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to send SMS.");
      }
      await fetchSmsPrompts();
      toast.success("SMS sent successfully.");
    } catch (err) {
      console.error("Error sending SMS:", err);
      toast.error(err.message || "Failed to send SMS.");
      await fetchSmsPrompts();
    } finally {
      setSmsSendingId("");
    }
  };

  const handleSkipSmsPrompt = async (promptId) => {
    if (!project?._id || !promptId) return;
    setSmsSkippingId(promptId);
    try {
      const res = await fetch(
        `/api/projects/${project._id}/sms-prompts/${promptId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ state: "skipped" }),
        },
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to skip SMS.");
      }
      await fetchSmsPrompts();
      toast.success("SMS prompt skipped.");
    } catch (err) {
      console.error("Error skipping SMS:", err);
      toast.error(err.message || "Failed to skip SMS.");
    } finally {
      setSmsSkippingId("");
    }
  };

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
        applyProjectToState(updatedProject);
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
        applyProjectToState(updatedProject);
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
      applyProjectToState(updatedProject);
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
      ["Pending Master Approval", "Pending Production"].includes(project.status) &&
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

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    const parsed = new Date(dateString);
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
  const activeMockupVersion =
    mockupCarouselVersions[mockupCarouselIndex] || mockupCarouselVersions[0] || null;
  const activeMockupLabel = activeMockupVersion
    ? `v${activeMockupVersion.version}`
    : "Mockup";
  const activeMockupFileUrl = activeMockupVersion?.fileUrl || "";
  const activeMockupFileName =
    activeMockupVersion?.fileName ||
    (activeMockupFileUrl ? activeMockupFileUrl.split("/").pop() : "Mockup");
  const activeMockupFileType = activeMockupVersion?.fileType || "";
  const activeMockupDecision = getMockupApprovalStatus(
    activeMockupVersion?.clientApproval || {},
  );
  const activeMockupReason = String(
    activeMockupVersion?.clientApproval?.rejectionReason || "",
  ).trim();
  const activeMockupIsImage = isImageReferenceFile(
    activeMockupFileUrl,
    activeMockupFileType,
  );
  const activeMockupIsPdf =
    activeMockupFileType === "application/pdf" ||
    /\.pdf$/i.test(activeMockupFileUrl || "");
  const latestMockupVersion =
    mockupCarouselVersions[mockupCarouselVersions.length - 1] || null;
  const latestMockupDecisionStatus = getMockupApprovalStatus(
    latestMockupVersion?.clientApproval || project?.mockup?.clientApproval || {},
  );
  const paymentLabels = {
    part_payment: "Part Payment",
    full_payment: "Full Payment",
    po: "P.O",
    authorized: "Authorized",
  };
  const paymentTypes = (project.paymentVerifications || []).map((entry) => entry.type);
  const isQuoteProject = project.projectType === "Quote";
  const quoteWorkflowStatus = isQuoteProject
    ? normalizeQuoteStatus(project.status || "")
    : project.status || "";
  const quoteChecklist = { ...(project?.quoteDetails?.checklist || {}) };
  const sampleProductionSelected = Boolean(quoteChecklist.sampleProduction);
  const quoteRequirementItems = project?.quoteDetails?.requirementItems || {};
  ["cost", "mockup", "previousSamples", "sampleProduction", "bidSubmission"].forEach(
    (key) => {
      if (!quoteChecklist[key] && quoteRequirementItems?.[key]?.isRequired) {
        if (sampleProductionSelected && key === "mockup") {
          return;
        }
        quoteChecklist[key] = true;
      }
    },
  );
  const quoteRequirementMode = isQuoteProject
    ? getQuoteRequirementMode(quoteChecklist)
    : "none";
  const isCostOnlyQuote = isQuoteProject && quoteRequirementMode === "cost";
  const isMockupOnlyQuote = isQuoteProject && quoteRequirementMode === "mockup";
  const isPreviousSamplesOnlyQuote =
    isQuoteProject && quoteRequirementMode === "previousSamples";
  const isSampleProductionOnlyQuote =
    isQuoteProject && quoteRequirementMode === "sampleProduction";
  const quoteHasUnsupportedRequirements = Object.entries(quoteChecklist).some(
    ([key, value]) =>
      !["cost", "mockup", "previousSamples", "sampleProduction"].includes(key) &&
      Boolean(value),
  );
  const enabledQuoteRequirements = [
    "cost",
    "mockup",
    "previousSamples",
    "sampleProduction",
  ].filter((key) => quoteChecklist?.[key]);
  const effectiveEnabledRequirements = quoteChecklist.sampleProduction
    ? enabledQuoteRequirements.filter((key) => key !== "mockup")
    : enabledQuoteRequirements;
  const quoteHasMultipleRequirements = effectiveEnabledRequirements.length > 1;
  const quoteWorkflowBlocked =
    isQuoteProject &&
    !isCostOnlyQuote &&
    !isMockupOnlyQuote &&
    !isPreviousSamplesOnlyQuote &&
    !isSampleProductionOnlyQuote;
  const quoteWorkflowBlockedMessage = quoteWorkflowBlocked
    ? quoteRequirementMode === "none"
      ? "Quote requirements are not configured yet."
      : quoteHasMultipleRequirements
        ? "Multiple quote requirements are selected. Only one workflow can be active right now."
        : quoteHasUnsupportedRequirements
          ? "Quote requirement workflows are not configured yet."
          : ""
    : "";
  const quoteCostVerification = project?.quoteDetails?.costVerification || {};
  const quoteCostAmountValue = Number.parseFloat(quoteCostVerification?.amount);
  const quoteCostVerified =
    isCostOnlyQuote &&
    Number.isFinite(quoteCostAmountValue) &&
    quoteCostAmountValue > 0;
  const quotePreviousSamplesRequirement =
    project?.quoteDetails?.requirementItems?.previousSamples || {};
  const quotePreviousSamplesStatus = String(
    quotePreviousSamplesRequirement?.status || "",
  )
    .trim()
    .toLowerCase();
  const quotePreviousSamplesStatusLabel = quotePreviousSamplesStatus
    ? quotePreviousSamplesStatus
        .split("_")
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" ")
    : "Pending";
  const quoteSampleProductionRequirement =
    project?.quoteDetails?.requirementItems?.sampleProduction || {};
  const quoteSampleProductionStatus = String(
    quoteSampleProductionRequirement?.status || "",
  )
    .trim()
    .toLowerCase();
  const quoteSampleProductionStatusLabel = quoteSampleProductionStatus
    ? quoteSampleProductionStatus
        .split("_")
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
        .join(" ")
    : "Pending";
  const currentDisplayStatus = mapQuoteStatusForDisplay(
    quoteWorkflowStatus,
    isQuoteProject,
    quoteRequirementMode,
  );
  const statusMovementNote = statusConfirmModal.open
    ? getStatusMovementNote(
        currentDisplayStatus,
        statusConfirmModal.targetStatus,
        isQuoteProject,
        quoteRequirementMode,
      )
    : "";
  const quoteDecisionState = isQuoteProject
    ? getQuoteDecisionState(project)
    : { status: "pending", note: "", validatedAt: null };
  const quoteDecisionTaken =
    isQuoteProject &&
    ["go_ahead", "declined"].includes(quoteDecisionState.status);
  const canValidateQuoteDecision =
    isQuoteProject &&
    ["Pending Client Decision", "Quote Submission Completed", "Completed"].includes(
      quoteWorkflowStatus,
    );
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
    ["Pending Master Approval", "Pending Production"].includes(project.status) &&
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

  const normalizeReferenceFileUrl = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "object") {
      return String(
        value.fileUrl ||
          value.url ||
          value.path ||
          value.location ||
          value.filename ||
          "",
      ).trim();
    }
    return "";
  };

  const normalizeAttachment = (value) => {
    if (!value) return null;
    if (typeof value === "string") {
      const fileUrl = value.trim();
      return fileUrl
        ? {
            fileUrl,
            fileName: "",
            fileType: "",
            note: "",
          }
        : null;
    }
    if (typeof value === "object") {
      const fileUrl = normalizeReferenceFileUrl(value);
      if (!fileUrl) return null;
      return {
        fileUrl,
        fileName:
          typeof value.fileName === "string"
            ? value.fileName
            : typeof value.name === "string"
              ? value.name
              : "",
        fileType:
          typeof value.fileType === "string"
            ? value.fileType
            : typeof value.type === "string"
              ? value.type
              : "",
        note: typeof value.note === "string" ? value.note : "",
      };
    }
    return null;
  };

  const getReferenceFileName = (attachment = {}) => {
    const explicitName = String(attachment.fileName || "").trim();
    if (explicitName) return explicitName;
    const url = String(attachment.fileUrl || "").split("?")[0];
    const segments = url.split("/").filter(Boolean);
    return segments[segments.length - 1] || "File";
  };

  function isImageReferenceFile(fileUrl, fileType) {
    const normalizedType = String(fileType || "").toLowerCase();
    if (normalizedType.startsWith("image/")) return true;
    if (typeof fileUrl !== "string") return false;
    const path = fileUrl.split("?")[0];
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(path);
  }

  const sampleImageValue = project.sampleImage || details.sampleImage;
  const sampleImageNote = String(details.sampleImageNote || "").trim();
  const sampleAttachment = sampleImageValue
    ? normalizeAttachment(sampleImageValue)
    : null;
  const referenceItems = [];
  const referenceIndex = new Map();
  const addReferenceItem = (item) => {
    if (!item || !item.fileUrl) return;
    const key = item.fileUrl;
    const existingIndex = referenceIndex.get(key);
    if (existingIndex === undefined) {
      referenceIndex.set(key, referenceItems.length);
      referenceItems.push({ ...item });
      return;
    }
    const existing = referenceItems[existingIndex];
    if (!existing.note && item.note) existing.note = item.note;
    if (!existing.fileName && item.fileName) existing.fileName = item.fileName;
    if (!existing.fileType && item.fileType) existing.fileType = item.fileType;
  };

  if (sampleAttachment) {
    addReferenceItem({
      ...sampleAttachment,
      note: sampleImageNote || sampleAttachment.note || "",
    });
  }

  [...(project.attachments || []), ...(details.attachments || [])].forEach(
    (attachment) => {
      const normalized = normalizeAttachment(attachment);
      if (normalized) addReferenceItem(normalized);
    },
  );
  const revisionMeta = getRevisionMeta(project);
  const revisionCount = getRevisionCount(project);

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
          <p className="header-project-name">
            {renderProjectName(details, null, "Untitled Project")}
          </p>
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
              className={`status-badge-select ${quoteWorkflowStatus
                ?.toLowerCase()
                .replace(/\s+/g, "-")}`}
              value={mapQuoteStatusForDisplay(
                quoteWorkflowStatus,
                isQuoteProject,
                quoteRequirementMode,
              )}
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
                ? isMockupOnlyQuote
                  ? [
                      "Quote Created",
                      "Pending Scope Approval",
                      "Scope Approval Completed",
                      "Pending Mockup",
                      "Mockup Completed",
                      "Pending Quote Submission",
                      "Quote Submitted",
                      "Pending Decision",
                      "Completed",
                      "Finished",
                      ...(isProjectOnHold ? ["On Hold"] : []),
                    ]
                  : isPreviousSamplesOnlyQuote
                    ? [
                        "Quote Created",
                        "Pending Scope Approval",
                        "Scope Approval Completed",
                        "Pending Sample / Work done Retrieval",
                        "Pending Sample / Work done Sent",
                        "Quote Submitted",
                        "Pending Decision",
                        "Completed",
                        "Finished",
                        ...(isProjectOnHold ? ["On Hold"] : []),
                      ]
                    : isSampleProductionOnlyQuote
                      ? [
                          "Quote Created",
                          "Pending Scope Approval",
                          "Scope Approval Completed",
                          "Pending Mockup",
                          "Mockup Completed",
                          "Pending Sample Production",
                          "Pending Quote Submission",
                          "Quote Submitted",
                          "Pending Decision",
                          "Completed",
                          "Finished",
                          ...(isProjectOnHold ? ["On Hold"] : []),
                        ]
                  : [
                      "Quote Created",
                      "Pending Scope Approval",
                      "Scope Approval Completed",
                      "Pending Cost Verification",
                      "Cost Verified",
                      "Pending Quote Submission",
                      "Quote Submitted",
                      "Pending Decision",
                      "Completed",
                      "Finished",
                      ...(isProjectOnHold ? ["On Hold"] : []),
                    ]
                : [
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

          {/* Quote Decision & Cost (Only for Quote projects) */}
          {project.projectType === "Quote" && (
            <div className="detail-card">
              <h3 className="card-title">Quote Decision &amp; Cost</h3>
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
                    {quoteWorkflowBlocked
                      ? quoteWorkflowBlockedMessage ||
                        "Quote workflows are not configured yet."
                      : "Quote decision can only be validated after status reaches Pending Client Decision or Quote Submission Completed."}
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
                {isCostOnlyQuote && (
                  <div
                    className={`checklist-admin-item quote-requirement-admin-item ${
                      quoteCostVerified ? "is-required" : "is-not-required"
                    }`}
                  >
                    <div className="quote-requirement-admin-header">
                      <span className="quote-requirement-admin-title">
                        Quote Cost
                      </span>
                      <span className="quote-requirement-admin-status">
                        {quoteCostVerified ? "Verified" : "Pending"}
                      </span>
                    </div>
                    <div className="quote-requirement-admin-updated">
                      Amount: {formatAmountLabel(quoteCostAmountValue, quoteCostVerification?.currency)}
                    </div>
                    {quoteCostVerification?.updatedAt && (
                      <div className="quote-requirement-admin-updated">
                        Updated {formatLastUpdated(quoteCostVerification.updatedAt)}
                      </div>
                    )}
                    {quoteCostVerification?.note && (
                      <div className="quote-requirement-admin-helper">
                        Note: {quoteCostVerification.note}
                      </div>
                    )}
                  </div>
                )}
                {isMockupOnlyQuote && (
                  <div
                    className={`checklist-admin-item quote-requirement-admin-item ${
                      latestMockupDecisionStatus === "approved"
                        ? "is-required"
                        : "is-not-required"
                    }`}
                  >
                    <div className="quote-requirement-admin-header">
                      <span className="quote-requirement-admin-title">
                        Quote Mockup
                      </span>
                      <span className="quote-requirement-admin-status">
                        {latestMockupDecisionStatus === "approved"
                          ? "Approved"
                          : latestMockupDecisionStatus === "rejected"
                            ? "Rejected"
                            : "Pending"}
                      </span>
                    </div>
                    <div className="quote-requirement-admin-updated">
                      Latest:{" "}
                      {latestMockupVersion?.version
                        ? `v${latestMockupVersion.version}`
                        : "N/A"}
                    </div>
                    {latestMockupVersion?.uploadedAt && (
                      <div className="quote-requirement-admin-updated">
                        Updated {formatLastUpdated(latestMockupVersion.uploadedAt)}
                      </div>
                    )}
                    {latestMockupDecisionStatus === "rejected" &&
                      latestMockupVersion?.clientApproval?.rejectionReason && (
                        <div className="quote-requirement-admin-helper">
                          Note: {latestMockupVersion.clientApproval.rejectionReason}
                        </div>
                      )}
                  </div>
                )}
                {isPreviousSamplesOnlyQuote && (
                  <div
                    className={`checklist-admin-item quote-requirement-admin-item ${
                      ["dept_submitted", "frontdesk_review", "sent_to_client", "client_approved"].includes(
                        quotePreviousSamplesStatus,
                      )
                        ? "is-required"
                        : "is-not-required"
                    }`}
                  >
                    <div className="quote-requirement-admin-header">
                      <span className="quote-requirement-admin-title">
                        Previous Sample / Jobs Done
                      </span>
                      <span className="quote-requirement-admin-status">
                        {quotePreviousSamplesStatusLabel}
                      </span>
                    </div>
                    {quotePreviousSamplesRequirement.updatedAt && (
                      <div className="quote-requirement-admin-updated">
                        Updated{" "}
                        {formatLastUpdated(quotePreviousSamplesRequirement.updatedAt)}
                      </div>
                    )}
                    {quotePreviousSamplesRequirement.note && (
                      <div className="quote-requirement-admin-helper">
                        Note: {quotePreviousSamplesRequirement.note}
                      </div>
                    )}
                  </div>
                )}
                {isSampleProductionOnlyQuote && (
                  <div
                    className={`checklist-admin-item quote-requirement-admin-item ${
                      ["dept_submitted", "frontdesk_review", "sent_to_client", "client_approved"].includes(
                        quoteSampleProductionStatus,
                      )
                        ? "is-required"
                        : "is-not-required"
                    }`}
                  >
                    <div className="quote-requirement-admin-header">
                      <span className="quote-requirement-admin-title">
                        Sample Production
                      </span>
                      <span className="quote-requirement-admin-status">
                        {quoteSampleProductionStatusLabel}
                      </span>
                    </div>
                    <div className="quote-requirement-admin-updated">
                      Mockup:{" "}
                      {latestMockupDecisionStatus === "approved"
                        ? "Approved"
                        : latestMockupDecisionStatus === "rejected"
                          ? "Rejected"
                          : "Pending"}
                    </div>
                    {quoteSampleProductionRequirement.updatedAt && (
                      <div className="quote-requirement-admin-updated">
                        Updated{" "}
                        {formatLastUpdated(quoteSampleProductionRequirement.updatedAt)}
                      </div>
                    )}
                    {quoteSampleProductionRequirement.note && (
                      <div className="quote-requirement-admin-helper">
                        Note: {quoteSampleProductionRequirement.note}
                      </div>
                    )}
                  </div>
                )}
                {quoteWorkflowBlocked && (
                  <p className="quote-requirement-admin-empty">
                    {quoteWorkflowBlockedMessage ||
                      "Quote workflows are not configured yet."}
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
          {referenceItems.length > 0 && (
            <div className="detail-card">
              <div className="detail-card-header">
                <h3 className="card-title">Reference Material</h3>
                {revisionMeta && revisionCount > 0 && (
                  <span className="revision-badge">
                    Revision v{revisionCount} by {revisionMeta.updatedByName} -{" "}
                    {formatDateTime(revisionMeta.updatedAt)}
                  </span>
                )}
              </div>
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
                    {referenceItems.map((attachment, idx) => {
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
                            gap: "0.4rem",
                          }}
                        >
                          <Link
                            to={fileUrl}
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
                              (e.currentTarget.style.transform = "scale(1.02)")
                            }
                            onMouseOut={(e) =>
                              (e.currentTarget.style.transform = "scale(1)")
                            }
                            title={fileName}
                          >
                            {isImage ? (
                              <img
                                src={fileUrl}
                                alt={fileName || "attachment"}
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
                            to={fileUrl}
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
                          {note && <div className="reference-note">{note}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {visibleMockupVersions.length > 0 && (
            <div className="detail-card">
              <h3 className="card-title">Mockups</h3>
              <div
                style={{
                  display: "grid",
                  gap: "0.85rem",
                  marginTop: "1rem",
                }}
              >
                <div className="project-mockup-carousel">
                  <button
                    type="button"
                    className="project-mockup-nav"
                    onClick={() =>
                      setMockupCarouselIndex((prev) => Math.max(prev - 1, 0))
                    }
                    disabled={mockupCarouselIndex === 0}
                    aria-label="Previous mockup"
                  >
                    {"<"}
                  </button>

                  <div className="project-mockup-preview">
                    {activeMockupIsImage ? (
                      <img
                        src={activeMockupFileUrl}
                        alt={activeMockupFileName}
                        loading="lazy"
                      />
                    ) : activeMockupIsPdf ? (
                      <iframe
                        src={activeMockupFileUrl}
                        title={`Preview of ${activeMockupFileName}`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="project-mockup-fallback">
                        Preview not available for this file type.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="project-mockup-nav"
                    onClick={() =>
                      setMockupCarouselIndex((prev) =>
                        Math.min(
                          prev + 1,
                          Math.max(mockupCarouselVersions.length - 1, 0),
                        ),
                      )
                    }
                    disabled={
                      mockupCarouselIndex >= mockupCarouselVersions.length - 1
                    }
                    aria-label="Next mockup"
                  >
                    {">"}
                  </button>
                </div>

                <div className="project-mockup-caption">
                  <strong>{activeMockupLabel}</strong>
                  <span>{activeMockupFileName}</span>
                </div>

                <div className={`project-mockup-status ${activeMockupDecision}`}>
                  {activeMockupDecision === "approved"
                    ? "Client Approved"
                    : activeMockupDecision === "rejected"
                      ? "Client Rejected"
                      : "Pending Client Decision"}
                </div>
                {activeMockupDecision === "rejected" && activeMockupReason && (
                  <div className="project-mockup-reason">
                    Reason: {activeMockupReason}
                  </div>
                )}

                <div className="project-mockup-track">
                  {mockupCarouselVersions.map((entry, index) => {
                    const status = getMockupApprovalStatus(
                      entry.clientApproval || {},
                    );
                    return (
                      <button
                        key={
                          entry.entryId
                            ? `project-mockup-${entry.entryId}`
                            : `project-mockup-${entry.version}-${index}`
                        }
                        type="button"
                        title={entry.fileName || ""}
                        className={`project-mockup-chip status-${status} ${
                          mockupCarouselIndex === index ? "active" : ""
                        }`}
                        onClick={() => setMockupCarouselIndex(index)}
                      >
                        v{entry.version}
                      </button>
                    );
                  })}
                </div>

                <div className="project-mockup-links">
                  <Link
                    to={activeMockupFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    reloadDocument
                  >
                    View {activeMockupLabel}
                  </Link>
                  <Link
                    to={activeMockupFileUrl}
                    download
                    reloadDocument
                    className="download"
                  >
                    Download {activeMockupFileName}
                  </Link>
                </div>

                {activeMockupVersion?.note && (
                  <div className="project-mockup-note">
                    Note: {activeMockupVersion.note}
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

          <div className="detail-card">
            <div className="detail-card-header">
              <h3 className="card-title">Batch Management</h3>
              <span className="batch-admin-count">
                {batches.length} {batches.length === 1 ? "batch" : "batches"}
              </span>
            </div>
            {showBatchProgress && (
              <div className="batch-admin-progress">
                <div className="batch-admin-progress-header">Batch Progress</div>
                {batchProgress.totalQty === 0 ? (
                  <div className="batch-admin-progress-empty">
                    No items available for batch progress.
                  </div>
                ) : (
                  <>
                    <div className="batch-admin-progress-summary">
                      Assigned to batches:{" "}
                      <strong>
                        {batchProgress.allocatedQty}/{batchProgress.totalQty}
                      </strong>{" "}
                      ({batchProgress.allocatedPercent}%)
                    </div>
                    <div className="batch-admin-progress-row">
                      <span>Produced</span>
                      <div className="batch-admin-progress-bar">
                        <span
                          style={{ width: `${batchProgress.producedPercent}%` }}
                        />
                      </div>
                      <strong>
                        {batchProgress.producedQty}/{batchProgress.totalQty} (
                        {batchProgress.producedPercent}%)
                      </strong>
                    </div>
                    <div className="batch-admin-progress-row">
                      <span>Packaged</span>
                      <div className="batch-admin-progress-bar">
                        <span
                          style={{ width: `${batchProgress.packagedPercent}%` }}
                        />
                      </div>
                      <strong>
                        {batchProgress.packagedQty}/{batchProgress.totalQty} (
                        {batchProgress.packagedPercent}%)
                      </strong>
                    </div>
                    <div className="batch-admin-progress-row">
                      <span>Delivered</span>
                      <div className="batch-admin-progress-bar">
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
            {batches.length === 0 ? (
              <p className="batch-admin-empty">
                No batches created yet for this project.
              </p>
            ) : (
              <div className="batch-admin-list">
                {batches.map((batch) => {
                  const batchId = String(batch?.batchId || "");
                  const currentStatus = String(batch?.status || "planned");
                  const selectedStatus =
                    batchStatusSelections[batchId] || currentStatus;
                  const isUpdating = batchStatusUpdatingId === batchId;
                  const summary = buildBatchItemSummary(batch, batchItemMap);
                  const batchTotalQty = getBatchTotalQty(batch);
                  const producedQtyValue = Number(batch?.packaging?.receivedQty);
                  const deliveredQtyValue = Number(batch?.delivery?.deliveredQty);
                  const producedQtyLabel = formatBatchQty(
                    producedQtyValue,
                    batchTotalQty,
                  );
                  const deliveredQtyLabel = formatBatchQty(
                    deliveredQtyValue,
                    batchTotalQty,
                  );
                  return (
                    <div key={batchId || batch?.label} className="batch-admin-item">
                      <div className="batch-admin-header">
                        <div>
                          <h4>{batch?.label || "Batch"}</h4>
                          <p>{summary}</p>
                        </div>
                        <span className={`batch-admin-status ${currentStatus}`}>
                          {getBatchStatusLabel(currentStatus)}
                        </span>
                      </div>
                      <div className="batch-admin-meta">
                        {batch?.createdAt && (
                          <span>Created {formatLastUpdated(batch.createdAt)}</span>
                        )}
                        {batch?.updatedAt && (
                          <span>Updated {formatLastUpdated(batch.updatedAt)}</span>
                        )}
                        {producedQtyLabel && (
                          <span>Produced Qty: {producedQtyLabel}</span>
                        )}
                        {deliveredQtyLabel && (
                          <span>Delivered Qty: {deliveredQtyLabel}</span>
                        )}
                      </div>
                      <div className="batch-admin-controls">
                        <label className="batch-admin-field">
                          <span>Status Override</span>
                          <select
                            value={selectedStatus}
                            onChange={(event) =>
                              setBatchStatusSelections((prev) => ({
                                ...prev,
                                [batchId]: event.target.value,
                              }))
                            }
                            disabled={isUpdating}
                          >
                            {BATCH_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>
                                {getBatchStatusLabel(status)}
                              </option>
                            ))}
                          </select>
                        </label>

                        {selectedStatus === "in_packaging" && (
                          <label className="batch-admin-field">
                            <span>Produced Qty (Packaging Confirmation)</span>
                            <input
                              type="number"
                              min="1"
                              value={batchPackagingQty[batchId] ?? ""}
                              onChange={(event) =>
                                setBatchPackagingQty((prev) => ({
                                  ...prev,
                                  [batchId]: event.target.value,
                                }))
                              }
                              placeholder="Enter produced quantity"
                              disabled={isUpdating}
                            />
                          </label>
                        )}

                        {selectedStatus === "delivered" && (
                          <>
                            <label className="batch-admin-field">
                              <span>Delivered Qty</span>
                              <input
                                type="number"
                                min="1"
                                value={batchDeliveryQty[batchId] ?? ""}
                                onChange={(event) =>
                                  setBatchDeliveryQty((prev) => ({
                                    ...prev,
                                    [batchId]: event.target.value,
                                  }))
                                }
                                placeholder="Enter delivered quantity"
                                disabled={isUpdating}
                              />
                            </label>
                            <label className="batch-admin-field">
                              <span>Recipient (Optional)</span>
                              <input
                                type="text"
                                value={batchDeliveryRecipients[batchId] || ""}
                                onChange={(event) =>
                                  setBatchDeliveryRecipients((prev) => ({
                                    ...prev,
                                    [batchId]: event.target.value,
                                  }))
                                }
                                placeholder="Who received this batch?"
                                disabled={isUpdating}
                              />
                            </label>
                            <label className="batch-admin-field">
                              <span>Delivery Notes (Optional)</span>
                              <textarea
                                rows={2}
                                value={batchDeliveryNotes[batchId] || ""}
                                onChange={(event) =>
                                  setBatchDeliveryNotes((prev) => ({
                                    ...prev,
                                    [batchId]: event.target.value,
                                  }))
                                }
                                placeholder="Optional delivery notes"
                                disabled={isUpdating}
                              />
                            </label>
                          </>
                        )}

                        {selectedStatus === "cancelled" && (
                          <label className="batch-admin-field">
                            <span>Cancellation Reason (Optional)</span>
                            <input
                              type="text"
                              value={batchCancelReasons[batchId] || ""}
                              onChange={(event) =>
                                setBatchCancelReasons((prev) => ({
                                  ...prev,
                                  [batchId]: event.target.value,
                                }))
                              }
                              placeholder="Why was this batch cancelled?"
                              disabled={isUpdating}
                            />
                          </label>
                        )}

                        <button
                          type="button"
                          className="batch-admin-update-btn"
                          onClick={() => handleBatchStatusUpdate(batch)}
                          disabled={isUpdating}
                        >
                          {isUpdating ? "Updating..." : "Update Status"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </>
          )}

          {activeContentTab === "updates" && (
            <>
          {canManageSms && (
            <div className="detail-card sms-prompts-card">
              <div className="sms-prompts-header">
                <div>
                  <h3 className="card-title sms-prompts-title">Client SMS Prompts</h3>
                  <p className="sms-prompts-subtitle">
                    Review progress updates and choose whether to send them.
                  </p>
                </div>
                <div className="sms-prompts-actions">
                  <span className="sms-prompts-count">
                    {smsPrompts.length}{" "}
                    {smsPrompts.length === 1 ? "prompt" : "prompts"}
                  </span>
                  <button
                    type="button"
                    className="sms-action-btn outline"
                    onClick={() => openSmsModal("custom")}
                  >
                    Draft Custom SMS
                  </button>
                </div>
              </div>

              <div className="sms-prompts-list">
                {smsLoading ? (
                  <div className="sms-prompts-empty">Loading SMS prompts...</div>
                ) : smsPrompts.length === 0 ? (
                  <div className="sms-prompts-empty">No SMS prompts yet.</div>
                ) : (
                  smsPrompts.map((prompt) => {
                    const stateLabel =
                      SMS_STATE_LABELS[prompt.state] || "Pending";
                    const typeLabel =
                      SMS_TYPE_LABELS[prompt.type] || "Status Update";
                    const titleLabel = prompt.title || typeLabel;
                    const isSending = smsSendingId === prompt._id;
                    const canSend = prompt.state !== "sent";
                    const canEdit = prompt.state !== "sent";
                    return (
                      <div
                        key={prompt._id}
                        className={`sms-prompt-item ${prompt.state || "pending"}`}
                      >
                        <div className="sms-prompt-header">
                          <div>
                            <strong>{titleLabel}</strong>
                            <span className="sms-prompt-meta">
                              Status: {prompt.projectStatus || project.status}
                            </span>
                          </div>
                          <span
                            className={`sms-prompt-status ${prompt.state || "pending"}`}
                          >
                            {stateLabel}
                          </span>
                        </div>
                        <p className="sms-prompt-message">
                          {prompt.message || "No message drafted yet."}
                        </p>
                        <div className="sms-prompt-meta-row">
                          <span>
                            Progress: {Number(prompt.progressPercent || 0)}%
                          </span>
                          <span>
                            Created: {formatLastUpdated(prompt.createdAt)}
                          </span>
                        </div>
                        {prompt.lastError && (
                          <div className="sms-prompt-error">
                            Last error: {prompt.lastError}
                          </div>
                        )}
                        <div className="sms-prompt-actions">
                          <button
                            type="button"
                            className="sms-action-btn primary"
                            onClick={() => handleSendSmsPrompt(prompt._id)}
                            disabled={!canSend || isSending}
                          >
                            {isSending ? "Sending..." : "Send SMS"}
                          </button>
                          <button
                            type="button"
                            className="sms-action-btn outline"
                            onClick={() => openSmsModal("edit", prompt)}
                            disabled={!canEdit || isSending}
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
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
          {isGroupedOrder ? (
            <div className="detail-card group-meeting-notice">
              <h3 className="card-title">Departmental Meeting</h3>
              <p>
                Meetings for grouped orders are scheduled on the Group Projects
                page so they apply to every project in the order.
              </p>
              {orderNumber && (
                <button
                  type="button"
                  className="group-meeting-btn"
                  onClick={() =>
                    navigate(`/projects/orders/${encodeURIComponent(orderNumber)}`)
                  }
                >
                  Open Group Projects
                </button>
              )}
            </div>
          ) : (
            <OrderMeetingCard
              project={project}
              orderGroupProjects={orderGroupProjects}
              user={user}
              onMeetingOverrideChange={(updatedProject) =>
                applyProjectToState(updatedProject)
              }
            />
          )}
          <ProjectRemindersCard project={project} user={user} />
          <div className="detail-card">
            <h3
              className="card-title"
              style={{ justifyContent: "space-between" }}
            >
              <span>People & Departments</span>
              {!isEditingLead ? (
                (user?.role === "admin" || !isLeadUser) &&
                !isProjectOnHold && (
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
                    const acknowledgement = project.acknowledgements?.find(
                      (a) => a.department === dept,
                    );
                    const isAcknowledged = Boolean(acknowledgement);
                    const acknowledgedBy = getPersonName(acknowledgement?.user);
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
                        {isAcknowledged && acknowledgedBy && (
                          <span className="dept-ack-user">
                            by {acknowledgedBy}
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

      <Modal
        isOpen={smsModal.open}
        onClose={closeSmsModal}
        title={smsModal.mode === "custom" ? "Draft Custom SMS" : "Edit SMS Prompt"}
        maxWidth="560px"
      >
        <div className="sms-modal-body">
          <div className="sms-modal-field">
            <label>Client</label>
            <div className="sms-modal-value">
              {project?.details?.client || "N/A"}
            </div>
          </div>
          <div className="sms-modal-field">
            <label>Phone</label>
            <div className="sms-modal-value">
              {project?.details?.clientPhone ||
                project?.orderRef?.clientPhone ||
                "No phone on file"}
            </div>
          </div>
          <div className="sms-modal-field">
            <label>Message</label>
            <textarea
              className="sms-textarea"
              rows="4"
              value={smsModal.message}
              onChange={(event) =>
                setSmsModal((prev) => ({ ...prev, message: event.target.value }))
              }
              placeholder="Write a message to the client..."
            />
          </div>
          <div className="sms-modal-actions">
            <button
              type="button"
              className="sms-action-btn muted"
              onClick={closeSmsModal}
              disabled={smsSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="sms-action-btn outline"
              onClick={() => handleSaveSmsPrompt({ sendAfterSave: false })}
              disabled={smsSubmitting}
            >
              Save
            </button>
            <button
              type="button"
              className="sms-action-btn primary"
              onClick={() => handleSaveSmsPrompt({ sendAfterSave: true })}
              disabled={smsSubmitting}
            >
              {smsSubmitting ? "Saving..." : "Save & Send"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={statusConfirmModal.open}
        onClose={() => closeStatusConfirmModal()}
        title="Confirm Status Change"
        maxWidth="560px"
      >
        <div className="status-confirm-modal">
          <p className="status-confirm-text">
            You are about to change the project status. Type the phrase below to
            confirm.
          </p>
          <div className="status-confirm-summary">
            <div className="status-confirm-summary-row">
              <span className="status-confirm-summary-label">Current</span>
              <span className="status-confirm-summary-value">
                {currentDisplayStatus || "N/A"}
              </span>
            </div>
            <div className="status-confirm-summary-row">
              <span className="status-confirm-summary-label">New</span>
              <span className="status-confirm-summary-value">
                {statusConfirmModal.targetStatus || "N/A"}
              </span>
            </div>
          </div>
          {statusMovementNote ? (
            <p className="status-confirm-note">{statusMovementNote}</p>
          ) : null}
          <div className="status-confirm-phrase">{statusConfirmModal.phrase}</div>
          <div className="status-confirm-input-group">
            <label className="status-confirm-label" htmlFor="status-confirm-input">
              Confirmation
            </label>
            <input
              id="status-confirm-input"
              type="text"
              className="edit-input status-confirm-input"
              value={statusConfirmInput}
              onChange={(e) => setStatusConfirmInput(e.target.value)}
              placeholder="Type the confirmation phrase..."
              disabled={statusConfirmSubmitting}
            />
          </div>
          <div className="status-confirm-actions">
            <button
              type="button"
              className="status-confirm-btn cancel"
              onClick={() => closeStatusConfirmModal()}
              disabled={statusConfirmSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="status-confirm-btn confirm"
              onClick={handleConfirmStatusChange}
              disabled={
                statusConfirmSubmitting ||
                statusConfirmInput.trim() !== statusConfirmModal.phrase
              }
            >
              {statusConfirmSubmitting ? "Confirming..." : "Confirm Status"}
            </button>
          </div>
        </div>
      </Modal>

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
        projectName={renderProjectName(details, null, "Untitled Project")}
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
        projectName={renderProjectName(project?.details, null, "Untitled Project")}
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
        projectName={renderProjectName(project?.details, null, "Untitled Project")}
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

