import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  PRODUCTION_SUB_DEPARTMENTS,
  GRAPHICS_SUB_DEPARTMENTS,
  STORES_SUB_DEPARTMENTS,
  PHOTOGRAPHY_SUB_DEPARTMENTS,
  getDepartmentLabel,
} from "../../constants/departments";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import Toast from "../../components/ui/Toast";
import useRealtimeRefresh from "../../hooks/useRealtimeRefresh";
import { getFullName, getLeadDisplay } from "../../utils/leadDisplay";
import { normalizeProjectUpdateText } from "../../utils/projectUpdateText";
import { renderProjectName } from "../../utils/projectName";
import {
  getQuoteRequirementMode,
  getQuoteStatusDisplay,
  normalizeQuoteChecklist,
  normalizeQuoteStatus,
} from "../../utils/quoteStatus";
import {
  normalizeReferenceAttachments,
  getReferenceFileName,
} from "../../utils/referenceAttachments";
import "./EngagedProjects.css";

const STATUS_ACTIONS = {
  Graphics: {
    label: "Mockup",
    pending: "Pending Mockup",
    complete: "Mockup Completed",
  },
  Production: {
    label: "Production Complete",
    pending: "Pending Production",
    complete: "Production Completed",
  },
  Photography: {
    label: "Photography Complete",
    pending: "Pending Photography",
    complete: "Photography Completed",
  },
  Stores: {
    label: "Stocks & Packaging Complete",
    pending: "Pending Packaging",
    complete: "Packaging Completed",
  },
};

const ACKNOWLEDGE_PHRASE = "I agree to be engaged in this project";
const COMPLETE_PHRASE = "I confirm this engagement is complete";
const SCOPE_APPROVAL_READY_STATUSES = new Set([
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
  "Finished",
  "In Progress",
  "Completed",
  "On Hold",
  "Pending Cost Verification",
  "Cost Verification Completed",
  "Pending Quote Submission",
  "Quote Submission Completed",
  "Pending Client Decision",
  "Completed",
]);

const isScopeApprovalComplete = (status) =>
  Boolean(status && SCOPE_APPROVAL_READY_STATUSES.has(status));

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
const SAMPLE_APPROVAL_MISSING_LABEL = "Client sample approval";
const QUOTE_REQUIREMENT_MOCKUP_KEY = "mockup";
const QUOTE_REQUIREMENT_MOCKUP_LABEL = "Mockup";
const QUOTE_REQUIREMENT_PREVIOUS_SAMPLES_KEY = "previousSamples";
const QUOTE_REQUIREMENT_PREVIOUS_SAMPLES_LABEL = "Previous Sample / Jobs Done";
const QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_KEY = "sampleProduction";
const QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_LABEL = "Sample Production";
const QUOTE_PRE_DEPARTMENTAL_STATUS_SET = new Set([
  "Quote Created",
  "Pending Scope Approval",
  "Scope Approval Completed",
  "Pending Cost Verification",
]);
const QUOTE_MOCKUP_WORKFLOW_STATUS_SET = new Set(["Pending Mockup"]);
const QUOTE_MOCKUP_SUBMIT_TRANSITIONS = {
  assigned: ["in_progress", "dept_submitted"],
  in_progress: ["dept_submitted"],
  client_revision_requested: ["in_progress", "dept_submitted"],
  blocked: ["in_progress", "dept_submitted"],
};
const QUOTE_PREVIOUS_SAMPLES_RETRIEVE_STATUSES = new Set([
  "assigned",
  "in_progress",
  "client_revision_requested",
]);
const QUOTE_SAMPLE_PRODUCTION_SUBMIT_TRANSITIONS = {
  assigned: ["in_progress", "dept_submitted"],
  in_progress: ["dept_submitted"],
  client_revision_requested: ["in_progress", "dept_submitted"],
  blocked: ["in_progress", "dept_submitted"],
};
const PRODUCTION_MOCKUP_VISIBILITY_STATUSES = new Set([
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
  "In Progress",
]);

const BATCH_STATUS_FLOW = [
  "planned",
  "in_production",
  "produced",
  "in_packaging",
  "packaged",
  "delivered",
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
const BATCH_ACTION_LABELS = {
  in_production: "Start Production",
  produced: "Mark Produced",
  in_packaging: "Receive in Packaging",
  packaged: "Mark Packaged",
  delivered: "Mark Delivered",
  cancelled: "Cancel Batch",
};
const BATCH_PRODUCTION_STATUS_SET = new Set(["in_production", "produced"]);
const BATCH_PACKAGING_STATUS_SET = new Set(["in_packaging", "packaged"]);
const BATCH_PRODUCTION_COMPLETE_STATUS_SET = new Set([
  "produced",
  "in_packaging",
  "packaged",
  "delivered",
]);

const getBatchStatusLabel = (status) =>
  BATCH_STATUS_LABELS[status] || status || "Unknown";
const getBatchActionLabel = (status) =>
  BATCH_ACTION_LABELS[status] || `Move to ${getBatchStatusLabel(status)}`;
const getNextBatchStatus = (status) => {
  const normalized = String(status || "").trim().toLowerCase();
  const index = BATCH_STATUS_FLOW.indexOf(normalized);
  if (index < 0) return "";
  return BATCH_STATUS_FLOW[index + 1] || "";
};
const normalizeBatchStatus = (status) =>
  String(status || "").trim().toLowerCase();

const buildBatchAllocationTotals = (batches = []) =>
  (Array.isArray(batches) ? batches : []).reduce((acc, batch) => {
    if (!batch || batch.status === "cancelled") return acc;
    (Array.isArray(batch.items) ? batch.items : []).forEach((item) => {
      const itemId = String(item?.itemId || item?._id || "");
      if (!itemId) return;
      const qty = Number(item?.qty) || 0;
      acc[itemId] = (acc[itemId] || 0) + qty;
    });
    return acc;
  }, {});

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

const formatQuoteRequirementStatus = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) return "Assigned";
  return normalized
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
};

const getQuoteRequirementState = (project = {}, key = "") => {
  const quoteDetails = project?.quoteDetails || {};
  const checklistRequired = Boolean(quoteDetails?.checklist?.[key]);
  const rawItems =
    quoteDetails?.requirementItems &&
    typeof quoteDetails.requirementItems === "object"
      ? quoteDetails.requirementItems
      : {};
  const rawItem = rawItems?.[key] && typeof rawItems[key] === "object"
    ? rawItems[key]
    : {};
  const rawStatus = String(rawItem?.status || "").trim().toLowerCase();
  const isRequired = Boolean(rawItem?.isRequired) || checklistRequired;
  const status = isRequired
    ? rawStatus && rawStatus !== "not_required"
      ? rawStatus
      : "assigned"
    : "not_required";

  return {
    isRequired,
    status,
    updatedAt: rawItem?.updatedAt || null,
    note: String(rawItem?.note || "").trim(),
  };
};

const formatBillingRequirementLabels = (missing = []) =>
  (Array.isArray(missing) ? missing : [])
    .map((item) => BILLING_REQUIREMENT_LABELS[item] || item)
    .filter(Boolean);

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

const getReferenceFileExtension = (value) => {
  const fileName = getReferenceFileName(value);
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) return "FILE";
  return fileName.slice(dotIndex + 1).toUpperCase().slice(0, 6);
};

const isImageReference = (fileUrl = "", fileType = "") => {
  const normalizedType = String(fileType || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(fileUrl || ""));
};

const normalizeObjectId = (value) => {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
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

const ENGAGED_WORKFLOW_STEPS = [
  {
    key: "brief",
    label: "Project Brief",
    statuses: [
      "Quote Created",
      "Order Created",
      "Pending Scope Approval",
      "Scope Approval Completed",
      "Pending Departmental Meeting",
      "Pending Departmental Engagement",
      "Departmental Engagement Completed",
    ],
  },
  {
    key: "graphics",
    label: "Graphics",
    statuses: [
      "Pending Cost Verification",
      "Cost Verification Completed",
      "Pending Mockup",
      "Mockup Completed",
    ],
  },
  {
    key: "qc",
    label: "QC",
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
      "Pending Quote Submission",
      "Quote Submission Completed",
      "Pending Client Decision",
      "Completed",
    ],
  },
  {
    key: "billing",
    label: "Billing",
    statuses: ["Pending Delivery/Pickup"],
  },
  {
    key: "delivery",
    label: "Delivery",
    statuses: [
      "Delivered",
      "Pending Feedback",
      "Feedback Completed",
      "Completed",
      "Finished",
    ],
  },
];

const resolveEngagedWorkflow = (status = "") => {
  const activeIndex = ENGAGED_WORKFLOW_STEPS.findIndex((step) =>
    step.statuses.includes(status),
  );
  const normalizedIndex = activeIndex >= 0 ? activeIndex : 0;

  return ENGAGED_WORKFLOW_STEPS.map((step, index) => ({
    ...step,
    state:
      index < normalizedIndex
        ? "complete"
        : index === normalizedIndex
          ? "active"
          : "upcoming",
  }));
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
        uploadedAt: entry?.uploadedAt || null,
        clientApproval: {
          status: decisionStatus,
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
    normalized.push({
      entryId: mockup?._id || mockup?.id || null,
      version:
        Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1,
      fileUrl: String(mockup.fileUrl || "").trim(),
      fileName: String(mockup.fileName || "").trim(),
      fileType: String(mockup.fileType || "").trim(),
      uploadedAt: mockup.uploadedAt || null,
      clientApproval: {
        status: getMockupApprovalStatus(mockup?.clientApproval || {}),
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

const isImageMockupAsset = (fileUrl = "", fileType = "") => {
  const normalizedType = String(fileType || "").toLowerCase();
  if (normalizedType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(fileUrl || ""));
};

const getCategoryForDepartment = (dept) => {
  if (GRAPHICS_SUB_DEPARTMENTS.includes(dept)) return "Graphics";
  if (STORES_SUB_DEPARTMENTS.includes(dept)) return "Stores";
  if (PHOTOGRAPHY_SUB_DEPARTMENTS.includes(dept)) return "Photography";
  return "Production";
};

const EngagedProjectActions = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orderMeeting, setOrderMeeting] = useState(null);
  const [meetingLoading, setMeetingLoading] = useState(false);
  const [meetingError, setMeetingError] = useState("");
  const [meetingGate, setMeetingGate] = useState(null);
  const [toast, setToast] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(null);
  const [quoteRequirementUpdating, setQuoteRequirementUpdating] = useState("");

  const [projectUpdates, setProjectUpdates] = useState([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updateForm, setUpdateForm] = useState({
    content: "",
    category: "Production",
    department: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const [showAcknowledgeModal, setShowAcknowledgeModal] = useState(false);
  const [acknowledgeTarget, setAcknowledgeTarget] = useState(null);
  const [acknowledgeInput, setAcknowledgeInput] = useState("");
  const [acknowledgeSubmitting, setAcknowledgeSubmitting] = useState(false);

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [completeInput, setCompleteInput] = useState("");
  const [completeSubmitting, setCompleteSubmitting] = useState(false);
  const [billingGuardModal, setBillingGuardModal] = useState({
    open: false,
    title: "Billing Caution",
    target: null,
    message: "",
    missingLabels: [],
  });
  const [billingGuardSubmitting, _setBillingGuardSubmitting] = useState(false);
  const [dismissedGuardKey, setDismissedGuardKey] = useState("");

  const [showMockupModal, setShowMockupModal] = useState(false);
  const [mockupTarget, setMockupTarget] = useState(null);
  const [mockupFiles, setMockupFiles] = useState([]);
  const [mockupNote, setMockupNote] = useState("");
  const [mockupUploading, setMockupUploading] = useState(false);
  const [mockupCarouselIndex, setMockupCarouselIndex] = useState(0);
  const [productionMockupIndex, setProductionMockupIndex] = useState(0);
  const [mockupDeleteModal, setMockupDeleteModal] = useState({
    open: false,
    version: null,
  });
  const [mockupDeleteSubmitting, setMockupDeleteSubmitting] = useState(false);
  const [batchFormOpen, setBatchFormOpen] = useState(false);
  const [batchLabel, setBatchLabel] = useState("");
  const [batchEditingId, setBatchEditingId] = useState("");
  const [batchItemAllocations, setBatchItemAllocations] = useState({});
  const [batchCreating, setBatchCreating] = useState(false);
  const [batchUpdatingId, setBatchUpdatingId] = useState("");
  const [batchPackagingModal, setBatchPackagingModal] = useState({
    open: false,
    batch: null,
  });
  const [batchPackagingQty, setBatchPackagingQty] = useState("");
  const [batchPackagingSubmitting, setBatchPackagingSubmitting] =
    useState(false);

  const userDepartments = Array.isArray(user?.department)
    ? user.department
    : user?.department
      ? [user.department]
      : [];
  const hasGraphicsParent = userDepartments.includes("Graphics/Design");
  const hasStoresParent = userDepartments.includes("Stores");
  const hasPhotographyParent = userDepartments.includes("Photography");

  const productionSubDepts = useMemo(() => {
    return userDepartments.filter((d) => PRODUCTION_SUB_DEPARTMENTS.includes(d));
  }, [userDepartments]);

  const userEngagedDepts = useMemo(() => {
    const found = [];
    if (productionSubDepts.length > 0) found.push("Production");
    if (
      hasGraphicsParent ||
      userDepartments.some((d) => GRAPHICS_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Graphics");
    if (
      hasStoresParent ||
      userDepartments.some((d) => STORES_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Stores");
    if (
      hasPhotographyParent ||
      userDepartments.some((d) => PHOTOGRAPHY_SUB_DEPARTMENTS.includes(d))
    )
      found.push("Photography");
    return found;
  }, [
    userDepartments,
    productionSubDepts,
    hasGraphicsParent,
    hasStoresParent,
    hasPhotographyParent,
  ]);

  const engagedSubDepts = useMemo(() => {
    let aggregated = [];
    if (productionSubDepts.length > 0)
      aggregated = [...aggregated, ...productionSubDepts];
    if (userEngagedDepts.includes("Graphics"))
      aggregated = [...aggregated, ...GRAPHICS_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Stores"))
      aggregated = [...aggregated, ...STORES_SUB_DEPARTMENTS];
    if (userEngagedDepts.includes("Photography"))
      aggregated = [...aggregated, ...PHOTOGRAPHY_SUB_DEPARTMENTS];
    return Array.from(new Set(aggregated));
  }, [userEngagedDepts, productionSubDepts]);

  const isAdminUser = user?.role === "admin";
  const hasProductionRole =
    userDepartments.includes("Production") ||
    userDepartments.some((dept) => PRODUCTION_SUB_DEPARTMENTS.includes(dept));
  const hasPackagingRole =
    userDepartments.includes("Stores") ||
    userDepartments.some((dept) => STORES_SUB_DEPARTMENTS.includes(dept));
  const isAdminPackagingUser = isAdminUser && hasPackagingRole;
  const canCreateBatches = !isAdminUser && hasProductionRole;
  const canManageProductionBatches = !isAdminUser && hasProductionRole;
  const canManagePackagingBatches = hasPackagingRole;

  const projectEngagedSubDepts = useMemo(() => {
    if (!project) return [];
    return (project.departments || []).filter((dept) =>
      engagedSubDepts.includes(dept),
    );
  }, [project, engagedSubDepts]);

  const acknowledgedDepts = useMemo(
    () => new Set((project?.acknowledgements || []).map((ack) => ack.department)),
    [project],
  );
  const acknowledgementsByDept = useMemo(() => {
    const entries = Array.isArray(project?.acknowledgements)
      ? project.acknowledgements
      : [];
    return new Map(
      entries
        .filter((ack) => ack && ack.department)
        .map((ack) => [ack.department, ack]),
    );
  }, [project]);

  const paymentTypes = useMemo(
    () =>
      new Set(
        (project?.paymentVerifications || []).map((entry) => entry.type),
      ),
    [project],
  );
  const isQuoteProject = project?.projectType === "Quote";
  const quoteWorkflowStatus = isQuoteProject
    ? normalizeQuoteStatus(project?.status || "")
    : project?.status || "";
  const resolveQuoteChecklist = (projectRecord) => {
    const base = normalizeQuoteChecklist(
      projectRecord?.quoteDetails?.checklist || {},
    );
    const requirementItems =
      projectRecord?.quoteDetails?.requirementItems || {};
    Object.keys(base).forEach((key) => {
      if (!base[key] && requirementItems?.[key]?.isRequired) {
        base[key] = true;
      }
    });
    return base;
  };

  const quoteChecklist = isQuoteProject ? resolveQuoteChecklist(project) : {};
  const unsupportedQuoteRequirementKeys = Object.entries(quoteChecklist)
    .filter(([key, value]) => key !== "cost" && key !== "mockup" && Boolean(value))
    .map(([key]) => key);
  const quoteRequirementMode = isQuoteProject
    ? getQuoteRequirementMode(quoteChecklist)
    : "none";
  const isCostOnlyQuote = isQuoteProject && quoteRequirementMode === "cost";
  const isMockupOnlyQuote = isQuoteProject && quoteRequirementMode === "mockup";
  const quoteHasMultipleRequirements = Boolean(
    quoteChecklist.cost && quoteChecklist.mockup,
  );
  const quoteWorkflowBlocked =
    isQuoteProject && !isCostOnlyQuote && !isMockupOnlyQuote;
  const quoteWorkflowBlockedMessage = quoteWorkflowBlocked
    ? quoteRequirementMode === "none"
      ? "Quote requirements are not configured yet."
      : quoteHasMultipleRequirements
        ? "Multiple quote requirements are selected. Only one workflow can be active right now."
        : unsupportedQuoteRequirementKeys.length > 0
          ? `Unsupported requirements: ${unsupportedQuoteRequirementKeys.join(", ")}.`
          : "Quote requirement workflows are not configured yet."
    : "";
  const displayStatus = isQuoteProject
    ? getQuoteStatusDisplay(
        project?.status || "",
        getQuoteRequirementMode(project?.quoteDetails?.checklist || {}),
      )
    : project?.status || "";
  const paymentChecksEnabled = !isQuoteProject;
  const quoteMockupRequirement = useMemo(
    () =>
      isQuoteProject
        ? getQuoteRequirementState(project, QUOTE_REQUIREMENT_MOCKUP_KEY)
        : {
            isRequired: false,
            status: "not_required",
            updatedAt: null,
            note: "",
          },
    [isQuoteProject, project],
  );
  const quotePreviousSamplesRequirement = useMemo(
    () =>
      isQuoteProject
        ? getQuoteRequirementState(project, QUOTE_REQUIREMENT_PREVIOUS_SAMPLES_KEY)
        : {
            isRequired: false,
            status: "not_required",
            updatedAt: null,
            note: "",
          },
    [isQuoteProject, project],
  );
  const quoteSampleProductionRequirement = useMemo(
    () =>
      isQuoteProject
        ? getQuoteRequirementState(project, QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_KEY)
        : {
            isRequired: false,
            status: "not_required",
            updatedAt: null,
            note: "",
          },
    [isQuoteProject, project],
  );
  const quoteDepartmentalEngagementComplete = useMemo(() => {
    if (!isQuoteProject) return true;
    if (quoteWorkflowBlocked) return false;
    const status = String(quoteWorkflowStatus || "").trim();
    if (QUOTE_PRE_DEPARTMENTAL_STATUS_SET.has(status)) return false;

    const engagedDepartments = Array.isArray(project?.departments)
      ? project.departments
      : [];
    if (engagedDepartments.length === 0) return false;
    return engagedDepartments.every((departmentName) =>
      acknowledgedDepts.has(departmentName),
    );
  }, [
    isQuoteProject,
    quoteWorkflowBlocked,
    quoteWorkflowStatus,
    project?.departments,
    acknowledgedDepts,
  ]);
  const invoiceSent = Boolean(project?.invoice?.sent);
  const pendingProductionMissing =
    project && paymentChecksEnabled
      ? getPendingProductionBillingMissing({ invoiceSent, paymentTypes })
      : [];
  const pendingDeliveryMissing =
    project && paymentChecksEnabled
      ? getPendingDeliveryBillingMissing({ paymentTypes })
      : [];
  const pendingProductionMissingLabels = formatBillingRequirementLabels(
    pendingProductionMissing,
  );
  const pendingDeliveryMissingLabels = formatBillingRequirementLabels(
    pendingDeliveryMissing,
  );
  const showPendingProductionWarning =
    project &&
    paymentChecksEnabled &&
    ["Pending Master Approval", "Pending Production"].includes(project.status) &&
    pendingProductionMissing.length > 0;
  const showPendingDeliveryWarning =
    project &&
    paymentChecksEnabled &&
    ["Pending Packaging", "Pending Delivery/Pickup"].includes(project.status) &&
    pendingDeliveryMissing.length > 0;
  const sampleRequirementEnabled =
    project &&
    paymentChecksEnabled &&
    Boolean(project?.sampleRequirement?.isRequired);
  const sampleApprovalStatus = getSampleApprovalStatus(
    project?.sampleApproval || {},
  );
  const sampleApprovalPending =
    sampleRequirementEnabled && sampleApprovalStatus !== "approved";
  const showPendingProductionSampleWarning =
    project &&
    sampleApprovalPending &&
    project.status === "Pending Production";
  const sampleMissingLabels = showPendingProductionSampleWarning
    ? [SAMPLE_APPROVAL_MISSING_LABEL]
    : [];
  const currentGuardKey = project?._id
    ? `${project._id}|${project.status}|${
        showPendingProductionSampleWarning
          ? sampleMissingLabels.join("|")
          : showPendingProductionWarning
            ? pendingProductionMissingLabels.join("|")
            : showPendingDeliveryWarning
              ? pendingDeliveryMissingLabels.join("|")
              : ""
      }`
    : "";

  const isProjectLeadForProject = useMemo(() => {
    const currentUserId = normalizeObjectId(user?._id || user?.id);
    const projectLeadId = normalizeObjectId(project?.projectLeadId);
    return Boolean(currentUserId && projectLeadId && currentUserId === projectLeadId);
  }, [user, project?.projectLeadId]);
  const projectItems = useMemo(
    () => (Array.isArray(project?.items) ? project.items : []),
    [project?.items],
  );
  const batches = useMemo(
    () => (Array.isArray(project?.batches) ? project.batches : []),
    [project?.batches],
  );
  const hasBatches = batches.length > 0;
  const activeBatches = useMemo(
    () => batches.filter((batch) => batch?.status !== "cancelled"),
    [batches],
  );
  const batchItemMap = useMemo(
    () => buildProjectItemMap(projectItems),
    [projectItems],
  );
  const batchAllocationTotals = useMemo(
    () => buildBatchAllocationTotals(batches),
    [batches],
  );
  const batchFormAllocationTotals = useMemo(() => {
    if (!batchEditingId) return batchAllocationTotals;
    const trimmed = String(batchEditingId);
    const filtered = batches.filter(
      (batch) => String(batch?.batchId || "") !== trimmed,
    );
    return buildBatchAllocationTotals(filtered);
  }, [batchEditingId, batchAllocationTotals, batches]);
  const batchRemainingByItem = useMemo(() => {
    const remaining = {};
    projectItems.forEach((item) => {
      const itemId = String(item?._id || "");
      if (!itemId) return;
      const totalQty = Number(item?.qty) || 0;
      const allocatedQty = batchFormAllocationTotals[itemId] || 0;
      remaining[itemId] = Math.max(totalQty - allocatedQty, 0);
    });
    return remaining;
  }, [projectItems, batchFormAllocationTotals]);
  const batchRemainingCount = useMemo(
    () =>
      projectItems.filter((item) => {
        const itemId = String(item?._id || "");
        return itemId && (batchRemainingByItem[itemId] || 0) > 0;
      }).length,
    [projectItems, batchRemainingByItem],
  );
  const batchRemainingQtyTotal = useMemo(
    () =>
      projectItems.reduce((acc, item) => {
        const itemId = String(item?._id || "");
        if (!itemId) return acc;
        return acc + (batchRemainingByItem[itemId] || 0);
      }, 0),
    [projectItems, batchRemainingByItem],
  );
  const batchProductionComplete = useMemo(() => {
    if (activeBatches.length === 0) return true;
    return activeBatches.every((batch) =>
      BATCH_PRODUCTION_COMPLETE_STATUS_SET.has(
        normalizeBatchStatus(batch?.status),
      ),
    );
  }, [activeBatches]);
  const totalBatchCountLabel = activeBatches.length || hasBatches
    ? `${activeBatches.length} active`
    : "No batches";
  const canShowBatchSection =
    (hasBatches || canCreateBatches || canManagePackagingBatches) &&
    (!isAdminUser || isAdminPackagingUser);
  const canCreateBatchNow =
    canCreateBatches && project?.status === "Pending Production";
  const canShowProductionApprovedMockups = useMemo(() => {
    if (!project) return false;
    const statusCandidate =
      project.status === "On Hold"
        ? project?.hold?.previousStatus || project.status
        : project.status;
    return PRODUCTION_MOCKUP_VISIBILITY_STATUSES.has(statusCandidate);
  }, [project, project?.status, project?.hold?.previousStatus]);
  const canDeleteMockup = userEngagedDepts.includes("Graphics");

  const mockupUrl = project?.mockup?.fileUrl;
  const mockupName = project?.mockup?.fileName || "Approved Mockup";
  const mockupType = project?.mockup?.fileType || "";
  const mockupVersionRaw = Number.parseInt(project?.mockup?.version, 10);
  const mockupVersionLabel =
    Number.isFinite(mockupVersionRaw) && mockupVersionRaw > 0
      ? `v${mockupVersionRaw}`
      : "Latest";
  const mockupApprovalStatus = getMockupApprovalStatus(
    project?.mockup?.clientApproval || {},
  );
  const mockupRejectionReason = String(
    project?.mockup?.clientApproval?.rejectionReason ||
      project?.mockup?.clientApproval?.note ||
      "",
  ).trim();
  const mockupVersions = useMemo(
    () => getMockupVersions(project?.mockup || {}),
    [project?.mockup],
  );
  const mockupCarouselVersions = useMemo(
    () => mockupVersions.slice().reverse(),
    [mockupVersions],
  );
  const approvedMockupVersions = useMemo(
    () =>
      mockupVersions.filter(
        (entry) =>
          getMockupApprovalStatus(entry.clientApproval || {}) === "approved",
      ),
    [mockupVersions],
  );
  const approvedMockupCarousel = useMemo(
    () => approvedMockupVersions.slice().reverse(),
    [approvedMockupVersions],
  );
  const activeMockupVersion =
    mockupCarouselVersions[mockupCarouselIndex] || mockupCarouselVersions[0] || null;
  const activeApprovedMockup =
    approvedMockupCarousel[productionMockupIndex] ||
    approvedMockupCarousel[0] ||
    null;
  const activeMockupVersionLabel = activeMockupVersion
    ? `v${activeMockupVersion.version}`
    : mockupVersionLabel;
  const activeMockupFileUrl = activeMockupVersion?.fileUrl || mockupUrl || "";
  const activeMockupFileName =
    activeMockupVersion?.fileName || mockupName || "Mockup File";
  const activeMockupFileType = activeMockupVersion?.fileType || mockupType || "";
  const activeApprovedMockupLabel = activeApprovedMockup
    ? `v${activeApprovedMockup.version}`
    : "Approved";
  const activeApprovedMockupUrl = activeApprovedMockup?.fileUrl || "";
  const activeApprovedMockupName =
    activeApprovedMockup?.fileName || "Approved Mockup";
  const activeApprovedMockupType = activeApprovedMockup?.fileType || "";
  const activeMockupDecision = getMockupApprovalStatus(
    activeMockupVersion?.clientApproval || {},
  );
  const activeMockupDecisionReason = String(
    activeMockupVersion?.clientApproval?.rejectionReason || "",
  ).trim();
  const activeMockupIsImage = isImageMockupAsset(
    activeMockupFileUrl,
    activeMockupFileType,
  );
  const activeApprovedIsImage = isImageMockupAsset(
    activeApprovedMockupUrl,
    activeApprovedMockupType,
  );
  const isImageMockup = isImageMockupAsset(mockupUrl, mockupType);
  const isPdfMockup =
    mockupType === "application/pdf" || /\.pdf$/i.test(mockupUrl || "");
  const activeApprovedIsPdf =
    activeApprovedMockupType === "application/pdf" ||
    /\.pdf$/i.test(activeApprovedMockupUrl || "");
  const quotePreviousSamplesStatus = String(
    quotePreviousSamplesRequirement?.status || "",
  )
    .trim()
    .toLowerCase();
  const quotePreviousSamplesStatusLabel =
    quotePreviousSamplesStatus === "dept_submitted"
      ? "Sample Retrieved"
      : quotePreviousSamplesStatus === "sent_to_client"
        ? "Sample Retrieved Confirmed"
        : formatQuoteRequirementStatus(quotePreviousSamplesStatus);
  const quoteSampleProductionStatus = String(
    quoteSampleProductionRequirement?.status || "",
  )
    .trim()
    .toLowerCase();
  const quoteSampleProductionStatusLabel =
    formatQuoteRequirementStatus(quoteSampleProductionStatus);
  const quoteMockupReadyForSampleProduction =
    isQuoteProject &&
    !quoteWorkflowBlocked &&
    Boolean(mockupUrl) &&
    mockupApprovalStatus === "approved";
  const workflowJourney = useMemo(
    () =>
      resolveEngagedWorkflow(
        isQuoteProject ? quoteWorkflowStatus : project?.status || "",
      ),
    [isQuoteProject, quoteWorkflowStatus, project?.status],
  );
  const departmentSections = useMemo(() => {
    if (!project) return [];

    const sections = [];

    const buildSection = (key, label, pool) => {
      const subDepts = pool.filter((dept) =>
        projectEngagedSubDepts.includes(dept),
      );
      if (subDepts.length === 0) return;
      sections.push({
        key,
        label,
        subDepts,
        action: STATUS_ACTIONS[key]
          ? { dept: key, ...STATUS_ACTIONS[key] }
          : null,
      });
    };

    if (userEngagedDepts.includes("Graphics")) {
      buildSection("Graphics", "Graphics", GRAPHICS_SUB_DEPARTMENTS);
    }
    if (userEngagedDepts.includes("Production")) {
      buildSection("Production", "Production", productionSubDepts);
    }
    if (userEngagedDepts.includes("Stores")) {
      buildSection("Stores", "Stores", STORES_SUB_DEPARTMENTS);
    }
    if (userEngagedDepts.includes("Photography")) {
      buildSection("Photography", "Photography", PHOTOGRAPHY_SUB_DEPARTMENTS);
    }

    return sections;
  }, [project, projectEngagedSubDepts, userEngagedDepts, productionSubDepts]);

  const shouldShowScopeReferenceSection = useMemo(
    () =>
      departmentSections.some(
        (section) => section.key === "Graphics" || section.key === "Production",
      ),
    [departmentSections],
  );

  const briefOverview = useMemo(
    () => String(project?.details?.briefOverview || "").trim(),
    [project?.details?.briefOverview],
  );
  const displayBriefOverview = useMemo(() => {
    const normalized = String(briefOverview || "").trim();
    if (!normalized) return "";
    if (normalized.toLowerCase() === "wewfefw") {
      return "Finalize logo placement, color match, and print scale before release to production.";
    }
    return normalized;
  }, [briefOverview]);

  const scopeReferenceItems = useMemo(() => {
    const sampleImage = String(project?.details?.sampleImage || "").trim();
    const sampleImageNote = String(project?.details?.sampleImageNote || "").trim();
    const attachments = normalizeReferenceAttachments(
      project?.details?.attachments || [],
    );

    const seen = new Set();
    const items = [];
    const addItem = (fileUrl, label, note = "", fileType = "", fileName = "") => {
      const normalized = String(fileUrl || "").trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      items.push({
        fileUrl: normalized,
        label,
        note: String(note || "").trim(),
        fileType: String(fileType || "").trim(),
        fileName: String(fileName || "").trim(),
      });
    };

    addItem(sampleImage, "Primary Reference", sampleImageNote);

    attachments.forEach((attachment, index) => {
      addItem(
        attachment.fileUrl,
        `Reference Material ${index + 1}`,
        attachment.note,
        attachment.fileType,
        attachment.fileName,
      );
    });

    return items;
  }, [
    project?.details?.sampleImage,
    project?.details?.sampleImageNote,
    project?.details?.attachments,
  ]);

  const activityFeedItems = useMemo(() => {
    const userUpdates = (Array.isArray(projectUpdates) ? projectUpdates : []).map(
      (update) => {
        const firstName = String(update?.author?.firstName || "").trim();
        const lastName = String(update?.author?.lastName || "").trim();
        const authorName =
          `${firstName} ${lastName}`.trim() ||
          update?.author?.email ||
          "Team Member";
        return {
          id: String(
            update?._id ||
              `${update?.createdAt || "na"}-${update?.category || "update"}`,
          ),
          type: "user",
          createdAt: update?.createdAt || null,
          label: String(update?.category || "Update").trim() || "Update",
          actor: authorName,
          content: normalizeProjectUpdateText(update?.content || ""),
        };
      },
    );

    const systemItems = [
      project?.createdAt
        ? {
            id: "system-created",
            type: "system",
            createdAt: project.createdAt,
            label: "System",
            actor: "System",
            content: `Order created with status ${project.status}.`,
          }
        : null,
    ].filter(Boolean);

    return [...userUpdates, ...systemItems].sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [projectUpdates, project?.createdAt, project?.status]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "TBD";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return "";
    return timeStr;
  };

  const formatUpdateDateTime = (dateStr) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleString("en-US", {
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

  const fetchProject = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/projects?mode=engaged");
      if (!res.ok) {
        throw new Error("Failed to load engaged project.");
      }
      const data = await res.json();
      const engaged = data.filter((item) => {
        if (!item.departments || item.departments.length === 0) return false;
        return item.departments.some((dept) => engagedSubDepts.includes(dept));
      });
      const match = engaged.find((item) => item._id === id);
      if (!match) {
        const exists = data.some((item) => item._id === id);
        if (exists) {
          throw new Error("This project is not assigned to your department.");
        }
        throw new Error("Engaged project not found.");
      }
      setProject(match);
      await fetchOrderMeeting(match?.orderId || match?.orderRef?.orderNumber);
    } catch (err) {
      setError(err.message || "Failed to load engaged project.");
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderMeeting = async (orderNumber) => {
    const normalizedOrder = String(orderNumber || "").trim();
    if (!normalizedOrder) {
      setOrderMeeting(null);
      setMeetingGate(null);
      setMeetingError("");
      return;
    }

    setMeetingLoading(true);
    setMeetingError("");
    try {
      const res = await fetch(
        `/api/meetings/order/${encodeURIComponent(normalizedOrder)}?mode=engaged`,
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
      setMeetingGate(data?.meetingGate || null);
    } catch (meetingFetchError) {
      console.error("Failed to load meeting:", meetingFetchError);
      setMeetingError(meetingFetchError.message || "Failed to fetch meeting.");
      setOrderMeeting(null);
      setMeetingGate(null);
    } finally {
      setMeetingLoading(false);
    }
  };

  const fetchProjectUpdates = async (projectId) => {
    if (!projectId) {
      setProjectUpdates([]);
      return;
    }

    setUpdatesLoading(true);
    try {
      const res = await fetch(`/api/updates/project/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch updates.");
      const data = await res.json();
      setProjectUpdates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching project updates:", err);
      setProjectUpdates([]);
    } finally {
      setUpdatesLoading(false);
    }
  };


  useEffect(() => {
    if (engagedSubDepts.length === 0) {
      setLoading(false);
      setError("No engaged departments are assigned to your profile.");
      return;
    }
    fetchProject();
  }, [id, engagedSubDepts]);

  useEffect(() => {
    if (!project?._id) {
      setProjectUpdates([]);
      return;
    }
    fetchProjectUpdates(project._id);
  }, [project?._id]);


  useEffect(() => {
    if (mockupCarouselVersions.length === 0) {
      setMockupCarouselIndex(0);
      return;
    }
    setMockupCarouselIndex((prev) =>
      Math.min(Math.max(prev, 0), mockupCarouselVersions.length - 1),
    );
  }, [mockupCarouselVersions.length]);

  useEffect(() => {
    if (approvedMockupCarousel.length === 0) {
      setProductionMockupIndex(0);
      return;
    }
    setProductionMockupIndex((prev) =>
      Math.min(Math.max(prev, 0), approvedMockupCarousel.length - 1),
    );
  }, [approvedMockupCarousel.length]);

  useEffect(() => {
    if (!projectEngagedSubDepts.length) return;
    setUpdateForm((prev) => {
      if (prev.department && projectEngagedSubDepts.includes(prev.department)) {
        return prev;
      }
      const defaultDept = projectEngagedSubDepts[0];
      return {
        ...prev,
        department: defaultDept,
        category: getCategoryForDepartment(defaultDept),
      };
    });
  }, [projectEngagedSubDepts]);

  useRealtimeRefresh((detail) => {
    const changedPath = String(detail?.path || "");
    const thisProjectChanged =
      project?._id && changedPath.includes(`/api/projects/${project._id}`);
    const updatesChanged = changedPath.startsWith("/api/updates");

    if (thisProjectChanged) {
      fetchProject();
      if (project?._id) fetchProjectUpdates(project._id);
      return;
    }

    if (updatesChanged) {
      if (project?._id) fetchProjectUpdates(project._id);
      return;
    }

    fetchProject();
  }, {
    enabled: Boolean(id) && engagedSubDepts.length > 0,
  });

  const handleCompleteStatus = async (targetProject, action) => {
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return false;
    }
    const actionKey = `${targetProject._id}:${action.complete}`;
    setStatusUpdating(actionKey);
    try {
      const res = await fetch(
        `/api/projects/${targetProject._id}/status?source=engaged`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: action.complete,
          }),
        },
      );

      if (res.ok) {
        setToast({
          type: "success",
          message: `${action.label} recorded.`,
        });
        await fetchProject();
        return true;
      }
      const errorData = await res.json().catch(() => ({}));
      if (errorData?.code === "BILLING_PREREQUISITE_MISSING") {
        setShowCompleteModal(false);
        setCompleteSubmitting(false);
        setCompleteInput("");
        setBillingGuardModal({
          open: true,
          title: "Billing Caution",
          target: { project: targetProject, action },
          message:
            errorData.message || "Billing prerequisites are required for this step.",
          missingLabels: formatBillingRequirementLabels(errorData.missing || []),
        });
        return false;
      }
      if (errorData?.code === "PRODUCTION_SAMPLE_CLIENT_APPROVAL_REQUIRED") {
        setShowCompleteModal(false);
        setCompleteSubmitting(false);
        setCompleteInput("");
        setBillingGuardModal({
          open: true,
          title: "Sample Caution",
          target: { project: targetProject, action },
          message:
            errorData.message ||
            "Client sample approval is required before Production can be completed.",
          missingLabels: [SAMPLE_APPROVAL_MISSING_LABEL],
        });
        return false;
      }
      if (
        errorData?.code === "MOCKUP_CLIENT_APPROVAL_REQUIRED" ||
        errorData?.code === "MOCKUP_CLIENT_REJECTED" ||
        errorData?.code === "MOCKUP_FILE_REQUIRED"
      ) {
        const latestVersion = Number.parseInt(errorData?.latestVersion?.version, 10);
        const versionLabel =
          Number.isFinite(latestVersion) && latestVersion > 0
            ? `v${latestVersion}`
            : "latest mockup";
        const reasonText = String(
          errorData?.latestVersion?.clientApproval?.rejectionReason || "",
        ).trim();
        const fallbackMessage =
          errorData?.code === "MOCKUP_CLIENT_REJECTED"
            ? `Client rejected ${versionLabel}. Upload a revised mockup${reasonText ? ` (Reason: ${reasonText})` : ""}.`
            : errorData?.code === "MOCKUP_FILE_REQUIRED"
              ? "Upload a mockup file first."
              : `Client approval is pending for ${versionLabel}.`;
        setToast({
          type: "error",
          message: errorData.message || fallbackMessage,
        });
        return false;
      }
      setToast({
        type: "error",
        message: errorData.message || "Failed to update status.",
      });
      return false;
    } catch (err) {
      console.error("Error updating status:", err);
      setToast({
        type: "error",
        message: "An unexpected error occurred.",
      });
      return false;
    } finally {
      setStatusUpdating(null);
    }
  };

  const resetBatchForm = () => {
    setBatchFormOpen(false);
    setBatchLabel("");
    setBatchEditingId("");
    setBatchItemAllocations({});
  };

  const openNewBatchForm = () => {
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot create batches on their own projects here.",
      });
      return;
    }
    if (isAdminUser) {
      setToast({
        type: "error",
        message: "Batch management for admins is available in the admin portal.",
      });
      return;
    }
    if (!canCreateBatchNow) {
      setToast({
        type: "error",
        message:
          "Batches can only be created when the project is Pending Production.",
      });
      return;
    }
    if (projectItems.length === 0) {
      setToast({
        type: "error",
        message: "Add project items before creating a batch.",
      });
      return;
    }
    setBatchEditingId("");
    setBatchLabel(`Batch ${batches.length + 1}`);
    setBatchItemAllocations({});
    setBatchFormOpen(true);
  };

  const openEditBatchForm = (batch) => {
    if (!batch) return;
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot edit batches on their own projects here.",
      });
      return;
    }
    setBatchEditingId(String(batch.batchId || ""));
    setBatchLabel(String(batch.label || ""));
    const allocations = {};
    (Array.isArray(batch.items) ? batch.items : []).forEach((entry) => {
      const itemId = String(entry?.itemId || entry?._id || "");
      if (!itemId) return;
      const qty = Number(entry?.qty) || 0;
      allocations[itemId] = qty;
    });
    setBatchItemAllocations(allocations);
    setBatchFormOpen(true);
  };

  const handleBatchItemChange = (itemId, maxQty, value) => {
    if (!itemId) return;
    if (value === "") {
      setBatchItemAllocations((prev) => ({ ...prev, [itemId]: "" }));
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const clamped = Math.max(0, Math.min(numeric, maxQty));
    setBatchItemAllocations((prev) => ({ ...prev, [itemId]: clamped }));
  };

  const handleSaveBatch = async () => {
    if (!project) return;
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot create batches on their own projects here.",
      });
      return;
    }
    if (!canCreateBatchNow) {
      setToast({
        type: "error",
        message:
          "Batches can only be created when the project is Pending Production.",
      });
      return;
    }

    const itemsPayload = Object.entries(batchItemAllocations)
      .map(([itemId, qty]) => ({
        itemId,
        qty: Number(qty),
      }))
      .filter((entry) => entry.itemId && Number.isFinite(entry.qty) && entry.qty > 0);

    if (itemsPayload.length === 0) {
      setToast({
        type: "error",
        message: "Select at least one item with quantity greater than zero.",
      });
      return;
    }

    const endpoint = batchEditingId
      ? `/api/projects/${project._id}/batches/${batchEditingId}?source=engaged`
      : `/api/projects/${project._id}/batches?source=engaged`;
    const method = batchEditingId ? "PATCH" : "POST";
    const label = batchLabel.trim();
    setBatchCreating(true);
    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          items: itemsPayload,
        }),
      });
      if (res.ok) {
        setToast({
          type: "success",
          message: batchEditingId ? "Batch updated." : "Batch created.",
        });
        await fetchProject();
        resetBatchForm();
        return;
      }
      const errorData = await res.json().catch(() => ({}));
      setToast({
        type: "error",
        message: errorData.message || "Failed to save batch.",
      });
    } catch (error) {
      console.error("Error saving batch:", error);
      setToast({
        type: "error",
        message: "An unexpected error occurred.",
      });
    } finally {
      setBatchCreating(false);
    }
  };

  const submitBatchStatusUpdate = async (
    batch,
    nextStatus,
    extraPayload = {},
  ) => {
    if (!project || !batch || !nextStatus) return false;
    setBatchUpdatingId(String(batch.batchId || ""));
    try {
      const res = await fetch(
        `/api/projects/${project._id}/batches/${batch.batchId}/status?source=engaged`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus, ...extraPayload }),
        },
      );
      if (res.ok) {
        setToast({
          type: "success",
          message: `Batch moved to ${getBatchStatusLabel(nextStatus)}.`,
        });
        await fetchProject();
        return true;
      }
      const errorData = await res.json().catch(() => ({}));
      setToast({
        type: "error",
        message: errorData.message || "Failed to update batch status.",
      });
      return false;
    } catch (error) {
      console.error("Error updating batch status:", error);
      setToast({
        type: "error",
        message: "An unexpected error occurred.",
      });
      return false;
    } finally {
      setBatchUpdatingId("");
    }
  };

  const openBatchPackagingModal = (batch) => {
    if (!batch) return;
    const totalQty = getBatchTotalQty(batch);
    const fallbackQty =
      batch?.packaging?.receivedQty ?? (totalQty > 0 ? totalQty : "");
    setBatchPackagingQty(
      fallbackQty !== "" && fallbackQty !== null && fallbackQty !== undefined
        ? String(fallbackQty)
        : "",
    );
    setBatchPackagingModal({ open: true, batch });
  };

  const closeBatchPackagingModal = () => {
    if (batchPackagingSubmitting) return;
    setBatchPackagingModal({ open: false, batch: null });
    setBatchPackagingQty("");
  };

  const handleConfirmBatchPackaging = async () => {
    if (!batchPackagingModal.batch) return;
    const totalQty = getBatchTotalQty(batchPackagingModal.batch);
    const receivedQtyValue = Number(batchPackagingQty);
    if (!Number.isFinite(receivedQtyValue) || receivedQtyValue <= 0) {
      setToast({
        type: "error",
        message: "Enter the produced quantity for this batch.",
      });
      return;
    }
    if (totalQty > 0 && receivedQtyValue > totalQty) {
      setToast({
        type: "error",
        message:
          "Produced quantity cannot exceed the total quantity assigned to this batch.",
      });
      return;
    }
    setBatchPackagingSubmitting(true);
    const updated = await submitBatchStatusUpdate(
      batchPackagingModal.batch,
      "in_packaging",
      { receivedQty: receivedQtyValue },
    );
    setBatchPackagingSubmitting(false);
    if (updated) {
      closeBatchPackagingModal();
    }
  };

  const handleBatchStatusUpdate = async (batch, nextStatus) => {
    if (!project || !batch || !nextStatus) return;
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot update batches on their own projects here.",
      });
      return;
    }
    if (nextStatus === "in_packaging") {
      openBatchPackagingModal(batch);
      return;
    }
    await submitBatchStatusUpdate(batch, nextStatus);
  };

  const handleSubmitUpdate = async () => {
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return;
    }
    if (!updateForm.content || !updateForm.department) {
      setToast({
        type: "error",
        message: "Please provide update content and select a department.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const data = new FormData();
      data.append(
        "content",
        `[${getDepartmentLabel(updateForm.department)}] ${updateForm.content}`,
      );
      data.append("category", updateForm.category);

      const res = await fetch(
        `/api/updates/project/${project._id}?source=engaged`,
        {
        method: "POST",
        body: data,
        },
      );

      if (res.ok) {
        setToast({ type: "success", message: "Update posted successfully!" });
        await fetchProject();
        await fetchProjectUpdates(project._id);
        setUpdateForm((prev) => ({ ...prev, content: "" }));
      } else {
        const errorData = await res.json();
        setToast({
          type: "error",
          message: errorData.message || "Failed to post update.",
        });
      }
    } catch (err) {
      console.error("Error posting update:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async (targetProject, department) => {
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return false;
    }
    try {
      const res = await fetch(
        `/api/projects/${targetProject._id}/acknowledge?source=engaged`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ department }),
        },
      );

      if (res.ok) {
        setToast({
          type: "success",
          message: `${getDepartmentLabel(department)} acknowledged!`,
        });
        await fetchProject();
        return true;
      }
      const errorData = await res.json();
      setToast({
        type: "error",
        message: errorData.message || "Acknowledgement failed.",
      });
      return false;
    } catch (err) {
      console.error("Error acknowledging project:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
      return false;
    }
  };

  const openAcknowledgeModal = (targetProject, department) => {
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return;
    }
    const meetingSkipped = Boolean(targetProject?.meetingOverride?.skipped);
    const meetingBlocked =
      Boolean(meetingGate?.required) &&
      !meetingSkipped &&
      !meetingGate?.meetingCompleted;
    if (meetingBlocked) {
      const message = meetingGate?.meetingScheduled
        ? "Departmental meeting must be completed before engagement can be accepted."
        : "Schedule and complete the departmental meeting before engagement can be accepted.";
      setToast({ type: "error", message });
      return;
    }
    const resolvedStatus =
      targetProject?.projectType === "Quote"
        ? normalizeQuoteStatus(targetProject.status)
        : targetProject.status;
    if (!isScopeApprovalComplete(resolvedStatus)) {
      setToast({
        type: "error",
        message: "Scope approval must be completed before engagement can be accepted.",
      });
      return;
    }
    setAcknowledgeTarget({ project: targetProject, department });
    setAcknowledgeInput("");
    setShowAcknowledgeModal(true);
  };

  const closeAcknowledgeModal = () => {
    setShowAcknowledgeModal(false);
    setAcknowledgeTarget(null);
    setAcknowledgeInput("");
    setAcknowledgeSubmitting(false);
  };

  const handleConfirmAcknowledge = async () => {
    if (!acknowledgeTarget) return;
    if (acknowledgeInput.trim() !== ACKNOWLEDGE_PHRASE) return;

    setAcknowledgeSubmitting(true);
    const acknowledged = await handleAcknowledge(
      acknowledgeTarget.project,
      acknowledgeTarget.department,
    );
    setAcknowledgeSubmitting(false);
    if (acknowledged) {
      setShowAcknowledgeModal(false);
      setAcknowledgeTarget(null);
      setAcknowledgeInput("");
    }
  };

  const closeBillingGuardModal = () => {
    if (billingGuardSubmitting) return;
    const missingKey = (billingGuardModal.missingLabels || []).join("|");
    if (project?._id) {
      setDismissedGuardKey(`${project._id}|${project.status}|${missingKey}`);
    }
    setBillingGuardModal({
      open: false,
      title: "Billing Caution",
      target: null,
      message: "",
      missingLabels: [],
    });
  };

  useEffect(() => {
    if (!project?._id || billingGuardModal.open) return;

    if (
      showPendingProductionSampleWarning &&
      currentGuardKey !== dismissedGuardKey
    ) {
      setBillingGuardModal({
        open: true,
        title: "Sample Caution",
        target: null,
        message:
          "Client sample approval is pending. Confirm approval before Production can be completed.",
        missingLabels: sampleMissingLabels,
      });
      return;
    }
  }, [
    project?._id,
    project?.status,
    billingGuardModal.open,
    showPendingProductionSampleWarning,
    currentGuardKey,
    dismissedGuardKey,
    sampleMissingLabels,
  ]);

  const openCompleteModal = (targetProject, action) => {
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return;
    }

    setCompleteTarget({ project: targetProject, action });
    setCompleteInput("");
    setShowCompleteModal(true);
  };

  const openMockupModal = (targetProject, action, mode = "revision") => {
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return;
    }
    setMockupTarget({ project: targetProject, action, mode });
    setMockupFiles([]);
    setMockupNote("");
    setShowMockupModal(true);
  };

  const closeCompleteModal = () => {
    setShowCompleteModal(false);
    setCompleteTarget(null);
    setCompleteInput("");
    setCompleteSubmitting(false);
  };

  const closeMockupModal = () => {
    setShowMockupModal(false);
    setMockupTarget(null);
    setMockupFiles([]);
    setMockupNote("");
    setMockupUploading(false);
  };

  const openMockupDeleteModal = (version) => {
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return;
    }
    setMockupDeleteModal({ open: true, version });
    setMockupDeleteSubmitting(false);
  };

  const closeMockupDeleteModal = () => {
    setMockupDeleteModal({ open: false, version: null });
    setMockupDeleteSubmitting(false);
  };

  const handleConfirmComplete = async () => {
    if (!completeTarget) return;
    if (completeInput.trim() !== COMPLETE_PHRASE) return;

    const isQuoteMockupCompletion =
      isQuoteProject && completeTarget?.action?.dept === "Graphics";
    setCompleteSubmitting(true);
    const completed = isQuoteMockupCompletion
      ? await handleConfirmQuoteMockupRequirement(completeTarget.project)
      : await handleCompleteStatus(completeTarget.project, completeTarget.action);
    setCompleteSubmitting(false);
    if (completed) {
      setShowCompleteModal(false);
      setCompleteTarget(null);
      setCompleteInput("");
    }
  };

  const handleUploadMockup = async (e) => {
    e.preventDefault();
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return;
    }
    if (!mockupTarget) return;
    if (mockupFiles.length === 0) {
      setToast({ type: "error", message: "Please select a mockup file." });
      return;
    }

    setMockupUploading(true);
    const target = mockupTarget;
    const appendToLatest = target?.mode === "append";
    try {
      const data = new FormData();
      mockupFiles.forEach((file) => data.append("mockup", file));
      if (mockupNote.trim()) data.append("note", mockupNote.trim());
      if (appendToLatest) data.append("appendToLatest", "true");

      const res = await fetch(
        `/api/projects/${target.project._id}/mockup?source=engaged`,
        {
          method: "POST",
          body: data,
        },
      );

      if (res.ok) {
        const updatedProject = await res.json();
        const updatedVersionRaw = Number.parseInt(
          updatedProject?.mockup?.version,
          10,
        );
        const updatedVersionLabel =
          Number.isFinite(updatedVersionRaw) && updatedVersionRaw > 0
            ? `v${updatedVersionRaw}`
            : "latest mockup";
        setToast({
          type: "success",
          message: appendToLatest
            ? isQuoteProject
              ? `Mockups added to ${updatedVersionLabel} and submitted to Front Desk for processing.`
              : `Mockups added to ${updatedVersionLabel}. Wait for Front Desk/Admin client decision before confirming completion.`
            : isQuoteProject
              ? mockupFiles.length > 1
                ? "Mockups uploaded and submitted to Front Desk for processing."
                : "Mockup uploaded and submitted to Front Desk for processing."
              : mockupFiles.length > 1
                ? "Mockups uploaded. Wait for Front Desk/Admin client decision before confirming completion."
                : "Mockup uploaded. Wait for Front Desk/Admin client decision before confirming completion.",
        });
        setProject(updatedProject);
        closeMockupModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setToast({
          type: "error",
          message: errorData.message || "Failed to upload mockup.",
        });
      }
    } catch (err) {
      console.error("Error uploading mockup:", err);
      setToast({ type: "error", message: "An unexpected error occurred." });
    } finally {
      setMockupUploading(false);
    }
  };

  const handleConfirmMockupDelete = async () => {
    if (!mockupDeleteModal.open || !mockupDeleteModal.version) return;
    if (!project?._id) return;
    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return;
    }

    setMockupDeleteSubmitting(true);
    const targetVersion = mockupDeleteModal.version;
    try {
      const entryToken = targetVersion.entryId || targetVersion.version;
      const res = await fetch(
        `/api/projects/${project._id}/mockup/${entryToken}?source=engaged`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        const updatedProject = await res.json();
        setProject(updatedProject);
        setToast({
          type: "success",
          message: `Mockup v${targetVersion.version} deleted.`,
        });
        closeMockupDeleteModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setToast({
          type: "error",
          message: errorData.message || "Failed to delete mockup.",
        });
      }
    } catch (error) {
      console.error("Error deleting mockup:", error);
      setToast({ type: "error", message: "An unexpected error occurred." });
    } finally {
      setMockupDeleteSubmitting(false);
    }
  };

  const transitionQuoteRequirement = async ({
    targetProject,
    requirementKey,
    toStatus,
    suppressErrorToast = false,
  } = {}) => {
    if (!targetProject?._id || !isQuoteProject) {
      return {
        ok: false,
        errorData: { message: "Quote project is not available." },
      };
    }

    try {
      const res = await fetch(
        `/api/projects/${targetProject._id}/quote-requirements/${requirementKey}/transition?source=engaged`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStatus }),
        },
      );

      if (res.ok) {
        const updated = await res.json();
        setProject(updated);
        return { ok: true, project: updated };
      }

      const errorData = await res.json().catch(() => ({}));
      if (!suppressErrorToast) {
        setToast({
          type: "error",
          message: errorData.message || "Failed to update quote requirement.",
        });
      }
      return { ok: false, errorData };
    } catch (error) {
      console.error("Quote requirement transition error:", error);
      if (!suppressErrorToast) {
        setToast({
          type: "error",
          message: "An unexpected error occurred.",
        });
      }
      return {
        ok: false,
        errorData: { message: "An unexpected error occurred." },
      };
    }
  };

  const handleConfirmQuotePreviousSamplesRetrieved = async (targetProject) => {
    if (!targetProject?._id || !isQuoteProject) return false;

    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return false;
    }

    const quoteStatus = String(targetProject?.status || "").trim();
    const engagedDepartments = Array.isArray(targetProject?.departments)
      ? targetProject.departments
      : [];
    const targetAcknowledged = new Set(
      (targetProject?.acknowledgements || []).map((ack) => ack.department),
    );
    const departmentalEngagementDone =
      !QUOTE_PRE_DEPARTMENTAL_STATUS_SET.has(quoteStatus) &&
      engagedDepartments.length > 0 &&
      engagedDepartments.every((departmentName) =>
        targetAcknowledged.has(departmentName),
      );

    if (!departmentalEngagementDone) {
      setToast({
        type: "error",
        message: "Complete departmental engagement before confirming retrieval.",
      });
      return false;
    }

    const previousSamplesRequirement = getQuoteRequirementState(
      targetProject,
      QUOTE_REQUIREMENT_PREVIOUS_SAMPLES_KEY,
    );

    if (!previousSamplesRequirement.isRequired) {
      setToast({
        type: "error",
        message:
          "Previous Sample / Jobs Done is not marked as a required quote item.",
      });
      return false;
    }

    const requirementStatus = String(previousSamplesRequirement.status || "")
      .trim()
      .toLowerCase();
    if (!QUOTE_PREVIOUS_SAMPLES_RETRIEVE_STATUSES.has(requirementStatus)) {
      if (
        ["dept_submitted", "frontdesk_review", "sent_to_client"].includes(
          requirementStatus,
        )
      ) {
        setToast({
          type: "success",
          message:
            "Retrieval is already confirmed. Front Desk can proceed with sample retrieval confirmation.",
        });
        return true;
      }

      if (requirementStatus === "client_approved") {
        setToast({
          type: "success",
          message: "Previous sample request is already completed.",
        });
        return true;
      }

      setToast({
        type: "error",
        message: `Cannot confirm retrieval from ${formatQuoteRequirementStatus(requirementStatus)}.`,
      });
      return false;
    }

    const pendingKey = `${targetProject._id}:${QUOTE_REQUIREMENT_PREVIOUS_SAMPLES_KEY}:dept_submitted`;
    setQuoteRequirementUpdating(pendingKey);

    const transitionResult = await transitionQuoteRequirement({
      targetProject,
      requirementKey: QUOTE_REQUIREMENT_PREVIOUS_SAMPLES_KEY,
      toStatus: "dept_submitted",
      suppressErrorToast: true,
    });
    setQuoteRequirementUpdating("");

    if (!transitionResult.ok) {
      setToast({
        type: "error",
        message:
          transitionResult.errorData?.message ||
          "Failed to confirm previous sample retrieval.",
      });
      return false;
    }

    setToast({
      type: "success",
      message: `${QUOTE_REQUIREMENT_PREVIOUS_SAMPLES_LABEL} marked as Sample Retrieved and submitted to Front Desk.`,
    });
    return true;
  };

  const handleSubmitQuoteSampleProduction = async (targetProject) => {
    if (!targetProject?._id || !isQuoteProject) return false;

    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return false;
    }

    const quoteStatus = String(targetProject?.status || "").trim();
    const engagedDepartments = Array.isArray(targetProject?.departments)
      ? targetProject.departments
      : [];
    const targetAcknowledged = new Set(
      (targetProject?.acknowledgements || []).map((ack) => ack.department),
    );
    const departmentalEngagementDone =
      !QUOTE_PRE_DEPARTMENTAL_STATUS_SET.has(quoteStatus) &&
      engagedDepartments.length > 0 &&
      engagedDepartments.every((departmentName) =>
        targetAcknowledged.has(departmentName),
      );

    if (!departmentalEngagementDone) {
      setToast({
        type: "error",
        message:
          "Complete departmental engagement before submitting sample production.",
      });
      return false;
    }

    const targetMockupApprovalStatus = getMockupApprovalStatus(
      targetProject?.mockup?.clientApproval || {},
    );
    if (!targetProject?.mockup?.fileUrl || targetMockupApprovalStatus !== "approved") {
      setToast({
        type: "error",
        message:
          "Front Desk must approve mockup and mockup must be completed before sample production can begin.",
      });
      return false;
    }

    const sampleProductionRequirement = getQuoteRequirementState(
      targetProject,
      QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_KEY,
    );

    if (!sampleProductionRequirement.isRequired) {
      setToast({
        type: "error",
        message: `${QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_LABEL} is not marked as a required quote item.`,
      });
      return false;
    }

    const sampleProductionStatus = String(sampleProductionRequirement.status || "")
      .trim()
      .toLowerCase();
    const plannedTransitions =
      QUOTE_SAMPLE_PRODUCTION_SUBMIT_TRANSITIONS[sampleProductionStatus] || [];

    if (plannedTransitions.length === 0) {
      if (
        ["dept_submitted", "frontdesk_review", "sent_to_client"].includes(
          sampleProductionStatus,
        )
      ) {
        setToast({
          type: "success",
          message:
            "Sample Production is already submitted and awaiting Front Desk/client review.",
        });
        return true;
      }

      if (sampleProductionStatus === "client_approved") {
        setToast({
          type: "success",
          message: "Sample Production is already client-approved.",
        });
        return true;
      }

      setToast({
        type: "error",
        message: `Cannot submit ${QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_LABEL.toLowerCase()} from ${formatQuoteRequirementStatus(sampleProductionStatus)}.`,
      });
      return false;
    }

    const pendingKey = `${targetProject._id}:${QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_KEY}:submit`;
    setQuoteRequirementUpdating(pendingKey);

    let workingProject = targetProject;
    for (const nextStatus of plannedTransitions) {
      const transitionResult = await transitionQuoteRequirement({
        targetProject: workingProject,
        requirementKey: QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_KEY,
        toStatus: nextStatus,
        suppressErrorToast: true,
      });

      if (!transitionResult.ok) {
        setQuoteRequirementUpdating("");
        setToast({
          type: "error",
          message:
            transitionResult.errorData?.message ||
            `Failed to submit ${QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_LABEL.toLowerCase()}.`,
        });
        return false;
      }

      workingProject = transitionResult.project || workingProject;
    }

    setQuoteRequirementUpdating("");
    setToast({
      type: "success",
      message: `${QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_LABEL} submitted to Front Desk for quote processing.`,
    });
    return true;
  };

  const handleConfirmQuoteMockupRequirement = async (targetProject) => {
    if (!targetProject?._id || !isQuoteProject) return false;

    if (isProjectLeadForProject) {
      setToast({
        type: "error",
        message:
          "Project Leads cannot take engagement actions on their own projects here.",
      });
      return false;
    }

    const quoteStatus = String(targetProject?.status || "").trim();
    const engagedDepartments = Array.isArray(targetProject?.departments)
      ? targetProject.departments
      : [];
    const targetAcknowledged = new Set(
      (targetProject?.acknowledgements || []).map((ack) => ack.department),
    );
    const departmentalEngagementDone =
      !QUOTE_PRE_DEPARTMENTAL_STATUS_SET.has(quoteStatus) &&
      engagedDepartments.length > 0 &&
      engagedDepartments.every((departmentName) =>
        targetAcknowledged.has(departmentName),
      );

    if (!departmentalEngagementDone) {
      setToast({
        type: "error",
        message: "Complete departmental engagement before submitting mockup.",
      });
      return false;
    }

    if (!targetProject?.mockup?.fileUrl) {
      setToast({
        type: "error",
        message: "Upload the mockup file before confirming completion.",
      });
      return false;
    }

    const targetMockupApprovalStatus = getMockupApprovalStatus(
      targetProject?.mockup?.clientApproval || {},
    );
    if (targetMockupApprovalStatus === "rejected") {
      setToast({
        type: "error",
        message:
          "Client rejected the latest mockup. Upload a revised version before confirming completion.",
      });
      return false;
    }
    if (targetMockupApprovalStatus !== "approved") {
      setToast({
        type: "error",
        message:
          "Front Desk/Admin must confirm client approval before Graphics can confirm completion.",
      });
      return false;
    }

    const mockupRequirement = getQuoteRequirementState(
      targetProject,
      QUOTE_REQUIREMENT_MOCKUP_KEY,
    );

    if (!mockupRequirement.isRequired) {
      setToast({
        type: "error",
        message: "Mockup is not marked as a required quote item.",
      });
      return false;
    }

    if (mockupRequirement.status === "client_approved") {
      setToast({
        type: "success",
        message:
          "Client approval is confirmed. Mockup is complete and Production can begin sample production.",
      });
      return true;
    }

    const plannedTransitions =
      QUOTE_MOCKUP_SUBMIT_TRANSITIONS[mockupRequirement.status] || [];

    if (plannedTransitions.length === 0) {
      const normalizedStatus = String(mockupRequirement.status || "").trim().toLowerCase();
      const statusMessage =
        normalizedStatus === "dept_submitted" ||
        normalizedStatus === "frontdesk_review" ||
        normalizedStatus === "sent_to_client"
          ? "Mockup requirement is awaiting Front Desk/client review."
          : normalizedStatus === "client_approved"
            ? "Mockup requirement is already client-approved."
            : `Mockup requirement cannot be submitted from ${formatQuoteRequirementStatus(normalizedStatus)}.`;
      setToast({
        type: "error",
        message: statusMessage,
      });
      return false;
    }

    let workingProject = targetProject;
    for (const nextStatus of plannedTransitions) {
      const transitionResult = await transitionQuoteRequirement({
        targetProject: workingProject,
        requirementKey: QUOTE_REQUIREMENT_MOCKUP_KEY,
        toStatus: nextStatus,
        suppressErrorToast: true,
      });

      if (!transitionResult.ok) {
        setToast({
          type: "error",
          message:
            transitionResult.errorData?.message ||
            "Failed to submit mockup requirement.",
        });
        return false;
      }

      workingProject = transitionResult.project || workingProject;
    }

    setToast({
      type: "success",
      message: `${QUOTE_REQUIREMENT_MOCKUP_LABEL} requirement submitted to Front Desk.`,
    });
    return true;
  };

  if (loading) {
    return (
      <div className="engaged-projects-container">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="engaged-projects-container">
        <div className="empty-state">{error || "Project not found."}</div>
        <button
          className="update-btn view-actions-btn engaged-back-btn-error"
          onClick={() => navigate("/engaged-projects")}
        >
          Back to Engaged Projects
        </button>
      </div>
    );
  }

  const lead = getLeadDisplay(project, "Unassigned");
  const deliveryDate = formatDate(project.details?.deliveryDate);
  const deliveryTime = formatTime(project.details?.deliveryTime);
  const projectId = project.orderId || project._id.slice(-6).toUpperCase();
  const projectName = renderProjectName(project.details, null, "Untitled");
  const parsedVersion = Number(project.versionNumber);
  const projectVersion =
    Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;
  const showVersionTag = projectVersion > 1;
  const hasMockupOnProject = Boolean(mockupUrl);
  const isAppendUpload = mockupTarget?.mode === "append";
  const mockupModalTitle = isAppendUpload
    ? "Upload More Mockups"
    : hasMockupOnProject
      ? mockupApprovalStatus === "rejected"
        ? "Upload Revised Mockup"
        : "Upload Mockup Revision"
      : "Upload Approved Mockup";
  const mockupModalHint = isAppendUpload
    ? `Add more mockups to ${mockupVersionLabel} before client decision.`
    : hasMockupOnProject
      ? mockupApprovalStatus === "rejected"
        ? `Latest ${mockupVersionLabel} was rejected. Upload a revised mockup.`
        : "Upload a new revision if updates were requested."
      : "Upload the approved mockup file for review.";
  const revisionMeta = getRevisionMeta(project);
  const revisionCount = getRevisionCount(project);
  const meetingReminderLabel = Array.isArray(orderMeeting?.reminderOffsets)
    ? orderMeeting.reminderOffsets
        .map(formatMeetingOffset)
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div className="engaged-projects-container engaged-actions-page">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <header className="engaged-actions-topbar">
        <div className="engaged-actions-topbar-main">
          <h1>{projectName}</h1>
          <p className="engaged-subtitle">
            <span className="project-id-with-version">
              <span>{projectId}</span>
              {showVersionTag && (
                <span className="project-version-chip">v{projectVersion}</span>
              )}
            </span>
          </p>
          <div className="engaged-actions-topbar-tags">
            <span
              className={`status-badge ${displayStatus
                .toLowerCase()
                .replace(/\s+/g, "-")}`}
            >
              {displayStatus}
            </span>
          </div>
        </div>
        <button
          className="update-btn view-actions-btn"
          onClick={() => navigate("/engaged-projects")}
        >
          Back to Engaged Projects
        </button>
      </header>

      <section className="engaged-workflow-banner">
        <div className="engaged-workflow-list">
          {workflowJourney.map((step, index) => (
            <div
              key={step.key}
              className={`engaged-workflow-step ${step.state}`}
            >
              <span className="engaged-workflow-index">{index + 1}</span>
              <span className="engaged-workflow-label">{step.label}</span>
              {step.state === "active" && (
                <span className="engaged-workflow-state">Active</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="engaged-actions-layout">
        <main className="engaged-actions-main">
      {shouldShowScopeReferenceSection && (
        <section className="engaged-scope-section">
          <div className="engaged-scope-header">
            <div>
              <h2>Brief Overview &amp; Reference Materials</h2>
              <p>
                Review the project scope and source files before starting design
                and production work.
              </p>
            </div>
            <div className="engaged-scope-stats">
              <span className="engaged-scope-pill">
                {scopeReferenceItems.length}{" "}
                {scopeReferenceItems.length === 1 ? "file" : "files"}
              </span>
              <span className="engaged-scope-pill muted">
                {displayBriefOverview ? "Brief ready" : "Brief pending"}
              </span>
              {revisionMeta && revisionCount > 0 && (
                <span className="revision-badge">
                  Revision v{revisionCount} by {revisionMeta.updatedByName} -{" "}
                  {formatUpdateDateTime(revisionMeta.updatedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="engaged-scope-grid">
            <article className="engaged-scope-card">
              <h3>Brief Overview</h3>
              {displayBriefOverview ? (
                <p className="engaged-scope-brief-text">{displayBriefOverview}</p>
              ) : (
                <p className="engaged-scope-empty">
                  No brief overview has been added yet.
                </p>
              )}
            </article>

            <article className="engaged-scope-card">
              <h3>Reference Materials</h3>
              {scopeReferenceItems.length === 0 ? (
                <p className="engaged-scope-empty">
                  No reference materials uploaded yet.
                </p>
              ) : (
                <div className="engaged-reference-grid">
                  {scopeReferenceItems.map((item) => {
                    const fileUrl = item.fileUrl;
                    const fileName = item.fileName || getReferenceFileName(fileUrl);
                    const fileExtension = getReferenceFileExtension(fileName);
                    const isImage = isImageReference(fileUrl, item.fileType);
                    const note = String(item.note || "").trim();

                    return (
                      <a
                        key={fileUrl || item.label}
                        className="engaged-reference-item"
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        download
                      >
                        <div
                          className={`engaged-reference-preview ${
                            isImage ? "is-image" : "is-file"
                          }`}
                        >
                          {isImage ? (
                            <img src={fileUrl} alt={fileName} loading="lazy" />
                          ) : (
                            <span>{fileExtension}</span>
                          )}
                        </div>
                        <div className="engaged-reference-meta">
                          <span className="engaged-reference-tag">
                            {item.label}
                          </span>
                          <span className="engaged-reference-name">{fileName}</span>
                          {note && (
                            <span className="engaged-reference-note">{note}</span>
                          )}
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </article>
          </div>
        </section>
      )}

      {isProjectLeadForProject && (
        <div className="engaged-warning-banner">
          You are the assigned Project Lead for this project. Engagement actions
          are disabled on this page for your account.
        </div>
      )}

      {canShowBatchSection && (
        <section className="engaged-section engaged-batch-section">
          <div className="engaged-section-header">
            <div>
              <h2 className="engaged-section-title">Production Batches</h2>
              <p className="engaged-section-subtitle">
                Split project items into manageable batches and track handoffs.
              </p>
            </div>
            <div className="engaged-section-tags">
              <span className="engaged-section-chip">{totalBatchCountLabel}</span>
              <span className="engaged-section-chip">
                {batchRemainingCount} items / {batchRemainingQtyTotal} qty available
              </span>
              {canCreateBatches && !batchFormOpen && !isProjectLeadForProject && (
                <button
                  type="button"
                  className="engaged-batch-create-btn"
                  onClick={openNewBatchForm}
                  disabled={!canCreateBatchNow}
                  title={
                    canCreateBatchNow
                      ? "Create new batch"
                      : "Available once project is Pending Production"
                  }
                >
                  New Batch
                </button>
              )}
            </div>
          </div>

          {batchFormOpen && (
            <div className="engaged-action-card engaged-batch-form">
              <h3>{batchEditingId ? "Edit Batch" : "Create Batch"}</h3>
              <p>Assign item quantities to this batch.</p>
              <div className="form-group">
                <label>Batch Label</label>
                <input
                  type="text"
                  className="input-field"
                  value={batchLabel}
                  onChange={(event) => setBatchLabel(event.target.value)}
                  placeholder={`Batch ${batches.length + 1}`}
                />
              </div>
              <div className="engaged-batch-items">
                {projectItems.length === 0 && (
                  <div className="engaged-batch-empty">
                    No items available for batching.
                  </div>
                )}
                {projectItems.map((item) => {
                  const itemId = String(item?._id || "");
                  if (!itemId) return null;
                  const totalQty = Number(item?.qty) || 0;
                  const availableQty = batchRemainingByItem[itemId] || 0;
                  const currentValue =
                    batchItemAllocations[itemId] === 0
                      ? 0
                      : batchItemAllocations[itemId] || "";
                  return (
                    <div key={itemId} className="engaged-batch-item-row">
                      <div className="engaged-batch-item-info">
                        <strong>{item.description || "Item"}</strong>
                        {item.breakdown && (
                          <span>Specs: {item.breakdown}</span>
                        )}
                        <span>Total: {totalQty}</span>
                        <span>Available: {availableQty}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={availableQty}
                        className="input-field engaged-batch-item-input"
                        value={currentValue}
                        onChange={(event) =>
                          handleBatchItemChange(
                            itemId,
                            availableQty,
                            event.target.value,
                          )
                        }
                      />
                    </div>
                  );
                })}
              </div>
              <div className="engaged-batch-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={resetBatchForm}
                  disabled={batchCreating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveBatch}
                  disabled={batchCreating || projectItems.length === 0}
                >
                  {batchCreating
                    ? "Saving..."
                    : batchEditingId
                      ? "Save Batch"
                      : "Create Batch"}
                </button>
              </div>
            </div>
          )}

          <div className="engaged-section-grid engaged-batch-grid">
            {hasBatches ? (
              batches.map((batch) => {
                const batchId = String(batch?.batchId || "");
                const itemSummary = buildBatchItemSummary(batch, batchItemMap);
                const statusLabel = getBatchStatusLabel(batch?.status);
                const nextStatus = getNextBatchStatus(batch?.status);
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
                const canAdvance =
                  Boolean(nextStatus) &&
                  !isProjectLeadForProject &&
                  (!isAdminUser || isAdminPackagingUser) &&
                  ((hasProductionRole &&
                    BATCH_PRODUCTION_STATUS_SET.has(nextStatus)) ||
                    (hasPackagingRole &&
                      BATCH_PACKAGING_STATUS_SET.has(nextStatus)));
                const canEditBatch =
                  !isProjectLeadForProject &&
                  batch?.status === "planned" &&
                  canCreateBatches;
                const isUpdating = batchUpdatingId === batchId;

                return (
                  <div
                    key={batchId || batch?.label || statusLabel}
                    className="engaged-action-card engaged-batch-card"
                  >
                    <div className="engaged-batch-card-header">
                      <div>
                        <h3>{batch?.label || "Batch"}</h3>
                        <p>{itemSummary}</p>
                      </div>
                      <span
                        className={`engaged-batch-status ${batch?.status || "planned"}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <div className="engaged-batch-meta">
                      {batch?.createdAt && (
                        <span>Created: {formatUpdateDateTime(batch.createdAt)}</span>
                      )}
                      {batch?.updatedAt && (
                        <span>Updated: {formatUpdateDateTime(batch.updatedAt)}</span>
                      )}
                    </div>
                    {producedQtyLabel && (
                      <div className="engaged-batch-meta">
                        Produced Qty: {producedQtyLabel}
                      </div>
                    )}
                    {deliveredQtyLabel && (
                      <div className="engaged-batch-meta">
                        Delivered Qty: {deliveredQtyLabel}
                      </div>
                    )}
                    {batch?.status === "delivered" && batch?.delivery?.deliveredAt && (
                      <div className="engaged-batch-meta">
                        Delivered:{" "}
                        {formatUpdateDateTime(batch.delivery.deliveredAt)}
                      </div>
                    )}
                    {batch?.status === "cancelled" &&
                      batch?.cancellation?.reason && (
                        <div className="engaged-batch-meta">
                          Cancelled: {batch.cancellation.reason}
                        </div>
                      )}
                    <div className="engaged-batch-actions">
                      {canEditBatch && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => openEditBatchForm(batch)}
                          disabled={batchCreating || isUpdating}
                        >
                          Edit Batch
                        </button>
                      )}
                      {canAdvance && (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handleBatchStatusUpdate(batch, nextStatus)}
                          disabled={isUpdating}
                        >
                          {isUpdating
                            ? "Updating..."
                            : getBatchActionLabel(nextStatus)}
                        </button>
                      )}
                      {!canAdvance &&
                        nextStatus &&
                        batch?.status !== "delivered" &&
                        batch?.status !== "cancelled" && (
                          <span className="engaged-batch-hint">
                            Awaiting {getBatchStatusLabel(nextStatus)} update.
                          </span>
                        )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="engaged-action-card engaged-batch-empty-card">
                <h3>No batches yet</h3>
                <p>Split production into smaller batches to track progress.</p>
                {canCreateBatches && !batchFormOpen && !isProjectLeadForProject && (
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={openNewBatchForm}
                    disabled={!canCreateBatchNow}
                    title={
                      canCreateBatchNow
                        ? "Create first batch"
                        : "Available once project is Pending Production"
                    }
                  >
                    Create First Batch
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <div className="engaged-sections">
        {departmentSections.length === 0 ? (
          <div className="empty-state">No engaged departments available.</div>
        ) : (
          departmentSections.map((section) => {
            const action = section.action;
            const showStageCompletionAction =
              Boolean(action) &&
              !(isQuoteProject && ["Stores", "Production"].includes(section.key));
            const isProductionSection = section.key === "Production";
            const isStoresSection = section.key === "Stores";

            return (
              <section key={section.key} className="engaged-section">
                <div className="engaged-section-header">
                  <div>
                    <h2 className="engaged-section-title">{section.label}</h2>
                    <p className="engaged-section-subtitle">
                      {section.subDepts.length > 1
                        ? "Engaged departments"
                        : "Engaged department"}
                    </p>
                  </div>
                  <div className="engaged-section-tags">
                    {section.subDepts.map((dept) => (
                      <span key={dept} className="engaged-section-chip">
                        {getDepartmentLabel(dept)}
                      </span>
                    ))}
                  </div>
                </div>

                {isProductionSection && showPendingProductionWarning && (
                  <div className="engaged-warning-banner">
                    Caution: before moving to Pending Production, confirm{" "}
                    {pendingProductionMissingLabels.join(", ")}.
                  </div>
                )}

                {isProductionSection && showPendingProductionSampleWarning && (
                  <div className="engaged-warning-banner">
                    Caution: client sample approval is pending. Confirm approval
                    before Production can be completed.
                  </div>
                )}

                {isStoresSection && showPendingDeliveryWarning && (
                  <div className="engaged-warning-banner">
                    Caution: before moving to Pending Delivery/Pickup, confirm{" "}
                    {pendingDeliveryMissingLabels.join(", ")}.
                  </div>
                )}

                <div className="engaged-section-grid">
                  <div className="engaged-action-card">
                    <h3>Engagement Acceptance</h3>
                    <p>Confirm engagement for the departments assigned to you.</p>
                    <div className="engaged-ack-list">
                      {section.subDepts.map((dept) => {
                        const isAcknowledged = acknowledgedDepts.has(dept);
                        const acknowledgement = acknowledgementsByDept.get(dept);
                        const acknowledgedBy = getFullName(acknowledgement?.user);
                        const canAcknowledge =
                          !isAcknowledged &&
                          !isProjectLeadForProject &&
                          isScopeApprovalComplete(quoteWorkflowStatus);
                        return (
                          <div key={dept} className="engaged-ack-row">
                            <div className="engaged-ack-info">
                              <span>{getDepartmentLabel(dept)}</span>
                              {isAcknowledged && (
                                <span
                                  className={`engaged-ack-status${acknowledgedBy ? " by-name" : ""}`}
                                >
                                  {acknowledgedBy
                                    ? `Acknowledged by ${acknowledgedBy}`
                                    : "Acknowledged"}
                                </span>
                              )}
                            </div>
                            <button
                              className="acknowledge-btn"
                              onClick={() => openAcknowledgeModal(project, dept)}
                              disabled={!canAcknowledge}
                              title={
                                isAcknowledged
                                  ? "Already acknowledged"
                                  : isProjectLeadForProject
                                    ? "Project leads cannot take engagement actions on their own projects here."
                                  : isScopeApprovalComplete(quoteWorkflowStatus)
                                    ? "Confirm engagement"
                                    : "Scope approval must be completed"
                              }
                            >
                              {isAcknowledged ? "Acknowledged" : "Acknowledge"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {showStageCompletionAction && (() => {
                    const isPending = project.status === action.pending;
                    const isProductionAction =
                      action.complete === "Production Completed";
                    const isStoresAction = action.complete === "Packaging Completed";
                    const blockedByBilling =
                      paymentChecksEnabled &&
                      isStoresAction &&
                      pendingDeliveryMissing.length > 0;
                    const blockedBySample =
                      paymentChecksEnabled &&
                      isProductionAction &&
                      sampleApprovalPending;
                    const blockedByBatchProduction =
                      isProductionAction && !batchProductionComplete;
                    const actionKey = `${project._id}:${action.complete}`;
                    const isUpdating = statusUpdating === actionKey;
                    const isMockupAction = action.dept === "Graphics";
                    const isQuoteGraphicsAction = isQuoteProject && isMockupAction;
                    const quoteAllowsMockupWorkflowStatus =
                      isQuoteGraphicsAction &&
                      !quoteWorkflowBlocked &&
                      QUOTE_MOCKUP_WORKFLOW_STATUS_SET.has(quoteWorkflowStatus);
                    const mockupAlreadySubmitted = Boolean(mockupUrl);
                    const mockupApprovalPending =
                      isMockupAction && mockupApprovalStatus === "pending";
                    const mockupApprovalRejected =
                      isMockupAction && mockupApprovalStatus === "rejected";
                    const mockupApprovalConfirmed =
                      isMockupAction && mockupApprovalStatus === "approved";
                    const quoteMockupCompletionFallback =
                      isQuoteGraphicsAction &&
                      mockupApprovalConfirmed &&
                      quoteWorkflowStatus === "Pending Quote Submission";
                    const canConfirmMockupCompletion =
                      isMockupAction &&
                      mockupAlreadySubmitted &&
                      mockupApprovalConfirmed &&
                      (isQuoteGraphicsAction
                        ? (quoteAllowsMockupWorkflowStatus ||
                            quoteMockupCompletionFallback) &&
                          quoteMockupRequirement.isRequired &&
                          quoteDepartmentalEngagementComplete
                        : isPending);
                    const quoteMockupStatus = String(
                      quoteMockupRequirement?.status || "",
                    )
                      .trim()
                      .toLowerCase();
                    const quoteMockupStatusLabel =
                      formatQuoteRequirementStatus(quoteMockupStatus);
                    const canUploadMockup =
                      !isUpdating &&
                      !isProjectLeadForProject &&
                      (isQuoteGraphicsAction
                        ? quoteAllowsMockupWorkflowStatus
                        : isPending);

                    let disabledReason = "";
                    if (!isQuoteGraphicsAction && !isPending) {
                      disabledReason = `Waiting for ${action.pending}.`;
                    } else if (isProjectLeadForProject) {
                      disabledReason =
                        "Project leads cannot take engagement actions on their own projects here.";
                    } else if (blockedBySample) {
                      disabledReason =
                        "Client sample approval is required before Production can be completed.";
                    } else if (blockedByBatchProduction) {
                      disabledReason =
                        "All batches must be produced before Production can be completed.";
                    } else if (blockedByBilling) {
                      disabledReason = `Before Pending Delivery/Pickup, confirm ${pendingDeliveryMissingLabels.join(", ")}.`;
                    }

                    let mockupUploadTitle = "Upload approved mockup";
                    if (isProjectLeadForProject) {
                      mockupUploadTitle =
                        "Project leads cannot take engagement actions on their own projects here.";
                    } else if (isQuoteGraphicsAction && quoteWorkflowBlocked) {
                      mockupUploadTitle =
                        quoteWorkflowBlockedMessage ||
                        "Quote workflows are not configured yet.";
                    } else if (
                      isQuoteGraphicsAction &&
                      !quoteAllowsMockupWorkflowStatus
                    ) {
                      mockupUploadTitle =
                        "Mockup upload is only available while status is Pending Mockup.";
                    } else if (!isQuoteGraphicsAction && !isPending) {
                      mockupUploadTitle = `Waiting for ${action.pending}.`;
                    } else if (mockupApprovalRejected) {
                      mockupUploadTitle =
                        "Client rejected latest mockup. Upload a revised version.";
                    } else if (mockupAlreadySubmitted) {
                      mockupUploadTitle =
                        "Upload a new revision if changes are needed.";
                    }

                    let mockupConfirmTitle = "Confirm mockup completion";
                    if (isProjectLeadForProject) {
                      mockupConfirmTitle =
                        "Project leads cannot take engagement actions on their own projects here.";
                    } else if (isQuoteGraphicsAction && quoteWorkflowBlocked) {
                      mockupConfirmTitle =
                        quoteWorkflowBlockedMessage ||
                        "Quote workflows are not configured yet.";
                    } else if (
                      isQuoteGraphicsAction &&
                      !quoteAllowsMockupWorkflowStatus &&
                      !quoteMockupCompletionFallback
                    ) {
                      mockupConfirmTitle =
                        "Mockup completion for quote is only available while status is Pending Mockup.";
                    } else if (
                      isQuoteGraphicsAction &&
                      !quoteDepartmentalEngagementComplete
                    ) {
                      mockupConfirmTitle =
                        "Departmental engagement must be completed first.";
                    } else if (isQuoteGraphicsAction && !mockupAlreadySubmitted) {
                      mockupConfirmTitle = "Upload mockup before confirming.";
                    } else if (
                      isQuoteGraphicsAction &&
                      !quoteMockupRequirement.isRequired
                    ) {
                      mockupConfirmTitle =
                        "Mockup is not marked as required for this quote.";
                    } else if (isQuoteGraphicsAction && mockupApprovalRejected) {
                      mockupConfirmTitle =
                        "Client rejected latest mockup. Upload revision first.";
                    } else if (isQuoteGraphicsAction && mockupApprovalPending) {
                      mockupConfirmTitle =
                        "Waiting for Front Desk/Admin client decision.";
                    } else if (
                      isQuoteGraphicsAction &&
                      quoteMockupStatus === "client_approved"
                    ) {
                      mockupConfirmTitle =
                        "Front Desk confirmed client approval. Confirm to acknowledge completion.";
                    } else if (!isQuoteGraphicsAction && !isPending) {
                      mockupConfirmTitle = `Waiting for ${action.pending}.`;
                    } else if (!isQuoteGraphicsAction && !mockupAlreadySubmitted) {
                      mockupConfirmTitle = "Upload mockup before confirming";
                    } else if (!isQuoteGraphicsAction && mockupApprovalRejected) {
                      mockupConfirmTitle =
                        "Client rejected latest mockup. Upload revision first.";
                    } else if (!isQuoteGraphicsAction && mockupApprovalPending) {
                      mockupConfirmTitle =
                        "Waiting for Front Desk/Admin client decision.";
                    }

                    return (
                      <div
                        className={`engaged-action-card ${
                          isMockupAction ? "graphics-hub-card" : ""
                        }`}
                      >
                        <h3>{action.dept} Stage</h3>
                        <p>
                          {isMockupAction
                            ? isQuoteGraphicsAction
                              ? "Upload mockup for Front Desk/client review. Confirm completion only after Front Desk records client approval."
                              : "Upload the approved mockup and confirm completion."
                            : "Confirm this stage is complete for the project."}
                        </p>
                        {isMockupAction ? (
                          <div className="mockup-action-stack">
                            <button
                              className="complete-btn"
                              onClick={() => openMockupModal(project, action)}
                              disabled={!canUploadMockup}
                              title={mockupUploadTitle}
                            >
                              {mockupApprovalRejected
                                ? `Upload Revision (${mockupVersionLabel})`
                                : mockupAlreadySubmitted
                                  ? "Upload Revision"
                                  : "Upload Mockup"}
                            </button>
                            <button
                              className="complete-btn confirm-btn"
                              onClick={() => openCompleteModal(project, action)}
                              disabled={
                                isUpdating ||
                                !canConfirmMockupCompletion ||
                                isProjectLeadForProject
                              }
                              title={mockupConfirmTitle}
                            >
                              Confirm Mockup Completion
                            </button>
                          </div>
                        ) : (
                          <button
                            className="complete-btn"
                            onClick={() => openCompleteModal(project, action)}
                            disabled={
                              !isPending ||
                              isUpdating ||
                              isProjectLeadForProject ||
                              blockedBySample ||
                              blockedByBatchProduction
                            }
                            title={disabledReason || "Confirm stage completion"}
                          >
                            {isUpdating ? "Updating..." : action.label}
                          </button>
                        )}
                        {isMockupAction && mockupAlreadySubmitted && (
                          <div className="engaged-action-meta">
                            Latest mockup {mockupVersionLabel}:{" "}
                            {mockupApprovalConfirmed
                              ? "Client Approved."
                              : mockupApprovalRejected
                                ? "Client Rejected."
                                : "Pending Client Decision."}
                            {mockupApprovalRejected && mockupRejectionReason
                              ? ` Reason: ${mockupRejectionReason}`
                              : ""}
                          </div>
                        )}
                        {isQuoteGraphicsAction && quoteMockupRequirement.isRequired && (
                          <div className="engaged-action-meta">
                            Quote mockup requirement: {quoteMockupStatusLabel}.
                            {quoteMockupRequirement.updatedAt
                              ? ` Updated: ${formatUpdateDateTime(quoteMockupRequirement.updatedAt)}.`
                              : ""}
                            {quoteMockupRequirement.note
                              ? ` Note: ${quoteMockupRequirement.note}`
                              : ""}
                          </div>
                        )}
                        {blockedByBilling && (
                          <div className="engaged-action-meta">
                            Full payment or authorization is required before
                            Pending Delivery/Pickup.
                          </div>
                        )}
                        {blockedBySample && (
                          <div className="engaged-action-meta">
                            Client sample approval is required before
                            Production can be completed.
                          </div>
                        )}
                        {isMockupAction && activeMockupFileUrl && (
                          <>
                            <div className="graphics-carousel">
                              <button
                                type="button"
                                className="graphics-carousel-nav"
                                onClick={() =>
                                  setMockupCarouselIndex((previous) =>
                                    Math.max(previous - 1, 0),
                                  )
                                }
                                disabled={mockupCarouselIndex === 0}
                                aria-label="Previous mockup revision"
                              >
                                {"<"}
                              </button>

                              <div className="mockup-preview graphics-preview-large">
                                {activeMockupIsImage ? (
                                  <img
                                    src={activeMockupFileUrl}
                                    alt={activeMockupFileName}
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="mockup-preview-fallback">
                                    Preview not available for this file type.
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                className="graphics-carousel-nav"
                                onClick={() =>
                                  setMockupCarouselIndex((previous) =>
                                    Math.min(
                                      previous + 1,
                                      Math.max(mockupCarouselVersions.length - 1, 0),
                                    ),
                                  )
                                }
                                disabled={
                                  mockupCarouselIndex >= mockupCarouselVersions.length - 1
                                }
                                aria-label="Next mockup revision"
                              >
                                {">"}
                              </button>
                            </div>

                            <div className="graphics-carousel-caption">
                              <strong>{activeMockupVersionLabel}</strong>
                              <span>{activeMockupFileName}</span>
                            </div>

                            <div
                              className={`graphics-mockup-status ${activeMockupDecision}`}
                            >
                              {activeMockupDecision === "approved"
                                ? "Client Approved"
                                : activeMockupDecision === "rejected"
                                  ? "Client Rejected"
                                  : "Pending Client Decision"}
                            </div>
                            {activeMockupDecision === "rejected" &&
                              activeMockupDecisionReason && (
                                <div className="graphics-mockup-reason">
                                  Reason: {activeMockupDecisionReason}
                                </div>
                              )}

                            <div className="graphics-carousel-track">
                              {mockupCarouselVersions.map((version, index) => {
                                const decision = getMockupApprovalStatus(
                                  version.clientApproval || {},
                                );
                                return (
                                  <button
                                    key={
                                      version.entryId
                                        ? `graphics-carousel-${version.entryId}`
                                        : `graphics-carousel-${version.version}-${index}`
                                    }
                                    type="button"
                                    className={`graphics-carousel-chip ${
                                      mockupCarouselIndex === index ? "active" : ""
                                    } status-${decision}`}
                                    onClick={() => setMockupCarouselIndex(index)}
                                  >
                                    v{version.version}
                                  </button>
                                );
                              })}
                            </div>

                            <div className="mockup-link-row">
                              <Link
                                className="mockup-link download"
                                to={activeMockupFileUrl}
                                target="_blank"
                                rel="noreferrer"
                                download
                                reloadDocument
                              >
                                Download {activeMockupVersionLabel} -{" "}
                                {activeMockupFileName}
                              </Link>
                              {canDeleteMockup && activeMockupVersion && (
                                <button
                                  type="button"
                                  className="mockup-link delete"
                                  onClick={() =>
                                    openMockupDeleteModal(activeMockupVersion)
                                  }
                                >
                                  Delete {activeMockupVersionLabel}
                                </button>
                              )}
                            </div>
                            {mockupAlreadySubmitted && (
                              <div className="mockup-footer-actions">
                                <button
                                  type="button"
                                  className="mockup-append-btn"
                                  onClick={() =>
                                    openMockupModal(project, action, "append")
                                  }
                                  disabled={!canUploadMockup}
                                  title="Upload another mockup for the current version."
                                >
                                  <span className="mockup-append-icon">+</span>
                                  Upload Mockup
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {section.key === "Stores" && isQuoteProject && (() => {
                    const retrievalActionKey = `${project._id}:${QUOTE_REQUIREMENT_PREVIOUS_SAMPLES_KEY}:dept_submitted`;
                    const retrievalUpdating =
                      quoteRequirementUpdating === retrievalActionKey;
                    const canConfirmRetrieved =
                      !quoteWorkflowBlocked &&
                      quotePreviousSamplesRequirement.isRequired &&
                      quoteDepartmentalEngagementComplete &&
                      QUOTE_PREVIOUS_SAMPLES_RETRIEVE_STATUSES.has(
                        quotePreviousSamplesStatus,
                      ) &&
                      !isProjectLeadForProject &&
                      !retrievalUpdating;

                    let retrievalTitle = "Confirm sample retrieval";
                    if (isProjectLeadForProject) {
                      retrievalTitle =
                        "Project leads cannot take engagement actions on their own projects here.";
                    } else if (quoteWorkflowBlocked) {
                      retrievalTitle =
                        quoteWorkflowBlockedMessage ||
                        "Quote workflows are not configured yet.";
                    } else if (!quotePreviousSamplesRequirement.isRequired) {
                      retrievalTitle =
                        "Previous Sample / Jobs Done is not required for this quote.";
                    } else if (!quoteDepartmentalEngagementComplete) {
                      retrievalTitle =
                        "Departmental engagement must be completed first.";
                    } else if (
                      ["dept_submitted", "frontdesk_review"].includes(
                        quotePreviousSamplesStatus,
                      )
                    ) {
                      retrievalTitle =
                        "Retrieval already confirmed. Front Desk should also confirm sample retrieval.";
                    } else if (
                      ["sent_to_client", "client_approved"].includes(
                        quotePreviousSamplesStatus,
                      )
                    ) {
                      retrievalTitle = "Sample retrieval already confirmed.";
                    } else if (!QUOTE_PREVIOUS_SAMPLES_RETRIEVE_STATUSES.has(
                      quotePreviousSamplesStatus,
                    )) {
                      retrievalTitle = `Cannot confirm retrieval from ${quotePreviousSamplesStatusLabel}.`;
                    }

                    return (
                      <div className="engaged-action-card">
                        <h3>Previous Sample Retrieval</h3>
                        <p>
                          Confirm when previous samples/jobs are retrieved. Front
                          Desk will then confirm sample retrieval.
                        </p>
                        <button
                          className="complete-btn confirm-btn"
                          onClick={() =>
                            handleConfirmQuotePreviousSamplesRetrieved(project)
                          }
                          disabled={!canConfirmRetrieved}
                          title={retrievalTitle}
                        >
                          {retrievalUpdating
                            ? "Confirming..."
                            : "Confirm Sample Retrieved"}
                        </button>
                        <div className="engaged-action-meta">
                          Requirement status: {quotePreviousSamplesStatusLabel}.
                          {quotePreviousSamplesRequirement.updatedAt
                            ? ` Updated: ${formatUpdateDateTime(quotePreviousSamplesRequirement.updatedAt)}.`
                            : ""}
                          {quotePreviousSamplesRequirement.note
                            ? ` Note: ${quotePreviousSamplesRequirement.note}`
                            : ""}
                        </div>
                      </div>
                    );
                  })()}

                  {section.key === "Production" && isQuoteProject && (() => {
                    const sampleProductionActionKey = `${project._id}:${QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_KEY}:submit`;
                    const sampleProductionUpdating =
                      quoteRequirementUpdating === sampleProductionActionKey;
                    const sampleProductionTransitions =
                      QUOTE_SAMPLE_PRODUCTION_SUBMIT_TRANSITIONS[
                        quoteSampleProductionStatus
                      ] || [];
                    const canSubmitSampleProduction =
                      !quoteWorkflowBlocked &&
                      quoteSampleProductionRequirement.isRequired &&
                      quoteDepartmentalEngagementComplete &&
                      quoteMockupReadyForSampleProduction &&
                      sampleProductionTransitions.length > 0 &&
                      !isProjectLeadForProject &&
                      !sampleProductionUpdating;

                    let sampleProductionTitle =
                      "Submit sample production to Front Desk";
                    if (isProjectLeadForProject) {
                      sampleProductionTitle =
                        "Project leads cannot take engagement actions on their own projects here.";
                    } else if (quoteWorkflowBlocked) {
                      sampleProductionTitle =
                        quoteWorkflowBlockedMessage ||
                        "Quote workflows are not configured yet.";
                    } else if (!quoteSampleProductionRequirement.isRequired) {
                      sampleProductionTitle =
                        `${QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_LABEL} is not required for this quote.`;
                    } else if (!quoteDepartmentalEngagementComplete) {
                      sampleProductionTitle =
                        "Departmental engagement must be completed first.";
                    } else if (!quoteMockupReadyForSampleProduction) {
                      sampleProductionTitle =
                        "Front Desk must approve mockup and mockup must be completed first.";
                    } else if (
                      ["dept_submitted", "frontdesk_review", "sent_to_client"].includes(
                        quoteSampleProductionStatus,
                      )
                    ) {
                      sampleProductionTitle =
                        "Sample Production is already awaiting Front Desk/client review.";
                    } else if (quoteSampleProductionStatus === "client_approved") {
                      sampleProductionTitle =
                        `${QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_LABEL} is already client-approved.`;
                    } else if (sampleProductionTransitions.length === 0) {
                      sampleProductionTitle = `Cannot submit from ${quoteSampleProductionStatusLabel}.`;
                    }

                    return (
                      <div className="engaged-action-card">
                        <h3>Quote {QUOTE_REQUIREMENT_SAMPLE_PRODUCTION_LABEL}</h3>
                        <p>
                          Submit sample production progress after mockup is
                          approved and confirmed complete.
                        </p>
                        <button
                          className="complete-btn confirm-btn"
                          onClick={() => handleSubmitQuoteSampleProduction(project)}
                          disabled={!canSubmitSampleProduction}
                          title={sampleProductionTitle}
                        >
                          {sampleProductionUpdating
                            ? "Submitting..."
                            : "Submit Sample Production"}
                        </button>
                        <div className="engaged-action-meta">
                          Requirement status: {quoteSampleProductionStatusLabel}.
                          {quoteSampleProductionRequirement.updatedAt
                            ? ` Updated: ${formatUpdateDateTime(quoteSampleProductionRequirement.updatedAt)}.`
                            : ""}
                          {quoteSampleProductionRequirement.note
                            ? ` Note: ${quoteSampleProductionRequirement.note}`
                            : ""}
                        </div>
                      </div>
                    );
                  })()}

                  {section.key === "Production" && (
                    <div className="engaged-action-card">
                      <h3>Approved Mockup Reference</h3>
                      <p>
                        Use the approved mockup from Graphics as your production
                        reference.
                      </p>

                      {!canShowProductionApprovedMockups ? (
                        <div className="engaged-action-meta">
                          Approved mockups will appear here after Master Approval
                          is completed.
                        </div>
                      ) : approvedMockupCarousel.length > 0 ? (
                        <>
                          <div className="graphics-carousel">
                            <button
                              type="button"
                              className="graphics-carousel-nav"
                              onClick={() =>
                                setProductionMockupIndex((previous) =>
                                  Math.max(previous - 1, 0),
                                )
                              }
                              disabled={productionMockupIndex === 0}
                              aria-label="Previous approved mockup"
                            >
                              {"<"}
                            </button>

                            <div className="mockup-preview graphics-preview-large">
                              {activeApprovedIsImage ? (
                                <img
                                  src={activeApprovedMockupUrl}
                                  alt={activeApprovedMockupName}
                                  loading="lazy"
                                />
                              ) : activeApprovedIsPdf ? (
                                <iframe
                                  src={activeApprovedMockupUrl}
                                  title={`Preview of ${activeApprovedMockupName}`}
                                  loading="lazy"
                                />
                              ) : (
                                <div className="mockup-preview-fallback">
                                  Preview not available for this file type.
                                </div>
                              )}
                            </div>

                            <button
                              type="button"
                              className="graphics-carousel-nav"
                              onClick={() =>
                                setProductionMockupIndex((previous) =>
                                  Math.min(
                                    previous + 1,
                                    Math.max(approvedMockupCarousel.length - 1, 0),
                                  ),
                                )
                              }
                              disabled={
                                productionMockupIndex >=
                                approvedMockupCarousel.length - 1
                              }
                              aria-label="Next approved mockup"
                            >
                              {">"}
                            </button>
                          </div>

                          <div className="graphics-carousel-caption">
                            <strong>{activeApprovedMockupLabel}</strong>
                            <span>{activeApprovedMockupName}</span>
                          </div>

                          <div className="graphics-carousel-track">
                            {approvedMockupCarousel.map((version, index) => (
                              <button
                                key={
                                  version.entryId
                                    ? `production-approved-${version.entryId}`
                                    : `production-approved-${version.version}-${index}`
                                }
                                type="button"
                                title={version.fileName || ""}
                                className={`graphics-carousel-chip status-approved ${
                                  productionMockupIndex === index ? "active" : ""
                                }`}
                                onClick={() => setProductionMockupIndex(index)}
                              >
                                v{version.version}
                              </button>
                            ))}
                          </div>

                          <Link
                            className="mockup-link download"
                            to={activeApprovedMockupUrl}
                            target="_blank"
                            rel="noreferrer"
                            download
                            reloadDocument
                          >
                            Download {activeApprovedMockupLabel} -{" "}
                            {activeApprovedMockupName}
                          </Link>
                        </>
                      ) : (
                        <div className="engaged-action-meta">
                          {mockupUrl
                            ? mockupApprovalStatus === "rejected"
                              ? `Latest mockup ${mockupVersionLabel} was rejected. Await revised upload from Graphics.`
                              : isQuoteProject
                                ? "Mockup must be client-approved and confirmed complete before sample production begins."
                                : "Latest mockup is pending client approval."
                            : isQuoteProject
                              ? "Approved mockup is not available yet for sample production."
                              : "Approved mockup is not available yet."}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>
      <section className="engaged-activity-section">
        <div className="engaged-activity-header">
          <div>
            <h2>Activity & Communication</h2>
            <p>System events and team comments in one live feed.</p>
          </div>
          <span className="engaged-scope-pill">
            {activityFeedItems.length}{" "}
            {activityFeedItems.length === 1 ? "entry" : "entries"}
          </span>
        </div>

        <div className="engaged-activity-feed">
          {updatesLoading ? (
            <div className="engaged-activity-empty">Loading timeline...</div>
          ) : activityFeedItems.length === 0 ? (
            <div className="engaged-activity-empty">No updates yet.</div>
          ) : (
            activityFeedItems.map((item) => (
              <article
                key={item.id}
                className={`engaged-activity-item ${item.type === "system" ? "system" : "user"}`}
              >
                <div className="engaged-activity-meta">
                  <span>{item.actor}</span>
                  <span>{formatUpdateDateTime(item.createdAt)}</span>
                </div>
                <div className="engaged-activity-category">{item.label}</div>
                <p>{item.content}</p>
              </article>
            ))
          )}
        </div>

        <div className="engaged-activity-composer">
          <div className="engaged-activity-composer-row">
            <label htmlFor="engaged-activity-dept">Department</label>
            <select
              id="engaged-activity-dept"
              className="filter-select"
              value={updateForm.department}
              onChange={(event) => {
                const nextDepartment = event.target.value;
                setUpdateForm((prev) => ({
                  ...prev,
                  department: nextDepartment,
                  category: getCategoryForDepartment(nextDepartment),
                }));
              }}
            >
              {projectEngagedSubDepts.map((dept) => (
                <option key={dept} value={dept}>
                  {getDepartmentLabel(dept)}
                </option>
              ))}
            </select>
          </div>

          <textarea
            className="input-field"
            rows="3"
            value={updateForm.content}
            onChange={(event) =>
              setUpdateForm((prev) => ({ ...prev, content: event.target.value }))
            }
            placeholder="Write an update for your team..."
          />

          <div className="engaged-activity-composer-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmitUpdate}
              disabled={
                submitting ||
                !updateForm.department ||
                updateForm.content.trim().length === 0
              }
            >
              {submitting ? "Posting..." : "Post Update"}
            </button>
          </div>
        </div>
      </section>
    </main>

    <aside className="engaged-actions-sidebar">
      <section className="engaged-context-card">
        <h3>Departmental Meeting</h3>
        {meetingLoading && <p>Loading meeting details...</p>}
        {meetingError && <p>{meetingError}</p>}
        {!meetingLoading && !orderMeeting && !meetingError && (
          <p>No meeting scheduled yet.</p>
        )}
        {orderMeeting && (
          <>
            <p>
              <strong>Status:</strong> {formatMeetingStatus(orderMeeting.status)}
            </p>
            <p>
              <strong>When:</strong>{" "}
              {formatMeetingDateTime(orderMeeting.meetingAt)}
            </p>
            {orderMeeting.timezone && (
              <p>
                <strong>Timezone:</strong> {orderMeeting.timezone}
              </p>
            )}
            {orderMeeting.location && (
              <p>
                <strong>Location:</strong> {orderMeeting.location}
              </p>
            )}
            {orderMeeting.virtualLink && (
              <p>
                <strong>Link:</strong>{" "}
                <a href={orderMeeting.virtualLink} target="_blank" rel="noreferrer">
                  Join meeting
                </a>
              </p>
            )}
            {orderMeeting.agenda && (
              <p>
                <strong>Agenda:</strong> {orderMeeting.agenda}
              </p>
            )}
            {meetingReminderLabel && (
              <p>
                <strong>Reminders:</strong> {meetingReminderLabel}
              </p>
            )}
            {orderMeeting.status === "scheduled" && (
              <p>Engagement actions unlock after the meeting is completed.</p>
            )}
          </>
        )}
      </section>
      <section className="engaged-context-card">
        <h3>Project Context</h3>
        <p>
          <strong>Status:</strong> {displayStatus}
        </p>
        <p>
          <strong>Lead:</strong> {lead}
        </p>
        <p>
          <strong>Client:</strong> {project.details?.client || "N/A"}
        </p>
        <p>
          <strong>Packaging:</strong> {project.details?.packagingType || "N/A"}
        </p>
        <p>
          <strong>Delivery:</strong> {deliveryDate}
          {deliveryTime && ` (${deliveryTime})`}
        </p>

        <div className="engaged-summary-tags">
          <span
            className={`status-badge ${project.status
              .toLowerCase()
              .replace(/\s+/g, "-")}`}
          >
            {displayStatus}
          </span>
          {invoiceSent && <span className="engaged-tag invoice">Invoice Sent</span>}
          {Array.from(paymentTypes).map((type) => (
            <span key={type} className="engaged-tag payment">
              {paymentLabels[type] || type}
            </span>
          ))}
          {sampleRequirementEnabled && (
            <span
              className={`engaged-tag ${
                sampleApprovalPending ? "caution" : "invoice"
              }`}
            >
              {sampleApprovalPending ? "Sample Approval Pending" : "Sample Approved"}
            </span>
          )}
        </div>
      </section>

      {(showPendingProductionWarning || showPendingDeliveryWarning) && (
        <section className="engaged-context-card caution">
          <h3>Action Needed</h3>
          {showPendingProductionWarning && (
            <p>Confirm {pendingProductionMissingLabels.join(", ")} before production.</p>
          )}
          {showPendingDeliveryWarning && (
            <p>Confirm {pendingDeliveryMissingLabels.join(", ")} before delivery.</p>
          )}
        </section>
      )}
    </aside>
  </div>

      {showMockupModal && mockupTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">{mockupModalTitle}</h3>
            <p className="acknowledge-confirm-text">
              {mockupModalHint} Project <strong>{projectId}</strong>.
            </p>
            <form onSubmit={handleUploadMockup}>
              <div className="form-group">
                <label>Mockup File(s)</label>
                <input
                  type="file"
                  className="input-field"
                  multiple
                  onChange={(e) =>
                    setMockupFiles(Array.from(e.target.files || []))
                  }
                  required
                />
                <div className="file-hint file-hint-spaced-md">
                  Any file type allowed (e.g., .cdr, .pdf, .png). Select
                  multiple files to upload several mockups at once.
                </div>
                {mockupFiles.length > 0 && (
                  <div className="file-hint file-hint-spaced-sm">
                    Selected: {mockupFiles.map((file) => file.name).join(", ")}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <textarea
                  className="input-field"
                  rows="3"
                  value={mockupNote}
                  onChange={(e) => setMockupNote(e.target.value)}
                  placeholder="Add a short note for production..."
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeMockupModal}
                  disabled={mockupUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={mockupUploading || mockupFiles.length === 0}
                >
                  {mockupUploading ? "Uploading..." : "Upload & Continue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {mockupDeleteModal.open && mockupDeleteModal.version && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Delete Mockup</h3>
            <p className="acknowledge-confirm-text">
              You are about to delete{" "}
              <strong>v{mockupDeleteModal.version.version}</strong> for project{" "}
              <strong>{projectId}</strong>.
            </p>
            <p className="acknowledge-confirm-text">
              File: {mockupDeleteModal.version.fileName || "Mockup file"}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeMockupDeleteModal}
                disabled={mockupDeleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmMockupDelete}
                disabled={mockupDeleteSubmitting}
              >
                {mockupDeleteSubmitting ? "Deleting..." : "Delete Mockup"}
              </button>
            </div>
          </div>
        </div>
      )}

      {billingGuardModal.open && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">
              {billingGuardModal.title || "Billing Caution"}
            </h3>
            <p className="acknowledge-confirm-text">
              <strong>Project:</strong> {projectId} - {projectName}
            </p>
            <p className="acknowledge-confirm-text">{billingGuardModal.message}</p>
            {billingGuardModal.missingLabels.length > 0 && (
              <p className="acknowledge-confirm-text">
                <strong>Missing:</strong>{" "}
                {billingGuardModal.missingLabels.join(", ")}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeBillingGuardModal}
                disabled={billingGuardSubmitting}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompleteModal && completeTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Engagement Completion</h3>
            <p className="acknowledge-confirm-text">
              You are about to mark <strong>{completeTarget.action.label}</strong>{" "}
              for project <strong>{projectId}</strong>.
            </p>
            <p className="acknowledge-confirm-text">
              Type the phrase below to confirm:
            </p>
            <div className="acknowledge-phrase">{COMPLETE_PHRASE}</div>
            <div className="form-group form-group-top-spaced">
              <label>Confirmation</label>
              <input
                type="text"
                className="input-field"
                value={completeInput}
                onChange={(e) => setCompleteInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeCompleteModal}
                disabled={completeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmComplete}
                disabled={
                  completeSubmitting || completeInput.trim() !== COMPLETE_PHRASE
                }
              >
                {completeSubmitting ? "Confirming..." : "Confirm Completion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAcknowledgeModal && acknowledgeTarget && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 className="modal-title">Confirm Engagement Acceptance</h3>
            <p className="acknowledge-confirm-text">
              You are about to acknowledge engagement for{" "}
              <strong>{getDepartmentLabel(acknowledgeTarget.department)}</strong>{" "}
              on project <strong>{projectId}</strong>.
            </p>
            <p className="acknowledge-confirm-text">
              Type the phrase below to confirm:
            </p>
            <div className="acknowledge-phrase">{ACKNOWLEDGE_PHRASE}</div>
            <div className="form-group form-group-top-spaced">
              <label>Confirmation</label>
              <input
                type="text"
                className="input-field"
                value={acknowledgeInput}
                onChange={(e) => setAcknowledgeInput(e.target.value)}
                placeholder="Type the confirmation phrase..."
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeAcknowledgeModal}
                disabled={acknowledgeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmAcknowledge}
                disabled={
                  acknowledgeSubmitting ||
                  acknowledgeInput.trim() !== ACKNOWLEDGE_PHRASE
                }
              >
                {acknowledgeSubmitting ? "Confirming..." : "Confirm Acceptance"}
              </button>
            </div>
          </div>
        </div>
      )}

      {batchPackagingModal.open && batchPackagingModal.batch && (
        <div className="modal-overlay" onClick={closeBatchPackagingModal}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <h3 className="modal-title">Confirm Batch Handoff</h3>
            <p className="acknowledge-confirm-text">
              <strong>Batch:</strong>{" "}
              {batchPackagingModal.batch?.label || "Batch"}
            </p>
            <p className="acknowledge-confirm-text">
              <strong>Items:</strong>{" "}
              {buildBatchItemSummary(batchPackagingModal.batch, batchItemMap)}
            </p>
            <p className="acknowledge-confirm-text">
              <strong>Total Qty:</strong>{" "}
              {getBatchTotalQty(batchPackagingModal.batch) || "N/A"}
            </p>
            <div className="form-group form-group-top-spaced">
              <label>Produced Quantity (Packaging Confirmation)</label>
              <input
                type="number"
                className="input-field"
                min="1"
                max={
                  getBatchTotalQty(batchPackagingModal.batch) > 0
                    ? getBatchTotalQty(batchPackagingModal.batch)
                    : undefined
                }
                value={batchPackagingQty}
                onChange={(event) => setBatchPackagingQty(event.target.value)}
                placeholder="Enter produced quantity"
              />
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeBatchPackagingModal}
                disabled={batchPackagingSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleConfirmBatchPackaging}
                disabled={
                  batchPackagingSubmitting ||
                  !Number.isFinite(Number(batchPackagingQty)) ||
                  Number(batchPackagingQty) <= 0 ||
                  (getBatchTotalQty(batchPackagingModal.batch) > 0 &&
                    Number(batchPackagingQty) >
                      getBatchTotalQty(batchPackagingModal.batch))
                }
              >
                {batchPackagingSubmitting ? "Confirming..." : "Confirm Handoff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EngagedProjectActions;

