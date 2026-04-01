import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { renderProjectName } from "../../utils/projectName";
import { appendPortalSource, resolvePortalSource } from "../../utils/portalSource";
import { normalizeReferenceAttachments } from "../../utils/referenceAttachments";
import {
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
  normalizeQuoteStatus,
} from "../../utils/quoteStatus";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import "./NewOrders.css";

const DELIVERY_CONFIRM_PHRASE = "I confirm this order has been delivered";
const INVOICE_CONFIRM_PHRASE = "I confirm the invoice has been sent";
const INVOICE_UNDO_PHRASE = "I confirm the invoice status should be reset";
const QUOTE_CONFIRM_PHRASE = "I confirm the quote has been sent";
const QUOTE_UNDO_PHRASE = "I confirm the quote status should be reset";
const MOCKUP_APPROVAL_CONFIRM_PHRASE =
  "I confirm the client approved this mockup";
const MOCKUP_REJECTION_CONFIRM_PHRASE =
  "I confirm the client rejected this mockup";
const SAMPLE_APPROVAL_CONFIRM_PHRASE =
  "I confirm the client approved the production sample";
const SAMPLE_APPROVAL_RESET_PHRASE =
  "I confirm sample approval should be reset to pending";
const FEEDBACK_MEDIA_ACCEPT = "image/*,audio/*,video/*";
const FEEDBACK_MEDIA_MAX_FILES = 6;
const REVISION_LOCKED_STATUSES = new Set([
  "Completed",
  "Delivered",
  "Feedback Completed",
  "Finished",
]);
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
const PAYMENT_OPTIONS = [
  {
    type: "part_payment",
    label: "Part Payment",
    phrase: "I confirm part payment has been received",
    undoPhrase: "I confirm part payment verification should be removed",
  },
  {
    type: "full_payment",
    label: "Full Payment",
    phrase: "I confirm full payment has been received",
    undoPhrase: "I confirm full payment verification should be removed",
  },
  {
    type: "po",
    label: "P.O",
    phrase: "I confirm a purchase order has been received",
    undoPhrase: "I confirm P.O verification should be removed",
  },
  {
    type: "authorized",
    label: "Authorized",
    phrase: "I confirm payment authorization has been received",
    undoPhrase: "I confirm authorization verification should be removed",
  },
];

const formatDate = (dateString) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatFileSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(size) / Math.log(1024)),
  );
  const value = size / 1024 ** index;
  const precision = value >= 10 || index === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[index]}`;
};

const paymentLabels = {
  part_payment: "Part Payment",
  full_payment: "Full Payment",
  po: "P.O",
  authorized: "Authorized",
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
const QUOTE_REQUIREMENT_KEYS = [
  "cost",
  "mockup",
  "previousSamples",
  "sampleProduction",
  "bidSubmission",
];

const ORDER_WORKFLOW_STEPS = [
  {
    key: "scope",
    label: "Scope",
    statuses: [
      "Order Created",
      "Pending Scope Approval",
      "Scope Approval Completed",
      "Pending Departmental Meeting",
      "Pending Departmental Engagement",
      "Departmental Engagement Completed",
    ],
  },
  {
    key: "mockup",
    label: "Mockup",
    statuses: ["Pending Mockup", "Mockup Completed"],
  },
  {
    key: "production",
    label: "Production",
    statuses: [
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
    ],
  },
  {
    key: "billing",
    label: "Billing",
    statuses: [
      "Pending Production",
      "Production Completed",
      "Pending Quality Control",
      "Quality Control Completed",
      "Pending Photography",
      "Photography Completed",
      "Pending Packaging",
      "Packaging Completed",
      "Pending Delivery/Pickup",
    ],
  },
  {
    key: "delivery",
    label: "Delivery",
    statuses: [
      "Pending Delivery/Pickup",
      "Delivered",
      "Pending Feedback",
      "Feedback Completed",
      "Completed",
      "Finished",
    ],
  },
];

const QUOTE_WORKFLOW_STEPS_BY_MODE = {
  cost: [
    {
      key: "scope",
      label: "Scope",
      statuses: [
        "Quote Created",
        "Pending Scope Approval",
        "Scope Approval Completed",
      ],
    },
    {
      key: "cost",
      label: "Cost Verification",
      statuses: ["Pending Cost Verification", "Cost Verification Completed"],
    },
    {
      key: "submission",
      label: "Quote Submission",
      statuses: ["Pending Quote Submission", "Quote Submission Completed"],
    },
    {
      key: "decision",
      label: "Client Decision",
      statuses: ["Pending Client Decision", "Completed", "Finished"],
    },
  ],
  mockup: [
    {
      key: "scope",
      label: "Scope",
      statuses: [
        "Quote Created",
        "Pending Scope Approval",
        "Scope Approval Completed",
      ],
    },
    {
      key: "mockup",
      label: "Mockup",
      statuses: ["Pending Mockup", "Mockup Completed"],
    },
    {
      key: "submission",
      label: "Quote Submission",
      statuses: ["Pending Quote Submission", "Quote Submission Completed"],
    },
    {
      key: "decision",
      label: "Client Decision",
      statuses: ["Pending Client Decision", "Completed", "Finished"],
    },
  ],
  previousSamples: [
    {
      key: "scope",
      label: "Scope",
      statuses: [
        "Quote Created",
        "Pending Scope Approval",
        "Scope Approval Completed",
      ],
    },
    {
      key: "retrieval",
      label: "Sample Retrieval",
      statuses: ["Pending Sample Retrieval", "Pending Sample / Work done Retrieval"],
    },
    {
      key: "submission",
      label: "Sample / Work done Sent",
      statuses: [
        "Pending Quote Submission",
        "Pending Sample / Work done Sent",
        "Quote Submission Completed",
      ],
    },
    {
      key: "decision",
      label: "Client Decision",
      statuses: ["Pending Client Decision", "Completed", "Finished"],
    },
  ],
  sampleProduction: [
    {
      key: "scope",
      label: "Scope",
      statuses: [
        "Quote Created",
        "Pending Scope Approval",
        "Scope Approval Completed",
      ],
    },
    {
      key: "mockup",
      label: "Mockup",
      statuses: ["Pending Mockup", "Mockup Completed"],
    },
    {
      key: "production",
      label: "Sample Production",
      statuses: ["Pending Production", "Pending Sample Production"],
    },
    {
      key: "submission",
      label: "Quote Submission",
      statuses: ["Pending Quote Submission", "Quote Submission Completed"],
    },
    {
      key: "decision",
      label: "Client Decision",
      statuses: ["Pending Client Decision", "Completed", "Finished"],
    },
  ],
  bidSubmission: [
    {
      key: "scope",
      label: "Scope",
      statuses: [
        "Quote Created",
        "Pending Scope Approval",
        "Scope Approval Completed",
      ],
    },
    {
      key: "documents",
      label: "Bid Documents",
      statuses: [
        "Pending Quote Submission",
        "Pending Bid Submission / Documents",
      ],
    },
    {
      key: "submission",
      label: "Quote Submission",
      statuses: ["Quote Submission Completed"],
    },
    {
      key: "decision",
      label: "Client Decision",
      statuses: ["Pending Client Decision", "Completed", "Finished"],
    },
  ],
};

const getQuoteWorkflowSteps = (mode) =>
  QUOTE_WORKFLOW_STEPS_BY_MODE[mode] || QUOTE_WORKFLOW_STEPS_BY_MODE.cost;

const resolveWorkflowJourney = (
  status = "",
  isQuoteProject = false,
  requirementMode = "",
) => {
  const steps = isQuoteProject
    ? getQuoteWorkflowSteps(requirementMode)
    : ORDER_WORKFLOW_STEPS;
  const activeIndex = steps.findIndex((step) => step.statuses.includes(status));
  const normalizedIndex = activeIndex >= 0 ? activeIndex : 0;

  return steps.map((step, index) => ({
    ...step,
    state:
      index < normalizedIndex
        ? "complete"
        : index === normalizedIndex
          ? "active"
          : "upcoming",
  }));
};

const isImageAsset = (fileUrl = "", fileType = "") => {
  const normalizedType = String(fileType || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;

  const normalizedUrl = String(fileUrl || "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"].some(
    (extension) => normalizedUrl.includes(extension),
  );
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
const QUOTE_REQUIREMENT_LABELS = {
  cost: "Cost",
  mockup: "Mockup",
  previousSamples: "Previous Sample / Jobs Done",
  sampleProduction: "Sample Production",
  bidSubmission: "Bid Submission / Documents",
};
const QUOTE_CONVERSION_TYPE_OPTIONS = [
  "Standard",
  "Emergency",
  "Corporate Job",
];
const QUOTE_CONVERSION_STATUS_OPTIONS = [
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
const QUOTE_DECISION_STATUS_LABELS = {
  pending: "Pending Decision",
  go_ahead: "Go Ahead",
  declined: "Declined",
};

const formatBillingRequirementLabels = (missing = []) =>
  (Array.isArray(missing) ? missing : [])
    .map((item) => BILLING_REQUIREMENT_LABELS[item] || item)
    .filter(Boolean);

const normalizeQuoteChecklist = (checklist = {}) =>
  QUOTE_REQUIREMENT_KEYS.reduce((accumulator, key) => {
    accumulator[key] = Boolean(checklist?.[key]);
    return accumulator;
  }, {});

const QUOTE_PREVIOUS_SAMPLES_RETRIEVE_STATUSES = new Set([
  "assigned",
  "in_progress",
  "client_revision_requested",
]);

const formatQuoteRequirementStatusLabel = (status = "") => {
  const normalized = String(status || "").trim();
  if (!normalized) return "Pending";
  return normalized
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
};

const formatProjectStatusForDisplay = (
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

const formatQuoteDecisionStatus = (value) =>
  QUOTE_DECISION_STATUS_LABELS[normalizeQuoteDecisionStatus(value)] ||
  "Pending Decision";

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

const UPDATE_CATEGORY_OPTIONS = [
  "General",
  "Client",
  "Production",
  "Graphics",
  "Photography",
  "Stores",
  "IT Department",
];

const normalizeUpdateCategory = (category) => {
  if (category === "Design" || category === "Graphics/Design") {
    return "Graphics";
  }
  return category || "General";
};

const isFeedbackMediaFile = (file) => {
  const mimeType = String(file?.type || "").toLowerCase();
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/")
  );
};

const getFeedbackAttachmentName = (attachment) => {
  if (attachment?.fileName) return attachment.fileName;
  const rawUrl = String(attachment?.fileUrl || "").split("?")[0];
  const parts = rawUrl.split("/").filter(Boolean);
  return parts[parts.length - 1] || "Attachment";
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

const toDepartmentList = (department) => {
  if (Array.isArray(department)) {
    return department.map((entry) => String(entry || "").trim()).filter(Boolean);
  }
  const normalized = String(department || "").trim();
  return normalized ? [normalized] : [];
};

const isGraphicsDepartmentValue = (department) =>
  toDepartmentList(department).some((entry) => {
    const normalized = entry.toLowerCase();
    return (
      normalized === "graphics/design" ||
      normalized === "graphics" ||
      normalized === "design" ||
      normalized.includes("graphics")
    );
  });

const isGraphicsUploader = (uploader) => {
  if (!uploader || typeof uploader !== "object") return false;
  return isGraphicsDepartmentValue(uploader.department);
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
      const decisionStatus = getMockupApprovalStatus(entry?.clientApproval || {});
      return {
        entryId: entry?._id || entry?.id || null,
        version,
        fileUrl: String(entry?.fileUrl || "").trim(),
        fileName: String(entry?.fileName || "").trim(),
        fileType: String(entry?.fileType || "").trim(),
        note: String(entry?.note || "").trim(),
        uploadedBy: entry?.uploadedBy || null,
        uploadedAt: entry?.uploadedAt || null,
        clientApproval: {
          status: decisionStatus,
          isApproved: decisionStatus === "approved",
          approvedAt: entry?.clientApproval?.approvedAt || null,
          rejectedAt: entry?.clientApproval?.rejectedAt || null,
          rejectionReason: String(entry?.clientApproval?.rejectionReason || "").trim(),
          note: String(entry?.clientApproval?.note || "").trim(),
        },
      };
    })
    .filter((entry) => entry.fileUrl && isGraphicsUploader(entry.uploadedBy));

  if (
    normalized.length === 0 &&
    mockup?.fileUrl &&
    isGraphicsUploader(mockup?.uploadedBy)
  ) {
    const parsedVersion = Number.parseInt(mockup?.version, 10);
    const version =
      Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
    const decisionStatus = getMockupApprovalStatus(mockup?.clientApproval || {});
    normalized.push({
      entryId: mockup?._id || mockup?.id || null,
      version,
      fileUrl: String(mockup.fileUrl || "").trim(),
      fileName: String(mockup.fileName || "").trim(),
      fileType: String(mockup.fileType || "").trim(),
      note: String(mockup.note || "").trim(),
      uploadedBy: mockup?.uploadedBy || null,
      uploadedAt: mockup.uploadedAt || null,
      clientApproval: {
        status: decisionStatus,
        isApproved: decisionStatus === "approved",
        approvedAt: mockup?.clientApproval?.approvedAt || null,
        rejectedAt: mockup?.clientApproval?.rejectedAt || null,
        rejectionReason: String(mockup?.clientApproval?.rejectionReason || "").trim(),
        note: String(mockup?.clientApproval?.note || "").trim(),
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

const OrderActions = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const [toast, setToast] = useState({
    show: false,
    message: "",
    type: "success",
  });

  const [feedbackModal, setFeedbackModal] = useState({
    open: false,
    project: null,
  });
  const [feedbackType, setFeedbackType] = useState("Positive");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [feedbackFiles, setFeedbackFiles] = useState([]);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [projectUpdates, setProjectUpdates] = useState([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updateCategory, setUpdateCategory] = useState("General");
  const [updateContent, setUpdateContent] = useState("");
  const [updateSubmitting, setUpdateSubmitting] = useState(false);
  const [editingUpdateId, setEditingUpdateId] = useState(null);
  const [editUpdateCategory, setEditUpdateCategory] = useState("General");
  const [editUpdateContent, setEditUpdateContent] = useState("");
  const [updateEditSubmitting, setUpdateEditSubmitting] = useState(false);
  const [updateDeleteSubmittingId, setUpdateDeleteSubmittingId] = useState(null);
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

  const [deliveryModal, setDeliveryModal] = useState({
    open: false,
  });
  const [deliveryInput, setDeliveryInput] = useState("");
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [batchDeliveryModal, setBatchDeliveryModal] = useState({
    open: false,
    batch: null,
  });
  const [batchDeliveryInput, setBatchDeliveryInput] = useState("");
  const [batchDeliveryRecipient, setBatchDeliveryRecipient] = useState("");
  const [batchDeliveryNotes, setBatchDeliveryNotes] = useState("");
  const [batchDeliveryQty, setBatchDeliveryQty] = useState("");
  const [batchDeliverySubmitting, setBatchDeliverySubmitting] =
    useState(false);
  const [billingGuardModal, setBillingGuardModal] = useState({
    open: false,
    title: "Billing Caution",
    message: "",
    missingLabels: [],
  });
  const [dismissedBillingGuardKey, setDismissedBillingGuardKey] = useState("");

  const [invoiceModal, setInvoiceModal] = useState(false);
  const [invoiceInput, setInvoiceInput] = useState("");
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false);
  const [invoiceUndoModal, setInvoiceUndoModal] = useState(false);
  const [invoiceUndoInput, setInvoiceUndoInput] = useState("");
  const [invoiceUndoSubmitting, setInvoiceUndoSubmitting] = useState(false);

  const [paymentModal, setPaymentModal] = useState({
    open: false,
    type: null,
  });
  const [paymentInput, setPaymentInput] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentUndoModal, setPaymentUndoModal] = useState({
    open: false,
    type: null,
  });
  const [paymentUndoInput, setPaymentUndoInput] = useState("");
  const [paymentUndoSubmitting, setPaymentUndoSubmitting] = useState(false);
  const [mockupApprovalModal, setMockupApprovalModal] = useState({
    open: false,
    version: null,
  });
  const [mockupApprovalInput, setMockupApprovalInput] = useState("");
  const [mockupApprovalSubmitting, setMockupApprovalSubmitting] =
    useState(false);
  const [mockupRejectionModal, setMockupRejectionModal] = useState({
    open: false,
    version: null,
  });
  const [mockupRejectionInput, setMockupRejectionInput] = useState("");
  const [mockupRejectionReason, setMockupRejectionReason] = useState("");
  const [mockupRejectionSubmitting, setMockupRejectionSubmitting] =
    useState(false);
  const [sampleApprovalModal, setSampleApprovalModal] = useState(false);
  const [sampleApprovalInput, setSampleApprovalInput] = useState("");
  const [sampleApprovalSubmitting, setSampleApprovalSubmitting] = useState(false);
  const [sampleApprovalResetModal, setSampleApprovalResetModal] = useState(false);
  const [sampleApprovalResetInput, setSampleApprovalResetInput] = useState("");
  const [sampleApprovalResetSubmitting, setSampleApprovalResetSubmitting] =
    useState(false);
  const [quoteCostAmount, setQuoteCostAmount] = useState("");
  const [quoteCostCurrency, setQuoteCostCurrency] = useState("");
  const [quoteCostNote, setQuoteCostNote] = useState("");
  const [quoteCostSubmitting, setQuoteCostSubmitting] = useState(false);
  const [quoteCostResetting, setQuoteCostResetting] = useState(false);
  const [quoteCostResetConfirmOpen, setQuoteCostResetConfirmOpen] =
    useState(false);
  const [quoteMockupResetConfirmOpen, setQuoteMockupResetConfirmOpen] =
    useState(false);
  const [quoteMockupResetting, setQuoteMockupResetting] = useState(false);
  const [quotePreviousSamplesSubmitting, setQuotePreviousSamplesSubmitting] =
    useState(false);
  const [quotePreviousSamplesResetConfirmOpen, setQuotePreviousSamplesResetConfirmOpen] =
    useState(false);
  const [quotePreviousSamplesResetting, setQuotePreviousSamplesResetting] =
    useState(false);
  const [quoteSampleProductionResetConfirmOpen, setQuoteSampleProductionResetConfirmOpen] =
    useState(false);
  const [quoteSampleProductionResetting, setQuoteSampleProductionResetting] =
    useState(false);
  const [quoteBidDocsSensitive, setQuoteBidDocsSensitive] = useState(false);
  const [quoteBidDocsFiles, setQuoteBidDocsFiles] = useState([]);
  const [quoteBidDocsSaving, setQuoteBidDocsSaving] = useState(false);
  const [quoteDecisionNote, setQuoteDecisionNote] = useState("");
  const [quoteDecisionSubmitting, setQuoteDecisionSubmitting] = useState(false);
  const [quoteConversionType, setQuoteConversionType] = useState("Standard");
  const [quoteConversionStatus, setQuoteConversionStatus] =
    useState("Pending Scope Approval");
  const [quoteConversionSubmitting, setQuoteConversionSubmitting] =
    useState(false);
  const [focusedWorkflowStep, setFocusedWorkflowStep] = useState("");
  const [billingPanelOpen, setBillingPanelOpen] = useState(false);
  const [mockupCarouselIndex, setMockupCarouselIndex] = useState(0);
  const [mockupLightboxVersion, setMockupLightboxVersion] = useState(null);

  const portalSource = useMemo(() => resolvePortalSource(), []);
  const withPortalSource = (url) => appendPortalSource(url, portalSource);
  const fetchWithPortal = (url, options) =>
    fetch(withPortalSource(url), options);
  const toastTimeoutRef = useRef(null);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(
      () => setToast({ show: false, message: "", type }),
      5000,
    );
  };

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    },
    [],
  );

  const isAdminUser = currentUser?.role === "admin";
  const isFrontDeskUser = currentUser?.department?.includes("Front Desk");
  const canManageBilling = isAdminUser || isFrontDeskUser;
  const canManageSms =
    ((portalSource === "admin" && isAdminUser) || isFrontDeskUser) &&
    project?.projectType !== "Quote";
  const canMarkDelivered = canManageBilling;
  const canManageFeedback = canManageBilling;
  const canShareUpdates = canManageBilling;
  const canAddFeedbackFor = (order) =>
    ["Pending Feedback", "Feedback Completed", "Delivered"].includes(
      order?.status,
    );
  const batches = useMemo(
    () => (Array.isArray(project?.batches) ? project.batches : []),
    [project?.batches],
  );
  const activeBatches = useMemo(
    () => batches.filter((batch) => batch?.status !== "cancelled"),
    [batches],
  );
  const hasBatches = batches.length > 0;
  const batchItemMap = useMemo(
    () => buildProjectItemMap(project?.items || []),
    [project?.items],
  );
  const deliveredBatchCount = useMemo(
    () => activeBatches.filter((batch) => batch?.status === "delivered").length,
    [activeBatches],
  );
  const batchDeliveryProgressLabel =
    activeBatches.length > 0
      ? `${deliveredBatchCount} of ${activeBatches.length} delivered`
      : "No active batches";

  const smsSource =
    portalSource === "admin" ? "admin" : isFrontDeskUser ? "frontdesk" : "";
  const smsSourceQuery = smsSource ? `?source=${smsSource}` : "";

  const fetchCurrentUser = async () => {
    try {
      const res = await fetchWithPortal("/api/auth/me", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data);
      }
    } catch (err) {
      console.error("Error fetching current user:", err);
    }
  };

  const fetchProject = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithPortal("/api/projects?mode=report");
      if (!res.ok) {
        throw new Error("Failed to load order.");
      }
      const data = await res.json();
      const match = data.find((item) => item._id === id);
      if (!match) {
        throw new Error("Order not found.");
      }
      setProject(match);
    } catch (err) {
      setError(err.message || "Failed to load order.");
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectUpdates = async (projectId) => {
    if (!projectId) {
      setProjectUpdates([]);
      return;
    }

    setUpdatesLoading(true);
    try {
      const res = await fetchWithPortal(`/api/updates/project/${projectId}`);
      if (!res.ok) {
        throw new Error("Failed to load project updates.");
      }
      const data = await res.json();
      setProjectUpdates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching project updates:", err);
    } finally {
      setUpdatesLoading(false);
    }
  };

  const fetchSmsPrompts = async (projectId) => {
    if (!projectId || !canManageSms) {
      setSmsPrompts([]);
      return;
    }

    setSmsLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sms-prompts${smsSourceQuery}`,
      );
      if (!res.ok) throw new Error("Failed to load SMS prompts.");
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
    fetchCurrentUser();
    fetchProject();
  }, [id]);

  useEffect(() => {
    if (project?._id) {
      fetchProjectUpdates(project._id);
    } else {
      setProjectUpdates([]);
    }
  }, [project?._id]);

  useEffect(() => {
    if (project?._id && canManageSms) {
      fetchSmsPrompts(project._id);
    } else {
      setSmsPrompts([]);
    }
  }, [project?._id, canManageSms]);

  useRealtimeRefresh(
    (detail) => {
      if (!project?._id) return;

      const changedPath = String(detail?.path || "");
      const updatesChanged = changedPath.startsWith("/api/updates");
      const thisProjectChanged = changedPath.includes(`/api/projects/${project._id}`);

      if (thisProjectChanged) {
        fetchProject();
        fetchProjectUpdates(project._id);
        if (canManageSms) fetchSmsPrompts(project._id);
        return;
      }

      if (updatesChanged) {
        fetchProjectUpdates(project._id);
      }
    },
    { enabled: Boolean(project?._id) },
  );

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
      showToast("SMS message cannot be empty.", "error");
      return;
    }

    setSmsSubmitting(true);
    try {
      let promptId = smsModal.prompt?._id || "";
      if (smsModal.mode === "custom") {
        const res = await fetch(
          `/api/projects/${project._id}/sms-prompts${smsSourceQuery}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: trimmedMessage }),
          },
        );
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to create SMS prompt.");
        }
        const created = await res.json();
        promptId = created?._id || "";
      } else if (smsModal.mode === "edit" && smsModal.prompt?._id) {
        const res = await fetch(
          `/api/projects/${project._id}/sms-prompts/${smsModal.prompt._id}${smsSourceQuery}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
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
        await fetchSmsPrompts(project._id);
        showToast("SMS prompt saved.");
      }

      closeSmsModal();
    } catch (err) {
      console.error("Error saving SMS prompt:", err);
      showToast(err.message || "Failed to save SMS prompt.", "error");
    } finally {
      setSmsSubmitting(false);
    }
  };

  const handleSendSmsPrompt = async (promptId, messageOverride = "") => {
    if (!project?._id || !promptId) return;
    setSmsSendingId(promptId);
    try {
      const res = await fetch(
        `/api/projects/${project._id}/sms-prompts/${promptId}/send${smsSourceQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            messageOverride ? { message: messageOverride } : {},
          ),
        },
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to send SMS.");
      }
      await fetchSmsPrompts(project._id);
      showToast("SMS sent successfully.");
    } catch (err) {
      console.error("Error sending SMS:", err);
      showToast(err.message || "Failed to send SMS.", "error");
    } finally {
      setSmsSendingId("");
    }
  };

  const handleSkipSmsPrompt = async (promptId) => {
    if (!project?._id || !promptId) return;
    setSmsSkippingId(promptId);
    try {
      const res = await fetch(
        `/api/projects/${project._id}/sms-prompts/${promptId}${smsSourceQuery}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "skipped" }),
        },
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to skip SMS.");
      }
      await fetchSmsPrompts(project._id);
      showToast("SMS prompt skipped.");
    } catch (err) {
      console.error("Error skipping SMS:", err);
      showToast(err.message || "Failed to skip SMS.", "error");
    } finally {
      setSmsSkippingId("");
    }
  };

  useEffect(() => {
    if (feedbackModal.open && feedbackModal.project && project?._id) {
      if (
        project._id === feedbackModal.project._id &&
        project !== feedbackModal.project
      ) {
        setFeedbackModal((prev) => ({ ...prev, project }));
      }
    }
  }, [project, feedbackModal.open, feedbackModal.project]);

  useEffect(() => {
    const isQuote = project?.projectType === "Quote";
    const decision = project?.quoteDetails?.decision || {};

    if (!isQuote) {
      setQuoteDecisionNote("");
      setQuoteConversionType("Standard");
      return;
    }

    setQuoteDecisionNote(String(decision?.note || "").trim());

    const convertedType = String(decision?.convertedToType || "").trim();
    setQuoteConversionType(
      QUOTE_CONVERSION_TYPE_OPTIONS.includes(convertedType)
        ? convertedType
        : "Standard",
    );
  }, [project?._id, project?.projectType, project?.quoteDetails?.decision]);

  useEffect(() => {
    const isQuote = project?.projectType === "Quote";
    if (!isQuote) {
      setQuoteCostAmount("");
      setQuoteCostCurrency("");
      setQuoteCostNote("");
      return;
    }

    const costVerification = project?.quoteDetails?.costVerification || {};
    const amountValue = costVerification?.amount;
    setQuoteCostAmount(
      amountValue === 0 || Number.isFinite(amountValue)
        ? String(amountValue)
        : "",
    );
    setQuoteCostCurrency(String(costVerification?.currency || "").trim());
    setQuoteCostNote(String(costVerification?.note || "").trim());
  }, [project?._id, project?.projectType, project?.quoteDetails?.costVerification]);

  const paymentTypes = useMemo(
    () => new Set((project?.paymentVerifications || []).map((p) => p.type)),
    [project],
  );
  const mockupVersions = useMemo(
    () => getMockupVersions(project?.mockup || {}),
    [project?.mockup],
  );
  const latestMockupVersion =
    mockupVersions.length > 0 ? mockupVersions[mockupVersions.length - 1] : null;
  const latestMockupVersionLabel = latestMockupVersion
    ? `v${latestMockupVersion.version}`
    : "";
  const latestMockupDecisionStatus = latestMockupVersion
    ? getMockupApprovalStatus(latestMockupVersion?.clientApproval || {})
    : "pending";
  const mockupApprovalPending = Boolean(
    latestMockupVersion?.fileUrl && latestMockupDecisionStatus === "pending",
  );
  const mockupApprovalRejected = Boolean(
    latestMockupVersion?.fileUrl && latestMockupDecisionStatus === "rejected",
  );
  const mockupApprovalConfirmed = Boolean(
    latestMockupVersion?.fileUrl && latestMockupDecisionStatus === "approved",
  );
  const isQuoteProject = project?.projectType === "Quote";
  const quoteWorkflowStatus = isQuoteProject
    ? normalizeQuoteStatus(project?.status || "")
    : project?.status || "";
  const invoiceSent = Boolean(project?.invoice?.sent);
  const billingDocumentLabel = isQuoteProject ? "Quote" : "Invoice";
  const billingDocumentLower = isQuoteProject ? "quote" : "invoice";
  const billingConfirmPhrase = isQuoteProject
    ? QUOTE_CONFIRM_PHRASE
    : INVOICE_CONFIRM_PHRASE;
  const billingUndoPhrase = isQuoteProject
    ? QUOTE_UNDO_PHRASE
    : INVOICE_UNDO_PHRASE;
  const canManageMockupApproval = canManageBilling;
  const sampleRequirementEnabled =
    !isQuoteProject && Boolean(project?.sampleRequirement?.isRequired);
  const sampleApprovalStatus = getSampleApprovalStatus(project?.sampleApproval || {});
  const sampleApprovalConfirmed =
    sampleRequirementEnabled && sampleApprovalStatus === "approved";
  const sampleApprovalPending =
    sampleRequirementEnabled && sampleApprovalStatus !== "approved";
  const quoteChecklist = useMemo(
    () => {
      if (!isQuoteProject) return {};
      const base = normalizeQuoteChecklist(
        project?.quoteDetails?.checklist || {},
      );
      const sampleProductionSelected = Boolean(base.sampleProduction);
      const requirementItems = project?.quoteDetails?.requirementItems || {};
      Object.keys(base).forEach((key) => {
        if (!base[key] && requirementItems?.[key]?.isRequired) {
          if (sampleProductionSelected && key === "mockup") {
            return;
          }
          base[key] = true;
        }
      });
      return base;
    },
    [
      isQuoteProject,
      project?.quoteDetails?.checklist,
      project?.quoteDetails?.requirementItems,
    ],
  );
  const unsupportedQuoteRequirementKeys = useMemo(
    () =>
      QUOTE_REQUIREMENT_KEYS.filter(
        (key) =>
          ![
            "cost",
            "mockup",
            "previousSamples",
            "sampleProduction",
            "bidSubmission",
          ].includes(key) && quoteChecklist[key],
      ),
    [quoteChecklist],
  );
  const unsupportedQuoteRequirementLabels = useMemo(
    () =>
      unsupportedQuoteRequirementKeys.map(
        (key) => QUOTE_REQUIREMENT_LABELS[key] || key,
      ),
    [unsupportedQuoteRequirementKeys],
  );
  const quoteRequirementMode = useMemo(
    () => (isQuoteProject ? getQuoteRequirementMode(quoteChecklist) : "none"),
    [isQuoteProject, quoteChecklist],
  );
  const isCostOnlyQuote = isQuoteProject && quoteRequirementMode === "cost";
  const isMockupOnlyQuote = isQuoteProject && quoteRequirementMode === "mockup";
  const isPreviousSamplesOnlyQuote =
    isQuoteProject && quoteRequirementMode === "previousSamples";
  const isSampleProductionOnlyQuote =
    isQuoteProject && quoteRequirementMode === "sampleProduction";
  const isBidSubmissionOnlyQuote =
    isQuoteProject && quoteRequirementMode === "bidSubmission";
  const enabledQuoteRequirements = useMemo(
    () =>
      [
        "cost",
        "mockup",
        "previousSamples",
        "sampleProduction",
        "bidSubmission",
      ].filter(
        (key) => quoteChecklist[key],
      ),
    [quoteChecklist],
  );
  const effectiveEnabledRequirements = useMemo(
    () =>
      quoteChecklist.sampleProduction
        ? enabledQuoteRequirements.filter((key) => key !== "mockup")
        : enabledQuoteRequirements,
    [enabledQuoteRequirements, quoteChecklist.sampleProduction],
  );
  const quoteHasMultipleRequirements = effectiveEnabledRequirements.length > 1;
  const quoteWorkflowBlocked =
    isQuoteProject &&
    !isCostOnlyQuote &&
    !isMockupOnlyQuote &&
    !isPreviousSamplesOnlyQuote &&
    !isSampleProductionOnlyQuote &&
    !isBidSubmissionOnlyQuote;
  const quoteWorkflowBlockedMessage = quoteWorkflowBlocked
    ? quoteRequirementMode === "none"
      ? "Quote requirements are not configured yet."
      : quoteHasMultipleRequirements
        ? "Multiple quote requirements are selected. Only one workflow can be active right now."
        : unsupportedQuoteRequirementLabels.length > 0
          ? `Unsupported requirements: ${unsupportedQuoteRequirementLabels.join(", ")}.`
          : "Quote requirement workflows are not configured yet."
    : "";
  const quoteCostVerification = project?.quoteDetails?.costVerification || {};
  const quoteCostAmountValue = Number.parseFloat(quoteCostVerification?.amount);
  const quoteCostVerified =
    isCostOnlyQuote &&
    Number.isFinite(quoteCostAmountValue) &&
    quoteCostAmountValue > 0;
  const quotePreviousSamplesRequirement = useMemo(() => {
    if (!isQuoteProject) {
      return { isRequired: false, status: "not_required", updatedAt: null, note: "" };
    }
    return project?.quoteDetails?.requirementItems?.previousSamples || {
      isRequired: Boolean(quoteChecklist.previousSamples),
      status: "assigned",
      updatedAt: null,
      note: "",
    };
  }, [isQuoteProject, project?.quoteDetails?.requirementItems, quoteChecklist.previousSamples]);
  const quotePreviousSamplesStatus = String(
    quotePreviousSamplesRequirement?.status || "",
  )
    .trim()
    .toLowerCase() || "assigned";
  const quotePreviousSamplesStatusLabel = formatQuoteRequirementStatusLabel(
    quotePreviousSamplesStatus,
  );
  const quotePreviousSamplesRetrieved = [
    "dept_submitted",
    "frontdesk_review",
    "sent_to_client",
    "client_approved",
  ].includes(quotePreviousSamplesStatus);
  const quotePreviousSamplesReadyForSubmission = [
    "dept_submitted",
    "frontdesk_review",
  ].includes(quotePreviousSamplesStatus);
  const quoteSampleProductionRequirement = useMemo(() => {
    if (!isQuoteProject) {
      return { isRequired: false, status: "not_required", updatedAt: null, note: "" };
    }
    return project?.quoteDetails?.requirementItems?.sampleProduction || {
      isRequired: Boolean(quoteChecklist.sampleProduction),
      status: "assigned",
      updatedAt: null,
      note: "",
    };
  }, [
    isQuoteProject,
    project?.quoteDetails?.requirementItems,
    quoteChecklist.sampleProduction,
  ]);
  const quoteSampleProductionStatus = String(
    quoteSampleProductionRequirement?.status || "",
  )
    .trim()
    .toLowerCase() || "assigned";
  const quoteSampleProductionStatusLabel = formatQuoteRequirementStatusLabel(
    quoteSampleProductionStatus,
  );
  const quoteSampleProductionCompleted = [
    "dept_submitted",
    "frontdesk_review",
    "sent_to_client",
    "client_approved",
  ].includes(quoteSampleProductionStatus);
  const quoteSampleProductionReadyForSubmission = [
    "dept_submitted",
    "frontdesk_review",
  ].includes(quoteSampleProductionStatus);
  const quoteBidSubmissionRequirement = useMemo(() => {
    if (!isQuoteProject) {
      return { isRequired: false, status: "not_required", updatedAt: null, note: "" };
    }
    return project?.quoteDetails?.requirementItems?.bidSubmission || {
      isRequired: Boolean(quoteChecklist.bidSubmission),
      status: "assigned",
      updatedAt: null,
      note: "",
    };
  }, [isQuoteProject, project?.quoteDetails?.requirementItems, quoteChecklist.bidSubmission]);
  const quoteBidSubmissionStatus = String(
    quoteBidSubmissionRequirement?.status || "",
  )
    .trim()
    .toLowerCase() || "assigned";
  const quoteBidSubmissionStatusLabel = formatQuoteRequirementStatusLabel(
    quoteBidSubmissionStatus,
  );
  const bidSubmissionDetails = project?.quoteDetails?.bidSubmission || {};
  const bidSubmissionDocuments = useMemo(
    () => normalizeReferenceAttachments(bidSubmissionDetails.documents || []),
    [bidSubmissionDetails.documents],
  );
  const bidSubmissionIsSensitive = Boolean(bidSubmissionDetails.isSensitive);
  const bidSubmissionHasDocuments = bidSubmissionDocuments.length > 0;
  const bidSubmissionReady = bidSubmissionIsSensitive || bidSubmissionHasDocuments;
  const canSubmitQuote =
    isQuoteProject &&
    !quoteWorkflowBlocked &&
    (isCostOnlyQuote
      ? quoteCostVerified
      : isMockupOnlyQuote
        ? mockupApprovalConfirmed
        : isPreviousSamplesOnlyQuote
          ? quotePreviousSamplesReadyForSubmission
          : isSampleProductionOnlyQuote
            ? quoteSampleProductionReadyForSubmission
            : isBidSubmissionOnlyQuote
              ? bidSubmissionReady
            : false);
  const quoteCostMissing =
    isCostOnlyQuote && !quoteCostVerified;
  const quoteMockupMissing =
    isMockupOnlyQuote && !mockupApprovalConfirmed;
  const quotePreviousSamplesMissing =
    isPreviousSamplesOnlyQuote && !quotePreviousSamplesRetrieved;
  const quoteSampleProductionMissing =
    isSampleProductionOnlyQuote && !quoteSampleProductionCompleted;
  const quoteBidSubmissionMissing =
    isBidSubmissionOnlyQuote && !bidSubmissionReady;
  const canConfirmPreviousSamplesRetrieved =
    isPreviousSamplesOnlyQuote &&
    canManageBilling &&
    !quoteWorkflowBlocked &&
    QUOTE_PREVIOUS_SAMPLES_RETRIEVE_STATUSES.has(quotePreviousSamplesStatus) &&
    !quotePreviousSamplesSubmitting;
  const quoteWorkflowStatusDisplay = isQuoteProject
    ? getQuoteStatusDisplay(quoteWorkflowStatus, quoteRequirementMode)
    : quoteWorkflowStatus;
  const quoteSubmissionLabel = isPreviousSamplesOnlyQuote
    ? "Sample / Work done Sent"
    : isBidSubmissionOnlyQuote
      ? "Bid Submission / Documents Sent"
      : "Quote Submission";
  const quoteSubmissionDescription = isPreviousSamplesOnlyQuote
    ? "Confirm when the sample/work done and quote have been sent to the client."
    : isBidSubmissionOnlyQuote
      ? "Confirm when bid submission documents and the quote have been sent to the client."
      : "Confirm when the quote has been sent to the client.";
  useEffect(() => {
    if (!isQuoteProject) return;
    setQuoteBidDocsSensitive(bidSubmissionIsSensitive);
  }, [isQuoteProject, bidSubmissionIsSensitive, project?._id]);
  const quoteDecisionState = useMemo(
    () => getQuoteDecisionState(project),
    [project],
  );
  const quoteDecisionStatus = quoteDecisionState.status;
  const quoteDecisionTaken =
    isQuoteProject && ["go_ahead", "declined"].includes(quoteDecisionStatus);
  const canValidateQuoteDecision =
    isQuoteProject &&
    canManageBilling &&
    !quoteWorkflowBlocked &&
    ["Pending Client Decision", "Quote Submission Completed", "Completed"].includes(
      quoteWorkflowStatus,
    );
  const canConvertQuoteToProject =
    isQuoteProject &&
    canManageBilling &&
    quoteDecisionStatus === "go_ahead" &&
    ["Pending Client Decision", "Quote Submission Completed", "Completed"].includes(
      quoteWorkflowStatus,
    );
  const convertedFromQuoteAt =
    !isQuoteProject && project?.quoteDetails?.decision?.convertedAt
      ? project.quoteDetails.decision.convertedAt
      : null;
  const workflowJourney = useMemo(
    () =>
      resolveWorkflowJourney(
        quoteWorkflowStatusDisplay,
        isQuoteProject,
        quoteRequirementMode,
      ),
    [quoteWorkflowStatusDisplay, isQuoteProject, quoteRequirementMode],
  );
  const activeJourneyStep = workflowJourney.find((item) => item.state === "active");

  useEffect(() => {
    if (!isQuoteProject) return;
    setQuoteConversionStatus((previous) =>
      QUOTE_CONVERSION_STATUS_OPTIONS.includes(previous)
        ? previous
        : "Pending Scope Approval",
    );
  }, [isQuoteProject]);

  useEffect(() => {
    if (workflowJourney.length === 0) return;
    const defaultStepKey = (activeJourneyStep || workflowJourney[0])?.key || "";
    setFocusedWorkflowStep((previous) => {
      if (!previous) return defaultStepKey;
      const stillExists = workflowJourney.some((item) => item.key === previous);
      return stillExists ? previous : defaultStepKey;
    });
  }, [workflowJourney, activeJourneyStep]);

  useEffect(() => {
    if (mockupVersions.length === 0) {
      setMockupCarouselIndex(0);
      return;
    }

    setMockupCarouselIndex((previous) =>
      Math.min(Math.max(previous, 0), mockupVersions.length - 1),
    );
  }, [mockupVersions.length]);

  const focusedJourneyStep =
    workflowJourney.find((item) => item.key === focusedWorkflowStep) ||
    activeJourneyStep ||
    workflowJourney[0] ||
    null;
  const mentionablePeople = useMemo(() => {
    const people = [];
    const pushPerson = (value) => {
      const name = String(value || "").trim();
      if (!name) return;
      if (people.some((item) => item.toLowerCase() === name.toLowerCase())) return;
      people.push(name);
    };

    const leadName = `${project?.projectLeadId?.firstName || ""} ${project?.projectLeadId?.lastName || ""}`.trim();
    pushPerson(leadName);
    pushPerson(project?.projectLeadId?.email);
    pushPerson(currentUser?.firstName ? `${currentUser.firstName} ${currentUser.lastName || ""}`.trim() : "");
    pushPerson(currentUser?.email);
    return people.slice(0, 4);
  }, [project?.projectLeadId, currentUser]);
  const mockupCarouselVersions = useMemo(
    () => mockupVersions.slice().reverse(),
    [mockupVersions],
  );
  const activeMockupVersion =
    mockupCarouselVersions[mockupCarouselIndex] || mockupCarouselVersions[0] || null;

  const getFrontDeskCommandMessage = (targetStatus) => {
    if (targetStatus === "Mockup Completed") {
      return "Confirm client approval now before mockup completion can proceed.";
    }
    if (targetStatus === "Mockup Rejected") {
      return "Client rejected the mockup. Request Graphics to upload a revised version now.";
    }
    if (targetStatus === "Pending Production") {
      return "Confirm invoice and payment now before production can proceed.";
    }
    if (targetStatus === "Production Sample Approval") {
      return "Confirm client sample approval now before production completion can proceed.";
    }
    if (targetStatus === "Pending Delivery/Pickup") {
      return "Confirm full payment or authorization now before delivery can proceed.";
    }
    return "Confirm billing requirements now before this action can proceed.";
  };

  const openBillingGuardModal = ({
    message,
    missing,
    targetStatus = "",
    forceCommandTone = false,
  }) => {
    const resolvedMessage =
      forceCommandTone || isFrontDeskUser
        ? getFrontDeskCommandMessage(targetStatus)
        : message || "Billing prerequisites are required before this action.";
    const resolvedTitle =
      targetStatus === "Mockup Completed"
        ? "Mockup Caution"
        : targetStatus === "Production Sample Approval"
          ? "Sample Caution"
        : "Billing Caution";

    setBillingGuardModal({
      open: true,
      title: resolvedTitle,
      message: resolvedMessage,
      missingLabels: formatBillingRequirementLabels(missing),
    });
  };

  const closeBillingGuardModal = () => {
    const missingKey = billingGuardModal.missingLabels.join("|");
    if (project?._id) {
      setDismissedBillingGuardKey(
        `${project._id}|${project.status}|${missingKey}`,
      );
    }
    setBillingGuardModal({
      open: false,
      title: "Billing Caution",
      message: "",
      missingLabels: [],
    });
  };

  const handleDeliveryComplete = async () => {
    if (!canMarkDelivered || !project) return;
    try {
      const res = await fetchWithPortal(`/api/projects/${project._id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "Delivered",
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Order delivered. Feedback is now pending.", "success");
        return true;
      }
      const errorData = await res.json();
      if (errorData?.code === "BILLING_PREREQUISITE_MISSING") {
        openBillingGuardModal({
          message: errorData.message,
          missing: errorData.missing || [],
          targetStatus: errorData.targetStatus || "Pending Delivery/Pickup",
          forceCommandTone: true,
        });
        return false;
      }
      showToast(
        errorData.message || "Failed to update status.",
        "error",
      );
      return false;
    } catch (error) {
      console.error("Delivery update error:", error);
      showToast("Network error. Please try again.", "error");
      return false;
    }
  };

  const handleConfirmDelivery = async () => {
    if (deliveryInput.trim() !== DELIVERY_CONFIRM_PHRASE) return;
    setDeliverySubmitting(true);
    const delivered = await handleDeliveryComplete();
    setDeliverySubmitting(false);
    if (delivered) {
      setDeliveryModal({ open: false });
      setDeliveryInput("");
    }
  };

  const openDeliveryModal = () => {
    setDeliveryInput("");
    setDeliveryModal({ open: true });
  };

  const closeDeliveryModal = () => {
    if (deliverySubmitting) return;
    setDeliveryModal({ open: false });
    setDeliveryInput("");
  };

  const handleBatchDeliveryComplete = async (batch) => {
    if (!canMarkDelivered || !project || !batch) return false;
    try {
      const deliveredQty = Number(batchDeliveryQty);
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/batches/${batch.batchId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "delivered",
            recipient: batchDeliveryRecipient,
            notes: batchDeliveryNotes,
            deliveredQty: Number.isFinite(deliveredQty) ? deliveredQty : undefined,
          }),
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Batch delivered successfully.", "success");
        return true;
      }
      const errorData = await res.json().catch(() => ({}));
      showToast(
        errorData.message || "Failed to update batch delivery.",
        "error",
      );
      return false;
    } catch (error) {
      console.error("Batch delivery update error:", error);
      showToast("Network error. Please try again.", "error");
      return false;
    }
  };

  const handleConfirmBatchDelivery = async () => {
    if (batchDeliveryInput.trim() !== DELIVERY_CONFIRM_PHRASE) return;
    const batchTotalQty = getBatchTotalQty(batchDeliveryModal.batch);
    const deliveredQtyValue = Number(batchDeliveryQty);
    if (!Number.isFinite(deliveredQtyValue) || deliveredQtyValue <= 0) {
      showToast("Enter the delivered quantity for this batch.", "error");
      return;
    }
    if (batchTotalQty > 0 && deliveredQtyValue > batchTotalQty) {
      showToast(
        "Delivered quantity cannot exceed the total quantity in this batch.",
        "error",
      );
      return;
    }
    setBatchDeliverySubmitting(true);
    const delivered = await handleBatchDeliveryComplete(batchDeliveryModal.batch);
    setBatchDeliverySubmitting(false);
    if (delivered) {
      closeBatchDeliveryModal();
    }
  };

  const openBatchDeliveryModal = (batch) => {
    setBatchDeliveryInput("");
    setBatchDeliveryRecipient(batch?.delivery?.recipient || "");
    setBatchDeliveryNotes(batch?.delivery?.notes || "");
    const totalQty = getBatchTotalQty(batch);
    const defaultQty =
      batch?.delivery?.deliveredQty ??
      (totalQty > 0 ? totalQty : "");
    setBatchDeliveryQty(
      defaultQty !== "" && defaultQty !== null && defaultQty !== undefined
        ? String(defaultQty)
        : "",
    );
    setBatchDeliveryModal({ open: true, batch });
  };

  const closeBatchDeliveryModal = () => {
    if (batchDeliverySubmitting) return;
    setBatchDeliveryModal({ open: false, batch: null });
    setBatchDeliveryInput("");
    setBatchDeliveryRecipient("");
    setBatchDeliveryNotes("");
    setBatchDeliveryQty("");
  };

  const openFeedbackModal = () => {
    setFeedbackType("Positive");
    setFeedbackNotes("");
    setFeedbackFiles([]);
    setFeedbackModal({ open: true, project });
  };

  const closeFeedbackModal = () => {
    setFeedbackModal({ open: false, project: null });
    setFeedbackType("Positive");
    setFeedbackNotes("");
    setFeedbackFiles([]);
  };

  const handleFeedbackFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length === 0) return;

    const acceptedFiles = selectedFiles.filter((file) =>
      isFeedbackMediaFile(file),
    );
    if (acceptedFiles.length !== selectedFiles.length) {
      showToast(
        "Only photos, audio, and video files can be attached to feedback.",
        "error",
      );
    }

    if (acceptedFiles.length > 0) {
      setFeedbackFiles((prev) => {
        const merged = [...prev, ...acceptedFiles];
        if (merged.length > FEEDBACK_MEDIA_MAX_FILES) {
          showToast(
            `You can attach up to ${FEEDBACK_MEDIA_MAX_FILES} files per feedback.`,
            "error",
          );
          return merged.slice(0, FEEDBACK_MEDIA_MAX_FILES);
        }
        return merged;
      });
    }

    event.target.value = "";
  };

  const handleRemoveFeedbackFile = (indexToRemove) => {
    setFeedbackFiles((prev) =>
      prev.filter((_, fileIndex) => fileIndex !== indexToRemove),
    );
  };

  const handleAddFeedback = async () => {
    if (!project) return;

    setFeedbackSaving(true);
    try {
      const payload = new FormData();
      payload.append("type", feedbackType);
      payload.append("notes", feedbackNotes);
      feedbackFiles.forEach((file) => {
        payload.append("feedbackAttachments", file);
      });

      const res = await fetchWithPortal(`/api/projects/${project._id}/feedback`, {
        method: "POST",
        body: payload,
      });
      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setFeedbackModal({ open: true, project: updatedProject });
        setFeedbackNotes("");
        setFeedbackFiles([]);
        showToast("Feedback added successfully.", "success");
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message || "Failed to add feedback.",
          "error",
        );
      }
    } catch (error) {
      console.error("Feedback add error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setFeedbackSaving(false);
    }
  };

  const handleDeleteFeedback = async (feedbackId) => {
    if (!project) return;
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/feedback/${feedbackId}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setFeedbackModal({ open: true, project: updatedProject });
        showToast("Feedback deleted.", "success");
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message || "Failed to delete feedback.",
          "error",
        );
      }
    } catch (error) {
      console.error("Feedback delete error:", error);
      showToast("Network error. Please try again.", "error");
    }
  };

  const sortedFeedbackEntries = (project?.feedbacks || [])
    .slice()
    .sort((a, b) => {
      const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

  const recentUpdates = useMemo(() => projectUpdates || [], [projectUpdates]);

  const getUpdateAuthorName = (update) => {
    if (!update?.author || typeof update.author === "string") {
      return "System";
    }
    const fullName =
      `${update.author.firstName || ""} ${update.author.lastName || ""}`.trim();
    return fullName || update.author.email || "System";
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const canManageUpdate = (update) => {
    if (!currentUser || !update) return false;
    if (currentUser.role === "admin") return true;
    const authorId =
      typeof update.author === "string" ? update.author : update.author?._id;
    return Boolean(authorId && currentUser._id === authorId);
  };

  const handlePostUpdate = async () => {
    if (!project || !canShareUpdates) return;
    const trimmedContent = updateContent.trim();
    if (!trimmedContent) {
      showToast("Please enter an update before posting.", "error");
      return;
    }

    setUpdateSubmitting(true);
    try {
      const data = new FormData();
      data.append("content", trimmedContent);
      data.append("category", updateCategory);

      const res = await fetchWithPortal(`/api/updates/project/${project._id}`, {
        method: "POST",
        body: data,
      });

      if (res.ok) {
        const createdUpdate = await res.json();
        setProjectUpdates((prev) => [createdUpdate, ...prev]);
        setUpdateContent("");
        setUpdateCategory("General");
        showToast("Update posted successfully.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to post update.", "error");
      }
    } catch (error) {
      console.error("Update post error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setUpdateSubmitting(false);
    }
  };

  const handleStartEditUpdate = (update) => {
    setEditingUpdateId(update._id);
    setEditUpdateCategory(normalizeUpdateCategory(update.category));
    setEditUpdateContent(update.content || "");
  };

  const handleCancelEditUpdate = () => {
    if (updateEditSubmitting) return;
    setEditingUpdateId(null);
    setEditUpdateCategory("General");
    setEditUpdateContent("");
  };

  const handleSaveEditUpdate = async (updateId) => {
    if (!updateId) return;
    const trimmedContent = editUpdateContent.trim();
    if (!trimmedContent) {
      showToast("Update content cannot be empty.", "error");
      return;
    }

    setUpdateEditSubmitting(true);
    try {
      const res = await fetchWithPortal(`/api/updates/${updateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmedContent,
          category: editUpdateCategory,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setProjectUpdates((prev) =>
          prev.map((item) => (item._id === updateId ? updated : item)),
        );
        handleCancelEditUpdate();
        showToast("Update edited successfully.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to edit update.", "error");
      }
    } catch (error) {
      console.error("Update edit error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setUpdateEditSubmitting(false);
    }
  };

  const handleDeleteUpdate = async (update) => {
    if (!update?._id || !canManageUpdate(update)) return;
    const confirmed = window.confirm(
      "Delete this update? This action cannot be undone.",
    );
    if (!confirmed) return;

    setUpdateDeleteSubmittingId(update._id);
    try {
      const res = await fetchWithPortal(`/api/updates/${update._id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setProjectUpdates((prev) => prev.filter((item) => item._id !== update._id));
        if (editingUpdateId === update._id) {
          handleCancelEditUpdate();
        }
        showToast("Update deleted.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to delete update.", "error");
      }
    } catch (error) {
      console.error("Update delete error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setUpdateDeleteSubmittingId(null);
    }
  };

  const handleConfirmInvoice = async () => {
    if (!project || invoiceInput.trim() !== billingConfirmPhrase) return;
    setInvoiceSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/invoice-sent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(`${billingDocumentLabel} marked as sent.`, "success");
        setInvoiceModal(false);
        setInvoiceInput("");
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message ||
            `Failed to mark ${billingDocumentLower} as sent.`,
          "error",
        );
      }
    } catch (error) {
      console.error("Invoice update error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setInvoiceSubmitting(false);
    }
  };

  const openInvoiceModal = () => {
    setInvoiceInput("");
    setInvoiceModal(true);
  };

  const closeInvoiceModal = () => {
    if (invoiceSubmitting) return;
    setInvoiceModal(false);
    setInvoiceInput("");
  };

  const openInvoiceUndoModal = () => {
    setInvoiceUndoInput("");
    setInvoiceUndoModal(true);
  };

  const closeInvoiceUndoModal = () => {
    if (invoiceUndoSubmitting) return;
    setInvoiceUndoModal(false);
    setInvoiceUndoInput("");
  };

  const handleConfirmInvoiceUndo = async () => {
    if (!project || invoiceUndoInput.trim() !== billingUndoPhrase) return;
    setInvoiceUndoSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/invoice-sent/undo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(`${billingDocumentLabel} status reset.`, "success");
        closeInvoiceUndoModal();
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message ||
            `Failed to undo ${billingDocumentLower} status.`,
          "error",
        );
      }
    } catch (error) {
      console.error("Invoice undo error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setInvoiceUndoSubmitting(false);
    }
  };

  const handleQuoteCostVerification = async () => {
    if (!project || !isQuoteProject || !canManageBilling) return;
    if (quoteWorkflowBlocked) {
      showToast(
        "Quote requirement workflows are not configured yet. Only cost-only quotes can proceed.",
        "error",
      );
      return;
    }
    const amountValue = Number.parseFloat(quoteCostAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      showToast("Enter a valid cost amount to continue.", "error");
      return;
    }

    setQuoteCostSubmitting(true);
    try {
      const res = await fetchWithPortal(`/api/projects/${project._id}/quote-cost`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountValue,
          currency: String(quoteCostCurrency || "").trim(),
          note: String(quoteCostNote || "").trim(),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Quote cost verified.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to verify quote cost.", "error");
      }
    } catch (error) {
      console.error("Quote cost verification error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setQuoteCostSubmitting(false);
    }
  };

  const handleQuoteCostReset = () => {
    if (!project || !isQuoteProject || !canManageBilling) return;
    setQuoteCostResetConfirmOpen(true);
  };

  const handleConfirmQuoteCostReset = async () => {
    if (!project || !isQuoteProject || !canManageBilling) return;
    setQuoteCostResetConfirmOpen(false);
    setQuoteCostResetting(true);
    try {
      const res = await fetchWithPortal(`/api/projects/${project._id}/quote-cost`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Quote cost reset. Cost verification is now pending.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to reset quote cost.", "error");
      }
    } catch (error) {
      console.error("Quote cost reset error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setQuoteCostResetting(false);
    }
  };

  const handleQuoteMockupReset = () => {
    if (!project || !isQuoteProject || !canManageBilling) return;
    setQuoteMockupResetConfirmOpen(true);
  };

  const handleConfirmQuoteMockupReset = async () => {
    if (!project || !isQuoteProject || !canManageBilling) return;
    setQuoteMockupResetConfirmOpen(false);
    setQuoteMockupResetting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/quote-mockup`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(
          "Quote mockup reset. Status moved back to Pending Mockup.",
          "success",
        );
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to reset quote mockup.",
          "error",
        );
      }
    } catch (error) {
      console.error("Quote mockup reset error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setQuoteMockupResetting(false);
    }
  };

  const handleConfirmQuotePreviousSamplesRetrieved = async () => {
    if (
      !project ||
      !isQuoteProject ||
      !isPreviousSamplesOnlyQuote ||
      !canManageBilling
    ) {
      return;
    }
    if (!QUOTE_PREVIOUS_SAMPLES_RETRIEVE_STATUSES.has(quotePreviousSamplesStatus)) {
      showToast("Sample retrieval is already confirmed.", "error");
      return;
    }

    setQuotePreviousSamplesSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/quote-requirements/previousSamples/transition`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStatus: "dept_submitted" }),
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Sample retrieval confirmed.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to confirm sample retrieval.",
          "error",
        );
      }
    } catch (error) {
      console.error("Quote sample retrieval error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setQuotePreviousSamplesSubmitting(false);
    }
  };

  const handleQuotePreviousSamplesReset = () => {
    if (!project || !isQuoteProject || !canManageBilling) return;
    setQuotePreviousSamplesResetConfirmOpen(true);
  };

  const handleConfirmQuotePreviousSamplesReset = async () => {
    if (
      !project ||
      !isQuoteProject ||
      !isPreviousSamplesOnlyQuote ||
      !canManageBilling
    ) {
      return;
    }
    setQuotePreviousSamplesResetConfirmOpen(false);
    setQuotePreviousSamplesResetting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/quote-previous-samples`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(
          "Sample retrieval reset. Status moved back to Pending Sample Retrieval.",
          "success",
        );
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to reset sample retrieval.",
          "error",
        );
      }
    } catch (error) {
      console.error("Quote sample reset error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setQuotePreviousSamplesResetting(false);
    }
  };

  const handleQuoteSampleProductionReset = () => {
    if (!project || !isQuoteProject || !canManageBilling) return;
    setQuoteSampleProductionResetConfirmOpen(true);
  };

  const handleConfirmQuoteSampleProductionReset = async () => {
    if (
      !project ||
      !isQuoteProject ||
      !isSampleProductionOnlyQuote ||
      !canManageBilling
    ) {
      return;
    }
    setQuoteSampleProductionResetConfirmOpen(false);
    setQuoteSampleProductionResetting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/quote-sample-production`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(
          "Sample production reset. Status moved back to Pending Production.",
          "success",
        );
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to reset sample production.",
          "error",
        );
      }
    } catch (error) {
      console.error("Quote sample production reset error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setQuoteSampleProductionResetting(false);
    }
  };

  const handleBidDocsFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setQuoteBidDocsFiles((prev) => [...prev, ...files]);
    event.target.value = null;
  };

  const handleRemoveBidDocFile = (index) => {
    setQuoteBidDocsFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveBidDocuments = async () => {
    if (!project || !isQuoteProject || !isBidSubmissionOnlyQuote || !canManageBilling) {
      return;
    }
    const totalDocs = bidSubmissionDocuments.length + quoteBidDocsFiles.length;
    if (!quoteBidDocsSensitive && totalDocs === 0) {
      showToast(
        "Upload at least one document or mark the document as sensitive.",
        "error",
      );
      return;
    }

    setQuoteBidDocsSaving(true);
    try {
      const formData = new FormData();
      formData.append("isSensitive", quoteBidDocsSensitive ? "true" : "false");
      quoteBidDocsFiles.forEach((file) => {
        formData.append("bidDocuments", file);
      });

      const res = await fetchWithPortal(
        `/api/projects/${project._id}/quote-bid-documents`,
        {
          method: "PATCH",
          body: formData,
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        setQuoteBidDocsFiles([]);
        showToast("Bid submission documents updated.", "success");
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to update bid submission documents.",
          "error",
        );
      }
    } catch (error) {
      console.error("Bid documents update error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setQuoteBidDocsSaving(false);
    }
  };

  const openPaymentModal = (type) => {
    setPaymentModal({ open: true, type });
    setPaymentInput("");
  };

  const openPaymentUndoModal = (type) => {
    setPaymentUndoModal({ open: true, type });
    setPaymentUndoInput("");
  };

  const closePaymentModal = () => {
    if (paymentSubmitting) return;
    setPaymentModal({ open: false, type: null });
    setPaymentInput("");
  };

  const closePaymentUndoModal = () => {
    if (paymentUndoSubmitting) return;
    setPaymentUndoModal({ open: false, type: null });
    setPaymentUndoInput("");
  };

  const handleConfirmPayment = async () => {
    if (!project || !paymentModal.type) return;
    const option = PAYMENT_OPTIONS.find(
      (item) => item.type === paymentModal.type,
    );
    if (!option || paymentInput.trim() !== option.phrase) return;

    setPaymentSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/payment-verification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: paymentModal.type }),
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(`${option.label} verified.`, "success");
        closePaymentModal();
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message || "Failed to verify payment.",
          "error",
        );
      }
    } catch (error) {
      console.error("Payment verification error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleConfirmPaymentUndo = async () => {
    if (!project || !paymentUndoModal.type) return;
    const option = PAYMENT_OPTIONS.find(
      (item) => item.type === paymentUndoModal.type,
    );
    if (!option || paymentUndoInput.trim() !== option.undoPhrase) return;

    setPaymentUndoSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/payment-verification/undo`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: paymentUndoModal.type }),
        },
      );
      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(`${option.label} verification removed.`, "success");
        closePaymentUndoModal();
      } else {
        const errorData = await res.json();
        showToast(
          errorData.message || "Failed to undo payment verification.",
          "error",
        );
      }
    } catch (error) {
      console.error("Payment undo error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setPaymentUndoSubmitting(false);
    }
  };

  const openMockupApprovalModal = (version) => {
    if (!version || !canManageMockupApproval) return;
    setMockupApprovalModal({
      open: true,
      version,
    });
    setMockupApprovalInput("");
  };

  const closeMockupApprovalModal = () => {
    if (mockupApprovalSubmitting) return;
    setMockupApprovalModal({
      open: false,
      version: null,
    });
    setMockupApprovalInput("");
  };

  const openMockupRejectionModal = (version) => {
    if (!version || !canManageMockupApproval) return;
    setMockupRejectionModal({
      open: true,
      version,
    });
    setMockupRejectionInput("");
    setMockupRejectionReason("");
  };

  const closeMockupRejectionModal = () => {
    if (mockupRejectionSubmitting) return;
    setMockupRejectionModal({
      open: false,
      version: null,
    });
    setMockupRejectionInput("");
    setMockupRejectionReason("");
  };

  const handleConfirmMockupApproval = async () => {
    if (!project || !mockupApprovalModal.version || !canManageMockupApproval) {
      return;
    }
    if (mockupApprovalInput.trim() !== MOCKUP_APPROVAL_CONFIRM_PHRASE) return;

    setMockupApprovalSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/mockup/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: mockupApprovalModal.version.version,
            entryId: mockupApprovalModal.version.entryId,
          }),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        const fileName = mockupApprovalModal.version.fileName;
        showToast(
          `Mockup v${mockupApprovalModal.version.version}${
            fileName ? ` (${fileName})` : ""
          } approved by client.`,
          "success",
        );
        closeMockupApprovalModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to confirm mockup approval.",
          "error",
        );
      }
    } catch (error) {
      console.error("Mockup approval error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setMockupApprovalSubmitting(false);
    }
  };

  const handleConfirmMockupRejection = async () => {
    if (!project || !mockupRejectionModal.version || !canManageMockupApproval) {
      return;
    }
    if (mockupRejectionInput.trim() !== MOCKUP_REJECTION_CONFIRM_PHRASE) return;

    setMockupRejectionSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/mockup/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: mockupRejectionModal.version.version,
            entryId: mockupRejectionModal.version.entryId,
            reason: mockupRejectionReason.trim(),
          }),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        const fileName = mockupRejectionModal.version.fileName;
        showToast(
          `Mockup v${mockupRejectionModal.version.version}${
            fileName ? ` (${fileName})` : ""
          } marked as rejected.`,
          "success",
        );
        closeMockupRejectionModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to record mockup rejection.",
          "error",
        );
      }
    } catch (error) {
      console.error("Mockup rejection error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setMockupRejectionSubmitting(false);
    }
  };

  const openSampleApprovalModal = () => {
    if (!project || !canManageBilling || !sampleRequirementEnabled) return;
    setSampleApprovalInput("");
    setSampleApprovalModal(true);
  };

  const closeSampleApprovalModal = () => {
    if (sampleApprovalSubmitting) return;
    setSampleApprovalModal(false);
    setSampleApprovalInput("");
  };

  const openSampleApprovalResetModal = () => {
    if (!project || !canManageBilling || !sampleRequirementEnabled) return;
    setSampleApprovalResetInput("");
    setSampleApprovalResetModal(true);
  };

  const closeSampleApprovalResetModal = () => {
    if (sampleApprovalResetSubmitting) return;
    setSampleApprovalResetModal(false);
    setSampleApprovalResetInput("");
  };

  const handleConfirmSampleApproval = async () => {
    if (
      !project ||
      !canManageBilling ||
      !sampleRequirementEnabled ||
      sampleApprovalInput.trim() !== SAMPLE_APPROVAL_CONFIRM_PHRASE
    ) {
      return;
    }

    setSampleApprovalSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/sample-approval/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Client sample approval confirmed.", "success");
        closeSampleApprovalModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to confirm sample approval.",
          "error",
        );
      }
    } catch (error) {
      console.error("Sample approval confirm error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setSampleApprovalSubmitting(false);
    }
  };

  const handleConfirmSampleApprovalReset = async () => {
    if (
      !project ||
      !canManageBilling ||
      !sampleRequirementEnabled ||
      sampleApprovalResetInput.trim() !== SAMPLE_APPROVAL_RESET_PHRASE
    ) {
      return;
    }

    setSampleApprovalResetSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/sample-approval/reset`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast("Client sample approval reset to pending.", "success");
        closeSampleApprovalResetModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(
          errorData.message || "Failed to reset sample approval.",
          "error",
        );
      }
    } catch (error) {
      console.error("Sample approval reset error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setSampleApprovalResetSubmitting(false);
    }
  };

  const handleValidateQuoteDecision = async (decisionStatus) => {
    if (!project || !isQuoteProject || !canManageBilling) return;
    if (!["go_ahead", "declined", "pending"].includes(decisionStatus)) return;

    setQuoteDecisionSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/quote-decision`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: decisionStatus,
            note: quoteDecisionNote,
          }),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(
          decisionStatus === "go_ahead"
            ? "Quote decision validated: client will proceed."
            : decisionStatus === "declined"
              ? "Quote decision validated: client declined."
              : "Quote decision reset to pending.",
          "success",
        );
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to validate quote decision.", "error");
      }
    } catch (error) {
      console.error("Quote decision validation error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setQuoteDecisionSubmitting(false);
    }
  };

  const handleConvertQuoteToProject = async () => {
    if (!project || !isQuoteProject || !canManageBilling) return;
    if (!canConvertQuoteToProject) {
      showToast(
        "Validate client decision as Go Ahead before converting this quote.",
        "error",
      );
      return;
    }

    const targetType = QUOTE_CONVERSION_TYPE_OPTIONS.includes(quoteConversionType)
      ? quoteConversionType
      : "Standard";
    const targetStatus = QUOTE_CONVERSION_STATUS_OPTIONS.includes(
      quoteConversionStatus,
    )
      ? quoteConversionStatus
      : "Pending Scope Approval";

    setQuoteConversionSubmitting(true);
    try {
      const res = await fetchWithPortal(
        `/api/projects/${project._id}/project-type`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetType,
            targetStatus,
            reason:
              "Converted from quote after client decision validated by Front Desk.",
          }),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        showToast(
          `Quote converted to ${targetType} (${targetStatus}).`,
          "success",
        );
      } else {
        const errorData = await res.json().catch(() => ({}));
        showToast(errorData.message || "Failed to convert quote.", "error");
      }
    } catch (error) {
      console.error("Quote conversion error:", error);
      showToast("Network error. Please try again.", "error");
    } finally {
      setQuoteConversionSubmitting(false);
    }
  };

  const canManageOrderRevision = canManageBilling;
  const isOrderRevisionLocked = REVISION_LOCKED_STATUSES.has(
    String(project?.status || ""),
  );
  const openFullOrderRevision = () => {
    if (!project || !canManageOrderRevision) return;
    if (isOrderRevisionLocked) {
      showToast(
        "Order revision is locked after completion. Reopen the project to revise it.",
        "error",
      );
      return;
    }
    const revisionState = {
      revisionMode: true,
      returnTo: `/new-orders/actions/${project._id}`,
    };

    if (isQuoteProject) {
      navigate(`/create/quote?edit=${project._id}`, {
        state: {
          ...revisionState,
          reopenedProject: project,
        },
      });
      return;
    }

    navigate(`/new-orders/form?edit=${project._id}`, {
      state: revisionState,
    });
  };

  const addMentionToComposer = (person) => {
    const normalized = String(person || "").trim();
    if (!normalized) return;
    const mentionToken = `@${normalized.replace(/\s+/g, "_")}`;
    setUpdateContent((previous) => {
      const safePrevious = String(previous || "");
      if (safePrevious.includes(mentionToken)) return safePrevious;
      const spacer = safePrevious.trim().length > 0 ? " " : "";
      return `${safePrevious}${spacer}${mentionToken} `;
    });
  };

  const jumpToSection = (sectionId) => {
    if (!sectionId) return;
    const target = document.getElementById(sectionId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const pendingProductionMissing =
    project && !isQuoteProject
      ? getPendingProductionBillingMissing({ invoiceSent, paymentTypes })
      : [];
  const pendingDeliveryMissing =
    project && !isQuoteProject
      ? getPendingDeliveryBillingMissing({ paymentTypes })
      : [];
  const pendingProductionMissingLabels =
    formatBillingRequirementLabels(pendingProductionMissing);
  const pendingDeliveryMissingLabels = formatBillingRequirementLabels(
    pendingDeliveryMissing,
  );
  const showPendingProductionWarning =
    project &&
    !isQuoteProject &&
    ["Pending Master Approval", "Pending Production"].includes(project.status) &&
    pendingProductionMissing.length > 0;
  const showPendingDeliveryWarning =
    project &&
    !isQuoteProject &&
    ["Pending Packaging", "Pending Delivery/Pickup"].includes(project.status) &&
    pendingDeliveryMissing.length > 0;
  const showSampleApprovalWarning =
    project &&
    !isQuoteProject &&
    project.status === "Pending Production" &&
    sampleApprovalPending;
  const mockupReviewStageOpen =
    project && !isQuoteProject && project.status === "Pending Mockup";
  const showMockupApprovalWarning =
    project &&
    mockupReviewStageOpen &&
    mockupApprovalPending;
  const showMockupRejectionWarning =
    project &&
    mockupReviewStageOpen &&
    mockupApprovalRejected;
  const mockupApprovalMissingLabels =
    showMockupApprovalWarning && latestMockupVersion
      ? [`Client approval for mockup ${latestMockupVersionLabel}`]
      : [];
  const mockupRejectionMissingLabels =
    showMockupRejectionWarning && latestMockupVersion
      ? [`Rejected mockup ${latestMockupVersionLabel}`]
      : [];
  const sampleApprovalMissingLabels = showSampleApprovalWarning
    ? ["Client sample approval"]
    : [];
  const currentBillingGuardKey = project?._id
    ? `${project._id}|${project.status}|${
        showSampleApprovalWarning
          ? sampleApprovalMissingLabels.join("|")
          : showPendingProductionWarning
          ? pendingProductionMissingLabels.join("|")
          : showPendingDeliveryWarning
            ? pendingDeliveryMissingLabels.join("|")
            : showMockupApprovalWarning
              ? mockupApprovalMissingLabels.join("|")
              : showMockupRejectionWarning
                ? mockupRejectionMissingLabels.join("|")
              : ""
      }`
    : "";
  const workflowAttentionItems = [
    quoteWorkflowBlocked
      ? quoteWorkflowBlockedMessage ||
        "Quote requirement workflows are not configured yet."
      : "",
    isCostOnlyQuote && !quoteCostVerified
      ? "Quote cost verification is still pending."
      : "",
    (isMockupOnlyQuote || isSampleProductionOnlyQuote) && !mockupApprovalConfirmed
      ? "Client mockup approval is still pending."
      : "",
    isSampleProductionOnlyQuote && !quoteSampleProductionCompleted
      ? "Sample production is still pending."
      : "",
    isBidSubmissionOnlyQuote && !bidSubmissionReady
      ? "Bid submission documents are still needed."
      : "",
    isQuoteProject &&
    !quoteWorkflowBlocked &&
    quoteWorkflowStatus === "Pending Quote Submission" &&
    !invoiceSent
      ? "Quote submission is still pending."
      : "",
    isQuoteProject &&
    !quoteWorkflowBlocked &&
    ["Pending Client Decision", "Quote Submission Completed"].includes(
      quoteWorkflowStatus,
    ) &&
    !quoteDecisionTaken
      ? "Client quote decision is pending validation."
      : "",
    showPendingProductionWarning
      ? "Confirm invoice and payment before production can proceed."
      : "",
    showSampleApprovalWarning
      ? "Confirm production sample approval before completing production."
      : "",
    showPendingDeliveryWarning
      ? "Confirm full payment or authorization before delivery can proceed."
      : "",
    (!isQuoteProject || isMockupOnlyQuote || isSampleProductionOnlyQuote) &&
    mockupApprovalPending &&
    latestMockupVersion
      ? `Confirm client approval for ${latestMockupVersionLabel}.`
      : "",
    (!isQuoteProject || isMockupOnlyQuote || isSampleProductionOnlyQuote) &&
    mockupApprovalRejected &&
    latestMockupVersion
      ? `Client rejected ${latestMockupVersionLabel}. Upload revised mockup.`
      : "",
  ].filter(Boolean);
  const statusToneTarget = isQuoteProject
    ? quoteWorkflowStatusDisplay
    : project?.status;
  const statusBadgeTone = [
    "Quote Created",
    "Pending Scope Approval",
    "Pending Mockup",
    "Pending Master Approval",
    "Pending Production",
    "Pending Delivery/Pickup",
    "Pending Cost Verification",
    "Pending Sample Retrieval",
    "Pending Sample / Work done Retrieval",
    "Pending Sample Production",
    "Pending Bid Submission / Documents",
    "Pending Quote Submission",
    "Pending Sample / Work done Sent",
    "Pending Client Decision",
    "Pending Quote Request",
    "Pending Send Response",
    "Pending Feedback",
  ].includes(statusToneTarget)
    ? "pending"
    : ["Delivered", "Feedback Completed", "Completed", "Finished"].includes(
        statusToneTarget,
      )
      ? "complete"
      : "active";

  useEffect(() => {
    if (!project || isQuoteProject || billingGuardModal.open) return;

    if (
      showSampleApprovalWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Confirm client sample approval now before production completion can proceed.",
        missing: sampleApprovalMissingLabels,
        targetStatus: "Production Sample Approval",
        forceCommandTone: true,
      });
      return;
    }

    if (
      showPendingProductionWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Caution: before moving to Pending Production, confirm the required billing checks.",
        missing: pendingProductionMissing,
        targetStatus: "Pending Production",
        forceCommandTone: true,
      });
      return;
    }

    if (
      showPendingDeliveryWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Caution: before moving to Pending Delivery/Pickup, confirm the required billing checks.",
        missing: pendingDeliveryMissing,
        targetStatus: "Pending Delivery/Pickup",
        forceCommandTone: true,
      });
      return;
    }

    if (
      showMockupApprovalWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Caution: confirm client approval for the latest mockup before mockup completion.",
        missing: mockupApprovalMissingLabels,
        targetStatus: "Mockup Completed",
        forceCommandTone: true,
      });
      return;
    }

    if (
      showMockupRejectionWarning &&
      currentBillingGuardKey !== dismissedBillingGuardKey
    ) {
      openBillingGuardModal({
        message:
          "Client rejected the latest mockup. Ask Graphics to upload a revised version now.",
        missing: mockupRejectionMissingLabels,
        targetStatus: "Mockup Rejected",
        forceCommandTone: true,
      });
    }
  }, [
    project?._id,
    project?.status,
    isQuoteProject,
    billingGuardModal.open,
    showSampleApprovalWarning,
    showPendingProductionWarning,
    showPendingDeliveryWarning,
    showMockupApprovalWarning,
    showMockupRejectionWarning,
    currentBillingGuardKey,
    dismissedBillingGuardKey,
    sampleApprovalMissingLabels,
    pendingProductionMissing,
    pendingDeliveryMissing,
    mockupApprovalMissingLabels,
    mockupRejectionMissingLabels,
  ]);

  const lastOrderRevisionUpdatedAt = project?.sectionUpdates?.details || null;
  const lastOrderRevisionLabel = currentUser?.department?.includes("Front Desk")
    ? "Last updated by Front Desk"
    : "Last updated";
  const activeMockupDecision = getMockupApprovalStatus(
    activeMockupVersion?.clientApproval || {},
  );
  const activeMockupFileName = activeMockupVersion
    ? activeMockupVersion.fileName ||
      activeMockupVersion.fileUrl?.split("/").pop() ||
      `Mockup v${activeMockupVersion.version}`
    : "";
  const activeMockupIsImage = activeMockupVersion
    ? isImageAsset(activeMockupVersion.fileUrl, activeMockupVersion.fileType)
    : false;
  const canDecideOnMockupVersions =
    canManageMockupApproval &&
    ((isQuoteProject &&
      (isMockupOnlyQuote || isSampleProductionOnlyQuote) &&
      quoteWorkflowStatus === "Pending Mockup") ||
      (!isQuoteProject && project?.status === "Pending Mockup"));

  if (loading) {
    return (
      <div className="new-orders-container">
        <div className="loading-state">Loading order actions...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="new-orders-container">
        <div className="empty-state">{error || "Order not found."}</div>
      </div>
    );
  }

  return (
    <div className="new-orders-container order-actions-page">
      {toast.show && (
        <div className={`toast-message ${toast.type}`}>{toast.message}</div>
      )}
      <ConfirmDialog
        isOpen={quoteCostResetConfirmOpen}
        title="Rework Cost?"
        message="This will move the quote back to Cost Verification and reset quote submission and decision."
        confirmText="Rework Cost"
        cancelText="Cancel"
        type="primary"
        onConfirm={handleConfirmQuoteCostReset}
        onCancel={() => setQuoteCostResetConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={quoteMockupResetConfirmOpen}
        title="Rework Mockup?"
        message="This will move the quote back to Pending Mockup and reset quote submission and decision."
        confirmText="Rework Mockup"
        cancelText="Cancel"
        type="primary"
        onConfirm={handleConfirmQuoteMockupReset}
        onCancel={() => setQuoteMockupResetConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={quotePreviousSamplesResetConfirmOpen}
        title="Rework Sample Retrieval?"
        message="This will move the quote back to Pending Sample Retrieval and reset quote submission and decision."
        confirmText="Rework Sample"
        cancelText="Cancel"
        type="primary"
        onConfirm={handleConfirmQuotePreviousSamplesReset}
        onCancel={() => setQuotePreviousSamplesResetConfirmOpen(false)}
      />
      <ConfirmDialog
        isOpen={quoteSampleProductionResetConfirmOpen}
        title="Rework Sample Production?"
        message="This will move the quote back to Pending Production and reset quote submission and decision."
        confirmText="Rework Sample Production"
        cancelText="Cancel"
        type="primary"
        onConfirm={handleConfirmQuoteSampleProductionReset}
        onCancel={() => setQuoteSampleProductionResetConfirmOpen(false)}
      />

      <header className="order-actions-topbar">
        <div className="order-actions-topbar-main">
          <p className="order-actions-ref">{project.orderId || project._id}</p>
          <h1>{renderProjectName(project.details, null, "Untitled Project")}</h1>
          <span className={`order-actions-status-pill ${statusBadgeTone}`}>
            {formatProjectStatusForDisplay(
              quoteWorkflowStatus,
              isQuoteProject,
              quoteRequirementMode,
            )}
          </span>
        </div>
        <button className="action-btn" onClick={() => navigate("/new-orders")}>
          Back to Orders
        </button>
      </header>

      <div className="orders-list-container order-actions-workspace">
        <div className="order-actions-layout">
          <main className="order-actions-main">
            <section className="workflow-journey-section">
              <div className="workflow-journey-head">
                <div>
                  <h2>Order Journey</h2>
                  <p>Move through each stage with contextual actions.</p>
                </div>
                <button
                  type="button"
                  className="action-btn"
                  onClick={() => {
                    if (!focusedJourneyStep) return;
                    if (
                      focusedJourneyStep.key === "mockup" ||
                      focusedJourneyStep.key === "requirements"
                    ) {
                      jumpToSection("order-actions-mockup");
                      return;
                    }
                    if (focusedJourneyStep.key === "billing") {
                      setBillingPanelOpen(true);
                      jumpToSection("order-actions-billing");
                      return;
                    }
                    if (
                      focusedJourneyStep.key === "delivery" ||
                      focusedJourneyStep.key === "decision"
                    ) {
                      jumpToSection("order-actions-updates");
                      return;
                    }
                    openFullOrderRevision();
                  }}
                >
                  {focusedJourneyStep?.key === "billing"
                    ? "Open Billing"
                    : focusedJourneyStep?.key === "mockup" ||
                        focusedJourneyStep?.key === "requirements"
                      ? "Open Mockup"
                      : focusedJourneyStep?.key === "delivery" ||
                          focusedJourneyStep?.key === "decision"
                        ? "Open Activity"
                        : "Review Scope"}
                </button>
              </div>
              <div className="workflow-stepper">
                {workflowJourney.map((step, index) => (
                  <button
                    key={step.key}
                    type="button"
                    className={`workflow-step ${step.state} ${
                      focusedJourneyStep?.key === step.key ? "focused" : ""
                    }`}
                    onClick={() => setFocusedWorkflowStep(step.key)}
                  >
                    <span className="workflow-step-index">{index + 1}</span>
                    <span className="workflow-step-label">{step.label}</span>
                  </button>
                ))}
              </div>
            </section>

            {workflowAttentionItems.length > 0 && (
              <section className="workflow-alert-stack">
                {workflowAttentionItems.map((item, index) => (
                  <div key={`${item}-${index}`} className="warning-banner critical">
                    {item}
                  </div>
                ))}
              </section>
            )}

            <div className="action-grid">
          {!isQuoteProject && hasBatches ? (
            <div className="action-card batch-delivery-card">
              <h3>Batch Deliveries</h3>
              <p>Confirm delivery for each packaged batch.</p>
              <div className="batch-delivery-progress">
                {batchDeliveryProgressLabel}
              </div>
              {batches.length === 0 ? (
                <div className="batch-delivery-empty">
                  No batches created yet.
                </div>
              ) : (
                <div className="batch-delivery-list">
                  {batches.map((batch) => {
                    const statusLabel = getBatchStatusLabel(batch?.status);
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
                    const canDeliver =
                      batch?.status === "packaged" && canMarkDelivered;
                    return (
                      <div
                        key={batch?.batchId || batch?.label || statusLabel}
                        className={`batch-delivery-item ${batch?.status || "planned"}`}
                      >
                        <div className="batch-delivery-header">
                          <div>
                            <strong>{batch?.label || "Batch"}</strong>
                            <span className="batch-delivery-summary">
                              {summary}
                            </span>
                          </div>
                          <span
                            className={`batch-delivery-status ${batch?.status || "planned"}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                        {producedQtyLabel && (
                          <div className="batch-delivery-meta">
                            Produced Qty: {producedQtyLabel}
                          </div>
                        )}
                        {deliveredQtyLabel && (
                          <div className="batch-delivery-meta">
                            Delivered Qty: {deliveredQtyLabel}
                          </div>
                        )}
                        {batch?.status === "delivered" &&
                          batch?.delivery?.deliveredAt && (
                            <div className="batch-delivery-meta">
                              Delivered:{" "}
                              {formatDateTime(batch.delivery.deliveredAt)}
                            </div>
                          )}
                        {batch?.status === "delivered" &&
                          batch?.delivery?.recipient && (
                            <div className="batch-delivery-meta">
                              Recipient: {batch.delivery.recipient}
                            </div>
                          )}
                        {batch?.status === "delivered" &&
                          batch?.delivery?.notes && (
                            <div className="batch-delivery-meta">
                              Notes: {batch.delivery.notes}
                            </div>
                          )}
                        {batch?.status === "cancelled" && (
                          <div className="batch-delivery-meta">
                            Cancelled batch
                          </div>
                        )}
                        {batch?.status === "packaged" && (
                          <button
                            className="action-btn complete-btn"
                            onClick={() => openBatchDeliveryModal(batch)}
                            disabled={!canDeliver}
                          >
                            Confirm Batch Delivery
                          </button>
                        )}
                        {batch?.status !== "packaged" &&
                          batch?.status !== "delivered" &&
                          batch?.status !== "cancelled" && (
                            <div className="batch-delivery-meta">
                              Waiting for packaging to complete.
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            !isQuoteProject && (
              <div className="action-card">
                <h3>Delivery</h3>
                <p>Mark the order as delivered once handed over.</p>
                <button
                  className="action-btn complete-btn"
                  onClick={openDeliveryModal}
                  disabled={
                    !canMarkDelivered || project.status !== "Pending Delivery/Pickup"
                  }
                  title={
                    project.status === "Pending Delivery/Pickup"
                      ? "Mark as Delivered"
                      : "Waiting for Pending Delivery/Pickup"
                  }
                >
                  Delivery Complete
                </button>
              </div>
            )
          )}

          <div className="action-card">
            <h3>Feedback</h3>
            <p>Capture client feedback after delivery.</p>
            <button
              className="action-btn feedback-btn"
              onClick={openFeedbackModal}
              disabled={!canManageFeedback || !canAddFeedbackFor(project)}
              title={
                !canManageFeedback
                  ? "Not authorized to add feedback"
                  : canAddFeedbackFor(project)
                  ? "Add feedback"
                  : "Feedback available after delivery"
              }
            >
              Add Feedback
            </button>
          </div>

          {isQuoteProject && isCostOnlyQuote && (
            <div className="action-card">
              <h3>Cost Verification</h3>
              <p>Confirm the quote cost before sending the quote.</p>
              {quoteWorkflowBlocked ? (
                <div className="mockup-empty-state">
                  {quoteWorkflowBlockedMessage ||
                    "Quote workflows are not configured for this requirement set."}
                </div>
              ) : (
                <>
                  <div
                    className={`mockup-approval-status ${
                      quoteCostVerified ? "approved" : "pending"
                    }`}
                  >
                    {quoteCostVerified
                      ? "Quote cost verified"
                      : "Quote cost verification pending"}
                  </div>
                  {quoteCostVerification?.updatedAt && (
                    <p className="mockup-approval-meta">
                      Updated: {formatDateTime(quoteCostVerification.updatedAt)}
                    </p>
                  )}
                  <label className="quote-decision-field">
                    <span>Cost Amount</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={quoteCostAmount}
                      onChange={(event) => setQuoteCostAmount(event.target.value)}
                      placeholder="Enter total cost"
                      disabled={
                        !canManageBilling ||
                        quoteCostSubmitting ||
                        quoteCostResetting
                      }
                    />
                  </label>
                  <label className="quote-decision-field">
                    <span>Currency (Optional)</span>
                    <input
                      type="text"
                      value={quoteCostCurrency}
                      onChange={(event) => setQuoteCostCurrency(event.target.value)}
                      placeholder="e.g. NGN"
                      disabled={
                        !canManageBilling ||
                        quoteCostSubmitting ||
                        quoteCostResetting
                      }
                    />
                  </label>
                  <label className="quote-decision-field">
                    <span>Note (Optional)</span>
                    <textarea
                      rows={2}
                      value={quoteCostNote}
                      onChange={(event) => setQuoteCostNote(event.target.value)}
                      placeholder="Add any cost notes for the client."
                      disabled={
                        !canManageBilling ||
                        quoteCostSubmitting ||
                        quoteCostResetting
                      }
                    />
                  </label>
                  <div className="billing-actions">
                    <button
                      className="action-btn complete-btn"
                      onClick={handleQuoteCostVerification}
                      disabled={
                        !canManageBilling ||
                        quoteCostSubmitting ||
                        quoteCostResetting
                      }
                    >
                      {quoteCostSubmitting
                        ? "Saving..."
                        : quoteCostVerified
                          ? "Update Cost"
                          : "Verify Cost"}
                    </button>
                    {quoteDecisionStatus === "declined" && (
                      <button
                        className="action-btn undo-btn"
                        onClick={handleQuoteCostReset}
                        disabled={
                          !canManageBilling ||
                          quoteCostSubmitting ||
                          quoteCostResetting
                        }
                      >
                        {quoteCostResetting ? "Resetting..." : "Rework Cost"}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {isQuoteProject && isMockupOnlyQuote && (
            <div className="action-card">
              <h3>Mockup Requirement</h3>
              <p>
                Confirm client approval for the mockup before sending the quote.
              </p>
              {quoteWorkflowBlocked ? (
                <div className="mockup-empty-state">
                  {quoteWorkflowBlockedMessage ||
                    "Quote workflows are not configured for this requirement set."}
                </div>
              ) : (
                <>
                  <div
                    className={`mockup-approval-status ${
                      mockupApprovalConfirmed
                        ? "approved"
                        : mockupApprovalRejected
                          ? "rejected"
                          : "pending"
                    }`}
                  >
                    {mockupApprovalConfirmed
                      ? "Mockup approved by client"
                      : mockupApprovalRejected
                        ? "Mockup rejected by client"
                        : "Client mockup approval pending"}
                  </div>
                  {latestMockupVersion?.uploadedAt && (
                    <p className="mockup-approval-meta">
                      Updated: {formatDateTime(latestMockupVersion.uploadedAt)}
                    </p>
                  )}
                  {quoteDecisionStatus === "declined" && (
                    <div className="billing-actions">
                      <button
                        className="action-btn undo-btn"
                        onClick={handleQuoteMockupReset}
                        disabled={!canManageBilling || quoteMockupResetting}
                      >
                        {quoteMockupResetting ? "Resetting..." : "Rework Mockup"}
                      </button>
                    </div>
                  )}
                  <p className="mockup-approval-meta">
                    Use the Mockup Workbench below to review versions and record
                    approval or rejection.
                  </p>
                </>
              )}
            </div>
          )}

          {isQuoteProject && isPreviousSamplesOnlyQuote && (
            <div className="action-card">
              <h3>Sample Retrieval</h3>
              <p>
                Confirm that previous samples/work done have been retrieved
                before sending the quote.
              </p>
              {quoteWorkflowBlocked ? (
                <div className="mockup-empty-state">
                  {quoteWorkflowBlockedMessage ||
                    "Quote workflows are not configured for this requirement set."}
                </div>
              ) : (
                <>
                  <div
                    className={`mockup-approval-status ${
                      quotePreviousSamplesRetrieved ? "approved" : "pending"
                    }`}
                  >
                    {quotePreviousSamplesRetrieved
                      ? "Sample retrieval confirmed"
                      : "Sample retrieval pending"}
                  </div>
                  <p className="mockup-approval-meta">
                    Requirement status: {quotePreviousSamplesStatusLabel}
                  </p>
                  {quotePreviousSamplesRequirement.updatedAt && (
                    <p className="mockup-approval-meta">
                      Updated:{" "}
                      {formatDateTime(quotePreviousSamplesRequirement.updatedAt)}
                    </p>
                  )}
                  {quotePreviousSamplesRequirement.note && (
                    <p className="mockup-approval-meta">
                      Note: {quotePreviousSamplesRequirement.note}
                    </p>
                  )}
                  <div className="billing-actions">
                    <button
                      className="action-btn complete-btn"
                      onClick={handleConfirmQuotePreviousSamplesRetrieved}
                      disabled={!canConfirmPreviousSamplesRetrieved}
                      title={
                        !canConfirmPreviousSamplesRetrieved
                          ? quoteWorkflowBlocked
                            ? quoteWorkflowBlockedMessage ||
                              "Quote workflows are not configured yet."
                            : quotePreviousSamplesRetrieved
                              ? "Sample retrieval is already confirmed."
                              : "Confirm sample retrieval when ready."
                          : undefined
                      }
                    >
                      {quotePreviousSamplesSubmitting
                        ? "Confirming..."
                        : "Confirm Sample Retrieved"}
                    </button>
                    {quoteDecisionStatus === "declined" && (
                      <button
                        className="action-btn undo-btn"
                        onClick={handleQuotePreviousSamplesReset}
                        disabled={
                          !canManageBilling || quotePreviousSamplesResetting
                        }
                      >
                        {quotePreviousSamplesResetting
                          ? "Resetting..."
                          : "Rework Sample"}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {isQuoteProject && isSampleProductionOnlyQuote && (
            <div className="action-card">
              <h3>Sample Production</h3>
              <p>
                Production will submit sample production after mockup approval.
                Confirm submission before sending the quote.
              </p>
              {quoteWorkflowBlocked ? (
                <div className="mockup-empty-state">
                  {quoteWorkflowBlockedMessage ||
                    "Quote workflows are not configured for this requirement set."}
                </div>
              ) : (
                <>
                  <div
                    className={`mockup-approval-status ${
                      quoteSampleProductionCompleted ? "approved" : "pending"
                    }`}
                  >
                    {quoteSampleProductionCompleted
                      ? "Sample production completed"
                      : "Sample production pending"}
                  </div>
                  <p className="mockup-approval-meta">
                    Requirement status: {quoteSampleProductionStatusLabel}
                  </p>
                  {quoteSampleProductionRequirement.updatedAt && (
                    <p className="mockup-approval-meta">
                      Updated:{" "}
                      {formatDateTime(quoteSampleProductionRequirement.updatedAt)}
                    </p>
                  )}
                  {quoteSampleProductionRequirement.note && (
                    <p className="mockup-approval-meta">
                      Note: {quoteSampleProductionRequirement.note}
                    </p>
                  )}
                  {quoteDecisionStatus === "declined" && (
                    <div className="billing-actions">
                      <button
                        className="action-btn undo-btn"
                        onClick={handleQuoteSampleProductionReset}
                        disabled={
                          !canManageBilling || quoteSampleProductionResetting
                        }
                      >
                        {quoteSampleProductionResetting
                          ? "Resetting..."
                          : "Rework Sample Production"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {isQuoteProject && isBidSubmissionOnlyQuote && (
            <div className="action-card">
              <h3>Bid Submission / Documents</h3>
              <p>
                Upload bid submission or supporting documents before confirming
                quote submission. Mark as sensitive if uploads should not be shared.
              </p>
              {quoteWorkflowBlocked ? (
                <div className="mockup-empty-state">
                  {quoteWorkflowBlockedMessage ||
                    "Quote workflows are not configured for this requirement set."}
                </div>
              ) : (
                <>
                  <label className="quote-decision-field">
                    <span>Document Sensitivity</span>
                    <div className="toggle-row">
                      <input
                        type="checkbox"
                        checked={quoteBidDocsSensitive}
                        onChange={(event) =>
                          setQuoteBidDocsSensitive(event.target.checked)
                        }
                        disabled={!canManageBilling || quoteBidDocsSaving}
                      />
                      <span>
                        Mark as sensitive (no upload required to proceed).
                      </span>
                    </div>
                  </label>
                  <div className="billing-actions">
                    <input
                      type="file"
                      id="quote-bid-docs-input"
                      multiple
                      style={{ display: "none" }}
                      onChange={handleBidDocsFileChange}
                    />
                    <button
                      type="button"
                      className="action-btn"
                      onClick={() =>
                        document.getElementById("quote-bid-docs-input")?.click()
                      }
                      disabled={!canManageBilling || quoteBidDocsSaving}
                    >
                      Add Documents
                    </button>
                    <button
                      type="button"
                      className="action-btn complete-btn"
                      onClick={handleSaveBidDocuments}
                      disabled={!canManageBilling || quoteBidDocsSaving}
                    >
                      {quoteBidDocsSaving ? "Saving..." : "Save Documents"}
                    </button>
                  </div>

                  {(bidSubmissionDocuments.length > 0 ||
                    quoteBidDocsFiles.length > 0) && (
                    <div className="reference-files-grid">
                      {bidSubmissionDocuments.map((doc, index) => {
                        const isImage = isImageAsset(doc.fileUrl, doc.fileType);
                        return (
                          <div
                            key={doc.fileUrl || `existing-${index}`}
                            className="reference-file-tile existing"
                          >
                            <div className="file-icon">
                              {isImage ? (
                                <img src={doc.fileUrl} alt={doc.fileName} />
                              ) : (
                                <span>FILE</span>
                              )}
                            </div>
                            <div className="file-info">
                              <a
                                className="file-name"
                                href={doc.fileUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {doc.fileName || "Document"}
                              </a>
                              <span className="file-size">
                                {doc.fileType || "Document"}
                              </span>
                            </div>
                            {doc.note && (
                              <div className="mockup-approval-meta">
                                Note: {doc.note}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {quoteBidDocsFiles.map((file, index) => {
                        const isImage = file.type?.startsWith("image/");
                        const previewUrl = isImage
                          ? URL.createObjectURL(file)
                          : "";
                        return (
                          <div
                            key={`${file.name}-${index}`}
                            className="reference-file-tile"
                          >
                            <div className="file-icon">
                              {isImage ? (
                                <img src={previewUrl} alt={file.name} />
                              ) : (
                                <span>FILE</span>
                              )}
                            </div>
                            <div className="file-info">
                              <span className="file-name">{file.name}</span>
                              <span className="file-size">
                                {formatFileSize(file.size)}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="file-remove-btn"
                              onClick={() => handleRemoveBidDocFile(index)}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {bidSubmissionDocuments.length === 0 &&
                    quoteBidDocsFiles.length === 0 && (
                      <div className="mockup-empty-state">
                        No bid documents uploaded yet.
                      </div>
                    )}

                  <p className="mockup-approval-meta">
                    Requirement status: {quoteBidSubmissionStatusLabel}.{" "}
                    {bidSubmissionReady
                      ? "Ready for quote submission."
                      : "Upload documents or mark as sensitive to proceed."}
                  </p>
                </>
              )}
            </div>
          )}

          <div className="action-card billing-card" id="order-actions-billing">
            <h3>{isQuoteProject ? quoteSubmissionLabel : "Billing"}</h3>
            <p>
              {isQuoteProject
                ? quoteSubmissionDescription
                : "Manage invoice and payment checkpoints."}
            </p>
            <button
              type="button"
              className="action-btn update-submit-btn billing-command-trigger"
              onClick={() => setBillingPanelOpen((previous) => !previous)}
            >
              {billingPanelOpen ? "Hide Billing Controls" : "Update Billing Status"}
            </button>
            {billingPanelOpen && (
              <div className="billing-actions billing-command-panel">
                {!invoiceSent ? (
                  <button
                    className="action-btn"
                    onClick={openInvoiceModal}
                    disabled={
                      !canManageBilling ||
                      (isQuoteProject && !canSubmitQuote)
                    }
                    title={
                      isQuoteProject && !canSubmitQuote
                        ? quoteWorkflowBlocked
                          ? "Quote workflows are not configured for this requirement set."
                          : isCostOnlyQuote
                            ? "Verify quote cost before sending the quote."
                            : isMockupOnlyQuote
                              ? "Confirm mockup approval before sending the quote."
                              : isPreviousSamplesOnlyQuote
                                ? "Confirm sample retrieval before sending the quote."
                                : isSampleProductionOnlyQuote
                                  ? "Confirm sample production before sending the quote."
                                  : "Upload bid documents or mark them as sensitive before sending the quote."
                        : undefined
                    }
                  >
                    Mark {billingDocumentLabel} Sent
                  </button>
                ) : (
                  <button
                    className="action-btn undo-btn"
                    onClick={openInvoiceUndoModal}
                    disabled={!canManageBilling}
                    title={`Undo ${billingDocumentLower} sent`}
                  >
                    Undo {billingDocumentLabel} Sent
                  </button>
                )}
                {!isQuoteProject && (
                  <div className="payment-actions">
                    {PAYMENT_OPTIONS.map((option) => (
                      <div key={option.type} className="payment-action-group">
                        {!paymentTypes.has(option.type) ? (
                          <button
                            className="action-btn"
                            onClick={() => openPaymentModal(option.type)}
                            disabled={!canManageBilling}
                            title={`Confirm ${option.label}`}
                          >
                            Confirm {option.label}
                          </button>
                        ) : (
                          <button
                            className="action-btn undo-btn"
                            onClick={() => openPaymentUndoModal(option.type)}
                            disabled={!canManageBilling}
                            title={`Undo ${option.label}`}
                          >
                            Undo {option.label}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isQuoteProject && quoteCostMissing && (
              <p className="mockup-approval-meta">
                Verify quote cost before sending the quote to the client.
              </p>
            )}
            {isQuoteProject && quoteMockupMissing && (
              <p className="mockup-approval-meta">
                Confirm mockup approval before sending the quote to the client.
              </p>
            )}
            {isQuoteProject && quotePreviousSamplesMissing && (
              <p className="mockup-approval-meta">
                Confirm sample retrieval before sending the quote to the client.
              </p>
            )}
            {isQuoteProject && quoteSampleProductionMissing && (
              <p className="mockup-approval-meta">
                Confirm sample production before sending the quote to the client.
              </p>
            )}
            {isQuoteProject && quoteBidSubmissionMissing && (
              <p className="mockup-approval-meta">
                Upload bid documents or mark them as sensitive before sending the quote.
              </p>
            )}
            {isQuoteProject && quoteWorkflowBlocked && (
              <p className="mockup-approval-meta">
                Quote requirements are not supported yet for this project.
              </p>
            )}
          </div>

          {isQuoteProject && (
            <div className="action-card">
              <h3>Quote Decision</h3>
              <p>
                After the quote is sent, validate client decision before quote
                closure or conversion.
              </p>

              <div className="billing-actions">
                <div
                  className={`mockup-approval-status ${
                    quoteDecisionStatus === "go_ahead"
                      ? "approved"
                      : quoteDecisionStatus === "declined"
                        ? "rejected"
                        : "pending"
                  }`}
                >
                  Current: {formatQuoteDecisionStatus(quoteDecisionStatus)}
                </div>

                {quoteDecisionState.validatedAt && (
                  <p className="mockup-approval-meta">
                    Validated: {formatDateTime(quoteDecisionState.validatedAt)}
                  </p>
                )}

                <label className="quote-decision-field">
                  <span>Front Desk Note (Optional)</span>
                  <textarea
                    rows={2}
                    value={quoteDecisionNote}
                    onChange={(event) => setQuoteDecisionNote(event.target.value)}
                    placeholder="Client confirmed they will proceed / declined."
                    disabled={
                      !canManageBilling ||
                      quoteWorkflowBlocked ||
                      quoteDecisionSubmitting ||
                      quoteConversionSubmitting
                    }
                  />
                </label>

                {canValidateQuoteDecision ? (
                  <div className="quote-decision-actions">
                    <button
                      className="action-btn complete-btn"
                      onClick={() => handleValidateQuoteDecision("go_ahead")}
                      disabled={
                        !canManageBilling ||
                        quoteDecisionSubmitting ||
                        quoteConversionSubmitting
                      }
                    >
                      {quoteDecisionSubmitting ? "Saving..." : "Client Go Ahead"}
                    </button>
                    <button
                      className="action-btn undo-btn"
                      onClick={() => handleValidateQuoteDecision("declined")}
                      disabled={
                        !canManageBilling ||
                        quoteDecisionSubmitting ||
                        quoteConversionSubmitting
                      }
                    >
                      {quoteDecisionSubmitting ? "Saving..." : "Client Declined"}
                    </button>
                    {quoteDecisionTaken && (
                      <button
                        className="action-btn"
                        onClick={() => handleValidateQuoteDecision("pending")}
                        disabled={
                          !canManageBilling ||
                          quoteDecisionSubmitting ||
                          quoteConversionSubmitting
                        }
                      >
                        {quoteDecisionSubmitting
                          ? "Saving..."
                          : "Reset to Pending"}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="mockup-approval-meta">
                    {quoteWorkflowBlocked
                      ? quoteWorkflowBlockedMessage ||
                        "Quote workflows are not configured yet."
                      : "Quote decision can be validated once status reaches Pending Client Decision or Quote Submission Completed."}
                  </p>
                )}

                {quoteDecisionStatus === "go_ahead" && (
                  <div className="quote-decision-convert">
                    <div className="quote-decision-convert-row">
                      <select
                        className="quote-decision-select"
                        value={quoteConversionType}
                        onChange={(event) =>
                          setQuoteConversionType(event.target.value)
                        }
                        disabled={!canManageBilling || quoteConversionSubmitting}
                      >
                        {QUOTE_CONVERSION_TYPE_OPTIONS.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <select
                        className="quote-decision-select"
                        value={quoteConversionStatus}
                        onChange={(event) =>
                          setQuoteConversionStatus(event.target.value)
                        }
                        disabled={!canManageBilling || quoteConversionSubmitting}
                      >
                        {QUOTE_CONVERSION_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <button
                        className="action-btn complete-btn"
                        onClick={handleConvertQuoteToProject}
                        disabled={
                          !canConvertQuoteToProject || quoteConversionSubmitting
                        }
                      >
                        {quoteConversionSubmitting
                          ? "Converting..."
                          : `Convert to ${quoteConversionType}`}
                      </button>
                    </div>
                    <p className="mockup-approval-meta">
                      Front Desk converts this quote into the selected project
                      type and starting status after client go-ahead.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {isQuoteProject && quoteWorkflowBlocked && (
            <div className="action-card">
              <h3>Quote Requirements</h3>
              <p>
                This quote includes requirements that are not supported yet. Only
                cost, mockup, or previous sample quotes can proceed.
              </p>
              <div className="mockup-empty-state">
                {quoteWorkflowBlockedMessage ||
                  "Quote workflows are not configured for this requirement set."}
              </div>
            </div>
          )}

          {!isQuoteProject && (
            <div className="action-card">
              <h3>Production Sample Approval</h3>
              <p>
                Confirm client decision on production sample before completing
                Production stage.
              </p>
              <div className="billing-actions">
                {!sampleRequirementEnabled ? (
                  <div className="mockup-empty-state">
                    Sample approval requirement is currently off.
                  </div>
                ) : sampleApprovalConfirmed ? (
                  <>
                    <div className="mockup-approval-status approved">
                      Client sample approval confirmed
                    </div>
                    {project?.sampleApproval?.approvedAt && (
                      <p className="mockup-approval-meta">
                        Approved: {formatDateTime(project.sampleApproval.approvedAt)}
                      </p>
                    )}
                    <button
                      className="action-btn undo-btn"
                      onClick={openSampleApprovalResetModal}
                      disabled={!canManageBilling}
                    >
                      Reset to Pending
                    </button>
                  </>
                ) : (
                  <>
                    <div className="mockup-approval-status pending">
                      Client sample approval pending
                    </div>
                    <button
                      className="action-btn complete-btn"
                      onClick={openSampleApprovalModal}
                      disabled={!canManageBilling}
                    >
                      Confirm Sample Approval
                    </button>
                  </>
                )}
                {!canManageBilling && (
                  <p className="mockup-approval-meta">
                    Front Desk or Admin must confirm client sample approval.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <section className="mockup-standalone-section" id="order-actions-mockup">
          <div className="action-card mockup-standalone-card">
            <h3>Mockup Workbench</h3>
            <p>
              {isQuoteProject
                ? "Review Graphics-uploaded mockups with client and record approval or revision request."
                : "Confirm client approval before Mockup stage can be marked complete."}
            </p>
            {!activeMockupVersion ? (
              <div className="mockup-empty-state">
                No Graphics mockup has been uploaded yet.
              </div>
            ) : (
              <>
                <div
                  className={`mockup-approval-status ${
                    mockupApprovalConfirmed
                      ? "approved"
                      : mockupApprovalRejected
                        ? "rejected"
                        : "pending"
                  }`}
                >
                  Latest: {latestMockupVersionLabel}{" "}
                  {mockupApprovalConfirmed
                    ? "Client Approved"
                    : mockupApprovalRejected
                      ? "Client Rejected"
                      : "Pending Client Approval"}
                </div>

                <div className="mockup-carousel">
                  <button
                    type="button"
                    className="mockup-carousel-nav"
                    onClick={() =>
                      setMockupCarouselIndex((previous) =>
                        Math.max(previous - 1, 0),
                      )
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
                    onClick={() => {
                      if (activeMockupIsImage) {
                        setMockupLightboxVersion(activeMockupVersion);
                        return;
                      }
                      window.open(activeMockupVersion.fileUrl, "_blank");
                    }}
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
                  {activeMockupVersion.uploadedAt && (
                    <span>Uploaded: {formatDateTime(activeMockupVersion.uploadedAt)}</span>
                  )}
                  {activeMockupDecision === "rejected" &&
                    activeMockupVersion.clientApproval?.rejectionReason && (
                      <span className="mockup-approval-meta rejection">
                        Reason: {activeMockupVersion.clientApproval.rejectionReason}
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

                {canDecideOnMockupVersions && (
                  <div className="mockup-version-actions">
                    {activeMockupDecision !== "rejected" && (
                      <button
                        className="action-btn complete-btn"
                        onClick={() => openMockupApprovalModal(activeMockupVersion)}
                        disabled={activeMockupDecision === "approved"}
                      >
                        {activeMockupDecision === "approved"
                          ? `Approved (v${activeMockupVersion.version})`
                          : `Confirm Approval (v${activeMockupVersion.version})`}
                      </button>
                    )}
                    {activeMockupDecision !== "approved" && (
                      <button
                        className="action-btn undo-btn"
                        onClick={() => openMockupRejectionModal(activeMockupVersion)}
                        disabled={activeMockupDecision === "rejected"}
                      >
                        {activeMockupDecision === "rejected"
                          ? `Rejected (v${activeMockupVersion.version})`
                          : `Mark Rejected (v${activeMockupVersion.version})`}
                      </button>
                    )}
                  </div>
                )}

                <div className="mockup-carousel-track">
                  {mockupCarouselVersions.map((version, index) => {
                    const decision = getMockupApprovalStatus(version.clientApproval || {});
                    const decisionLabel =
                      decision === "approved"
                        ? "Approved"
                        : decision === "rejected"
                          ? "Rejected"
                          : "Pending approval";
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
                        <span
                          className={`mockup-carousel-tab-status ${decision}`}
                        >
                          {decisionLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!canManageMockupApproval && (
                  <p className="mockup-approval-meta">
                    Front Desk or Admin must confirm client decision.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {canManageSms && (
          <section className="sms-prompts-section">
            <div className="sms-prompts-header">
              <div>
                <h3>Client SMS Prompts</h3>
                <p>Review progress updates and choose whether to send them.</p>
              </div>
              <div className="sms-prompts-header-actions">
                <span className="sms-prompts-count">
                  {smsPrompts.length}{" "}
                  {smsPrompts.length === 1 ? "prompt" : "prompts"}
                </span>
                <button
                  type="button"
                  className="action-btn view-btn"
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
                    <article
                      key={prompt._id}
                      className={`sms-prompt-card ${prompt.state || "pending"}`}
                    >
                      <div className="sms-prompt-card-header">
                        <div>
                          <h4>{titleLabel}</h4>
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
                        <span>Created: {formatDateTime(prompt.createdAt)}</span>
                      </div>
                      {prompt.lastError && (
                        <div className="sms-prompt-error">
                          Last error: {prompt.lastError}
                        </div>
                      )}
                      <div className="sms-prompt-actions">
                        <button
                          type="button"
                          className="action-btn complete-btn"
                          onClick={() => handleSendSmsPrompt(prompt._id)}
                          disabled={!canSend || isSending}
                        >
                          {isSending ? "Sending..." : "Send SMS"}
                        </button>
                        <button
                          type="button"
                          className="action-btn view-btn"
                          onClick={() => openSmsModal("edit", prompt)}
                          disabled={!canEdit || isSending}
                        >
                          Edit
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        )}

        <section className="updates-standalone-section" id="order-actions-updates">
          <div className="updates-standalone-header">
            <div>
              <h3>Activity Feed</h3>
              <p>System events and team comments in one timeline.</p>
            </div>
            <span className="updates-count-badge">{projectUpdates.length} updates</span>
          </div>

          <div className="activity-feed-shell">
            <div className="activity-feed-list">
              {updatesLoading ? (
                <>
                  <div className="activity-feed-item skeleton" />
                  <div className="activity-feed-item skeleton" />
                  <div className="activity-feed-item skeleton" />
                </>
              ) : recentUpdates.length === 0 ? (
                <div className="updates-preview-empty">No updates yet.</div>
              ) : (
                recentUpdates.map((update) => {
                  const isSystemUpdate =
                    !update?.author || typeof update.author === "string";
                  const isEditing = editingUpdateId === update._id;
                  return (
                    <article
                      className={`activity-feed-item ${
                        isSystemUpdate ? "is-system" : "is-human"
                      }`}
                      key={update._id}
                    >
                      <div className="activity-feed-dot" />
                      <div className="activity-feed-content">
                        <div className="updates-preview-meta">
                          <span>{getUpdateAuthorName(update)}</span>
                          <span>{formatDateTime(update.createdAt)}</span>
                        </div>
                        <div className="updates-preview-category-row">
                          <div className="updates-preview-category">
                            {normalizeUpdateCategory(update.category)}
                          </div>
                          {canManageUpdate(update) && (
                            <div className="updates-preview-actions">
                              {isEditing ? (
                                <button
                                  className="action-btn updates-preview-action"
                                  onClick={handleCancelEditUpdate}
                                  disabled={updateEditSubmitting}
                                >
                                  Cancel
                                </button>
                              ) : (
                                <button
                                  className="action-btn updates-preview-action"
                                  onClick={() => handleStartEditUpdate(update)}
                                  disabled={updateDeleteSubmittingId === update._id}
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                className="action-btn undo-btn updates-preview-action"
                                onClick={() => handleDeleteUpdate(update)}
                                disabled={updateDeleteSubmittingId === update._id}
                              >
                                {updateDeleteSubmittingId === update._id
                                  ? "Deleting..."
                                  : "Delete"}
                              </button>
                            </div>
                          )}
                        </div>
                        {isEditing ? (
                          <div className="updates-preview-edit-form">
                            <label htmlFor={`update-edit-category-${update._id}`}>
                              Category
                            </label>
                            <select
                              id={`update-edit-category-${update._id}`}
                              value={editUpdateCategory}
                              onChange={(event) =>
                                setEditUpdateCategory(event.target.value)
                              }
                              disabled={updateEditSubmitting}
                            >
                              {UPDATE_CATEGORY_OPTIONS.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                            <label htmlFor={`update-edit-content-${update._id}`}>
                              Content
                            </label>
                            <textarea
                              id={`update-edit-content-${update._id}`}
                              rows="3"
                              value={editUpdateContent}
                              onChange={(event) =>
                                setEditUpdateContent(event.target.value)
                              }
                              disabled={updateEditSubmitting}
                            />
                            <div className="updates-preview-edit-actions">
                              <button
                                className="action-btn"
                                onClick={handleCancelEditUpdate}
                                disabled={updateEditSubmitting}
                              >
                                Cancel
                              </button>
                              <button
                                className="action-btn update-submit-btn"
                                onClick={() => handleSaveEditUpdate(update._id)}
                                disabled={
                                  updateEditSubmitting ||
                                  editUpdateContent.trim().length === 0
                                }
                              >
                                {updateEditSubmitting ? "Saving..." : "Save Changes"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="updates-preview-content">{update.content}</p>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="activity-composer">
              <div className="activity-composer-head">
                <label htmlFor="order-update-category">Category</label>
                <select
                  id="order-update-category"
                  value={updateCategory}
                  onChange={(event) => setUpdateCategory(event.target.value)}
                  disabled={!canShareUpdates || updateSubmitting}
                >
                  {UPDATE_CATEGORY_OPTIONS.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              {mentionablePeople.length > 0 && (
                <div className="activity-mention-row">
                  {mentionablePeople.map((person) => (
                    <button
                      key={person}
                      type="button"
                      className="activity-mention-chip"
                      onClick={() => addMentionToComposer(person)}
                      disabled={!canShareUpdates || updateSubmitting}
                    >
                      @{person}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                id="order-update-content"
                rows="3"
                value={updateContent}
                onChange={(event) => setUpdateContent(event.target.value)}
                placeholder="Post an update, tag teammates, and keep everyone aligned..."
                disabled={!canShareUpdates || updateSubmitting}
              />
              <div className="activity-composer-actions">
                <button
                  className="action-btn update-submit-btn"
                  onClick={handlePostUpdate}
                  disabled={
                    !canShareUpdates ||
                    updateSubmitting ||
                    updateContent.trim().length === 0
                  }
                >
                  {updateSubmitting ? "Posting..." : "Post Update"}
                </button>
              </div>
            </div>
          </div>
        </section>
          </main>

          <aside className="order-actions-sidebar">
            <section className="order-summary order-context-card">
              <h3>Order Context</h3>
              <p>
                <strong>Client:</strong> {project.details?.client || "-"}
              </p>
              <p>
                <strong>Packaging Type:</strong> {project.details?.packagingType || "-"}
              </p>
              <p>
                <strong>Status:</strong>{" "}
                {formatProjectStatusForDisplay(
                  quoteWorkflowStatus,
                  isQuoteProject,
                  quoteRequirementMode,
                )}
              </p>
              <p>
                <strong>Created:</strong> {formatDate(project.createdAt)}
              </p>
              <div className="status-tags">
                {latestMockupVersion && (
                  <span className="status-tag mockup">Mockup {latestMockupVersionLabel}</span>
                )}
                {mockupApprovalConfirmed && latestMockupVersion && (
                  <span className="status-tag invoice">
                    {latestMockupVersionLabel} Client Approved
                  </span>
                )}
                {mockupApprovalPending && latestMockupVersion && (
                  <span className="status-tag caution">
                    {latestMockupVersionLabel} Pending Client Approval
                  </span>
                )}
                {mockupApprovalRejected && latestMockupVersion && (
                  <span className="status-tag rejection">
                    {latestMockupVersionLabel} Rejected by Client
                  </span>
                )}
                {invoiceSent && (
                  <span className="status-tag invoice">{billingDocumentLabel} Sent</span>
                )}
                {sampleRequirementEnabled && (
                  <span
                    className={`status-tag ${
                      sampleApprovalConfirmed ? "invoice" : "caution"
                    }`}
                  >
                    {sampleApprovalConfirmed ? "Sample Approved" : "Sample Approval Pending"}
                  </span>
                )}
                {!isQuoteProject &&
                  Array.from(paymentTypes).map((type) => (
                    <span key={type} className="status-tag payment">
                      {paymentLabels[type] || type}
                    </span>
                  ))}
                {!isQuoteProject && convertedFromQuoteAt && (
                  <span className="status-tag payment">
                    Converted from Quote ({formatDate(convertedFromQuoteAt)})
                  </span>
                )}
                {isQuoteProject && quoteWorkflowBlocked && (
                  <span className="status-tag caution">Quote Workflow Blocked</span>
                )}
                {isQuoteProject && !quoteWorkflowBlocked && quoteCostMissing && (
                  <span className="status-tag caution">Quote Cost Pending</span>
                )}
                {isQuoteProject && !quoteWorkflowBlocked && quoteMockupMissing && (
                  <span className="status-tag caution">Mockup Approval Pending</span>
                )}
                {isQuoteProject &&
                  !quoteWorkflowBlocked &&
                  quotePreviousSamplesMissing && (
                  <span className="status-tag caution">
                    Sample Retrieval Pending
                  </span>
                )}
                {isQuoteProject &&
                  !quoteWorkflowBlocked &&
                  (quoteWorkflowStatus === "Pending Client Decision" ||
                    quoteWorkflowStatus === "Quote Submission Completed" ||
                    quoteDecisionTaken) && (
                  <span
                    className={`status-tag ${
                      quoteDecisionStatus === "go_ahead"
                        ? "invoice"
                        : quoteDecisionStatus === "declined"
                          ? "rejection"
                          : "caution"
                    }`}
                  >
                    Quote Decision: {formatQuoteDecisionStatus(quoteDecisionStatus)}
                  </span>
                )}
                {showPendingProductionWarning && (
                  <span className="status-tag caution">
                    Pending Production Blocked: {pendingProductionMissingLabels.join(", ")}
                  </span>
                )}
                {showPendingDeliveryWarning && (
                  <span className="status-tag caution">
                    Pending Delivery Blocked: {pendingDeliveryMissingLabels.join(", ")}
                  </span>
                )}
              </div>
            </section>

            <section className="order-revision-section">
              <div className="updates-standalone-header">
                <div>
                  <h3>Order Revision</h3>
                  <p>
                    Open the full order form to revise project details using the same
                    fields available during New Order creation.
                  </p>
                  {lastOrderRevisionUpdatedAt && (
                    <p className="order-revision-last-updated">
                      {lastOrderRevisionLabel}: {formatDateTime(lastOrderRevisionUpdatedAt)}
                    </p>
                  )}
                </div>
              </div>
              <div className="order-revision-body">
                {!canManageOrderRevision && (
                  <p className="order-revision-note">
                    Only Front Desk and Admin can revise full order details.
                  </p>
                )}
                {canManageOrderRevision && isOrderRevisionLocked && (
                  <p className="order-revision-note">
                    Revision is locked because this project is completed. Reopen it to
                    create a new revision.
                  </p>
                )}
                <div className="order-revision-actions">
                  <button
                    className="action-btn update-submit-btn"
                    onClick={openFullOrderRevision}
                    disabled={!canManageOrderRevision || isOrderRevisionLocked}
                  >
                    Open Full Revision Form
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {mockupLightboxVersion && (
        <div
          className="feedback-modal-overlay mockup-lightbox-overlay"
          onClick={() => setMockupLightboxVersion(null)}
        >
          <div
            className="feedback-modal mockup-lightbox"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="feedback-modal-header">
              <div>
                <h3>Mockup v{mockupLightboxVersion.version}</h3>
                <p>{mockupLightboxVersion.fileName || "Mockup preview"}</p>
              </div>
              <button
                type="button"
                className="feedback-modal-close"
                onClick={() => setMockupLightboxVersion(null)}
                aria-label="Close preview"
              >
                ×
              </button>
            </div>
            <div className="mockup-lightbox-body">
              <img
                src={mockupLightboxVersion.fileUrl}
                alt={mockupLightboxVersion.fileName || "Mockup preview"}
              />
            </div>
          </div>
        </div>
      )}

      {billingGuardModal.open && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>{billingGuardModal.title || "Billing Caution"}</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {renderProjectName(project.details, null, "Untitled")}
            </p>
            <p className="confirm-modal-text">{billingGuardModal.message}</p>
            {billingGuardModal.missingLabels.length > 0 && (
              <div className="confirm-phrase">
                Missing: {billingGuardModal.missingLabels.join(", ")}
              </div>
            )}
            <div className="confirm-actions">
              <button
                className="action-btn"
                onClick={closeBillingGuardModal}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {sampleApprovalModal && (
        <div className="confirm-modal-overlay" onClick={closeSampleApprovalModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Client Sample Approval</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {renderProjectName(project.details, null, "Untitled")}
            </p>
            <p className="confirm-modal-text">
              Confirm that client approved the production sample.
            </p>
            <div className="confirm-phrase">{SAMPLE_APPROVAL_CONFIRM_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={sampleApprovalInput}
                onChange={(e) => setSampleApprovalInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeSampleApprovalModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmSampleApproval}
                disabled={
                  sampleApprovalSubmitting ||
                  sampleApprovalInput.trim() !== SAMPLE_APPROVAL_CONFIRM_PHRASE
                }
              >
                {sampleApprovalSubmitting ? "Confirming..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sampleApprovalResetModal && (
        <div
          className="confirm-modal-overlay"
          onClick={closeSampleApprovalResetModal}
        >
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Reset Sample Approval</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {renderProjectName(project.details, null, "Untitled")}
            </p>
            <p className="confirm-modal-text">
              Reset sample approval back to pending.
            </p>
            <div className="confirm-phrase">{SAMPLE_APPROVAL_RESET_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={sampleApprovalResetInput}
                onChange={(e) => setSampleApprovalResetInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button
                className="action-btn"
                onClick={closeSampleApprovalResetModal}
              >
                Cancel
              </button>
              <button
                className="action-btn undo-btn"
                onClick={handleConfirmSampleApprovalReset}
                disabled={
                  sampleApprovalResetSubmitting ||
                  sampleApprovalResetInput.trim() !== SAMPLE_APPROVAL_RESET_PHRASE
                }
              >
                {sampleApprovalResetSubmitting ? "Saving..." : "Reset Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mockupApprovalModal.open && (
        <div className="confirm-modal-overlay" onClick={closeMockupApprovalModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Client Mockup Approval</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {renderProjectName(project.details, null, "Untitled")}
            </p>
            <p className="confirm-modal-text">
              Confirm that client approved mockup version{" "}
              <strong>
                v{mockupApprovalModal.version?.version || "N/A"}
              </strong>
              .
            </p>
            {mockupApprovalModal.version?.fileName && (
              <p className="confirm-modal-text">
                <strong>File:</strong> {mockupApprovalModal.version.fileName}
              </p>
            )}
            <div className="confirm-phrase">{MOCKUP_APPROVAL_CONFIRM_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={mockupApprovalInput}
                onChange={(e) => setMockupApprovalInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeMockupApprovalModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmMockupApproval}
                disabled={
                  mockupApprovalSubmitting ||
                  mockupApprovalInput.trim() !== MOCKUP_APPROVAL_CONFIRM_PHRASE
                }
              >
                {mockupApprovalSubmitting ? "Confirming..." : "Confirm Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mockupRejectionModal.open && (
        <div className="confirm-modal-overlay" onClick={closeMockupRejectionModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Client Mockup Rejection</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Project:</strong>{" "}
              {project.orderId || project._id || "N/A"} -{" "}
              {renderProjectName(project.details, null, "Untitled")}
            </p>
            <p className="confirm-modal-text">
              Confirm that client rejected mockup version{" "}
              <strong>
                v{mockupRejectionModal.version?.version || "N/A"}
              </strong>
              .
            </p>
            {mockupRejectionModal.version?.fileName && (
              <p className="confirm-modal-text">
                <strong>File:</strong> {mockupRejectionModal.version.fileName}
              </p>
            )}
            <div className="confirm-phrase">{MOCKUP_REJECTION_CONFIRM_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={mockupRejectionInput}
                onChange={(e) => setMockupRejectionInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-input-group">
              <label>Rejection Reason (Optional)</label>
              <textarea
                rows="3"
                value={mockupRejectionReason}
                onChange={(e) => setMockupRejectionReason(e.target.value)}
                placeholder="Why did client reject this mockup? (optional)"
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeMockupRejectionModal}>
                Cancel
              </button>
              <button
                className="action-btn undo-btn"
                onClick={handleConfirmMockupRejection}
                disabled={
                  mockupRejectionSubmitting ||
                  mockupRejectionInput.trim() !==
                    MOCKUP_REJECTION_CONFIRM_PHRASE
                }
              >
                {mockupRejectionSubmitting ? "Saving..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isQuoteProject && deliveryModal.open && (
        <div className="confirm-modal-overlay" onClick={closeDeliveryModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Delivery</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to confirm delivery completion.
            </p>
            <div className="confirm-phrase">{DELIVERY_CONFIRM_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={deliveryInput}
                onChange={(e) => setDeliveryInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeDeliveryModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmDelivery}
                disabled={
                  deliverySubmitting ||
                  deliveryInput.trim() !== DELIVERY_CONFIRM_PHRASE
                }
              >
                {deliverySubmitting ? "Confirming..." : "Confirm Delivery"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isQuoteProject && batchDeliveryModal.open && batchDeliveryModal.batch && (
        <div className="confirm-modal-overlay" onClick={closeBatchDeliveryModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Batch Delivery</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              <strong>Batch:</strong>{" "}
              {batchDeliveryModal.batch?.label || "Batch"}
            </p>
            <p className="confirm-modal-text">
              <strong>Items:</strong>{" "}
              {buildBatchItemSummary(batchDeliveryModal.batch, batchItemMap)}
            </p>
            <p className="confirm-modal-text">
              <strong>Total Qty:</strong>{" "}
              {getBatchTotalQty(batchDeliveryModal.batch) || "N/A"}
            </p>
            <div className="confirm-input-group">
              <label>Delivered Quantity</label>
              <input
                type="number"
                min="1"
                max={
                  getBatchTotalQty(batchDeliveryModal.batch) > 0
                    ? getBatchTotalQty(batchDeliveryModal.batch)
                    : undefined
                }
                value={batchDeliveryQty}
                onChange={(e) => setBatchDeliveryQty(e.target.value)}
                placeholder="Enter delivered quantity"
              />
            </div>
            <div className="confirm-input-group">
              <label>Recipient (Optional)</label>
              <input
                type="text"
                value={batchDeliveryRecipient}
                onChange={(e) => setBatchDeliveryRecipient(e.target.value)}
                placeholder="Who received this batch?"
              />
            </div>
            <div className="confirm-input-group">
              <label>Delivery Notes (Optional)</label>
              <textarea
                rows="3"
                value={batchDeliveryNotes}
                onChange={(e) => setBatchDeliveryNotes(e.target.value)}
                placeholder="Any delivery notes?"
              />
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to confirm delivery completion.
            </p>
            <div className="confirm-phrase">{DELIVERY_CONFIRM_PHRASE}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={batchDeliveryInput}
                onChange={(e) => setBatchDeliveryInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeBatchDeliveryModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmBatchDelivery}
                disabled={
                  batchDeliverySubmitting ||
                  batchDeliveryInput.trim() !== DELIVERY_CONFIRM_PHRASE ||
                  !Number.isFinite(Number(batchDeliveryQty)) ||
                  Number(batchDeliveryQty) <= 0 ||
                  (getBatchTotalQty(batchDeliveryModal.batch) > 0 &&
                    Number(batchDeliveryQty) >
                      getBatchTotalQty(batchDeliveryModal.batch))
                }
              >
                {batchDeliverySubmitting ? "Confirming..." : "Confirm Delivery"}
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceModal && (
        <div className="confirm-modal-overlay" onClick={closeInvoiceModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm {billingDocumentLabel} Sent</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to confirm {billingDocumentLower} delivery.
            </p>
            <div className="confirm-phrase">{billingConfirmPhrase}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={invoiceInput}
                onChange={(e) => setInvoiceInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeInvoiceModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmInvoice}
                disabled={
                  invoiceSubmitting ||
                  invoiceInput.trim() !== billingConfirmPhrase
                }
              >
                {invoiceSubmitting
                  ? "Confirming..."
                  : `Confirm ${billingDocumentLabel} Sent`}
              </button>
            </div>
          </div>
        </div>
      )}

      {invoiceUndoModal && (
        <div className="confirm-modal-overlay" onClick={closeInvoiceUndoModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Undo {billingDocumentLabel} Sent</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to reset {billingDocumentLower} status.
            </p>
            <div className="confirm-phrase">{billingUndoPhrase}</div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={invoiceUndoInput}
                onChange={(e) => setInvoiceUndoInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closeInvoiceUndoModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmInvoiceUndo}
                disabled={
                  invoiceUndoSubmitting ||
                  invoiceUndoInput.trim() !== billingUndoPhrase
                }
              >
                {invoiceUndoSubmitting
                  ? "Confirming..."
                  : `Undo ${billingDocumentLabel} Sent`}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentModal.open && (
        <div className="confirm-modal-overlay" onClick={closePaymentModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Confirm Payment Verification</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to confirm payment verification.
            </p>
            <div className="confirm-phrase">
              {PAYMENT_OPTIONS.find((option) => option.type === paymentModal.type)
                ?.phrase || ""}
            </div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={paymentInput}
                onChange={(e) => setPaymentInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closePaymentModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmPayment}
                disabled={
                  paymentSubmitting ||
                  paymentInput.trim() !==
                    (PAYMENT_OPTIONS.find(
                      (option) => option.type === paymentModal.type,
                    )?.phrase || "")
                }
              >
                {paymentSubmitting ? "Confirming..." : "Confirm Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentUndoModal.open && (
        <div className="confirm-modal-overlay" onClick={closePaymentUndoModal}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-modal-header">
              <h3>Undo Payment Verification</h3>
              <p>{project.orderId || project._id || "Project"}</p>
            </div>
            <p className="confirm-modal-text">
              Type the phrase below to undo payment verification.
            </p>
            <div className="confirm-phrase">
              {PAYMENT_OPTIONS.find((option) => option.type === paymentUndoModal.type)
                ?.undoPhrase || ""}
            </div>
            <div className="confirm-input-group">
              <label>Confirmation</label>
              <input
                type="text"
                value={paymentUndoInput}
                onChange={(e) => setPaymentUndoInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="confirm-actions">
              <button className="action-btn" onClick={closePaymentUndoModal}>
                Cancel
              </button>
              <button
                className="action-btn complete-btn"
                onClick={handleConfirmPaymentUndo}
                disabled={
                  paymentUndoSubmitting ||
                  paymentUndoInput.trim() !==
                    (PAYMENT_OPTIONS.find(
                      (option) => option.type === paymentUndoModal.type,
                    )?.undoPhrase || "")
                }
              >
                {paymentUndoSubmitting ? "Confirming..." : "Undo Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {smsModal.open && (
        <div className="feedback-modal-overlay" onClick={closeSmsModal}>
          <div
            className="feedback-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="feedback-modal-header">
              <div>
                <h3>
                  {smsModal.mode === "custom" ? "Draft Custom SMS" : "Edit SMS"}
                </h3>
                <p>{project.orderId || project._id || "Project"}</p>
              </div>
              <button
                className="feedback-modal-close"
                onClick={closeSmsModal}
                aria-label="Close SMS modal"
              >
                x
              </button>
            </div>

            <div className="feedback-form">
              <label>Client</label>
              <div className="feedback-preview-text">
                {project.details?.client || "N/A"}
              </div>

              <label>Phone</label>
              <div className="feedback-preview-text">
                {project.details?.clientPhone ||
                  project.orderRef?.clientPhone ||
                  "No phone on file"}
              </div>

              <label>Message</label>
              <textarea
                rows="4"
                value={smsModal.message}
                onChange={(e) =>
                  setSmsModal((prev) => ({ ...prev, message: e.target.value }))
                }
                placeholder="Write a message to the client..."
              />

              <div className="feedback-actions">
                <button className="action-btn" onClick={closeSmsModal}>
                  Cancel
                </button>
                <button
                  className="action-btn view-btn"
                  onClick={() => handleSaveSmsPrompt({ sendAfterSave: false })}
                  disabled={smsSubmitting}
                >
                  Save
                </button>
                <button
                  className="action-btn complete-btn"
                  onClick={() => handleSaveSmsPrompt({ sendAfterSave: true })}
                  disabled={smsSubmitting}
                >
                  {smsSubmitting ? "Saving..." : "Save & Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feedbackModal.open && (
        <div className="feedback-modal-overlay" onClick={closeFeedbackModal}>
          <div
            className="feedback-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="feedback-modal-header">
              <div>
                <h3>Project Feedback</h3>
                <p>{project.orderId || project._id || "Project"}</p>
              </div>
              <button
                className="feedback-modal-close"
                onClick={closeFeedbackModal}
                aria-label="Close feedback modal"
              >
                x
              </button>
            </div>

            <div className="feedback-form">
              <label>Feedback Type</label>
              <select
                value={feedbackType}
                onChange={(e) => setFeedbackType(e.target.value)}
              >
                <option value="Positive">Positive</option>
                <option value="Negative">Negative</option>
              </select>

              <label>Add some few notes</label>
              <textarea
                rows="3"
                value={feedbackNotes}
                onChange={(e) => setFeedbackNotes(e.target.value)}
                placeholder="Share brief notes about the delivery..."
              />

              <label>
                Client Media (Optional)
              </label>
              <input
                type="file"
                accept={FEEDBACK_MEDIA_ACCEPT}
                multiple
                onChange={handleFeedbackFileChange}
                className="feedback-media-input"
              />
              <div className="feedback-upload-hint">
                Attach photos, voice notes, or videos shared by the client.
              </div>
              {feedbackFiles.length > 0 && (
                <div className="feedback-selected-files">
                  {feedbackFiles.map((file, index) => (
                    <div
                      className="feedback-selected-file"
                      key={`${file.name}-${file.lastModified}-${index}`}
                    >
                      <span>{file.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveFeedbackFile(index)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="feedback-actions">
                <button className="action-btn" onClick={closeFeedbackModal}>
                  Cancel
                </button>
                <button
                  className="action-btn feedback-submit"
                  onClick={handleAddFeedback}
                  disabled={feedbackSaving}
                >
                  {feedbackSaving ? "Saving..." : "Submit Feedback"}
                </button>
              </div>
            </div>

            <div className="feedback-history">
              <h4>Previous Feedback</h4>
              {sortedFeedbackEntries.length === 0 ? (
                <div className="empty-feedback">No feedback yet.</div>
              ) : (
                <div className="feedback-history-list">
                  {sortedFeedbackEntries.map((entry) => (
                    <div className="feedback-history-item" key={entry._id}>
                      <div className="feedback-history-meta">
                        <span
                          className={`feedback-pill ${
                            entry.type === "Positive" ? "positive" : "negative"
                          }`}
                        >
                          {entry.type}
                        </span>
                        <span className="feedback-history-by">
                          {entry.createdByName || "Unknown"}
                        </span>
                        <span className="feedback-history-date">
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                      <p>{entry.notes || "No notes provided."}</p>
                      {Array.isArray(entry.attachments) &&
                        entry.attachments.filter((file) => file?.fileUrl).length >
                          0 && (
                          <div className="feedback-history-attachments">
                            {entry.attachments
                              .filter((file) => file?.fileUrl)
                              .map((file, index) => (
                                <a
                                  key={`${entry._id || "feedback"}-${index}`}
                                  href={file.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="feedback-attachment-link"
                                >
                                  {getFeedbackAttachmentName(file)}
                                </a>
                              ))}
                          </div>
                        )}
                      <button
                        className="feedback-delete"
                        onClick={() => handleDeleteFeedback(entry._id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderActions;

