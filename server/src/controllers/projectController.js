const mongoose = require("mongoose");
const Project = require("../models/Project");
const Order = require("../models/Order");
const ActivityLog = require("../models/ActivityLog");
const ProjectUpdate = require("../models/ProjectUpdate");
const { logActivity } = require("../utils/activityLogger");
const { createNotification } = require("../utils/notificationService");
const User = require("../models/User"); // Need User model for department notifications
const { notifyAdmins } = require("../utils/adminNotificationUtils"); // [NEW]
const {
  hasAdminPortalAccess,
  isAdminPortalRequest,
  isEngagedPortalRequest,
} = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const {
  notifyBillingOptionChange,
  notifyBillingPrerequisiteBlocked,
  notifyBillingOverrideUsed,
  notifyBillingPrerequisiteResolved,
} = require("../utils/billingNotificationService");
const {
  MOCKUP_PENDING_CLIENT_APPROVAL_UPDATE_TEXT,
  MOCKUP_APPROVED_BY_CLIENT_UPDATE_TEXT,
  SAMPLE_PENDING_CLIENT_APPROVAL_UPDATE_TEXT,
  SAMPLE_APPROVED_BY_CLIENT_UPDATE_TEXT,
  normalizeProjectUpdateContent,
} = require("../utils/projectUpdateText");

const ENGAGED_PARENT_DEPARTMENTS = new Set([
  "Production",
  "Graphics/Design",
  "Stores",
  "Photography",
]);

const ENGAGED_SUB_DEPARTMENTS = new Set([
  "graphics",
  "stock",
  "packaging",
  "photography",
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
]);

const PRODUCTION_DEPARTMENTS = new Set([
  "Production",
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
]);

const PAYMENT_TYPES = new Set([
  "part_payment",
  "full_payment",
  "po",
  "authorized",
]);
const FRONT_DESK_DEPARTMENT = "Front Desk";
const DEFAULT_RELEASE_STATUS = "In Progress";
const HOLD_STATUS = "On Hold";
const CANCELLED_MUTATION_ACTIONS = new Set(["cancel", "reactivate"]);
const HOLDABLE_STATUSES = new Set(
  (Project.schema.path("status")?.enumValues || []).filter(
    (status) => status !== HOLD_STATUS,
  ),
);
const FEEDBACK_COMPLETION_GATE_STATUSES = new Set([
  "Pending Feedback",
  "Delivered",
]);

const mapFeedbackAttachments = (req, userId) => {
  const files = Array.isArray(req.files) ? req.files : [];
  return files
    .filter((file) => file?.filename)
    .map((file) => ({
      fileUrl: `/uploads/${file.filename}`,
      fileName: file.originalname || "",
      fileType: file.mimetype || "",
      uploadedBy: userId || undefined,
      uploadedAt: new Date(),
    }));
};

const cleanupUploadedFilesSafely = async (req) => {
  try {
    await upload.cleanupRequestFiles(req);
  } catch (cleanupError) {
    console.error("Failed to clean up uploaded files:", cleanupError);
  }
};

const canManageBilling = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  const departments = Array.isArray(user.department)
    ? user.department
    : user.department
      ? [user.department]
      : [];
  return departments.includes("Front Desk");
};

const canManageMockupApproval = (user) => canManageBilling(user);
const canManageSampleApproval = (user) => canManageBilling(user);

const canEditOrderNumber = (user) => canManageBilling(user);

const PROJECT_MUTATION_ACCESS_FIELDS =
  "createdBy projectLeadId assistantLeadId departments";

const toObjectIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (typeof value === "object") {
    if (typeof value.toHexString === "function") return value.toHexString();
    if (value.$oid) return String(value.$oid);
    if (value._id && value._id !== value) return toObjectIdString(value._id);
    if (typeof value.id === "string" || typeof value.id === "number") {
      return String(value.id);
    }
    if (typeof value.toString === "function") {
      const stringified = value.toString();
      if (stringified && stringified !== "[object Object]") {
        return stringified;
      }
    }
  }

  return "";
};

const normalizeOrderNumber = (value) => String(value || "").trim();

const normalizeOptionalText = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const parseBooleanFlag = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parseCorporateEmergencyFlag = (value, fallback = false) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return parseBooleanFlag(value.isEnabled, fallback);
  }
  return parseBooleanFlag(value, fallback);
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isValidObjectId = (value) =>
  Boolean(value) && mongoose.Types.ObjectId.isValid(String(value));

const ensureOrderRecord = async ({
  orderNumber,
  orderDate,
  client,
  clientEmail,
  clientPhone,
  createdBy,
  requestedOrderRefId,
}) => {
  const normalizedOrderNumber = normalizeOrderNumber(orderNumber);
  const normalizedRequestedOrderRef = isValidObjectId(requestedOrderRefId)
    ? String(requestedOrderRefId)
    : "";

  let order = null;
  if (normalizedRequestedOrderRef) {
    order = await Order.findById(normalizedRequestedOrderRef);
  }

  if (!order && normalizedOrderNumber) {
    order = await Order.findOne({ orderNumber: normalizedOrderNumber });
  }

  const normalizedClient = normalizeOptionalText(client);
  const normalizedClientEmail = normalizeOptionalText(clientEmail);
  const normalizedClientPhone = normalizeOptionalText(clientPhone);
  const parsedOrderDate = toDateOrNull(orderDate);

  if (!order) {
    if (!normalizedOrderNumber || !createdBy) return null;
    try {
      order = await Order.create({
        orderNumber: normalizedOrderNumber,
        orderDate: parsedOrderDate || new Date(),
        client: normalizedClient,
        clientEmail: normalizedClientEmail,
        clientPhone: normalizedClientPhone,
        createdBy,
      });
    } catch (error) {
      if (error?.code === 11000) {
        order = await Order.findOne({ orderNumber: normalizedOrderNumber });
      } else {
        throw error;
      }
    }
    return order;
  }

  let changed = false;
  if (normalizedOrderNumber && order.orderNumber !== normalizedOrderNumber) {
    const existingByOrderNumber = await Order.findOne({
      orderNumber: normalizedOrderNumber,
    });
    if (
      existingByOrderNumber &&
      toObjectIdString(existingByOrderNumber._id) !== toObjectIdString(order._id)
    ) {
      order = existingByOrderNumber;
    } else {
      order.orderNumber = normalizedOrderNumber;
      changed = true;
    }
  }

  if (normalizedClient && order.client !== normalizedClient) {
    order.client = normalizedClient;
    changed = true;
  }
  if (normalizedClientEmail && order.clientEmail !== normalizedClientEmail) {
    order.clientEmail = normalizedClientEmail;
    changed = true;
  }
  if (normalizedClientPhone && order.clientPhone !== normalizedClientPhone) {
    order.clientPhone = normalizedClientPhone;
    changed = true;
  }
  if (parsedOrderDate && String(order.orderDate) !== String(parsedOrderDate)) {
    order.orderDate = parsedOrderDate;
    changed = true;
  }

  if (changed) {
    await order.save();
  }

  return order;
};

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

const PRODUCTION_DEPARTMENT_TOKENS = new Set(
  Array.from(PRODUCTION_DEPARTMENTS)
    .map(normalizeDepartmentValue)
    .filter(Boolean),
);
const GRAPHICS_DEPARTMENT_TOKENS = new Set([
  "graphics/design",
  "graphics",
  "design",
]);
const STORES_DEPARTMENT_TOKENS = new Set(["stores", "stock", "packaging"]);
const PHOTOGRAPHY_DEPARTMENT_TOKENS = new Set(["photography"]);

const canonicalizeDepartment = (value) => {
  const token = normalizeDepartmentValue(value);
  if (!token) return "";
  if (PRODUCTION_DEPARTMENT_TOKENS.has(token)) return "production";
  if (GRAPHICS_DEPARTMENT_TOKENS.has(token)) return "graphics";
  if (STORES_DEPARTMENT_TOKENS.has(token)) return "stores";
  if (PHOTOGRAPHY_DEPARTMENT_TOKENS.has(token)) return "photography";
  return token;
};

const hasDepartmentOverlap = (userDepartments, projectDepartments) => {
  const userCanonical = new Set(
    toDepartmentArray(userDepartments)
      .map(canonicalizeDepartment)
      .filter(Boolean),
  );
  if (userCanonical.size === 0) return false;

  const projectCanonical = new Set(
    toDepartmentArray(projectDepartments)
      .map(canonicalizeDepartment)
      .filter(Boolean),
  );
  if (projectCanonical.size === 0) return false;

  for (const dept of userCanonical) {
    if (projectCanonical.has(dept)) return true;
  }
  return false;
};

const userHasDepartmentMatch = (userDepartments, targetDepartment) => {
  const targetCanonical = canonicalizeDepartment(targetDepartment);
  if (!targetCanonical) return false;
  return toDepartmentArray(userDepartments)
    .map(canonicalizeDepartment)
    .some((dept) => dept === targetCanonical);
};

const projectHasDepartment = (projectDepartments, targetDepartment) => {
  const targetCanonical = canonicalizeDepartment(targetDepartment);
  if (!targetCanonical) return false;
  return toDepartmentArray(projectDepartments)
    .map(canonicalizeDepartment)
    .some((dept) => dept === targetCanonical);
};

const getMissingDepartmentAcknowledgements = (project) => {
  const engagedDepartments = toDepartmentArray(project?.departments);
  if (engagedDepartments.length === 0) return [];

  const engagedByCanonical = new Map();
  engagedDepartments.forEach((dept) => {
    const canonical = canonicalizeDepartment(dept);
    if (!canonical || engagedByCanonical.has(canonical)) return;
    engagedByCanonical.set(canonical, String(dept));
  });

  const acknowledgedCanonical = new Set(
    (project?.acknowledgements || [])
      .map((ack) => canonicalizeDepartment(ack?.department))
      .filter(Boolean),
  );

  const missing = [];
  engagedByCanonical.forEach((displayName, canonical) => {
    if (!acknowledgedCanonical.has(canonical)) {
      missing.push(displayName);
    }
  });

  return missing;
};

const isUserAssignedProjectLead = (user, project) => {
  if (!user || !project) return false;
  const userId = toObjectIdString(user._id || user.id);
  const projectLeadId = toObjectIdString(project.projectLeadId);
  return Boolean(userId && projectLeadId && userId === projectLeadId);
};

const canMutateProject = (user, project, action = "default") => {
  if (!user || !project) return false;
  if (user.role === "admin") return true;

  const userId = toObjectIdString(user._id || user.id);
  const stakeholderIds = new Set(
    [
      toObjectIdString(project.createdBy),
      toObjectIdString(project.projectLeadId),
      toObjectIdString(project.assistantLeadId),
    ].filter(Boolean),
  );
  const isStakeholder = Boolean(userId && stakeholderIds.has(userId));

  const userDepartmentTokens = toDepartmentArray(user.department).map(
    normalizeDepartmentValue,
  );
  const isFrontDesk = userDepartmentTokens.includes("front desk");
  const hasDeptScope = hasDepartmentOverlap(user.department, project.departments);

  switch (action) {
    case "manage":
    case "delete":
    case "reopen":
    case "billing":
    case "feedback":
      return isStakeholder || isFrontDesk;
    case "status":
    case "department":
    case "acknowledge":
    case "mockup":
    default:
      return isStakeholder || isFrontDesk || hasDeptScope;
  }
};

const ensureProjectMutationAccess = (req, res, project, action = "default") => {
  if (!project) {
    res.status(404).json({ message: "Project not found" });
    return false;
  }
  const isAdminPortalMutation = isAdminPortalRequest(req);
  if (
    req.user?.role === "admin" &&
    isUserAssignedProjectLead(req.user, project) &&
    isAdminPortalMutation
  ) {
    res.status(403).json({
      message:
        "You cannot modify this project from the admin portal while you are the assigned Project Lead. Ask another admin to make this change.",
    });
    return false;
  }
  const engagedActionTypes = new Set(["acknowledge", "status", "mockup"]);
  const isEngagedPortalMutation = isEngagedPortalRequest(req);
  if (
    isUserAssignedProjectLead(req.user, project) &&
    isEngagedPortalMutation &&
    engagedActionTypes.has(action)
  ) {
    res.status(403).json({
      message:
        "Project Leads cannot perform engagement actions on their own projects from the engaged departments page.",
    });
    return false;
  }
  if (
    project?.cancellation?.isCancelled &&
    !CANCELLED_MUTATION_ACTIONS.has(action)
  ) {
    res.status(400).json({
      message:
        "This project is cancelled and frozen. Reactivate it before making changes.",
    });
    return false;
  }
  if (!canMutateProject(req.user, project, action)) {
    res.status(403).json({ message: "Not authorized to modify this project." });
    return false;
  }
  return true;
};

const mergeQueryWithCondition = (baseQuery = {}, condition = {}) => {
  if (!condition || Object.keys(condition).length === 0) return baseQuery || {};
  if (!baseQuery || Object.keys(baseQuery).length === 0) return { ...condition };
  return { $and: [baseQuery, condition] };
};

const buildProjectAccessQuery = (req) => {
  let query = {};
  const isReportMode = req.query.mode === "report";
  const isEngagedMode = req.query.mode === "engaged";
  const isAdminPortal = req.query.source === "admin";
  const isFrontDesk = req.user.department?.includes("Front Desk");
  const userDepartments = Array.isArray(req.user.department)
    ? req.user.department
    : req.user.department
      ? [req.user.department]
      : [];
  const isEngagedDept = userDepartments.some(
    (dept) =>
      ENGAGED_PARENT_DEPARTMENTS.has(dept) ||
      ENGAGED_SUB_DEPARTMENTS.has(dept),
  );

  const canSeeAll =
    (hasAdminPortalAccess(req.user) && isAdminPortal) ||
    (isReportMode && isFrontDesk) ||
    (isEngagedMode && isEngagedDept);

  if (!canSeeAll) {
    query = {
      $or: [{ projectLeadId: req.user._id }, { assistantLeadId: req.user._id }],
    };

    if (isReportMode) {
      query = {
        $or: [
          { projectLeadId: req.user._id },
          { assistantLeadId: req.user._id },
          { endOfDayUpdateBy: req.user._id },
          { createdBy: req.user._id },
        ],
      };
    }
  }

  const cancelledOnly = String(req.query.cancelled || "").toLowerCase() === "true";
  const includeCancelled =
    String(req.query.includeCancelled || "").toLowerCase() === "true";

  if (cancelledOnly) {
    query = mergeQueryWithCondition(query, {
      "cancellation.isCancelled": true,
    });
  } else if (!includeCancelled) {
    query = mergeQueryWithCondition(query, {
      "cancellation.isCancelled": { $ne: true },
    });
  }

  return {
    query,
    isAdminPortal,
    canSeeAll,
  };
};

const CLOSED_ORDER_STATUSES = new Set([
  "Completed",
  "Delivered",
  "Feedback Completed",
  "Finished",
  "Response Sent",
  "Quote Request Completed",
]);
const BOTTLENECK_EXCLUDED_STATUSES = new Set([
  "Completed",
  "Finished",
  "On Hold",
]);
const BOTTLENECK_DEFAULT_DAYS = 14;
const BOTTLENECK_MIN_DAYS = 1;
const BOTTLENECK_MAX_DAYS = 90;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const getLineageKey = (project = {}) => {
  const rawLineageId = project?.lineageId;
  if (!rawLineageId) return project?._id ? String(project._id) : "";
  if (typeof rawLineageId === "string") return rawLineageId;
  if (typeof rawLineageId === "object") {
    const rawId = rawLineageId._id || rawLineageId.id;
    return rawId ? String(rawId) : project?._id ? String(project._id) : "";
  }
  return project?._id ? String(project._id) : "";
};

const getProjectVersionNumber = (project = {}) => {
  const value = Number(project?.versionNumber);
  return Number.isFinite(value) && value > 0 ? value : 1;
};

const collapseToLatestLineageProjects = (projects = []) => {
  const latestByLineage = new Map();

  projects.forEach((project) => {
    if (!project?._id) return;
    const lineageKey = getLineageKey(project);
    if (!lineageKey) return;

    const existing = latestByLineage.get(lineageKey);
    if (!existing) {
      latestByLineage.set(lineageKey, project);
      return;
    }

    const incomingVersion = getProjectVersionNumber(project);
    const existingVersion = getProjectVersionNumber(existing);

    if (incomingVersion > existingVersion) {
      latestByLineage.set(lineageKey, project);
      return;
    }

    if (incomingVersion === existingVersion) {
      const incomingCreatedAt = project.createdAt
        ? new Date(project.createdAt).getTime()
        : 0;
      const existingCreatedAt = existing.createdAt
        ? new Date(existing.createdAt).getTime()
        : 0;
      if (incomingCreatedAt > existingCreatedAt) {
        latestByLineage.set(lineageKey, project);
      }
    }
  });

  return Array.from(latestByLineage.values());
};

const toUserDisplayName = (user) => {
  if (!user) return "";
  const firstName = String(user.firstName || "").trim();
  const lastName = String(user.lastName || "").trim();
  return `${firstName} ${lastName}`.trim() || String(user.employeeId || "").trim();
};

const buildOrderGroups = (projects = [], { collapseRevisions = true } = {}) => {
  const sourceProjects = collapseRevisions
    ? collapseToLatestLineageProjects(projects)
    : projects;
  const groups = new Map();

  sourceProjects.forEach((project) => {
    const orderRefId = toObjectIdString(project?.orderRef);
    const orderNumber =
      normalizeOrderNumber(project?.orderRef?.orderNumber) ||
      normalizeOrderNumber(project?.orderId) ||
      "UNASSIGNED";
    // Always group by order number first so all projects under the same
    // orderNumber are in one bucket even if orderRef is inconsistent.
    const groupKey = orderNumber || orderRefId || toObjectIdString(project?._id);

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: groupKey,
        orderRef: orderRefId || null,
        orderNumber,
        orderDate: project?.orderRef?.orderDate || project?.orderDate || null,
        client:
          normalizeOptionalText(project?.orderRef?.client) ||
          normalizeOptionalText(project?.details?.client) ||
          "",
        clientEmail:
          normalizeOptionalText(project?.orderRef?.clientEmail) ||
          normalizeOptionalText(project?.details?.clientEmail) ||
          "",
        clientPhone:
          normalizeOptionalText(project?.orderRef?.clientPhone) ||
          normalizeOptionalText(project?.details?.clientPhone) ||
          "",
        totalProjects: 0,
        openProjects: 0,
        leads: [],
        projects: [],
      });
    }

    const group = groups.get(groupKey);
    if (!group.orderRef && orderRefId) {
      group.orderRef = orderRefId;
    }
    if (group.orderNumber === "UNASSIGNED" && orderNumber !== "UNASSIGNED") {
      group.orderNumber = orderNumber;
    }
    if (!group.orderDate && (project?.orderRef?.orderDate || project?.orderDate)) {
      group.orderDate = project?.orderRef?.orderDate || project?.orderDate || null;
    }
    if (!group.client) {
      group.client =
        normalizeOptionalText(project?.orderRef?.client) ||
        normalizeOptionalText(project?.details?.client) ||
        "";
    }
    if (!group.clientEmail) {
      group.clientEmail =
        normalizeOptionalText(project?.orderRef?.clientEmail) ||
        normalizeOptionalText(project?.details?.clientEmail) ||
        "";
    }
    if (!group.clientPhone) {
      group.clientPhone =
        normalizeOptionalText(project?.orderRef?.clientPhone) ||
        normalizeOptionalText(project?.details?.clientPhone) ||
        "";
    }

    group.totalProjects += 1;
    if (!CLOSED_ORDER_STATUSES.has(project?.status)) {
      group.openProjects += 1;
    }

    const leadName = toUserDisplayName(project?.projectLeadId);
    if (leadName && !group.leads.includes(leadName)) {
      group.leads.push(leadName);
    }

    group.projects.push(project);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      projects: group.projects.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }))
    .sort(
      (a, b) =>
        new Date(b.orderDate || 0).getTime() - new Date(a.orderDate || 0).getTime(),
    );
};

const getPaymentVerificationTypes = (project) =>
  new Set(
    (Array.isArray(project?.paymentVerifications)
      ? project.paymentVerifications
      : []
    )
      .map((entry) => toText(entry?.type))
      .filter(Boolean),
  );

const BILLING_REQUIREMENT_LABELS = {
  invoice: "Invoice confirmation",
  payment_verification_any: "Payment method verification",
  full_payment_or_authorized:
    "Full payment or authorization verification",
};

const getPendingProductionBillingMissing = (project) => {
  const missing = [];
  const paymentTypes = getPaymentVerificationTypes(project);

  if (!project?.invoice?.sent) {
    missing.push("invoice");
  }
  if (paymentTypes.size === 0) {
    missing.push("payment_verification_any");
  }

  return missing;
};

const getPendingDeliveryBillingMissing = (project) => {
  const missing = [];
  const paymentTypes = getPaymentVerificationTypes(project);

  if (!paymentTypes.has("full_payment") && !paymentTypes.has("authorized")) {
    missing.push("full_payment_or_authorized");
  }

  return missing;
};

const formatBillingRequirementLabels = (missing = []) =>
  (Array.isArray(missing) ? missing : [])
    .map((key) => BILLING_REQUIREMENT_LABELS[key] || key)
    .filter(Boolean);

const buildBillingRequirementMessage = (targetStatus, missing = []) => {
  const labels = formatBillingRequirementLabels(missing);
  const missingLabelText = labels.length ? ` Missing: ${labels.join(", ")}.` : "";

  if (targetStatus === "Pending Production") {
    return `Invoice confirmation and at least one payment method verification are required before moving to Pending Production.${missingLabelText}`;
  }

  if (targetStatus === "Pending Delivery/Pickup") {
    return `Full payment or authorization verification is required before moving to Pending Delivery/Pickup.${missingLabelText}`;
  }

  return `Billing prerequisites are missing for ${targetStatus}.${missingLabelText}`;
};

const getBillingGuardMissingByTarget = (project) => {
  if (project?.projectType === "Quote") {
    return {
      pendingProduction: [],
      pendingDelivery: [],
    };
  }

  return {
    pendingProduction: getPendingProductionBillingMissing(project),
    pendingDelivery: getPendingDeliveryBillingMissing(project),
  };
};

const getClearedBillingGuardTargets = (beforeState = {}, afterState = {}) => {
  const beforeProduction = Array.isArray(beforeState.pendingProduction)
    ? beforeState.pendingProduction
    : [];
  const afterProduction = Array.isArray(afterState.pendingProduction)
    ? afterState.pendingProduction
    : [];
  const beforeDelivery = Array.isArray(beforeState.pendingDelivery)
    ? beforeState.pendingDelivery
    : [];
  const afterDelivery = Array.isArray(afterState.pendingDelivery)
    ? afterState.pendingDelivery
    : [];

  const cleared = [];

  if (beforeProduction.length > 0 && afterProduction.length === 0) {
    cleared.push({
      targetStatus: "Pending Production",
      resolved: beforeProduction,
    });
  }

  if (beforeDelivery.length > 0 && afterDelivery.length === 0) {
    cleared.push({
      targetStatus: "Pending Delivery/Pickup",
      resolved: beforeDelivery,
    });
  }

  return cleared;
};

const notifyClearedBillingGuardTargets = async ({
  project,
  senderId,
  beforeState,
  afterState,
  resolutionNote = "",
}) => {
  const clearedTargets = getClearedBillingGuardTargets(beforeState, afterState);
  if (!clearedTargets.length) return;

  await Promise.all(
    clearedTargets.map((entry) =>
      notifyBillingPrerequisiteResolved({
        project,
        senderId,
        targetStatus: entry.targetStatus,
        resolved: entry.resolved,
        resolutionNote,
      }),
    ),
  );
};

const AI_RISK_MODEL = process.env.OPENAI_RISK_MODEL || "gpt-4o-mini";
const AI_RISK_TIMEOUT_MS = 12000;
const AI_RISK_TEMPERATURE = 0.55;
const OLLAMA_RISK_URL =
  process.env.OLLAMA_RISK_URL || "http://localhost:11434/api/generate";
const OLLAMA_RISK_MODEL = process.env.OLLAMA_RISK_MODEL || "llama3.1:8b";
const OLLAMA_RISK_TIMEOUT_MS = Number.isFinite(
  Number.parseInt(process.env.OLLAMA_RISK_TIMEOUT_MS, 10),
)
  ? Number.parseInt(process.env.OLLAMA_RISK_TIMEOUT_MS, 10)
  : 20000;
const OLLAMA_RISK_TEMPERATURE = Number.isFinite(
  Number.parseFloat(process.env.OLLAMA_RISK_TEMPERATURE),
)
  ? Number.parseFloat(process.env.OLLAMA_RISK_TEMPERATURE)
  : 0.7;
const MIN_RISK_SUGGESTIONS = 3;
const MAX_RISK_SUGGESTIONS = 5;
const DEFAULT_AI_PREVENTIVE_MEASURE =
  "Run a pilot sample and QA preflight before full production.";

const PRODUCTION_SUGGESTION_DEPARTMENTS = [
  "graphics",
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
  "in-house-production",
  "local-outsourcing",
];

const PRODUCTION_SUGGESTION_DEPARTMENT_SET = new Set(
  PRODUCTION_SUGGESTION_DEPARTMENTS,
);

const PRODUCTION_DEPARTMENT_LABELS = {
  graphics: "Mockup / Graphics / Design",
  dtf: "DTF Printing",
  "uv-dtf": "UV DTF Printing",
  "uv-printing": "UV Printing",
  engraving: "Engraving",
  "large-format": "Large Format",
  "digital-press": "Digital Press",
  "digital-heat-press": "Digital Heat Press",
  "offset-press": "Offset Press",
  "screen-printing": "Screen Printing",
  embroidery: "Embroidery",
  sublimation: "Sublimation",
  "digital-cutting": "Digital Cutting",
  "pvc-id": "PVC ID Cards",
  "business-cards": "Business Cards",
  installation: "Installation",
  overseas: "Overseas",
  woodme: "Woodme",
  fabrication: "Fabrication",
  signage: "Signage",
  "outside-production": "Outside Production",
  "in-house-production": "In-house Production",
  "local-outsourcing": "Local Outsourcing",
};

const PRODUCTION_DEPARTMENT_ALIASES = {
  graphics: "graphics",
  design: "graphics",
  "graphics design": "graphics",
  "graphics/design": "graphics",
  mockup: "graphics",
  "mock up": "graphics",
  "mockup design": "graphics",
  "uv dtf": "uv-dtf",
  "uv dtf printing": "uv-dtf",
  "dtf printing": "dtf",
  "large format printing": "large-format",
  "screen print": "screen-printing",
  "pvc id": "pvc-id",
  "pvc id cards": "pvc-id",
  "business cards": "business-cards",
  "outside production": "outside-production",
  "in house production": "in-house-production",
  "local outsourcing": "local-outsourcing",
};

const toSafeArray = (value) => (Array.isArray(value) ? value : []);
const toText = (value) => (typeof value === "string" ? value.trim() : "");
const PROJECT_TYPE_VALUES = new Set([
  "Standard",
  "Emergency",
  "Quote",
  "Corporate Job",
]);
const PRIORITY_VALUES = new Set(["Normal", "Urgent"]);
const QUOTE_ONLY_STATUSES = new Set([
  "Pending Quote Request",
  "Quote Request Completed",
  "Pending Send Response",
  "Response Sent",
]);
const NON_QUOTE_ONLY_STATUSES = new Set([
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
]);
const DEFAULT_STATUS_BY_PROJECT_TYPE = {
  Quote: "Pending Quote Request",
  Standard: "Pending Departmental Engagement",
  Emergency: "Pending Departmental Engagement",
  "Corporate Job": "Pending Departmental Engagement",
};
const normalizeProjectType = (value, fallback = "Standard") => {
  const candidate = toText(value);
  if (PROJECT_TYPE_VALUES.has(candidate)) return candidate;
  return fallback;
};
const normalizePriority = (value, fallback = "Normal") => {
  const candidate = toText(value);
  if (PRIORITY_VALUES.has(candidate)) return candidate;
  return fallback;
};
const isStatusCompatibleWithProjectType = (status, projectType) => {
  const normalizedStatus = toText(status);
  if (!normalizedStatus) return false;
  if (projectType === "Quote") {
    return !NON_QUOTE_ONLY_STATUSES.has(normalizedStatus);
  }
  return !QUOTE_ONLY_STATUSES.has(normalizedStatus);
};
const getDefaultStatusForProjectType = (projectType) =>
  DEFAULT_STATUS_BY_PROJECT_TYPE[projectType] ||
  DEFAULT_STATUS_BY_PROJECT_TYPE.Standard;
const getAllowedStatusesForProjectType = (projectType) => {
  const allStatuses = toSafeArray(Project.schema.path("status")?.enumValues).filter(
    Boolean,
  );
  return allStatuses.filter((status) =>
    isStatusCompatibleWithProjectType(status, projectType),
  );
};
const SUPPLY_SOURCE_VALUES = new Set([
  "in-house",
  "purchase",
  "client-supply",
]);
const normalizeSupplySourceValue = (value) => {
  const token = toText(value).toLowerCase();
  if (!token) return "";
  if (SUPPLY_SOURCE_VALUES.has(token)) return token;
  if (token === "in house" || token === "inhouse") return "in-house";
  if (token === "client supply" || token === "clientsupply")
    return "client-supply";
  return "";
};
const normalizeSupplySourceSelection = (value) => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map(normalizeSupplySourceValue).filter(Boolean)),
    );
  }

  if (value && typeof value === "object") {
    if (typeof value.value === "string") {
      return normalizeSupplySourceSelection(value.value);
    }
    return [];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        return normalizeSupplySourceSelection(JSON.parse(trimmed));
      } catch {
        // Fall through to scalar parsing.
      }
    }

    if (trimmed.includes(",")) {
      return Array.from(
        new Set(
          trimmed
            .split(",")
            .map((entry) => normalizeSupplySourceValue(entry))
            .filter(Boolean),
        ),
      );
    }

    const normalized = normalizeSupplySourceValue(trimmed);
    return normalized ? [normalized] : [];
  }

  return [];
};
const toSupplySourceText = (value) =>
  normalizeSupplySourceSelection(value).join(", ");
const normalizeTextToken = (value) =>
  toText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const RISK_TEXT_STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "from",
  "that",
  "this",
  "into",
  "for",
  "than",
  "then",
  "before",
  "after",
  "during",
  "while",
  "when",
  "where",
  "which",
  "who",
  "what",
  "may",
  "can",
  "could",
  "will",
  "should",
  "must",
  "each",
  "across",
  "between",
  "through",
  "about",
  "around",
  "over",
  "under",
  "inside",
  "outside",
  "project",
  "production",
  "risk",
  "risks",
  "issue",
  "issues",
  "work",
  "workflow",
  "task",
  "tasks",
  "process",
  "processes",
  "team",
  "details",
  "detail",
  "general",
  "generic",
]);

const tokenizeMeaningfulRiskText = (value, minLength = 3) =>
  normalizeTextToken(value)
    .split(" ")
    .filter(
      (token) =>
        token &&
        token.length >= minLength &&
        !RISK_TEXT_STOP_WORDS.has(token),
    );

const buildRiskTokenSet = (value, minLength = 3) =>
  new Set(tokenizeMeaningfulRiskText(value, minLength));

const computeTokenOverlapRatio = (setA, setB) => {
  if (!setA?.size || !setB?.size) return 0;
  let overlap = 0;
  setA.forEach((token) => {
    if (setB.has(token)) overlap += 1;
  });
  return overlap / Math.min(setA.size, setB.size);
};

const toOptionValue = (value) => {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    return toText(value.value || value.label);
  }
  return "";
};

const normalizeProductionDepartment = (value) => {
  const raw = toOptionValue(value);
  if (!raw) return "";

  const normalized = raw.toLowerCase();
  if (PRODUCTION_SUGGESTION_DEPARTMENT_SET.has(normalized)) {
    return normalized;
  }

  const normalizedDash = normalized.replace(/_/g, "-").trim();
  if (PRODUCTION_SUGGESTION_DEPARTMENT_SET.has(normalizedDash)) {
    return normalizedDash;
  }

  const token = normalizeTextToken(raw);
  if (!token) return "";
  if (PRODUCTION_DEPARTMENT_ALIASES[token]) {
    return PRODUCTION_DEPARTMENT_ALIASES[token];
  }

  for (const [deptId, label] of Object.entries(PRODUCTION_DEPARTMENT_LABELS)) {
    if (token === normalizeTextToken(label)) {
      return deptId;
    }
  }

  return "";
};

const inferPreventiveMeasureFromDescription = (description = "") => {
  const text = description.toLowerCase();

  if (/color|icc|profile|proof|shade/.test(text)) {
    return "Run a calibrated color proof and sign-off before full production.";
  }
  if (/artwork|file|mockup|font|version|approval/.test(text)) {
    return "Lock an approved artwork revision and run preflight checks before release.";
  }
  if (/alignment|registration|fit|dimension|tolerance|trim/.test(text)) {
    return "Validate dimensions on a first-piece sample and approve before scaling up.";
  }
  if (/adhesion|lamination|delaminate|peel|cure|curing/.test(text)) {
    return "Perform adhesion and cure tests on actual substrate before full run.";
  }
  if (/temperature|pressure|heat|humidity|moisture/.test(text)) {
    return "Calibrate machine settings at startup and re-check settings before batch run.";
  }
  if (/delay|late|lead time|timeline|shipment|dispatch/.test(text)) {
    return "Set milestone checkpoints with a buffer plan and escalation triggers.";
  }
  if (/installation|onsite|site|mount|surface/.test(text)) {
    return "Confirm site measurements and run a pre-installation checklist before dispatch.";
  }
  if (/material|substrate|batch|stock|supplier/.test(text)) {
    return "Run incoming material QA and a small pilot batch before full production.";
  }

  return DEFAULT_AI_PREVENTIVE_MEASURE;
};

const sanitizeRiskSuggestions = (value, limit = Number.POSITIVE_INFINITY) => {
  const uniqueDescriptions = new Set();
  const acceptedDescriptionTokenSets = [];
  const cleaned = [];

  toSafeArray(value).forEach((item) => {
    const description = toText(item?.description);
    const preventive =
      toText(item?.preventive) ||
      inferPreventiveMeasureFromDescription(description);
    if (!description || !preventive) return;

    const descriptionKey = description.toLowerCase();
    if (uniqueDescriptions.has(descriptionKey)) return;

    const descriptionTokens = buildRiskTokenSet(description, 4);
    const isNearDuplicate = acceptedDescriptionTokenSets.some(
      (tokenSet) => computeTokenOverlapRatio(descriptionTokens, tokenSet) >= 0.78,
    );
    if (isNearDuplicate) return;

    uniqueDescriptions.add(descriptionKey);
    if (descriptionTokens.size > 0) {
      acceptedDescriptionTokenSets.push(descriptionTokens);
    }

    cleaned.push({
      description: description.slice(0, 160),
      preventive: preventive.slice(0, 220),
    });
  });

  return cleaned.slice(0, limit);
};

const buildRiskSuggestionContext = (projectData = {}) => {
  const details =
    projectData?.details && typeof projectData.details === "object"
      ? projectData.details
      : {};

  const departments = toSafeArray(projectData?.departments)
    .map(toOptionValue)
    .filter(Boolean)
    .slice(0, 30);

  const items = toSafeArray(projectData?.items)
    .map((item) => ({
      description: toText(item?.description),
      breakdown: toText(item?.breakdown),
      quantity:
        typeof item?.quantity === "number"
          ? item.quantity
          : typeof item?.qty === "number"
            ? item.qty
            : null,
      department: toOptionValue(item?.department),
      departmentRaw: toText(item?.departmentRaw),
    }))
    .filter(
      (item) =>
        item.description ||
        item.breakdown ||
        item.department ||
        item.departmentRaw ||
        item.quantity,
    )
    .slice(0, 30);

  const requestedProductionDepartments = toSafeArray(
    projectData?.productionDepartments,
  )
    .map(normalizeProductionDepartment)
    .filter(Boolean);

  const inferredProductionDepartments = [
    ...departments.map(normalizeProductionDepartment).filter(Boolean),
    ...items
      .map((item) => normalizeProductionDepartment(item.department))
      .filter(Boolean),
    ...items
      .map((item) => normalizeProductionDepartment(item.departmentRaw))
      .filter(Boolean),
  ];

  const productionDepartments = Array.from(
    new Set([
      ...requestedProductionDepartments,
      ...inferredProductionDepartments,
    ]),
  );

  const uncontrollableFactors = toSafeArray(projectData?.uncontrollableFactors)
    .map((factor) => ({
      description: toText(factor?.description),
      responsible: toOptionValue(factor?.responsible),
      status: toOptionValue(factor?.status),
    }))
    .filter((factor) => factor.description)
    .slice(0, 12);

  const existingRiskDescriptions = toSafeArray(projectData?.productionRisks)
    .map((risk) => toText(risk?.description))
    .filter(Boolean);
  const supplySourceRaw =
    details && Object.prototype.hasOwnProperty.call(details, "supplySource")
      ? details.supplySource
      : projectData?.supplySource;

  return {
    projectType: toText(projectData?.projectType) || "Standard",
    priority: toText(projectData?.priority) || "Normal",
    projectName: toText(details?.projectName || projectData?.projectName),
    briefOverview: toText(details?.briefOverview || projectData?.briefOverview),
    client: toText(details?.client || projectData?.client),
    contactType: toText(details?.contactType || projectData?.contactType),
    supplySource: toSupplySourceText(supplySourceRaw),
    deliveryDate: toText(details?.deliveryDate || projectData?.deliveryDate),
    deliveryTime: toText(details?.deliveryTime || projectData?.deliveryTime),
    deliveryLocation: toText(
      details?.deliveryLocation || projectData?.deliveryLocation,
    ),
    departments,
    productionDepartments,
    productionDepartmentLabels: productionDepartments.map(
      (deptId) => PRODUCTION_DEPARTMENT_LABELS[deptId] || deptId,
    ),
    items,
    uncontrollableFactors,
    existingRiskDescriptions,
  };
};

const filterExistingRiskSuggestions = (
  suggestions = [],
  existingRiskDescriptions = [],
) => {
  const existingDescriptionSet = new Set(
    existingRiskDescriptions.map((description) => description.toLowerCase()),
  );

  return sanitizeRiskSuggestions(suggestions, Number.POSITIVE_INFINITY).filter(
    (suggestion) => {
      const key = suggestion.description.toLowerCase();
      if (existingDescriptionSet.has(key)) return false;
      existingDescriptionSet.add(key);
      return true;
    },
  );
};

const shuffleArray = (items = []) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const mergeRiskSuggestions = (...collections) => {
  const seen = new Set();
  const merged = [];

  collections.forEach((collection) => {
    sanitizeRiskSuggestions(collection, Number.POSITIVE_INFINITY).forEach(
      (suggestion) => {
        const key = toText(suggestion.description).toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(suggestion);
      },
    );
  });

  return merged;
};

const buildRiskContextKeywordSet = (context = {}) => {
  const keywords = new Set();
  const addTokens = (value, minLength = 4) => {
    tokenizeMeaningfulRiskText(value, minLength).forEach((token) =>
      keywords.add(token),
    );
  };

  addTokens(context.projectName, 3);
  addTokens(context.briefOverview, 4);
  addTokens(context.client, 4);
  addTokens(context.deliveryLocation, 4);
  addTokens(context.priority, 3);
  addTokens(context.contactType, 3);
  addTokens(context.supplySource, 3);

  toSafeArray(context.productionDepartmentLabels).forEach((entry) =>
    addTokens(entry, 3),
  );

  toSafeArray(context.items).forEach((item) => {
    addTokens(item?.description, 4);
    addTokens(item?.breakdown, 4);
    addTokens(item?.department, 3);
    addTokens(item?.departmentRaw, 3);
  });

  toSafeArray(context.uncontrollableFactors).forEach((factor) => {
    addTokens(factor?.description, 4);
    addTokens(factor?.responsible, 3);
  });

  return keywords;
};

const scoreRiskSuggestionAgainstContext = (
  suggestion = {},
  contextKeywordSet = new Set(),
) => {
  const description = toText(suggestion.description);
  const preventive = toText(suggestion.preventive);
  if (!description) return Number.NEGATIVE_INFINITY;

  let score = 0;
  buildRiskTokenSet(description, 3).forEach((token) => {
    if (contextKeywordSet.has(token)) score += 2;
  });
  buildRiskTokenSet(preventive, 3).forEach((token) => {
    if (contextKeywordSet.has(token)) score += 1;
  });

  if (/^\[[^\]]+\]/.test(description)) score += 1;
  if (description.length >= 48) score += 0.5;
  if (
    /\b(generic|general|quality issue|unexpected delay|communication gap)\b/i.test(
      description,
    )
  ) {
    score -= 2;
  }

  return score;
};

const prioritizeRiskSuggestions = (
  suggestions = [],
  context = {},
  limit = MAX_RISK_SUGGESTIONS,
) => {
  const sanitized = sanitizeRiskSuggestions(suggestions, Number.POSITIVE_INFINITY);
  if (sanitized.length <= 1) return sanitized.slice(0, limit);

  const contextKeywordSet = buildRiskContextKeywordSet(context);
  if (contextKeywordSet.size === 0) {
    return sanitized.slice(0, limit);
  }

  return sanitized
    .map((suggestion, index) => ({
      suggestion,
      index,
      score: scoreRiskSuggestionAgainstContext(suggestion, contextKeywordSet),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map((entry) => entry.suggestion)
    .slice(0, limit);
};

const PRODUCTION_DEPARTMENT_RISK_TEMPLATES = {
  graphics: [
    {
      description:
        "Artwork version mismatch can carry unapproved edits into production.",
      preventive:
        "Lock a single approved artwork version and require revision IDs on all exports.",
    },
    {
      description:
        "Mockup dimensions may not match the final substrate print area.",
      preventive:
        "Cross-check mockup dimensions against production templates before release.",
    },
    {
      description:
        "Color output can shift between design preview and production device profiles.",
      preventive:
        "Apply the correct output ICC profile and approve a calibrated proof before printing.",
    },
    {
      description:
        "Font substitution may alter spacing and alignment in final output files.",
      preventive:
        "Outline fonts or package font assets with a preflight check before handoff.",
    },
    {
      description:
        "Low-resolution linked assets may pixelate at final production scale.",
      preventive:
        "Run preflight for minimum DPI at actual size and replace weak assets before release.",
    },
  ],
  dtf: [
    {
      description: "Adhesive powder cure may be uneven on complex surfaces.",
      preventive:
        "Run a test press and lock curing settings before full production.",
    },
    {
      description:
        "Film humidity may affect transfer quality and crack resistance.",
      preventive:
        "Store films in a dry environment and verify transfer adhesion on sample pieces.",
    },
  ],
  "uv-dtf": [
    {
      description:
        "UV DTF lamination may delaminate on curved or textured substrates.",
      preventive:
        "Validate substrate compatibility and perform adhesion tests on representative samples.",
    },
    {
      description: "Ink curing imbalance may cause brittle transfers.",
      preventive:
        "Calibrate UV intensity and curing passes before mass output.",
    },
  ],
  "uv-printing": [
    {
      description: "UV ink adhesion may fail on untreated substrate surfaces.",
      preventive:
        "Apply surface prep/primer and approve a scratch test before production.",
    },
    {
      description: "Head strike risk increases with warped rigid materials.",
      preventive:
        "Measure substrate flatness and set print head clearance per material batch.",
    },
  ],
  "large-format": [
    {
      description: "Long-run banding may appear due to nozzle inconsistency.",
      preventive:
        "Run nozzle checks and maintenance cycles at scheduled intervals.",
    },
    {
      description:
        "Media stretch can distort final dimensions on large panels.",
      preventive:
        "Use calibrated tension settings and verify dimensions before finishing.",
    },
  ],
  "digital-press": [
    {
      description: "Color drift may occur between batches on digital press.",
      preventive:
        "Create batch color controls and approve first-sheet references for every run.",
    },
    {
      description:
        "Paper humidity variance may cause feed or registration issues.",
      preventive:
        "Condition paper stock and monitor feed alignment through setup prints.",
    },
  ],
  "offset-press": [
    {
      description:
        "Plate registration drift may affect fine text and linework.",
      preventive:
        "Lock registration controls and inspect makeready output before run approval.",
    },
    {
      description:
        "Ink-water balance instability can reduce print consistency.",
      preventive:
        "Standardize fountain settings and monitor densitometer readings per batch.",
    },
  ],
  "screen-printing": [
    {
      description: "Screen tension inconsistency may blur print edges.",
      preventive:
        "Check mesh tension and perform trial pulls before production starts.",
    },
    {
      description: "Incorrect flash cure timing can cause poor layer bonding.",
      preventive:
        "Validate flash cure parameters on production material samples.",
    },
  ],
  "digital-heat-press": [
    {
      description:
        "Heat press temperature variance may cause incomplete transfer.",
      preventive:
        "Calibrate platen temperature and confirm transfer durability with wash tests.",
    },
    {
      description:
        "Pressure variation may leave inconsistent transfer texture.",
      preventive:
        "Set pressure standards by material type and verify on pilot samples.",
    },
  ],
  sublimation: [
    {
      description: "Sublimation color shift may occur across polyester blends.",
      preventive:
        "Profile color per fabric type and approve strike-offs before production.",
    },
    {
      description:
        "Ghosting risk increases if transfer paper shifts during pressing.",
      preventive:
        "Secure transfer sheets and validate fixture method before bulk runs.",
    },
  ],
  embroidery: [
    {
      description: "Thread tension mismatch may pucker lightweight fabrics.",
      preventive:
        "Test stabilization and thread tension on actual garment material first.",
    },
    {
      description:
        "Digitized file density may cause thread breaks on small text.",
      preventive:
        "Review stitch density and run sample sew-out before full production.",
    },
  ],
  engraving: [
    {
      description:
        "Depth inconsistency may occur across mixed material hardness.",
      preventive:
        "Run material-specific power/speed tests and lock settings per substrate.",
    },
    {
      description: "Fine-detail burn risk may reduce readability.",
      preventive:
        "Use preview passes and inspect detail clarity before production batches.",
    },
  ],
  "digital-cutting": [
    {
      description: "Blade wear may produce rough edges on precision cuts.",
      preventive:
        "Track blade life and replace before tolerance-critical production.",
    },
    {
      description:
        "Registration mismatch can offset contour cuts from print guides.",
      preventive:
        "Verify registration marks with a pilot sheet before cutting the full run.",
    },
  ],
  "pvc-id": [
    {
      description:
        "Card lamination bubbles may appear after thermal processing.",
      preventive:
        "Control lamination temperature and inspect sample cards from each batch.",
    },
    {
      description: "Chip/slot placement drift may fail card usability checks.",
      preventive:
        "Use alignment jigs and run dimensional QA before card finishing.",
    },
  ],
  "business-cards": [
    {
      description:
        "Trim drift may cause uneven margins on business card stacks.",
      preventive:
        "Run trim calibration and verify alignment after blade setup.",
    },
    {
      description: "Stack offset during finishing may scuff coated surfaces.",
      preventive:
        "Use protective interleaving and controlled stacking during post-press.",
    },
  ],
  installation: [
    {
      description: "Site surface mismatch may prevent secure installation.",
      preventive:
        "Confirm mounting surface conditions and hardware requirements before dispatch.",
    },
    {
      description: "On-site measurement variance may cause fitment rework.",
      preventive:
        "Perform final site verification and pre-assemble critical parts where possible.",
    },
  ],
  fabrication: [
    {
      description: "Tolerance stacking may cause assembly misalignment.",
      preventive:
        "Introduce first-piece inspection and enforce dimension checkpoints per stage.",
    },
    {
      description: "Weld/finish defects may appear after paint or coating.",
      preventive:
        "Inspect weld quality before finishing and maintain a documented QA checklist.",
    },
  ],
  woodme: [
    {
      description:
        "Wood moisture variance may cause warping after fabrication.",
      preventive:
        "Condition wood stock and measure moisture content before cutting.",
    },
    {
      description: "Surface finish inconsistency may expose grain defects.",
      preventive:
        "Prepare sanding/finishing sequence and approve sample finish panels.",
    },
  ],
  signage: [
    {
      description: "Signage panel bonding may fail under outdoor conditions.",
      preventive:
        "Use outdoor-rated adhesives and validate weather exposure on sample assemblies.",
    },
    {
      description:
        "Illumination uniformity may be inconsistent across sign faces.",
      preventive:
        "Run illumination tests and balance light distribution before final closure.",
    },
  ],
  overseas: [
    {
      description:
        "Overseas production handoff may cause specification mismatch.",
      preventive:
        "Send signed technical specs with visuals and require pre-production samples.",
    },
    {
      description: "International shipment handling may damage finished goods.",
      preventive:
        "Define export-grade packaging specs and confirm them with supplier QA.",
    },
  ],
  "outside-production": [
    {
      description:
        "Third-party process quality may not match internal standards.",
      preventive:
        "Issue clear QC acceptance criteria and require approval samples before full run.",
    },
    {
      description:
        "External lead-time slippage can delay downstream production stages.",
      preventive:
        "Set milestone checkpoints with contingency turnaround options.",
    },
  ],
  "in-house-production": [
    {
      description:
        "Internal capacity saturation may create bottlenecks across machines.",
      preventive:
        "Balance workload by machine availability and set daily capacity caps.",
    },
    {
      description:
        "Shift handover gaps can cause rework on active production jobs.",
      preventive:
        "Use standardized handover checklists and end-of-shift production logs.",
    },
  ],
  "local-outsourcing": [
    {
      description:
        "Local outsourcing quality variance may affect output consistency.",
      preventive:
        "Align on approved sample standards and perform incoming QC at receipt.",
    },
    {
      description:
        "Specification interpretation differences may trigger rework.",
      preventive:
        "Use a signed production brief with measurable acceptance criteria.",
    },
  ],
};

const SHARED_DEPARTMENT_RISK_TEMPLATES = [
  {
    description:
      "Machine/setup parameters may drift between operators or shifts.",
    preventive:
      "Use a signed setup sheet and re-validate first-piece output at every shift change.",
  },
  {
    description:
      "Material batch variation may alter adhesion, color, or finishing consistency.",
    preventive:
      "Run a short batch verification test before committing to full production.",
  },
  {
    description:
      "Rework risk increases when tolerance checkpoints are skipped mid-process.",
    preventive:
      "Add stage-by-stage QC checkpoints with hold points before final finishing.",
  },
  {
    description:
      "Handoff gaps between departments can cause missing specs on active jobs.",
    preventive:
      "Issue a handoff checklist with measurable acceptance criteria for each stage.",
  },
  {
    description:
      "Final finishing/packing can introduce defects if output cure time is rushed.",
    preventive:
      "Enforce minimum cure/drying windows and final inspection before packing.",
  },
  {
    description:
      "Urgent reprioritization may create queue bottlenecks and delayed completion.",
    preventive:
      "Reserve buffer capacity and re-balance machine queues daily for critical jobs.",
  },
];

const stripSentencePeriod = (text) =>
  toText(text)
    .replace(/[.!?\s]+$/, "")
    .trim();

const normalizeRiskItemSubject = (item) => {
  const rawSubject = toText(item?.description) || toText(item?.breakdown);
  if (!rawSubject) return "";
  return rawSubject.replace(/\s+/g, " ").slice(0, 80);
};

const buildProductionItemSubjectsByDepartment = (items = []) => {
  const map = new Map();

  items.forEach((item) => {
    const departmentId = normalizeProductionDepartment(
      item?.department || item?.departmentRaw,
    );
    if (!departmentId) return;

    const subject = normalizeRiskItemSubject(item);
    if (!subject) return;

    if (!map.has(departmentId)) {
      map.set(departmentId, []);
    }

    const existing = map.get(departmentId);
    if (existing.includes(subject)) return;
    if (existing.length >= 3) return;
    existing.push(subject);
  });

  return map;
};

const buildGlobalItemSubjects = (items = []) => {
  const subjects = [];
  const seen = new Set();

  items.forEach((item) => {
    const subject = normalizeRiskItemSubject(item);
    if (!subject) return;

    const key = subject.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    subjects.push(subject);
  });

  return subjects.slice(0, 8);
};

const buildDepartmentScopedFallbackSuggestion = ({
  template,
  departmentLabel,
  itemSubject,
  projectName,
}) => {
  if (!itemSubject) {
    if (projectName) {
      return {
        description: `[${departmentLabel}] ${stripSentencePeriod(template.description)} for "${projectName}".`,
        preventive: `${stripSentencePeriod(template.preventive)} for "${projectName}".`,
      };
    }

    return {
      description: `[${departmentLabel}] ${template.description}`,
      preventive: template.preventive,
    };
  }

  return {
    description: `[${departmentLabel}] ${stripSentencePeriod(template.description)} for "${itemSubject}".`,
    preventive: `${stripSentencePeriod(template.preventive)} for "${itemSubject}".`,
  };
};

const buildFallbackRiskSuggestions = (context) => {
  if (context.productionDepartments.length === 0) {
    return [];
  }

  const fallbackSuggestions = [];
  const itemSubjectsByDepartment = buildProductionItemSubjectsByDepartment(
    context.items,
  );
  const globalItemSubjects = buildGlobalItemSubjects(context.items);
  const globalItemSubjectPool = globalItemSubjects.length
    ? shuffleArray(globalItemSubjects)
    : [];

  context.productionDepartments.forEach((departmentId) => {
    const departmentTemplates =
      PRODUCTION_DEPARTMENT_RISK_TEMPLATES[departmentId] || [];
    const templates = shuffleArray([
      ...departmentTemplates,
      ...SHARED_DEPARTMENT_RISK_TEMPLATES,
    ]);
    const label = PRODUCTION_DEPARTMENT_LABELS[departmentId] || departmentId;
    const departmentItemSubjects =
      itemSubjectsByDepartment.get(departmentId) || [];
    const itemSubjectPool = departmentItemSubjects.length
      ? shuffleArray(departmentItemSubjects)
      : globalItemSubjectPool;

    templates.forEach((template, index) => {
      const itemSubject =
        itemSubjectPool.length > 0
          ? itemSubjectPool[index % itemSubjectPool.length]
          : "";

      fallbackSuggestions.push(
        buildDepartmentScopedFallbackSuggestion({
          template,
          departmentLabel: label,
          itemSubject,
          projectName: context.projectName,
        }),
      );
    });
  });

  const filteredSuggestions = filterExistingRiskSuggestions(
    fallbackSuggestions,
    context.existingRiskDescriptions,
  );

  return shuffleArray(filteredSuggestions).slice(0, MAX_RISK_SUGGESTIONS);
};

const getFetchClient = async () => {
  if (typeof fetch === "function") return fetch;
  const nodeFetch = await import("node-fetch");
  return nodeFetch.default;
};

const buildAiRiskPrompt = (context = {}) => {
  const projectSnapshot = {
    projectType: context.projectType || "Standard",
    priority: context.priority || "Normal",
    projectName: context.projectName || "",
    client: context.client || "",
    briefOverview: context.briefOverview || "",
    timeline: {
      deliveryDate: context.deliveryDate || "",
      deliveryTime: context.deliveryTime || "",
      deliveryLocation: context.deliveryLocation || "",
    },
    execution: {
      contactType: context.contactType || "",
      supplySource: context.supplySource || "",
    },
    productionDepartments: toSafeArray(context.productionDepartmentLabels).slice(
      0,
      12,
    ),
    items: toSafeArray(context.items)
      .slice(0, 12)
      .map((item) => ({
        description: toText(item?.description),
        breakdown: toText(item?.breakdown),
        quantity:
          typeof item?.quantity === "number" && Number.isFinite(item.quantity)
            ? item.quantity
            : null,
        department: toText(item?.departmentRaw || item?.department),
      })),
    uncontrollableFactors: toSafeArray(context.uncontrollableFactors)
      .slice(0, 8)
      .map((factor) => ({
        description: toText(factor?.description),
        responsible: toText(factor?.responsible),
        status: toText(factor?.status),
      })),
    existingRisks: toSafeArray(context.existingRiskDescriptions).slice(0, 15),
  };

  return [
    "Analyze the project snapshot and suggest production execution risks.",
    "Return STRICT JSON only. Do not wrap in markdown.",
    "Required format:",
    '{"suggestions":[{"description":"...","preventive":"..."}]}',
    "",
    "Rules:",
    "- Return 3 to 5 suggestions.",
    "- Each description must be specific to this project (items, departments, timeline, or constraints).",
    "- Each preventive measure must be actionable and directly mitigate its paired risk.",
    "- Keep description <= 160 chars and preventive <= 220 chars.",
    "- Avoid generic wording and avoid repeating/paraphrasing any existing risk.",
    "- Cover different failure points (artwork/specs, production setup, material/process, and schedule/hand-off).",
    "",
    "Project snapshot JSON:",
    JSON.stringify(projectSnapshot, null, 2),
  ].join("\n");
};

const parseJsonSafely = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractJsonPayload = (value = "") => {
  const content = toText(value);
  if (!content) return null;

  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const parsedFenced = parseJsonSafely(fencedMatch[1].trim());
    if (parsedFenced) return parsedFenced;
  }

  const directParsed = parseJsonSafely(content);
  if (directParsed) return directParsed;

  const arrayStart = content.indexOf("[");
  const arrayEnd = content.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const parsedArray = parseJsonSafely(content.slice(arrayStart, arrayEnd + 1));
    if (parsedArray) return parsedArray;
  }

  const objectStart = content.indexOf("{");
  const objectEnd = content.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    const parsedObject = parseJsonSafely(
      content.slice(objectStart, objectEnd + 1),
    );
    if (parsedObject) return parsedObject;
  }

  return null;
};

const parseAiRiskJsonSuggestions = (value = "") => {
  const payload = extractJsonPayload(value);
  if (!payload) return [];

  const rawSuggestions = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.suggestions)
      ? payload.suggestions
      : [];

  return sanitizeRiskSuggestions(rawSuggestions, Number.POSITIVE_INFINITY);
};

const parseRiskLineWithPreventive = (line = "") => {
  const normalized = toText(line).replace(/\s+/g, " ");
  if (!normalized) return null;

  const doublePipe = normalized
    .split("||")
    .map((part) => toText(part))
    .filter(Boolean);
  if (doublePipe.length >= 2) {
    return {
      description: doublePipe[0],
      preventive: doublePipe.slice(1).join(" | "),
    };
  }

  const labeledMatch = normalized.match(
    /^(.*?)(?:\s+(?:\||-)?\s*(?:preventive|mitigation|action)\s*:\s*)(.+)$/i,
  );
  if (labeledMatch) {
    return {
      description: toText(labeledMatch[1]),
      preventive: toText(labeledMatch[2]),
    };
  }

  return {
    description: normalized,
    preventive: inferPreventiveMeasureFromDescription(normalized),
  };
};

const parseAiRiskBulletSuggestions = (value = "") => {
  const content = toText(value).replace(/```/g, "").trim();
  if (!content) return [];

  const bulletPattern = /^\s*(?:[-*]|\u2022|\d+[.)])\s+/;
  const cleanLine = (line) =>
    toText(line)
      .replace(bulletPattern, "")
      .replace(/^risk\s*[:\-]\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();

  const lines = content
    .split(/\r?\n/)
    .map((line) => toText(line))
    .filter(Boolean);

  let candidates = lines
    .filter((line) => bulletPattern.test(line))
    .map(cleanLine)
    .filter(Boolean);

  if (candidates.length === 0) {
    candidates = lines
      .map(cleanLine)
      .filter(
        (line) =>
          line &&
          !/^(project name|project description|timeline|production department|project snapshot|rules|respond as|required format)/i.test(
            line,
          ),
      );
  }

  return candidates
    .map(parseRiskLineWithPreventive)
    .filter((entry) => entry?.description && entry?.preventive);
};

const requestAiRiskSuggestions = async (context) => {
  const apiKey = toText(process.env.OPENAI_API_KEY);
  if (!apiKey || context.productionDepartments.length === 0) return [];

  const fetchClient = await getFetchClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_RISK_TIMEOUT_MS);
  const prompt = buildAiRiskPrompt(context);

  try {
    const response = await fetchClient(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: AI_RISK_MODEL,
          temperature: AI_RISK_TEMPERATURE,
          messages: [
            {
              role: "system",
              content:
                "You are a senior production planner for print and fabrication workflows. Return only valid JSON with concrete, project-specific risk + preventive pairs.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 700,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    const contentText = Array.isArray(content)
      ? content
          .map((part) =>
            typeof part === "string" ? part : toText(part?.text || part?.value),
          )
          .join("")
      : toText(content);

    if (!contentText) return [];

    const parsedJson = parseAiRiskJsonSuggestions(contentText);
    if (parsedJson.length > 0) {
      return sanitizeRiskSuggestions(parsedJson, MAX_RISK_SUGGESTIONS);
    }

    const parsedBullets = parseAiRiskBulletSuggestions(contentText);
    return sanitizeRiskSuggestions(parsedBullets, MAX_RISK_SUGGESTIONS);
  } finally {
    clearTimeout(timeout);
  }
};

const requestOllamaRiskSuggestions = async (context) => {
  if (
    !toText(OLLAMA_RISK_URL) ||
    !toText(OLLAMA_RISK_MODEL) ||
    context.productionDepartments.length === 0
  ) {
    return [];
  }

  const fetchClient = await getFetchClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_RISK_TIMEOUT_MS);
  const prompt = buildAiRiskPrompt(context);

  try {
    const response = await fetchClient(OLLAMA_RISK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_RISK_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: OLLAMA_RISK_TEMPERATURE,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const contentText = toText(data?.response);
    if (!contentText) return [];

    const parsedJson = parseAiRiskJsonSuggestions(contentText);
    if (parsedJson.length > 0) {
      return sanitizeRiskSuggestions(parsedJson, MAX_RISK_SUGGESTIONS);
    }

    const parsedBullets = parseAiRiskBulletSuggestions(contentText);
    return sanitizeRiskSuggestions(parsedBullets, MAX_RISK_SUGGESTIONS);
  } finally {
    clearTimeout(timeout);
  }
};

const isQuoteProject = (project) => project?.projectType === "Quote";
const getBillingDocumentLabel = (project) =>
  isQuoteProject(project) ? "Quote" : "Invoice";
const getProjectDisplayRef = (project) =>
  project?.orderId ||
  project?._id?.toString()?.slice(-6)?.toUpperCase() ||
  "N/A";
const getProjectDisplayName = (project) =>
  project?.details?.projectName || "Unnamed Project";
const formatPaymentTypeLabel = (type = "") => toText(type).replace(/_/g, " ");
const SAMPLE_APPROVAL_BLOCK_CODE = "PRODUCTION_SAMPLE_CLIENT_APPROVAL_REQUIRED";
const SAMPLE_APPROVAL_MISSING_LABEL = "Client sample approval";
const getSampleApprovalStatus = (sampleApproval = {}) => {
  const explicitStatus = toText(sampleApproval?.status).toLowerCase();
  if (explicitStatus === "pending" || explicitStatus === "approved") {
    return explicitStatus;
  }
  if (sampleApproval?.approvedAt || sampleApproval?.approvedBy) {
    return "approved";
  }
  return "pending";
};

const isSampleApprovalRequired = (project = {}) =>
  !isQuoteProject(project) && Boolean(project?.sampleRequirement?.isRequired);

const isSampleApprovalSatisfied = (project = {}) => {
  if (!isSampleApprovalRequired(project)) return true;
  return getSampleApprovalStatus(project?.sampleApproval || {}) === "approved";
};

const getSampleApprovalGuard = (project = {}) => {
  if (!isSampleApprovalRequired(project)) return null;
  if (isSampleApprovalSatisfied(project)) return null;

  return {
    code: SAMPLE_APPROVAL_BLOCK_CODE,
    missing: ["client_sample_approval"],
    message:
      "Client sample approval is required before completing Production stage.",
  };
};

const getProjectProductionDepartmentFilters = (project = {}) => {
  const projectDepartments = toDepartmentArray(project?.departments);
  const productionDepartments = projectDepartments.filter((dept) => {
    const canonical = canonicalizeDepartment(dept);
    return canonical === "production";
  });

  if (productionDepartments.length === 0) {
    return ["Production"];
  }

  return Array.from(new Set(["Production", ...productionDepartments]));
};

const getSampleNotificationRecipients = async (project = {}) => {
  const recipients = new Set();

  const leadId = toObjectIdString(project?.projectLeadId);
  if (leadId) recipients.add(leadId);

  const productionUsers = await User.find({
    department: { $in: getProjectProductionDepartmentFilters(project) },
  })
    .select("_id")
    .lean();
  productionUsers.forEach((entry) => {
    const userId = toObjectIdString(entry?._id);
    if (userId) recipients.add(userId);
  });

  const adminsAndFrontDesk = await User.find({
    $or: [{ role: "admin" }, { department: FRONT_DESK_DEPARTMENT }],
  })
    .select("_id")
    .lean();
  adminsAndFrontDesk.forEach((entry) => {
    const userId = toObjectIdString(entry?._id);
    if (userId) recipients.add(userId);
  });

  return Array.from(recipients);
};

const notifySampleApprovalBlocked = async ({ project, senderId }) => {
  try {
    const projectId = toObjectIdString(project?._id);
    const actorId = toObjectIdString(senderId);
    if (!projectId || !actorId) return;

    const recipients = await getSampleNotificationRecipients(project);
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((recipientId) => toObjectIdString(recipientId))
          .filter(Boolean)
          .filter((recipientId) => recipientId !== actorId),
      ),
    );
    if (!uniqueRecipients.length) return;

    const message = `Caution: project #${getProjectDisplayRef(project)} (${getProjectDisplayName(project)}) is blocked at Production completion. Client sample approval is still pending.`;

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "SYSTEM",
          "Production Sample Approval Required",
          message,
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying sample approval block:", error);
  }
};

const notifySampleApprovalResolved = async ({
  project,
  senderId,
  resolutionNote = "",
}) => {
  try {
    const projectId = toObjectIdString(project?._id);
    const actorId = toObjectIdString(senderId);
    if (!projectId || !actorId) return;

    const recipients = await getSampleNotificationRecipients(project);
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((recipientId) => toObjectIdString(recipientId))
          .filter(Boolean)
          .filter((recipientId) => recipientId !== actorId),
      ),
    );
    if (!uniqueRecipients.length) return;

    const noteText = toText(resolutionNote);
    const message = noteText
      ? `Client sample approval cleared for project #${getProjectDisplayRef(project)} (${getProjectDisplayName(project)}). Production can proceed. ${noteText}`
      : `Client sample approval cleared for project #${getProjectDisplayRef(project)} (${getProjectDisplayName(project)}). Production can proceed.`;

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "SYSTEM",
          "Production Sample Approval Cleared",
          message,
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying sample approval resolution:", error);
  }
};

const buildMockupVersionLabel = (version) => {
  const parsed = Number.parseInt(version, 10);
  const safeVersion = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return `v${safeVersion}`;
};

const buildMockupPendingApprovalUpdateText = () =>
  MOCKUP_PENDING_CLIENT_APPROVAL_UPDATE_TEXT;

const resolveProjectUpdateAuthorId = ({ authorId, project } = {}) => {
  const candidates = [authorId, project?.projectLeadId, project?.createdBy];
  for (const candidate of candidates) {
    const candidateId = toObjectIdString(candidate);
    if (isValidObjectId(candidateId)) {
      return candidateId;
    }
  }
  return "";
};

const createProjectSystemUpdateAndSnapshot = async ({
  project,
  authorId,
  category = "General",
  content = "",
}) => {
  const projectId = toObjectIdString(project?._id);
  const normalizedContent = normalizeProjectUpdateContent(content);
  if (!projectId || !normalizedContent) return null;

  const resolvedAuthorId = resolveProjectUpdateAuthorId({ authorId, project });
  if (!resolvedAuthorId) return null;

  const createdUpdate = await ProjectUpdate.create({
    project: projectId,
    author: resolvedAuthorId,
    category,
    content: normalizedContent,
    attachments: [],
  });

  const snapshotDate = createdUpdate?.createdAt || new Date();
  await Project.findByIdAndUpdate(projectId, {
    $set: {
      endOfDayUpdate: normalizedContent,
      endOfDayUpdateDate: snapshotDate,
      endOfDayUpdateBy: resolvedAuthorId,
    },
  });

  // Keep current response payload in sync without a re-fetch.
  if (project && typeof project === "object") {
    project.endOfDayUpdate = normalizedContent;
    project.endOfDayUpdateDate = snapshotDate;
    project.endOfDayUpdateBy = resolvedAuthorId;
  }

  return createdUpdate;
};

const getMockupApprovalStatus = (approval = {}) => {
  const explicitStatus = toText(approval?.status).toLowerCase();
  if (
    explicitStatus === "pending" ||
    explicitStatus === "approved" ||
    explicitStatus === "rejected"
  ) {
    return explicitStatus;
  }
  if (Boolean(approval?.isApproved)) {
    return "approved";
  }
  if (
    approval?.rejectedAt ||
    approval?.rejectedBy ||
    toText(approval?.rejectionReason)
  ) {
    return "rejected";
  }
  return "pending";
};

const getNormalizedMockupVersions = (project = {}) => {
  const mockup = project?.mockup || {};
  const rawVersions = Array.isArray(mockup.versions) ? mockup.versions : [];

  const versions = rawVersions
    .map((entry, index) => {
      const parsedVersion = Number.parseInt(entry?.version, 10);
      const version =
        Number.isFinite(parsedVersion) && parsedVersion > 0
          ? parsedVersion
          : index + 1;
      const approvalStatus = getMockupApprovalStatus(entry?.clientApproval || {});

      return {
        version,
        fileUrl: toText(entry?.fileUrl),
        fileName: toText(entry?.fileName),
        fileType: toText(entry?.fileType),
        note: toText(entry?.note),
        uploadedBy: entry?.uploadedBy || null,
        uploadedAt: entry?.uploadedAt ? new Date(entry.uploadedAt) : null,
        clientApproval: {
          status: approvalStatus,
          isApproved: approvalStatus === "approved",
          approvedAt: entry?.clientApproval?.approvedAt || null,
          approvedBy: entry?.clientApproval?.approvedBy || null,
          rejectedAt: entry?.clientApproval?.rejectedAt || null,
          rejectedBy: entry?.clientApproval?.rejectedBy || null,
          rejectionReason: toText(entry?.clientApproval?.rejectionReason),
          note: toText(entry?.clientApproval?.note),
        },
      };
    })
    .filter((entry) => entry.fileUrl);

  if (versions.length === 0 && toText(mockup.fileUrl)) {
    const parsedVersion = Number.parseInt(mockup.version, 10);
    const fallbackVersion =
      Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : 1;

    versions.push({
      version: fallbackVersion,
      fileUrl: toText(mockup.fileUrl),
      fileName: toText(mockup.fileName),
      fileType: toText(mockup.fileType),
      note: toText(mockup.note),
      uploadedBy: mockup.uploadedBy || null,
      uploadedAt: mockup.uploadedAt ? new Date(mockup.uploadedAt) : null,
      clientApproval: {
        status: getMockupApprovalStatus(mockup?.clientApproval || {}),
        isApproved: getMockupApprovalStatus(mockup?.clientApproval || {}) === "approved",
        approvedAt: mockup?.clientApproval?.approvedAt || null,
        approvedBy: mockup?.clientApproval?.approvedBy || null,
        rejectedAt: mockup?.clientApproval?.rejectedAt || null,
        rejectedBy: mockup?.clientApproval?.rejectedBy || null,
        rejectionReason: toText(mockup?.clientApproval?.rejectionReason),
        note: toText(mockup?.clientApproval?.note),
      },
    });
  }

  return versions.sort((left, right) => {
    if (left.version !== right.version) return left.version - right.version;
    const leftTime = left.uploadedAt ? left.uploadedAt.getTime() : 0;
    const rightTime = right.uploadedAt ? right.uploadedAt.getTime() : 0;
    return leftTime - rightTime;
  });
};

const getLatestMockupVersion = (project = {}) => {
  const versions = getNormalizedMockupVersions(project);
  return versions.length ? versions[versions.length - 1] : null;
};

const getMockupCompletionGuard = (project = {}) => {
  const latestVersion = getLatestMockupVersion(project);

  if (!latestVersion?.fileUrl) {
    return {
      code: "MOCKUP_FILE_REQUIRED",
      message: "Please upload the mockup before completing this stage.",
      latestVersion: null,
    };
  }

  const approvalStatus = getMockupApprovalStatus(
    latestVersion.clientApproval || {},
  );
  if (approvalStatus === "approved") {
    return null;
  }

  const versionLabel = buildMockupVersionLabel(latestVersion.version);
  if (approvalStatus === "rejected") {
    const rejectionReason = toText(
      latestVersion?.clientApproval?.rejectionReason ||
        latestVersion?.clientApproval?.note,
    );
    const reasonSuffix = rejectionReason ? ` Reason: ${rejectionReason}.` : "";
    return {
      code: "MOCKUP_CLIENT_REJECTED",
      message: `Client rejected mockup ${versionLabel}. Upload a revised version before completing this stage.${reasonSuffix}`,
      latestVersion,
    };
  }

  return {
    code: "MOCKUP_CLIENT_APPROVAL_REQUIRED",
    message: `Client approval is required for mockup ${versionLabel} before completing this stage.`,
    latestVersion,
  };
};

const getMockupNotificationRecipients = async (project = {}) => {
  const recipients = new Set();
  const leadId = toObjectIdString(project?.projectLeadId);
  if (leadId) {
    recipients.add(leadId);
  }

  const adminsAndFrontDesk = await User.find({
    $or: [{ role: "admin" }, { department: FRONT_DESK_DEPARTMENT }],
  })
    .select("_id")
    .lean();

  adminsAndFrontDesk.forEach((entry) => {
    const userId = toObjectIdString(entry?._id);
    if (userId) {
      recipients.add(userId);
    }
  });

  return Array.from(recipients);
};

const notifyMockupVersionUploaded = async ({ project, senderId, version }) => {
  try {
    const projectId = toObjectIdString(project?._id);
    const actorId = toObjectIdString(senderId);
    if (!projectId || !actorId) return;

    const recipients = await getMockupNotificationRecipients(project);
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((recipientId) => toObjectIdString(recipientId))
          .filter(Boolean)
          .filter((recipientId) => recipientId !== actorId),
      ),
    );

    if (!uniqueRecipients.length) return;

    const versionLabel = buildMockupVersionLabel(version);
    const message = `Mockup ${versionLabel} uploaded for project #${getProjectDisplayRef(project)} (${getProjectDisplayName(project)}). Client approval is required before Mockup stage can be completed.`;

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "SYSTEM",
          "Mockup Uploaded",
          message,
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying mockup upload:", error);
  }
};

const notifyMockupCompletionBlocked = async ({
  project,
  senderId,
  version,
  reason = "",
}) => {
  try {
    const projectId = toObjectIdString(project?._id);
    const actorId = toObjectIdString(senderId);
    if (!projectId || !actorId) return;

    const recipients = await getMockupNotificationRecipients(project);
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((recipientId) => toObjectIdString(recipientId))
          .filter(Boolean)
          .filter((recipientId) => recipientId !== actorId),
      ),
    );

    if (!uniqueRecipients.length) return;

    const versionLabel = buildMockupVersionLabel(version);
    const reasonText = toText(reason);
    const message = reasonText
      ? `Caution: project #${getProjectDisplayRef(project)} (${getProjectDisplayName(project)}) is blocked at Mockup completion. Client rejected ${versionLabel}. Reason: ${reasonText}.`
      : `Caution: project #${getProjectDisplayRef(project)} (${getProjectDisplayName(project)}) is blocked at Mockup completion. Client approval is required for ${versionLabel}.`;

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "SYSTEM",
          "Mockup Approval Required",
          message,
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying mockup completion block:", error);
  }
};

const notifyMockupApprovalConfirmed = async ({ project, senderId, version }) => {
  try {
    const projectId = toObjectIdString(project?._id);
    const actorId = toObjectIdString(senderId);
    if (!projectId || !actorId) return;

    const recipients = await getMockupNotificationRecipients(project);
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((recipientId) => toObjectIdString(recipientId))
          .filter(Boolean)
          .filter((recipientId) => recipientId !== actorId),
      ),
    );

    if (!uniqueRecipients.length) return;

    const versionLabel = buildMockupVersionLabel(version);
    const message = `Client approval confirmed for ${versionLabel} on project #${getProjectDisplayRef(project)} (${getProjectDisplayName(project)}). Mockup stage can now proceed.`;

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "SYSTEM",
          "Mockup Approval Confirmed",
          message,
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying mockup approval confirmation:", error);
  }
};

const notifyMockupRejected = async ({
  project,
  senderId,
  version,
  rejectionReason = "",
}) => {
  try {
    const projectId = toObjectIdString(project?._id);
    const actorId = toObjectIdString(senderId);
    if (!projectId || !actorId) return;

    const recipients = await getMockupNotificationRecipients(project);
    const uniqueRecipients = Array.from(
      new Set(
        recipients
          .map((recipientId) => toObjectIdString(recipientId))
          .filter(Boolean)
          .filter((recipientId) => recipientId !== actorId),
      ),
    );

    if (!uniqueRecipients.length) return;

    const versionLabel = buildMockupVersionLabel(version);
    const safeReason = toText(rejectionReason);
    const reasonSuffix = safeReason ? ` Reason: ${safeReason}.` : "";
    const message = `Client rejected ${versionLabel} for project #${getProjectDisplayRef(project)} (${getProjectDisplayName(project)}). Graphics should upload a revised mockup.${reasonSuffix}`;

    await Promise.all(
      uniqueRecipients.map((recipientId) =>
        createNotification(
          recipientId,
          actorId,
          projectId,
          "SYSTEM",
          "Mockup Rejected",
          message,
        ),
      ),
    );
  } catch (error) {
    console.error("Error notifying mockup rejection:", error);
  }
};

const parseBottleneckThresholdDays = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return BOTTLENECK_DEFAULT_DAYS;
  return Math.min(BOTTLENECK_MAX_DAYS, Math.max(BOTTLENECK_MIN_DAYS, parsed));
};

// @desc    Create a new project (Step 1)
// @route   POST /api/projects
// @access  Private
const createProject = async (req, res) => {
  try {
    const {
      orderId, // Optional, can be auto-generated
      orderRef,
      orderDate,
      receivedTime,
      lead,
      client,
      clientEmail, // [NEW]
      clientPhone, // [NEW]
      projectName,
      deliveryDate,
      deliveryTime,
      deliveryLocation,
      contactType,
      supplySource,
      packagingType,
      departments, // [NEW] Step 2
      items, // [NEW] Step 3
      uncontrollableFactors,
      productionRisks,
      projectLeadId, // [NEW] For Admin Assignment
      assistantLeadId, // [NEW] Optional assistant lead
      status, // [NEW] Allow explicit status setting (e.g. "Pending Scope Approval")
      description, // [NEW]
      details, // [NEW]
      workstreamCode,
      sampleRequired,
      corporateEmergency,
    } = req.body;

    // Basic validation
    if (!projectName) {
      return res.status(400).json({ message: "Project name is required" });
    }

    // Verify user is authenticated
    if (!req.user) {
      return res
        .status(401)
        .json({ message: "User not found or not authorized" });
    }

    // Auto-generate orderId if not provided and we are not attaching to an existing orderRef.
    const generatedOrderId = `ORD-${Date.now().toString().slice(-6)}`;

    // Helper to extract value if object
    const getValue = (field) => (field && field.value ? field.value : field);
    const parseMaybeJson = (field) => {
      if (typeof field === "string" && field.trim().startsWith("{")) {
        try {
          return JSON.parse(field);
        } catch (e) {
          return field;
        }
      }
      return field;
    };

    // [NEW] Handle File Uploads (Multiple Fields)
    let sampleImagePath = req.body.existingSampleImage || "";
    let existingAttachments = req.body.existingAttachments;

    // Parse existing attachments if they come as a JSON string
    if (
      typeof existingAttachments === "string" &&
      existingAttachments.startsWith("[")
    ) {
      try {
        existingAttachments = JSON.parse(existingAttachments);
      } catch (e) {
        existingAttachments = [existingAttachments];
      }
    } else if (existingAttachments && !Array.isArray(existingAttachments)) {
      existingAttachments = [existingAttachments];
    }

    let attachmentPaths = Array.isArray(existingAttachments)
      ? existingAttachments
      : [];

    if (req.files) {
      // Handle 'sampleImage' (single file)
      if (req.files.sampleImage && req.files.sampleImage.length > 0) {
        sampleImagePath = `/uploads/${req.files.sampleImage[0].filename}`;
      }

      // Handle 'attachments' (multiple files)
      if (req.files.attachments && req.files.attachments.length > 0) {
        const newAttachments = req.files.attachments.map(
          (file) => `/uploads/${file.filename}`,
        );
        attachmentPaths = [...attachmentPaths, ...newAttachments];
      }
    } else if (req.file) {
      // Fallback for single file upload middleware (if used elsewhere)
      sampleImagePath = `/uploads/${req.file.filename}`;
    }

    // [NEW] Extract time from deliveryDate if deliveryTime is missing
    let finalDeliveryTime = getValue(deliveryTime);
    if (!finalDeliveryTime && deliveryDate && deliveryDate.includes("T")) {
      finalDeliveryTime = new Date(deliveryDate).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    // [NEW] Handle items array (parsing from JSON string if needed for FormData)
    let finalItems = items;
    if (typeof items === "string") {
      try {
        finalItems = JSON.parse(items);
      } catch (e) {
        console.error("Failed to parse items JSON", e);
        finalItems = [];
      }
    }

    // [NEW] Handle quoteDetails parsing (important for Multipart/FormData)
    let finalQuoteDetails = req.body.quoteDetails || {};
    if (typeof finalQuoteDetails === "string") {
      try {
        finalQuoteDetails = JSON.parse(finalQuoteDetails);
      } catch (e) {
        console.error("Failed to parse quoteDetails JSON", e);
      }
    }

    // [NEW] Sync Received Time with creation if not provided
    const now = new Date();
    const currentTime = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const finalReceivedTime = getValue(receivedTime) || currentTime;

    const normalizedAssistantLeadId = getValue(parseMaybeJson(assistantLeadId));
    const normalizedOrderRefId = getValue(parseMaybeJson(orderRef));
    const normalizedSupplySource = normalizeSupplySourceSelection(
      supplySource !== undefined ? supplySource : details?.supplySource,
    );
    const normalizedPackagingType = normalizeOptionalText(
      getValue(
        packagingType !== undefined ? packagingType : details?.packagingType,
      ),
    );
    const normalizedProjectType = toText(req.body.projectType) || "Standard";
    const isCorporateEmergency =
      normalizedProjectType === "Corporate Job" &&
      parseCorporateEmergencyFlag(corporateEmergency, false);
    const isSampleRequired = parseBooleanFlag(sampleRequired, false);
    const finalOrderId =
      normalizeOrderNumber(orderId) || (normalizedOrderRefId ? "" : generatedOrderId);

    const linkedOrder = await ensureOrderRecord({
      orderNumber: finalOrderId,
      orderDate: orderDate || now,
      client,
      clientEmail,
      clientPhone,
      createdBy: req.user._id,
      requestedOrderRefId: normalizedOrderRefId,
    });

    const resolvedOrderId = linkedOrder?.orderNumber || finalOrderId || generatedOrderId;

    // Create project
    const project = new Project({
      orderId: resolvedOrderId,
      orderRef: linkedOrder?._id || null,
      orderDate: orderDate || now,
      receivedTime: finalReceivedTime,
      details: {
        lead: lead?.label || lead?.value || lead, // Prefer label (name) over value (id) for lead
        client, // [NEW] Added client name
        clientEmail, // [NEW] Added client email
        clientPhone, // [NEW] Added client phone
        projectName,
        briefOverview: getValue(req.body.briefOverview) || description, // [NEW] Map briefOverview, fallback to description if legacy
        deliveryDate,
        deliveryTime: finalDeliveryTime, // [NEW]
        deliveryLocation,
        contactType: getValue(contactType) || "None",
        supplySource: normalizedSupplySource,
        packagingType: normalizedPackagingType,
        sampleImage: sampleImagePath, // [NEW]
        attachments: attachmentPaths, // [NEW]
      },
      departments: departments || [],
      items: finalItems || [], // [NEW] Use parsed items
      uncontrollableFactors: uncontrollableFactors || [],
      productionRisks: productionRisks || [],
      currentStep: status ? 1 : 2, // If assigned status provided, likely Step 1 needs completion. Else Step 2.
      status: status || "Order Confirmed", // Default or Explicit
      createdBy: req.user._id,
      projectLeadId: projectLeadId || null,
      assistantLeadId: normalizedAssistantLeadId || null,
      workstreamCode: normalizeOptionalText(workstreamCode),
      // [NEW] Project Type System
      projectType: normalizedProjectType,
      priority:
        req.body.priority ||
        (normalizedProjectType === "Emergency" ? "Urgent" : "Normal"),
      corporateEmergency: {
        isEnabled: isCorporateEmergency,
        updatedAt: isCorporateEmergency ? new Date() : null,
        updatedBy: isCorporateEmergency ? req.user._id : null,
      },
      quoteDetails: finalQuoteDetails,
      updates: req.body.updates || [],
      sampleRequirement: {
        isRequired: isSampleRequired,
        updatedAt: new Date(),
        updatedBy: req.user._id,
      },
      sampleApproval: {
        status: "pending",
        approvedAt: null,
        approvedBy: null,
        note: "",
      },
    });

    // Root project in a lineage starts at version 1 and points to itself.
    project.lineageId = project._id;
    project.parentProjectId = null;
    project.versionNumber = 1;
    project.isLatestVersion = true;
    project.versionState = "active";

    const savedProject = await project.save();

    // Log Activity
    await logActivity(
      savedProject._id,
      req.user.id,
      "create",
      `Created project #${savedProject.orderId || savedProject._id}`,
    );

    // [New] Notify Lead
    if (savedProject.projectLeadId) {
      await createNotification(
        savedProject.projectLeadId,
        req.user._id,
        savedProject._id,
        "ASSIGNMENT",
        "New Project Assigned",
        `Project #${savedProject.orderId}: You have been assigned as the lead for project: ${savedProject.details.projectName}`,
      );
    }

    // [New] Notify Assistant Lead (if provided and different from lead)
    if (
      savedProject.assistantLeadId &&
      (!savedProject.projectLeadId ||
        savedProject.assistantLeadId.toString() !==
          savedProject.projectLeadId.toString())
    ) {
      await createNotification(
        savedProject.assistantLeadId,
        req.user._id,
        savedProject._id,
        "ASSIGNMENT",
        "Assistant Lead Assigned",
        `Project #${savedProject.orderId}: You have been added as an assistant lead for project: ${savedProject.details.projectName}`,
      );
    }

    // [New] Notify Admins (if creator is not admin)
    if (req.user.role !== "admin") {
      await notifyAdmins(
        req.user._id,
        savedProject._id,
        "SYSTEM",
        "New Project Created",
        `${req.user.firstName} ${req.user.lastName} created a new project #${savedProject.orderId || savedProject._id}: ${savedProject.details.projectName}`,
      );
    }

    res.status(201).json(savedProject);
  } catch (error) {
    console.error("Error creating project:", error);
    // [DEBUG] Log full validation error details
    if (error.name === "ValidationError") {
      console.error(
        "Validation Details:",
        JSON.stringify(error.errors, null, 2),
      );
      return res.status(400).json({
        message: "Validation Error",
        error: error.message,
        details: error.errors,
      });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res) => {
  try {
    const { query } = buildProjectAccessQuery(req);
    const groupByOrder =
      String(req.query.groupBy || "").toLowerCase() === "order";
    const collapseRevisions =
      String(req.query.collapseRevisions || "true").toLowerCase() !== "false";

    const projects = await Project.find(query)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName")
      .populate("assistantLeadId", "firstName lastName employeeId email")
      .populate("endOfDayUpdateBy", "firstName lastName department")
      .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone")
      .sort({ createdAt: -1 });

    if (groupByOrder) {
      const groups = buildOrderGroups(projects, { collapseRevisions });
      return res.json(groups);
    }

    res.json(projects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    // DEBUG LOGGING
    const fs = require("fs");
    const path = require("path");
    const logPath = path.join(__dirname, "../../error_log.txt");
    fs.appendFileSync(
      logPath,
      `${new Date().toISOString()} - Error fetching projects: ${error.stack}\n`,
    );
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get projects currently bottlenecked in a stage
// @route   GET /api/projects/bottlenecks/stage
// @access  Private (Admin portal)
const getStageBottlenecks = async (req, res) => {
  try {
    if (!hasAdminPortalAccess(req.user)) {
      return res.status(403).json({
        message:
          "Access denied: this bottleneck feed is restricted to admin portal users.",
      });
    }

    const thresholdDays = parseBottleneckThresholdDays(req.query?.days);
    const thresholdMs = thresholdDays * DAY_IN_MS;
    const nowMs = Date.now();

    const projects = await Project.find({
      status: { $nin: Array.from(BOTTLENECK_EXCLUDED_STATUSES) },
      "cancellation.isCancelled": { $ne: true },
      $or: [{ "hold.isOnHold": { $exists: false } }, { "hold.isOnHold": false }],
    })
      .select("_id orderId details.projectName status hold createdAt")
      .lean();

    if (!projects.length) {
      return res.json({
        thresholdDays,
        total: 0,
        bottlenecks: [],
      });
    }

    const projectIds = projects.map((project) => project?._id).filter(Boolean);
    const stageEntries = await ActivityLog.aggregate([
      {
        $match: {
          project: { $in: projectIds },
          action: "status_change",
        },
      },
      {
        $group: {
          _id: {
            project: "$project",
            to: "$details.statusChange.to",
          },
          latestAt: { $max: "$createdAt" },
        },
      },
    ]);

    const stageEntryMap = new Map();
    stageEntries.forEach((entry) => {
      const projectId = entry?._id?.project ? String(entry._id.project) : "";
      const statusKey = toText(entry?._id?.to);
      const latestAt = entry?.latestAt;
      if (!projectId || !statusKey || !latestAt) return;
      stageEntryMap.set(`${projectId}|${statusKey}`, new Date(latestAt));
    });

    const bottlenecks = [];

    projects.forEach((project) => {
      if (project?.hold?.isOnHold || project?.status === HOLD_STATUS) return;

      const projectId = project?._id ? String(project._id) : "";
      const status = toText(project?.status);
      if (!projectId || !status) return;

      const stageEnteredAtValue =
        stageEntryMap.get(`${projectId}|${status}`) || project?.createdAt;
      if (!stageEnteredAtValue) return;

      const stageEnteredAt = new Date(stageEnteredAtValue);
      const stageEnteredMs = stageEnteredAt.getTime();
      if (!Number.isFinite(stageEnteredMs)) return;

      const elapsedMs = nowMs - stageEnteredMs;
      if (elapsedMs < thresholdMs) return;

      bottlenecks.push({
        projectId,
        orderId: toText(project?.orderId) || "N/A",
        projectName: toText(project?.details?.projectName) || "Unnamed Project",
        status,
        stageEnteredAt,
        daysInStage: Math.floor(elapsedMs / DAY_IN_MS),
      });
    });

    bottlenecks.sort((a, b) => {
      if (b.daysInStage !== a.daysInStage) return b.daysInStage - a.daysInStage;
      return new Date(a.stageEnteredAt).getTime() - new Date(b.stageEnteredAt).getTime();
    });

    return res.json({
      thresholdDays,
      total: bottlenecks.length,
      bottlenecks,
    });
  } catch (error) {
    console.error("Error fetching stage bottlenecks:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get grouped orders for accessible projects
// @route   GET /api/projects/orders
// @access  Private
const getOrderGroups = async (req, res) => {
  try {
    const { query } = buildProjectAccessQuery(req);
    const collapseRevisions =
      String(req.query.collapseRevisions || "true").toLowerCase() !== "false";

    const projects = await Project.find(query)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName")
      .populate("assistantLeadId", "firstName lastName employeeId email")
      .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone")
      .sort({ createdAt: -1 });

    const groups = buildOrderGroups(projects, { collapseRevisions });
    res.json(groups);
  } catch (error) {
    console.error("Error fetching grouped orders:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get one grouped order by order number
// @route   GET /api/projects/orders/:orderNumber
// @access  Private
const getOrderGroupByNumber = async (req, res) => {
  try {
    const orderNumber = normalizeOrderNumber(
      decodeURIComponent(req.params.orderNumber || ""),
    );
    if (!orderNumber) {
      return res.status(400).json({ message: "orderNumber is required." });
    }

    const { query, canSeeAll } = buildProjectAccessQuery(req);
    const conditions = [{ orderId: orderNumber }];
    if (query && Object.keys(query).length > 0) {
      conditions.push(query);
    }
    const scopedQuery = conditions.length === 1 ? conditions[0] : { $and: conditions };

    const findGroupedProjects = (criteria) =>
      Project.find(criteria)
        .populate("createdBy", "firstName lastName")
        .populate("projectLeadId", "firstName lastName")
        .populate("assistantLeadId", "firstName lastName employeeId email")
        .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone")
        .sort({ createdAt: -1 });

    const accessibleProjects = await findGroupedProjects(scopedQuery);

    if (accessibleProjects.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }

    let projects = accessibleProjects;

    // For client portal users, once they are authorized on at least one project in the
    // order group, return the full group so cross-project lead assignments are visible.
    if (!canSeeAll) {
      const orderRefIds = Array.from(
        new Set(
          accessibleProjects
            .map((project) => toObjectIdString(project?.orderRef))
            .filter(Boolean),
        ),
      );
      const orderScopeConditions = [{ orderId: orderNumber }];
      if (orderRefIds.length > 0) {
        orderScopeConditions.push({ orderRef: { $in: orderRefIds } });
      }

      const visibilityConditions = [];
      const cancelledOnly =
        String(req.query.cancelled || "").toLowerCase() === "true";
      const includeCancelled =
        String(req.query.includeCancelled || "").toLowerCase() === "true";

      if (cancelledOnly) {
        visibilityConditions.push({ "cancellation.isCancelled": true });
      } else if (!includeCancelled) {
        visibilityConditions.push({ "cancellation.isCancelled": { $ne: true } });
      }

      const expandedConditions = [
        { $or: orderScopeConditions },
        ...visibilityConditions,
      ];
      const expandedQuery =
        expandedConditions.length === 1
          ? expandedConditions[0]
          : { $and: expandedConditions };

      const expandedProjects = await findGroupedProjects(expandedQuery);
      if (expandedProjects.length > 0) {
        projects = expandedProjects;
      }
    }

    const groups = buildOrderGroups(projects, {
      collapseRevisions:
        String(req.query.collapseRevisions || "true").toLowerCase() !== "false",
    });
    const group = groups.find((entry) => entry.orderNumber === orderNumber);

    if (!group) {
      return res.status(404).json({ message: "Order not found." });
    }

    res.json(group);
  } catch (error) {
    console.error("Error fetching grouped order:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get user project stats
// @route   GET /api/projects/stats
// @access  Private
const getUserStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Count all projects where user is the Lead or Assistant Lead
    const totalProjects = await Project.countDocuments({
      $or: [{ projectLeadId: userId }, { assistantLeadId: userId }],
    });

    // Count completed projects where user is the Lead or Assistant Lead
    const completedProjects = await Project.countDocuments({
      $or: [{ projectLeadId: userId }, { assistantLeadId: userId }],
      status: { $in: ["Completed", "Finished"] },
    });

    // Estimate hours: 8 hours per completed project (mock calculation)
    const hoursLogged = completedProjects * 8;

    res.json({
      totalProjects,
      completedProjects,
      hoursLogged,
    });
  } catch (error) {
    console.error("Error fetching project stats:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get project by ID
// @route   GET /api/projects/:id
// @access  Private
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName employeeId email")
      .populate("assistantLeadId", "firstName lastName employeeId email")
      .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone");

    if (project) {
      // Access Check: Admin OR Project Lead
      const isLead =
        project.projectLeadId &&
        (project.projectLeadId._id.toString() === req.user._id.toString() ||
          project.projectLeadId.toString() === req.user._id.toString());

      const isAssistant =
        project.assistantLeadId &&
        (project.assistantLeadId._id?.toString() === req.user._id.toString() ||
          project.assistantLeadId.toString() === req.user._id.toString());

      if (req.user.role !== "admin" && !isLead && !isAssistant) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this project" });
      }

      res.json(project);
    } else {
      res.status(404).json({ message: "Project not found" });
    }
  } catch (error) {
    console.error("Error fetching project by ID:", error);
    if (error.kind === "ObjectId") {
      res.status(404).json({ message: "Project not found" });
    } else {
      res.status(500).json({ message: "Server Error" });
    }
  }
};

// @desc    Add item to project
// @route   POST /api/projects/:id/items
// @access  Private
const addItemToProject = async (req, res) => {
  try {
    const { description, breakdown, qty } = req.body;

    // Basic validation
    if (!description || !qty) {
      return res
        .status(400)
        .json({ message: "Description and Quantity are required" });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    const newItem = {
      description,
      breakdown: breakdown || "",
      qty: Number(qty),
    };

    project.items.push(newItem);
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.items = new Date();
    await project.save();

    await logActivity(
      project._id,
      req.user.id,
      "item_add",
      `Added order item: ${description} (Qty: ${qty})`,
      { item: newItem },
    );

    // Notify Admins
    await notifyAdmins(
      req.user.id,
      project._id,
      "UPDATE",
      "Project Item Added",
      `${req.user.firstName} added an item to project #${project.orderId}: ${description} (Qty: ${qty})`,
    );

    res.json(project);
  } catch (error) {
    console.error("Error adding item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update item in project
// @route   PATCH /api/projects/:id/items/:itemId
// @access  Private
const updateItemInProject = async (req, res) => {
  try {
    const { description, breakdown, qty } = req.body;
    const { id, itemId } = req.params;

    const projectForAccess = await Project.findById(id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "manage")) return;

    const project = await Project.findOneAndUpdate(
      { _id: id, "items._id": itemId },
      {
        $set: {
          "items.$.description": description,
          "items.$.breakdown": breakdown,
          "items.$.qty": Number(qty),
          "sectionUpdates.items": new Date(),
        },
      },
      { new: true, runValidators: false },
    );

    if (!project) {
      return res.status(404).json({ message: "Project or Item not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "item_update",
      `Updated order item: ${description}`,
      { itemId, description, qty },
    );

    // Notify Admins
    await notifyAdmins(
      req.user.id,
      id,
      "UPDATE",
      "Project Item Updated",
      `${req.user.firstName} updated an item in project #${project.orderId || id}: ${description}`,
    );

    res.json(project);
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete item from project
// @route   DELETE /api/projects/:id/items/:itemId
// @access  Private
const deleteItemFromProject = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const project = await Project.findById(id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    // Pull item from array
    project.items.pull({ _id: itemId });
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.items = new Date();
    await project.save();

    await logActivity(id, req.user.id, "item_delete", `Deleted order item`, {
      itemId,
    });

    // Notify Admins
    await notifyAdmins(
      req.user.id,
      id,
      "UPDATE",
      "Project Item Deleted",
      `${req.user.firstName} deleted an item from project #${project.orderId || id}`,
    );

    res.json(project);
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update project departments
// @route   PUT /api/projects/:id/departments
// @access  Private
const updateProjectDepartments = async (req, res) => {
  try {
    const { departments } = req.body; // Expecting array of strings
    const { id } = req.params;

    const project = await Project.findById(id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    const oldDepartments = project.departments || [];
    const newDepartments = departments || [];

    // Reset acknowledgements for removed departments
    // If a department is no longer in the engaged list, remove its acknowledgement
    project.acknowledgements = (project.acknowledgements || []).filter((ack) =>
      newDepartments.includes(ack.department),
    );

    // Identify newly added departments
    const addedDepartments = newDepartments.filter(
      (dept) => !oldDepartments.includes(dept),
    );

    project.departments = newDepartments;
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.departments = new Date();

    await project.save();

    await logActivity(
      id,
      req.user.id,
      "departments_update",
      `Updated engaged departments`,
      { departments },
    );

    // Notify newly added departments
    if (addedDepartments.length > 0) {
      // Find all users who are in any of the newly added departments
      const usersToNotify = await User.find({
        department: { $in: addedDepartments },
      });

      for (const dept of addedDepartments) {
        // Find users specifically in THIS department
        const deptUsers = usersToNotify.filter((u) =>
          u.department?.includes(dept),
        );

        for (const targetUser of deptUsers) {
          // Avoid notifying the person who made the change if they happen to be in that dept
          if (targetUser._id.toString() === req.user.id.toString()) continue;

          await createNotification(
            targetUser._id,
            req.user.id,
            project._id,
            "UPDATE",
            "New Project Engagement",
            `Your department (${dept}) has been engaged on project #${project.orderId || project._id.slice(-6).toUpperCase()}: ${project.details?.projectName || "Unnamed Project"}`,
          );
        }
      }
    }

    // Notify Admins of Department Update
    await notifyAdmins(
      req.user.id,
      id,
      "UPDATE",
      "Departments Updated",
      `${req.user.firstName} updated engaged departments for project #${project.orderId || project._id}: ${newDepartments.join(", ")}`,
    );

    res.json(project);
  } catch (error) {
    console.error("Error updating departments:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Put a project on hold or release hold
// @route   PATCH /api/projects/:id/hold
// @access  Private (Admin only)
const setProjectHold = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Only admins can place or release a project hold.",
      });
    }

    const { onHold, reason, releaseStatus } = req.body;

    if (typeof onHold !== "boolean") {
      return res
        .status(400)
        .json({ message: "`onHold` must be provided as a boolean." });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    const now = new Date();
    const oldStatus = project.status;
    const alreadyOnHold =
      Boolean(project.hold?.isOnHold) || project.status === HOLD_STATUS;
    const normalizedReason =
      typeof reason === "string" ? reason.trim() : project.hold?.reason || "";

    if (onHold) {
      if (!alreadyOnHold) {
        project.hold = {
          ...(project.hold?.toObject?.() || {}),
          isOnHold: true,
          reason: normalizedReason,
          heldAt: now,
          heldBy: req.user._id,
          previousStatus:
            oldStatus && oldStatus !== HOLD_STATUS
              ? oldStatus
              : DEFAULT_RELEASE_STATUS,
          releasedAt: null,
          releasedBy: null,
        };
        project.status = HOLD_STATUS;
      } else {
        project.hold = {
          ...(project.hold?.toObject?.() || {}),
          isOnHold: true,
          reason: normalizedReason,
          heldAt: project.hold?.heldAt || now,
          heldBy: project.hold?.heldBy || req.user._id,
          previousStatus:
            project.hold?.previousStatus || DEFAULT_RELEASE_STATUS,
          releasedAt: null,
          releasedBy: null,
        };
      }

      const savedProject = await project.save();

      if (!alreadyOnHold && oldStatus !== HOLD_STATUS) {
        await logActivity(
          savedProject._id,
          req.user._id,
          "status_change",
          "Project was put on hold.",
          {
            statusChange: { from: oldStatus, to: HOLD_STATUS },
            hold: { reason: normalizedReason || null },
          },
        );
      }

      const directlyNotifiedUserIds = new Set();

      if (savedProject.projectLeadId) {
        await createNotification(
          savedProject.projectLeadId,
          req.user._id,
          savedProject._id,
          "SYSTEM",
          "Project Put On Hold",
          `Project #${savedProject.orderId || savedProject._id} is now on hold${normalizedReason ? `: ${normalizedReason}` : "."}`,
        );
        directlyNotifiedUserIds.add(savedProject.projectLeadId.toString());
      }

      if (
        savedProject.assistantLeadId &&
        savedProject.assistantLeadId.toString() !==
          savedProject.projectLeadId?.toString()
      ) {
        await createNotification(
          savedProject.assistantLeadId,
          req.user._id,
          savedProject._id,
          "SYSTEM",
          "Project Put On Hold",
          `Project #${savedProject.orderId || savedProject._id} is now on hold${normalizedReason ? `: ${normalizedReason}` : "."}`,
        );
        directlyNotifiedUserIds.add(savedProject.assistantLeadId.toString());
      }

      await notifyAdmins(
        req.user._id,
        savedProject._id,
        "SYSTEM",
        "Project Put On Hold",
        `${req.user.firstName} ${req.user.lastName} put project #${savedProject.orderId || savedProject._id} on hold${normalizedReason ? `: ${normalizedReason}` : "."}`,
        { excludeUserIds: Array.from(directlyNotifiedUserIds) },
      );

      const populatedProject = await Project.findById(savedProject._id)
        .populate("createdBy", "firstName lastName")
        .populate("projectLeadId", "firstName lastName employeeId email")
        .populate("assistantLeadId", "firstName lastName employeeId email");

      return res.json(populatedProject);
    }

    if (!alreadyOnHold) {
      return res.status(400).json({ message: "Project is not on hold." });
    }

    const requestedStatus =
      typeof releaseStatus === "string" ? releaseStatus.trim() : "";
    let nextStatus =
      requestedStatus || project.hold?.previousStatus || DEFAULT_RELEASE_STATUS;

    if (!HOLDABLE_STATUSES.has(nextStatus)) {
      nextStatus = DEFAULT_RELEASE_STATUS;
    }

    project.status = nextStatus;
    project.hold = {
      ...(project.hold?.toObject?.() || {}),
      isOnHold: false,
      reason: normalizedReason,
      releasedAt: now,
      releasedBy: req.user._id,
    };

    const savedProject = await project.save();

    await logActivity(
      savedProject._id,
      req.user._id,
      "status_change",
      `Project hold released. Status restored to ${nextStatus}.`,
      {
        statusChange: { from: oldStatus, to: nextStatus },
        hold: { reason: normalizedReason || null },
      },
    );

    const directlyNotifiedUserIds = new Set();

    if (savedProject.projectLeadId) {
      await createNotification(
        savedProject.projectLeadId,
        req.user._id,
        savedProject._id,
        "SYSTEM",
        "Project Hold Released",
        `Project #${savedProject.orderId || savedProject._id} has been released from hold and is now ${nextStatus}.`,
      );
      directlyNotifiedUserIds.add(savedProject.projectLeadId.toString());
    }

    if (
      savedProject.assistantLeadId &&
      savedProject.assistantLeadId.toString() !==
        savedProject.projectLeadId?.toString()
    ) {
      await createNotification(
        savedProject.assistantLeadId,
        req.user._id,
        savedProject._id,
        "SYSTEM",
        "Project Hold Released",
        `Project #${savedProject.orderId || savedProject._id} has been released from hold and is now ${nextStatus}.`,
      );
      directlyNotifiedUserIds.add(savedProject.assistantLeadId.toString());
    }

    await notifyAdmins(
      req.user._id,
      savedProject._id,
      "SYSTEM",
      "Project Hold Released",
      `${req.user.firstName} ${req.user.lastName} released hold on project #${savedProject.orderId || savedProject._id}. Restored status: ${nextStatus}.`,
      { excludeUserIds: Array.from(directlyNotifiedUserIds) },
    );

    const populatedProject = await Project.findById(savedProject._id)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName employeeId email")
      .populate("assistantLeadId", "firstName lastName employeeId email");

    return res.json(populatedProject);
  } catch (error) {
    console.error("Error updating project hold state:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Cancel and freeze a project
// @route   PATCH /api/projects/:id/cancel
// @access  Private (Admin portal only)
const cancelProject = async (req, res) => {
  try {
    if (!hasAdminPortalAccess(req.user) || !isAdminPortalRequest(req)) {
      return res.status(403).json({
        message:
          "Only Administration admins can cancel projects from the admin portal.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "cancel")) return;

    if (project.cancellation?.isCancelled) {
      return res.status(400).json({
        message: "Project is already cancelled.",
      });
    }

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const now = new Date();
    const resumedStatus = project.status || DEFAULT_RELEASE_STATUS;
    const resumedHoldState = project.hold?.toObject
      ? project.hold.toObject()
      : project.hold || null;

    project.cancellation = {
      ...(project.cancellation?.toObject?.() || {}),
      isCancelled: true,
      reason,
      cancelledAt: now,
      cancelledBy: req.user._id,
      resumedStatus,
      resumedHoldState,
      reactivatedAt: null,
      reactivatedBy: null,
    };

    const savedProject = await project.save();

    await logActivity(
      savedProject._id,
      req.user._id,
      "status_change",
      "Project was cancelled and frozen.",
      {
        cancellation: {
          isCancelled: true,
          reason: reason || null,
          resumedStatus,
        },
      },
    );

    const notifiedUsers = new Set();

    if (savedProject.projectLeadId) {
      await createNotification(
        savedProject.projectLeadId,
        req.user._id,
        savedProject._id,
        "SYSTEM",
        "Project Cancelled",
        `Project #${savedProject.orderId || savedProject._id} has been cancelled${reason ? `: ${reason}` : "."}`,
      );
      notifiedUsers.add(savedProject.projectLeadId.toString());
    }

    if (
      savedProject.assistantLeadId &&
      savedProject.assistantLeadId.toString() !==
        savedProject.projectLeadId?.toString()
    ) {
      await createNotification(
        savedProject.assistantLeadId,
        req.user._id,
        savedProject._id,
        "SYSTEM",
        "Project Cancelled",
        `Project #${savedProject.orderId || savedProject._id} has been cancelled${reason ? `: ${reason}` : "."}`,
      );
      notifiedUsers.add(savedProject.assistantLeadId.toString());
    }

    await notifyAdmins(
      req.user._id,
      savedProject._id,
      "SYSTEM",
      "Project Cancelled",
      `${req.user.firstName} ${req.user.lastName} cancelled project #${savedProject.orderId || savedProject._id}${reason ? `: ${reason}` : "."}`,
      { excludeUserIds: Array.from(notifiedUsers) },
    );

    const populatedProject = await Project.findById(savedProject._id)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName employeeId email")
      .populate("assistantLeadId", "firstName lastName employeeId email");

    return res.json(populatedProject);
  } catch (error) {
    console.error("Error cancelling project:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Reactivate a cancelled project and resume previous stage
// @route   PATCH /api/projects/:id/reactivate
// @access  Private (Admin portal only)
const reactivateProject = async (req, res) => {
  try {
    if (!hasAdminPortalAccess(req.user) || !isAdminPortalRequest(req)) {
      return res.status(403).json({
        message:
          "Only Administration admins can reactivate projects from the admin portal.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "reactivate")) return;

    if (!project.cancellation?.isCancelled) {
      return res.status(400).json({
        message: "Project is not cancelled.",
      });
    }

    const now = new Date();
    const resumedStatus =
      typeof project.cancellation?.resumedStatus === "string" &&
      project.cancellation.resumedStatus.trim()
        ? project.cancellation.resumedStatus.trim()
        : project.status || DEFAULT_RELEASE_STATUS;
    const resumedHoldState =
      project.cancellation?.resumedHoldState &&
      typeof project.cancellation.resumedHoldState === "object"
        ? project.cancellation.resumedHoldState
        : null;

    project.status = resumedStatus;
    if (resumedHoldState) {
      project.hold = {
        ...(project.hold?.toObject?.() || {}),
        ...resumedHoldState,
      };
    }

    project.cancellation = {
      ...(project.cancellation?.toObject?.() || {}),
      isCancelled: false,
      reason: "",
      cancelledAt: null,
      cancelledBy: null,
      resumedStatus: resumedStatus,
      resumedHoldState: resumedHoldState,
      reactivatedAt: now,
      reactivatedBy: req.user._id,
    };

    const savedProject = await project.save();

    await logActivity(
      savedProject._id,
      req.user._id,
      "status_change",
      `Project reactivated and resumed at ${resumedStatus}.`,
      {
        cancellation: {
          isCancelled: false,
          resumedStatus,
        },
      },
    );

    const notifiedUsers = new Set();

    if (savedProject.projectLeadId) {
      await createNotification(
        savedProject.projectLeadId,
        req.user._id,
        savedProject._id,
        "SYSTEM",
        "Project Reactivated",
        `Project #${savedProject.orderId || savedProject._id} has been reactivated and resumed at ${resumedStatus}.`,
      );
      notifiedUsers.add(savedProject.projectLeadId.toString());
    }

    if (
      savedProject.assistantLeadId &&
      savedProject.assistantLeadId.toString() !==
        savedProject.projectLeadId?.toString()
    ) {
      await createNotification(
        savedProject.assistantLeadId,
        req.user._id,
        savedProject._id,
        "SYSTEM",
        "Project Reactivated",
        `Project #${savedProject.orderId || savedProject._id} has been reactivated and resumed at ${resumedStatus}.`,
      );
      notifiedUsers.add(savedProject.assistantLeadId.toString());
    }

    await notifyAdmins(
      req.user._id,
      savedProject._id,
      "SYSTEM",
      "Project Reactivated",
      `${req.user.firstName} ${req.user.lastName} reactivated project #${savedProject.orderId || savedProject._id}. Resumed at ${resumedStatus}.`,
      { excludeUserIds: Array.from(notifiedUsers) },
    );

    const populatedProject = await Project.findById(savedProject._id)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName employeeId email")
      .populate("assistantLeadId", "firstName lastName employeeId email");

    return res.json(populatedProject);
  } catch (error) {
    console.error("Error reactivating project:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update project status
// @route   PATCH /api/projects/:id/status
// @access  Private (Admin or permitted departments)
const updateProjectStatus = async (req, res) => {
  try {
    const { status: newStatus } = req.body;
    if (!newStatus) {
      return res.status(400).json({ message: "Status is required" });
    }

    if (newStatus === HOLD_STATUS) {
      return res.status(400).json({
        message: "Use the project hold endpoint to put this project on hold.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "status")) return;

    const oldStatus = project.status;
    const isAdmin = req.user.role === "admin";
    const allowBillingOverride =
      Boolean(req.body?.allowBillingOverride) && isAdmin;

    // Project Lead can transition from "Completed" to "Finished".
    const isLead =
      project.projectLeadId &&
      project.projectLeadId.toString() === req.user.id.toString();
    const isFinishing =
      project.status === "Completed" && newStatus === "Finished";
    const adminOnlyStageCompletions = new Set([
      "Proof Reading Completed",
      "Quality Control Completed",
    ]);
    const adminOnlyStagePrerequisites = {
      "Proof Reading Completed": "Pending Proof Reading",
      "Quality Control Completed": "Pending Quality Control",
    };

    if (adminOnlyStageCompletions.has(newStatus)) {
      if (!isAdmin) {
        return res.status(403).json({
          message:
            "Only admins can validate this stage in the admin portal.",
        });
      }
      if (!isAdminPortalRequest(req)) {
        return res.status(403).json({
          message:
            "This stage can only be validated from the admin portal.",
        });
      }

      const requiredStatus = adminOnlyStagePrerequisites[newStatus];
      if (requiredStatus && project.status !== requiredStatus) {
        return res.status(400).json({
          message: `Status must be '${requiredStatus}' before completing this stage.`,
        });
      }
    }

    // Department-based allowed completions
    const deptActions = [
      {
        dept: "Graphics/Design",
        from: "Pending Mockup",
        to: "Mockup Completed",
      },
      {
        dept: "Production",
        from: "Pending Production",
        to: "Production Completed",
      },
      {
        dept: "Photography",
        from: "Pending Photography",
        to: "Photography Completed",
      },
      {
        dept: "Stores",
        from: "Pending Packaging",
        to: "Packaging Completed",
      },
      {
        dept: "Front Desk",
        from: "Pending Delivery/Pickup",
        to: "Delivered",
      },
      {
        dept: "Front Desk",
        from: "Pending Feedback",
        to: "Feedback Completed",
      },
    ];

    if (!isAdmin && !isFinishing) {
      const userDepts = req.user.department || [];
      const deptAction = deptActions.find(
        (action) => userDepts.includes(action.dept) && newStatus === action.to,
      );

      if (!deptAction) {
        return res.status(403).json({
          message:
            "Not authorized to update this status. Admins can update all statuses, and departments can only complete their assigned stage.",
        });
      }

      if (project.status !== deptAction.from) {
        return res.status(400).json({
          message: `Status must be '${deptAction.from}' before completing this stage.`,
        });
      }
    }

    if (newStatus === "Mockup Completed") {
      const mockupGuard = getMockupCompletionGuard(project);
      if (mockupGuard) {
        if (
          mockupGuard.code === "MOCKUP_CLIENT_APPROVAL_REQUIRED" ||
          mockupGuard.code === "MOCKUP_CLIENT_REJECTED"
        ) {
          await notifyMockupCompletionBlocked({
            project,
            senderId: req.user._id || req.user.id,
            version: mockupGuard.latestVersion?.version,
            reason: mockupGuard.latestVersion?.clientApproval?.rejectionReason,
          });
        }

        return res.status(400).json({
          code: mockupGuard.code,
          targetStatus: "Mockup Completed",
          latestVersion: mockupGuard.latestVersion
            ? {
                version: mockupGuard.latestVersion.version,
                fileUrl: mockupGuard.latestVersion.fileUrl,
                fileName: mockupGuard.latestVersion.fileName,
                clientApproval: {
                  status: getMockupApprovalStatus(
                    mockupGuard.latestVersion?.clientApproval || {},
                  ),
                  rejectionReason: toText(
                    mockupGuard.latestVersion?.clientApproval?.rejectionReason,
                  ),
                },
              }
            : null,
          message: mockupGuard.message,
        });
      }
    }

    if (newStatus === "Production Completed") {
      const sampleGuard = getSampleApprovalGuard(project);
      if (sampleGuard) {
        await notifySampleApprovalBlocked({
          project,
          senderId: req.user._id || req.user.id,
        });

        return res.status(400).json({
          code: sampleGuard.code,
          targetStatus: "Production Completed",
          missing: sampleGuard.missing,
          message: sampleGuard.message,
        });
      }
    }

    if (newStatus === "Departmental Engagement Completed") {
      const missingAcknowledgements = getMissingDepartmentAcknowledgements(project);
      if (missingAcknowledgements.length > 0) {
        return res.status(400).json({
          message: `All engaged departments must acknowledge before completing Departmental Engagement. Pending: ${missingAcknowledgements.join(", ")}.`,
        });
      }
    }

    // Status progression map: when a stage is marked complete, auto-advance to next pending
    const statusProgression = {
      // Standard workflow
      "Scope Approval Completed": "Pending Departmental Engagement",
      "Mockup Completed": "Pending Proof Reading",
      "Proof Reading Completed": "Pending Production",
      "Production Completed": "Pending Quality Control",
      "Quality Control Completed": "Pending Photography",
      "Photography Completed": "Pending Packaging",
      "Packaging Completed": "Pending Delivery/Pickup",
      Delivered: "Pending Feedback",
      // Quote workflow
      "Quote Request Completed": "Pending Send Response",
    };

    // If the selected status has an auto-advancement, use it
    const finalStatus = statusProgression[newStatus] || newStatus;

    const isStandardProject = !isQuoteProject(project);

    const requiresPendingProductionBillingGuard =
      isStandardProject && finalStatus === "Pending Production";

    if (requiresPendingProductionBillingGuard) {
      const missing = getPendingProductionBillingMissing(project);
      if (missing.length > 0) {
        const message = buildBillingRequirementMessage(
          "Pending Production",
          missing,
        );

        if (!allowBillingOverride) {
          await notifyBillingPrerequisiteBlocked({
            project,
            senderId: req.user._id || req.user.id,
            targetStatus: "Pending Production",
            missing,
          });

          return res.status(400).json({
            code: "BILLING_PREREQUISITE_MISSING",
            targetStatus: "Pending Production",
            missing,
            message,
          });
        }

        await logActivity(
          project._id,
          req.user.id,
          "update",
          `Billing override used while moving project toward Pending Production.`,
          {
            billingOverride: {
              targetStatus: "Pending Production",
              missing,
            },
          },
        );

        await notifyBillingOverrideUsed({
          project,
          senderId: req.user._id || req.user.id,
          targetStatus: "Pending Production",
          missing,
        });
      }
    }

    const requiresPendingDeliveryBillingGuard =
      isStandardProject && finalStatus === "Pending Delivery/Pickup";

    if (requiresPendingDeliveryBillingGuard) {
      const missing = getPendingDeliveryBillingMissing(project);
      if (missing.length > 0) {
        const message = buildBillingRequirementMessage(
          "Pending Delivery/Pickup",
          missing,
        );

        if (!allowBillingOverride) {
          await notifyBillingPrerequisiteBlocked({
            project,
            senderId: req.user._id || req.user.id,
            targetStatus: "Pending Delivery/Pickup",
            missing,
          });

          return res.status(400).json({
            code: "BILLING_PREREQUISITE_MISSING",
            targetStatus: "Pending Delivery/Pickup",
            missing,
            message,
          });
        }

        await logActivity(
          project._id,
          req.user.id,
          "update",
          `Billing override used while moving project toward Pending Delivery/Pickup.`,
          {
            billingOverride: {
              targetStatus: "Pending Delivery/Pickup",
              missing,
            },
          },
        );

        await notifyBillingOverrideUsed({
          project,
          senderId: req.user._id || req.user.id,
          targetStatus: "Pending Delivery/Pickup",
          missing,
        });
      }
    }

    project.status = finalStatus;
    await project.save();

    // Log Activity
    if (oldStatus !== finalStatus) {
      await logActivity(
        project._id,
        req.user.id,
        "status_change",
        `Project status updated to ${finalStatus}`,
        {
          statusChange: { from: oldStatus, to: finalStatus },
        },
      );

      // Notify Admins (if not sender)
      await notifyAdmins(
        req.user.id,
        project._id,
        "SYSTEM",
        "Project Status Updated",
        `Project #${project.orderId || project._id} status changed to ${finalStatus} by ${req.user.firstName}`,
      );
    }

    // Notify Lead when mockup is marked complete
    if (newStatus === "Mockup Completed" && project.projectLeadId) {
      await createNotification(
        project.projectLeadId,
        req.user._id,
        project._id,
        "UPDATE",
        "Mockup Completed",
        `Project #${project.orderId || project._id.slice(-6).toUpperCase()}: Mockup has been completed and is ready for proof reading.`,
      );
    }

    // Notify Production team when production becomes pending
    if (finalStatus === "Pending Production" && oldStatus !== finalStatus) {
      const sampleGuard = getSampleApprovalGuard(project);
      if (sampleGuard) {
        await createProjectSystemUpdateAndSnapshot({
          project,
          authorId: req.user._id || req.user.id,
          category: "Client",
          content: SAMPLE_PENDING_CLIENT_APPROVAL_UPDATE_TEXT,
        });
      }

      const productionUsers = await User.find({
        department: { $in: getProjectProductionDepartmentFilters(project) },
      });
      for (const prodUser of productionUsers) {
        await createNotification(
          prodUser._id,
          req.user._id,
          project._id,
          "UPDATE",
          sampleGuard
            ? "Production Caution"
            : "Production Ready",
          sampleGuard
            ? `Project #${project.orderId || project._id.slice(-6).toUpperCase()}: client sample approval is pending. Complete sample approval before mass production.`
            : `Project #${project.orderId || project._id.slice(-6).toUpperCase()}: Approved mockup is ready and production can begin.`,
        );
      }
    }

    res.json(project);
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Mark invoice sent for a project
// @route   POST /api/projects/:id/invoice-sent
// @access  Private (Admin or Front Desk)
const markInvoiceSent = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to mark invoice as sent.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    const billingDocumentLabel = getBillingDocumentLabel(project);
    const billingGuardBefore = getBillingGuardMissingByTarget(project);

    if (project.invoice?.sent) {
      return res.status(400).json({
        message: `${billingDocumentLabel} already marked as sent.`,
      });
    }

    project.invoice = {
      sent: true,
      sentAt: new Date(),
      sentBy: req.user._id,
    };
    const billingGuardAfter = getBillingGuardMissingByTarget(project);

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      `${billingDocumentLabel} marked as sent.`,
      { invoice: { sent: true } },
    );

    await notifyBillingOptionChange({
      project,
      senderId: req.user._id,
      title: `${billingDocumentLabel} Sent`,
      message: `${billingDocumentLabel} sent for project #${getProjectDisplayRef(project)}: ${getProjectDisplayName(project)}`,
    });

    await notifyClearedBillingGuardTargets({
      project,
      senderId: req.user._id,
      beforeState: billingGuardBefore,
      afterState: billingGuardAfter,
      resolutionNote: `Resolved by ${billingDocumentLabel.toLowerCase()} confirmation.`,
    });

    res.json(project);
  } catch (error) {
    console.error("Error marking invoice sent:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Verify payment for a project
// @route   POST /api/projects/:id/payment-verification
// @access  Private (Admin or Front Desk)
const verifyPayment = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to verify payments.",
      });
    }

    const { type } = req.body;
    if (!type || !PAYMENT_TYPES.has(type)) {
      return res.status(400).json({ message: "Invalid payment type." });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    if (isQuoteProject(project)) {
      return res.status(400).json({
        message: "Payment verification is not required for quote projects.",
      });
    }

    const billingGuardBefore = getBillingGuardMissingByTarget(project);

    const existing = (project.paymentVerifications || []).find(
      (entry) => entry.type === type,
    );
    if (existing) {
      return res
        .status(400)
        .json({ message: "Payment type already verified." });
    }

    project.paymentVerifications.push({
      type,
      verifiedAt: new Date(),
      verifiedBy: req.user._id,
    });
    const billingGuardAfter = getBillingGuardMissingByTarget(project);

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      `Payment verified: ${type}.`,
      { paymentVerification: { type } },
    );

    await notifyBillingOptionChange({
      project,
      senderId: req.user._id,
      title: "Payment Verified",
      message: `Payment verified (${formatPaymentTypeLabel(type)}) for project #${getProjectDisplayRef(project)}: ${getProjectDisplayName(project)}`,
    });

    await notifyClearedBillingGuardTargets({
      project,
      senderId: req.user._id,
      beforeState: billingGuardBefore,
      afterState: billingGuardAfter,
      resolutionNote: `Resolved by payment verification (${formatPaymentTypeLabel(type)}).`,
    });

    res.json(project);
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Undo invoice sent for a project
// @route   POST /api/projects/:id/invoice-sent/undo
// @access  Private (Admin or Front Desk)
const undoInvoiceSent = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to undo invoice status.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    const billingDocumentLabel = getBillingDocumentLabel(project);

    if (!project.invoice?.sent) {
      return res.status(400).json({
        message: `${billingDocumentLabel} is not marked as sent.`,
      });
    }

    project.invoice = {
      sent: false,
      sentAt: null,
      sentBy: null,
    };

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      `${billingDocumentLabel} status reset.`,
      { invoice: { sent: false } },
    );

    await notifyBillingOptionChange({
      project,
      senderId: req.user._id,
      title: `${billingDocumentLabel} Status Reset`,
      message: `${billingDocumentLabel} status reset for project #${getProjectDisplayRef(project)}: ${getProjectDisplayName(project)}`,
    });

    res.json(project);
  } catch (error) {
    console.error("Error undoing invoice sent:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Undo payment verification for a project
// @route   POST /api/projects/:id/payment-verification/undo
// @access  Private (Admin or Front Desk)
const undoPaymentVerification = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to undo payment verification.",
      });
    }

    const { type } = req.body;
    if (!type || !PAYMENT_TYPES.has(type)) {
      return res.status(400).json({ message: "Invalid payment type." });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    if (isQuoteProject(project)) {
      return res.status(400).json({
        message: "Payment verification is not required for quote projects.",
      });
    }

    const existingIndex = (project.paymentVerifications || []).findIndex(
      (entry) => entry.type === type,
    );

    if (existingIndex === -1) {
      return res
        .status(400)
        .json({ message: "Payment verification not found." });
    }

    project.paymentVerifications.splice(existingIndex, 1);
    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      `Payment verification removed (${type}).`,
      { paymentVerification: { type, removed: true } },
    );

    await notifyBillingOptionChange({
      project,
      senderId: req.user._id,
      title: "Payment Verification Removed",
      message: `Payment verification removed (${formatPaymentTypeLabel(type)}) for project #${getProjectDisplayRef(project)}: ${getProjectDisplayName(project)}`,
    });

    res.json(project);
  } catch (error) {
    console.error("Error undoing payment verification:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Toggle sample requirement for a project
// @route   PATCH /api/projects/:id/sample-requirement
// @access  Private (Admin only)
const updateSampleRequirement = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Only admins can toggle sample requirements.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    if (isQuoteProject(project)) {
      return res.status(400).json({
        message: "Sample requirement is not available for quote projects.",
      });
    }

    const nextRequired = parseBooleanFlag(
      req.body?.isRequired,
      Boolean(project?.sampleRequirement?.isRequired),
    );
    const previousRequired = Boolean(project?.sampleRequirement?.isRequired);
    const previousGuard = getSampleApprovalGuard(project);

    if (nextRequired === previousRequired) {
      return res.json(project);
    }

    project.sampleRequirement = {
      ...(project.sampleRequirement || {}),
      isRequired: nextRequired,
      updatedAt: new Date(),
      updatedBy: req.user._id,
    };

    if (nextRequired) {
      const currentStatus = getSampleApprovalStatus(project?.sampleApproval || {});
      if (currentStatus !== "approved") {
        project.sampleApproval = {
          status: "pending",
          approvedAt: null,
          approvedBy: null,
          note: "",
        };
      }
    }

    const currentStatus = getSampleApprovalStatus(project?.sampleApproval || {});
    if (!nextRequired && currentStatus !== "approved") {
      project.sampleApproval = {
        ...(project.sampleApproval || {}),
        status: "pending",
        approvedAt: null,
        approvedBy: null,
        note: "",
      };
    }

    await project.save();

    const nextGuard = getSampleApprovalGuard(project);
    const requirementActionLabel = nextRequired ? "enabled" : "disabled";
    const sampleApprovalStatus = getSampleApprovalStatus(
      project?.sampleApproval || {},
    );
    const updateText =
      !nextRequired || sampleApprovalStatus === "approved"
        ? SAMPLE_APPROVED_BY_CLIENT_UPDATE_TEXT
        : SAMPLE_PENDING_CLIENT_APPROVAL_UPDATE_TEXT;

    await logActivity(
      project._id,
      req.user._id,
      "update",
      `Sample requirement ${requirementActionLabel}.`,
      {
        sampleRequirement: {
          previousRequired,
          nextRequired,
          approvalStatus: getSampleApprovalStatus(project?.sampleApproval || {}),
        },
      },
    );

    await createProjectSystemUpdateAndSnapshot({
      project,
      authorId: req.user._id || req.user.id,
      category: "Client",
      content: updateText,
    });

    if (!previousGuard && nextGuard) {
      await notifySampleApprovalBlocked({
        project,
        senderId: req.user._id || req.user.id,
      });
    }

    if (previousGuard && !nextGuard) {
      await notifySampleApprovalResolved({
        project,
        senderId: req.user._id || req.user.id,
        resolutionNote: "Sample requirement was turned off by admin.",
      });
    }

    res.json(project);
  } catch (error) {
    console.error("Error toggling sample requirement:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Confirm client sample approval for production
// @route   POST /api/projects/:id/sample-approval/confirm
// @access  Private (Front Desk or Admin)
const confirmProjectSampleApproval = async (req, res) => {
  try {
    if (!canManageSampleApproval(req.user)) {
      return res.status(403).json({
        message: "Not authorized to confirm sample approval.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    if (isQuoteProject(project)) {
      return res.status(400).json({
        message: "Sample approval is not required for quote projects.",
      });
    }

    if (!isSampleApprovalRequired(project)) {
      return res.status(400).json({
        message: "Sample requirement is currently turned off for this project.",
      });
    }

    const previousGuard = getSampleApprovalGuard(project);
    const currentStatus = getSampleApprovalStatus(project?.sampleApproval || {});
    if (currentStatus === "approved") {
      return res.status(400).json({
        message: "Client sample approval has already been confirmed.",
      });
    }

    project.sampleApproval = {
      ...(project.sampleApproval || {}),
      status: "approved",
      approvedAt: new Date(),
      approvedBy: req.user._id,
      note: toText(req.body?.note),
    };

    await project.save();
    const nextGuard = getSampleApprovalGuard(project);

    await logActivity(
      project._id,
      req.user._id,
      "update",
      "Client sample approval confirmed.",
      {
        sampleApproval: {
          status: "approved",
          approvedAt: project.sampleApproval?.approvedAt || null,
        },
      },
    );

    await createProjectSystemUpdateAndSnapshot({
      project,
      authorId: req.user._id || req.user.id,
      category: "Client",
      content: SAMPLE_APPROVED_BY_CLIENT_UPDATE_TEXT,
    });

    if (previousGuard && !nextGuard) {
      await notifySampleApprovalResolved({
        project,
        senderId: req.user._id || req.user.id,
      });
    }

    res.json(project);
  } catch (error) {
    console.error("Error confirming sample approval:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Reset client sample approval to pending
// @route   POST /api/projects/:id/sample-approval/reset
// @access  Private (Front Desk or Admin)
const resetProjectSampleApproval = async (req, res) => {
  try {
    if (!canManageSampleApproval(req.user)) {
      return res.status(403).json({
        message: "Not authorized to reset sample approval.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    if (isQuoteProject(project)) {
      return res.status(400).json({
        message: "Sample approval is not required for quote projects.",
      });
    }

    if (!isSampleApprovalRequired(project)) {
      return res.status(400).json({
        message: "Sample requirement is currently turned off for this project.",
      });
    }

    const previousGuard = getSampleApprovalGuard(project);
    const currentStatus = getSampleApprovalStatus(project?.sampleApproval || {});
    if (currentStatus !== "approved") {
      return res.status(400).json({
        message: "Sample approval is already pending.",
      });
    }

    project.sampleApproval = {
      ...(project.sampleApproval || {}),
      status: "pending",
      approvedAt: null,
      approvedBy: null,
      note: "",
    };

    await project.save();
    const nextGuard = getSampleApprovalGuard(project);

    await logActivity(
      project._id,
      req.user._id,
      "update",
      "Client sample approval reset to pending.",
      {
        sampleApproval: {
          status: "pending",
          resetBy: req.user._id,
        },
      },
    );

    await createProjectSystemUpdateAndSnapshot({
      project,
      authorId: req.user._id || req.user.id,
      category: "Client",
      content: SAMPLE_PENDING_CLIENT_APPROVAL_UPDATE_TEXT,
    });

    if (!previousGuard && nextGuard) {
      await notifySampleApprovalBlocked({
        project,
        senderId: req.user._id || req.user.id,
      });
    }

    res.json(project);
  } catch (error) {
    console.error("Error resetting sample approval:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Toggle corporate emergency flag for a corporate project
// @route   PATCH /api/projects/:id/corporate-emergency
// @access  Private (Admin portal only)
const updateCorporateEmergency = async (req, res) => {
  try {
    if (req.user.role !== "admin" || !isAdminPortalRequest(req)) {
      return res.status(403).json({
        message:
          "Only admins in the admin portal can toggle Corporate Emergency.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    if (project.projectType !== "Corporate Job") {
      return res.status(400).json({
        message:
          "Corporate Emergency is only available for Corporate Job projects.",
      });
    }

    const previousEnabled = Boolean(project?.corporateEmergency?.isEnabled);
    const nextEnabled = parseCorporateEmergencyFlag(
      req.body?.isEnabled,
      previousEnabled,
    );

    if (previousEnabled === nextEnabled) {
      return res.json(project);
    }

    project.corporateEmergency = {
      ...(project.corporateEmergency || {}),
      isEnabled: nextEnabled,
      updatedAt: new Date(),
      updatedBy: req.user._id,
    };

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      nextEnabled
        ? "Corporate Emergency enabled."
        : "Corporate Emergency disabled.",
      {
        corporateEmergency: {
          previousEnabled,
          nextEnabled,
        },
      },
    );

    res.json(project);
  } catch (error) {
    console.error("Error toggling corporate emergency:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Change project type / convert quote to project workflow
// @route   PATCH /api/projects/:id/project-type
// @access  Private (Admin portal only)
const updateProjectType = async (req, res) => {
  try {
    if (!hasAdminPortalAccess(req.user) || !isAdminPortalRequest(req)) {
      return res.status(403).json({
        message:
          "Only Administration admins can change project types from the admin portal.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    if (project?.cancellation?.isCancelled) {
      return res.status(400).json({
        message:
          "Cancelled projects are frozen. Reactivate the project before changing type.",
      });
    }

    const previousType = normalizeProjectType(project.projectType, "Standard");
    const rawTargetType = toText(req.body?.targetType);
    if (rawTargetType && !PROJECT_TYPE_VALUES.has(rawTargetType)) {
      return res.status(400).json({
        message: "Invalid project type selected.",
      });
    }
    const requestedType = normalizeProjectType(rawTargetType, previousType);
    const requestedStatus = toText(req.body?.targetStatus || req.body?.status);
    const previousStatus = toText(project.status);

    let nextStatus = "";
    if (requestedStatus) {
      if (!isStatusCompatibleWithProjectType(requestedStatus, requestedType)) {
        return res.status(400).json({
          code: "PROJECT_TYPE_STATUS_MISMATCH",
          message: `Status '${requestedStatus}' is not valid for project type '${requestedType}'.`,
          allowedStatuses: getAllowedStatusesForProjectType(requestedType),
        });
      }
      nextStatus = requestedStatus;
    } else if (isStatusCompatibleWithProjectType(previousStatus, requestedType)) {
      nextStatus = previousStatus;
    } else {
      nextStatus = getDefaultStatusForProjectType(requestedType);
    }

    const requestedPriority = normalizePriority(
      req.body?.priority,
      normalizePriority(project.priority, "Normal"),
    );
    const nextPriority =
      requestedType === "Emergency" ? "Urgent" : requestedPriority;

    const previousPriority = normalizePriority(project.priority, "Normal");
    const previousSampleRequired = Boolean(project?.sampleRequirement?.isRequired);
    const previousCorporateEmergency = Boolean(project?.corporateEmergency?.isEnabled);

    const requestedSampleRequired = parseBooleanFlag(
      req.body?.sampleRequired,
      previousSampleRequired,
    );
    const nextSampleRequired =
      requestedType === "Quote" ? false : requestedSampleRequired;

    const requestedCorporateEmergency = parseCorporateEmergencyFlag(
      req.body?.corporateEmergency,
      previousCorporateEmergency,
    );
    const nextCorporateEmergency =
      requestedType === "Corporate Job" ? requestedCorporateEmergency : false;

    const reason = toText(req.body?.reason);
    const now = new Date();
    const hadTypeChange = previousType !== requestedType;
    const hadStatusChange = previousStatus !== nextStatus;
    const hadPriorityChange = previousPriority !== nextPriority;
    const hadSampleRequirementChange =
      previousSampleRequired !== nextSampleRequired;
    const hadCorporateEmergencyChange =
      previousCorporateEmergency !== nextCorporateEmergency;

    if (
      !hadTypeChange &&
      !hadStatusChange &&
      !hadPriorityChange &&
      !hadSampleRequirementChange &&
      !hadCorporateEmergencyChange
    ) {
      const populatedProject = await Project.findById(project._id)
        .populate("createdBy", "firstName lastName")
        .populate("projectLeadId", "firstName lastName employeeId email")
        .populate("assistantLeadId", "firstName lastName employeeId email");
      return res.json(populatedProject);
    }

    project.projectType = requestedType;
    project.status = nextStatus;
    project.priority = nextPriority;
    project.sampleRequirement = {
      ...(project.sampleRequirement?.toObject?.() || project.sampleRequirement || {}),
      isRequired: nextSampleRequired,
      updatedAt: now,
      updatedBy: req.user._id,
    };
    project.corporateEmergency = {
      ...(project.corporateEmergency?.toObject?.() || project.corporateEmergency || {}),
      isEnabled: nextCorporateEmergency,
      updatedAt: now,
      updatedBy: req.user._id,
    };

    if (nextSampleRequired) {
      const currentSampleStatus = getSampleApprovalStatus(project?.sampleApproval || {});
      if (currentSampleStatus !== "approved") {
        project.sampleApproval = {
          ...(project.sampleApproval?.toObject?.() || project.sampleApproval || {}),
          status: "pending",
          approvedAt: null,
          approvedBy: null,
          note: toText(project?.sampleApproval?.note),
        };
      }
    }

    const savedProject = await project.save();

    await logActivity(
      savedProject._id,
      req.user._id,
      "update",
      hadTypeChange
        ? `Project type changed from ${previousType} to ${requestedType}.`
        : "Project type settings updated.",
      {
        projectTypeChange: {
          fromType: previousType,
          toType: requestedType,
          fromStatus: previousStatus,
          toStatus: nextStatus,
          fromPriority: previousPriority,
          toPriority: nextPriority,
          sampleRequired: {
            from: previousSampleRequired,
            to: nextSampleRequired,
          },
          corporateEmergency: {
            from: previousCorporateEmergency,
            to: nextCorporateEmergency,
          },
          reason: reason || null,
        },
      },
    );

    if (hadStatusChange) {
      await logActivity(
        savedProject._id,
        req.user._id,
        "status_change",
        `Project status updated to ${nextStatus} after type ${hadTypeChange ? "conversion" : "update"}.`,
        {
          statusChange: {
            from: previousStatus,
            to: nextStatus,
            causedByTypeChange: hadTypeChange,
          },
        },
      );
    }

    const summaryBits = [
      hadTypeChange ? `${previousType} -> ${requestedType}` : null,
      hadStatusChange ? `Status: ${previousStatus} -> ${nextStatus}` : null,
      hadSampleRequirementChange
        ? `Sample Required: ${nextSampleRequired ? "ON" : "OFF"}`
        : null,
      hadCorporateEmergencyChange
        ? `Corporate Emergency: ${nextCorporateEmergency ? "ON" : "OFF"}`
        : null,
    ].filter(Boolean);
    const summaryText = summaryBits.length
      ? summaryBits.join(" | ")
      : "Project type settings updated.";

    const notifiedUserIds = new Set();

    if (savedProject.projectLeadId) {
      await createNotification(
        savedProject.projectLeadId,
        req.user._id,
        savedProject._id,
        "SYSTEM",
        hadTypeChange ? "Project Type Changed" : "Project Type Settings Updated",
        `Project #${savedProject.orderId || savedProject._id}: ${summaryText}`,
      );
      notifiedUserIds.add(savedProject.projectLeadId.toString());
    }

    if (
      savedProject.assistantLeadId &&
      savedProject.assistantLeadId.toString() !==
        savedProject.projectLeadId?.toString()
    ) {
      await createNotification(
        savedProject.assistantLeadId,
        req.user._id,
        savedProject._id,
        "SYSTEM",
        hadTypeChange ? "Project Type Changed" : "Project Type Settings Updated",
        `Project #${savedProject.orderId || savedProject._id}: ${summaryText}`,
      );
      notifiedUserIds.add(savedProject.assistantLeadId.toString());
    }

    await notifyAdmins(
      req.user._id,
      savedProject._id,
      "SYSTEM",
      hadTypeChange ? "Project Type Changed" : "Project Type Settings Updated",
      `${req.user.firstName} ${req.user.lastName} updated project #${savedProject.orderId || savedProject._id}: ${summaryText}`,
      { excludeUserIds: Array.from(notifiedUserIds) },
    );

    const populatedProject = await Project.findById(savedProject._id)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName employeeId email")
      .populate("assistantLeadId", "firstName lastName employeeId email");

    res.json(populatedProject);
  } catch (error) {
    console.error("Error changing project type:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Upload approved mockup file for a project
// @route   POST /api/projects/:id/mockup
// @access  Private (Graphics/Design or Admin)
const uploadProjectMockup = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Mockup file is required" });
    }

    const project = await Project.findById(id);
    if (!ensureProjectMutationAccess(req, res, project, "mockup")) return;

    const userDepts = Array.isArray(req.user.department)
      ? req.user.department
      : req.user.department
        ? [req.user.department]
        : [];
    const isAdmin = req.user.role === "admin";
    const isGraphics = userDepts.includes("Graphics/Design");

    if (!isAdmin && !isGraphics) {
      return res
        .status(403)
        .json({ message: "Not authorized to upload mockups" });
    }

    if (project.status !== "Pending Mockup") {
      return res.status(400).json({
        message:
          "Mockup upload is only allowed while status is Pending Mockup.",
      });
    }

    const existingVersions = Array.isArray(project?.mockup?.versions)
      ? [...project.mockup.versions]
      : [];
    if (existingVersions.length === 0 && project?.mockup?.fileUrl) {
      const legacyVersionRaw = Number.parseInt(project.mockup.version, 10);
      const legacyVersion =
        Number.isFinite(legacyVersionRaw) && legacyVersionRaw > 0
          ? legacyVersionRaw
          : 1;
      existingVersions.push({
        version: legacyVersion,
        fileUrl: project.mockup.fileUrl,
        fileName: project.mockup.fileName,
        fileType: project.mockup.fileType,
        note: project.mockup.note || "",
        uploadedBy: project.mockup.uploadedBy || null,
        uploadedAt: project.mockup.uploadedAt || null,
        clientApproval: {
          status: getMockupApprovalStatus(project.mockup?.clientApproval || {}),
          isApproved: Boolean(project.mockup?.clientApproval?.isApproved),
          approvedAt: project.mockup?.clientApproval?.approvedAt || null,
          approvedBy: project.mockup?.clientApproval?.approvedBy || null,
          rejectedAt: project.mockup?.clientApproval?.rejectedAt || null,
          rejectedBy: project.mockup?.clientApproval?.rejectedBy || null,
          rejectionReason: project.mockup?.clientApproval?.rejectionReason || "",
          note: project.mockup?.clientApproval?.note || "",
        },
      });
    }

    const highestVersion = existingVersions.reduce((maxVersion, entry) => {
      const parsedVersion = Number.parseInt(entry?.version, 10);
      if (!Number.isFinite(parsedVersion) || parsedVersion <= 0) {
        return maxVersion;
      }
      return Math.max(maxVersion, parsedVersion);
    }, 0);

    const nextVersion = highestVersion + 1;
    const uploadedAt = new Date();
    const versionEntry = {
      version: nextVersion,
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      note: (note || "").trim(),
      uploadedBy: req.user._id,
      uploadedAt,
      clientApproval: {
        status: "pending",
        isApproved: false,
        approvedAt: null,
        approvedBy: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: "",
        note: "",
      },
    };

    const mergedVersions = [...existingVersions, versionEntry].sort(
      (left, right) => {
        const leftVersion = Number.parseInt(left?.version, 10) || 0;
        const rightVersion = Number.parseInt(right?.version, 10) || 0;
        return leftVersion - rightVersion;
      },
    );

    project.mockup = {
      fileUrl: versionEntry.fileUrl,
      fileName: versionEntry.fileName,
      fileType: versionEntry.fileType,
      note: versionEntry.note,
      uploadedBy: versionEntry.uploadedBy,
      uploadedAt: versionEntry.uploadedAt,
      version: nextVersion,
      clientApproval: {
        status: "pending",
        isApproved: false,
        approvedAt: null,
        approvedBy: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: "",
        note: "",
        approvedVersion: null,
      },
      versions: mergedVersions,
    };

    await project.save();

    await createProjectSystemUpdateAndSnapshot({
      project,
      authorId: req.user._id || req.user.id,
      category: "Graphics",
      content: buildMockupPendingApprovalUpdateText(nextVersion),
    });

    await logActivity(
      project._id,
      req.user._id,
      "mockup_upload",
      `Mockup ${buildMockupVersionLabel(nextVersion)} uploaded.`,
      {
        mockup: {
          version: nextVersion,
          fileUrl: project.mockup.fileUrl,
          note: project.mockup.note,
        },
      },
    );

    await notifyMockupVersionUploaded({
      project,
      senderId: req.user._id,
      version: nextVersion,
    });

    res.json(project);
  } catch (error) {
    console.error("Error uploading mockup:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Confirm client approval for latest mockup version
// @route   POST /api/projects/:id/mockup/approve
// @access  Private (Front Desk or Admin)
const approveProjectMockup = async (req, res) => {
  try {
    if (!canManageMockupApproval(req.user)) {
      return res.status(403).json({
        message: "Not authorized to approve mockups.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "mockup")) return;

    const normalizedVersions = getNormalizedMockupVersions(project);
    if (!normalizedVersions.length) {
      return res.status(400).json({
        message: "No mockup has been uploaded yet.",
      });
    }

    const latestVersion = normalizedVersions[normalizedVersions.length - 1];
    const requestedVersionRaw = Number.parseInt(req.body?.version, 10);
    const requestedVersion =
      Number.isFinite(requestedVersionRaw) && requestedVersionRaw > 0
        ? requestedVersionRaw
        : latestVersion.version;

    if (requestedVersion !== latestVersion.version) {
      return res.status(400).json({
        message: `Only the latest mockup version (${buildMockupVersionLabel(latestVersion.version)}) can be approved.`,
      });
    }

    const requestedVersionLabel = buildMockupVersionLabel(requestedVersion);
    const approvalNote = toText(req.body?.note);

    project.mockup = project.mockup || {};
    if (!Array.isArray(project.mockup.versions)) {
      project.mockup.versions = [];
    }

    if (project.mockup.versions.length === 0 && project.mockup.fileUrl) {
      project.mockup.versions.push({
        version: latestVersion.version,
        fileUrl: project.mockup.fileUrl,
        fileName: project.mockup.fileName,
        fileType: project.mockup.fileType,
        note: project.mockup.note || "",
        uploadedBy: project.mockup.uploadedBy || null,
        uploadedAt: project.mockup.uploadedAt || null,
        clientApproval: {
          status: getMockupApprovalStatus(project.mockup?.clientApproval || {}),
          isApproved: Boolean(project.mockup?.clientApproval?.isApproved),
          approvedAt: project.mockup?.clientApproval?.approvedAt || null,
          approvedBy: project.mockup?.clientApproval?.approvedBy || null,
          rejectedAt: project.mockup?.clientApproval?.rejectedAt || null,
          rejectedBy: project.mockup?.clientApproval?.rejectedBy || null,
          rejectionReason: project.mockup?.clientApproval?.rejectionReason || "",
          note: project.mockup?.clientApproval?.note || "",
        },
      });
    }

    const versionEntry = project.mockup.versions.find((entry) => {
      const parsed = Number.parseInt(entry?.version, 10);
      return Number.isFinite(parsed) && parsed === requestedVersion;
    });

    if (!versionEntry?.fileUrl) {
      return res.status(400).json({
        message: "Selected mockup version is not available.",
      });
    }

    if (versionEntry?.clientApproval?.isApproved) {
      return res.status(400).json({
        message: `Mockup ${requestedVersionLabel} is already approved.`,
      });
    }

    const approvedAt = new Date();
    const approvalState = {
      status: "approved",
      isApproved: true,
      approvedAt,
      approvedBy: req.user._id,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: "",
      note: approvalNote,
    };

    versionEntry.clientApproval = approvalState;

    project.mockup.fileUrl = versionEntry.fileUrl;
    project.mockup.fileName = versionEntry.fileName;
    project.mockup.fileType = versionEntry.fileType;
    project.mockup.note = versionEntry.note || "";
    project.mockup.uploadedBy = versionEntry.uploadedBy || null;
    project.mockup.uploadedAt = versionEntry.uploadedAt || null;
    project.mockup.version = requestedVersion;
    project.mockup.clientApproval = {
      ...approvalState,
      approvedVersion: requestedVersion,
    };

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "mockup_approval",
      `Client approval confirmed for mockup ${requestedVersionLabel}.`,
      {
        mockupApproval: {
          version: requestedVersion,
          note: approvalNote,
        },
      },
    );

    await createProjectSystemUpdateAndSnapshot({
      project,
      authorId: req.user._id || req.user.id,
      category: "Graphics",
      content: MOCKUP_APPROVED_BY_CLIENT_UPDATE_TEXT,
    });

    await notifyMockupApprovalConfirmed({
      project,
      senderId: req.user._id,
      version: requestedVersion,
    });

    res.json(project);
  } catch (error) {
    console.error("Error approving mockup:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Record client rejection for latest mockup version
// @route   POST /api/projects/:id/mockup/reject
// @access  Private (Front Desk or Admin)
const rejectProjectMockup = async (req, res) => {
  try {
    if (!canManageMockupApproval(req.user)) {
      return res.status(403).json({
        message: "Not authorized to reject mockups.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "mockup")) return;

    if (project.status !== "Pending Mockup") {
      return res.status(400).json({
        message: "Mockup rejection is only allowed while status is Pending Mockup.",
      });
    }

    const normalizedVersions = getNormalizedMockupVersions(project);
    if (!normalizedVersions.length) {
      return res.status(400).json({
        message: "No mockup has been uploaded yet.",
      });
    }

    const latestVersion = normalizedVersions[normalizedVersions.length - 1];
    const requestedVersionRaw = Number.parseInt(req.body?.version, 10);
    const requestedVersion =
      Number.isFinite(requestedVersionRaw) && requestedVersionRaw > 0
        ? requestedVersionRaw
        : latestVersion.version;

    if (requestedVersion !== latestVersion.version) {
      return res.status(400).json({
        message: `Only the latest mockup version (${buildMockupVersionLabel(latestVersion.version)}) can be rejected.`,
      });
    }

    const rejectionReason = toText(req.body?.reason);

    project.mockup = project.mockup || {};
    if (!Array.isArray(project.mockup.versions)) {
      project.mockup.versions = [];
    }

    if (project.mockup.versions.length === 0 && project.mockup.fileUrl) {
      project.mockup.versions.push({
        version: latestVersion.version,
        fileUrl: project.mockup.fileUrl,
        fileName: project.mockup.fileName,
        fileType: project.mockup.fileType,
        note: project.mockup.note || "",
        uploadedBy: project.mockup.uploadedBy || null,
        uploadedAt: project.mockup.uploadedAt || null,
        clientApproval: {
          status: getMockupApprovalStatus(project.mockup?.clientApproval || {}),
          isApproved: Boolean(project.mockup?.clientApproval?.isApproved),
          approvedAt: project.mockup?.clientApproval?.approvedAt || null,
          approvedBy: project.mockup?.clientApproval?.approvedBy || null,
          rejectedAt: project.mockup?.clientApproval?.rejectedAt || null,
          rejectedBy: project.mockup?.clientApproval?.rejectedBy || null,
          rejectionReason: project.mockup?.clientApproval?.rejectionReason || "",
          note: project.mockup?.clientApproval?.note || "",
        },
      });
    }

    const versionEntry = project.mockup.versions.find((entry) => {
      const parsed = Number.parseInt(entry?.version, 10);
      return Number.isFinite(parsed) && parsed === requestedVersion;
    });

    if (!versionEntry?.fileUrl) {
      return res.status(400).json({
        message: "Selected mockup version is not available.",
      });
    }

    const rejectionAt = new Date();
    const decisionState = {
      status: "rejected",
      isApproved: false,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: rejectionAt,
      rejectedBy: req.user._id,
      rejectionReason,
      note: rejectionReason,
    };

    versionEntry.clientApproval = decisionState;
    project.mockup.fileUrl = versionEntry.fileUrl;
    project.mockup.fileName = versionEntry.fileName;
    project.mockup.fileType = versionEntry.fileType;
    project.mockup.note = versionEntry.note || "";
    project.mockup.uploadedBy = versionEntry.uploadedBy || null;
    project.mockup.uploadedAt = versionEntry.uploadedAt || null;
    project.mockup.version = requestedVersion;
    project.mockup.clientApproval = {
      ...decisionState,
      approvedVersion: null,
    };

    await project.save();

    const versionLabel = buildMockupVersionLabel(requestedVersion);
    await logActivity(
      project._id,
      req.user._id,
      "mockup_rejection",
      `Client rejected mockup ${versionLabel}.`,
      {
        mockupRejection: {
          version: requestedVersion,
          reason: rejectionReason,
        },
      },
    );

    await notifyMockupRejected({
      project,
      senderId: req.user._id,
      version: requestedVersion,
      rejectionReason,
    });

    res.json(project);
  } catch (error) {
    console.error("Error rejecting mockup:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Add feedback to project
// @route   POST /api/projects/:id/feedback
// @access  Private (Front Desk / Admin)
const addFeedbackToProject = async (req, res) => {
  try {
    const { type, notes } = req.body;
    const feedbackAttachments = mapFeedbackAttachments(req, req.user?._id);

    if (!type || !["Positive", "Negative"].includes(type)) {
      await cleanupUploadedFilesSafely(req);
      return res
        .status(400)
        .json({ message: "Feedback type must be Positive or Negative." });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "feedback")) {
      await cleanupUploadedFilesSafely(req);
      return;
    }

    const userDepts = Array.isArray(req.user.department)
      ? req.user.department
      : req.user.department
        ? [req.user.department]
        : [];
    const isFrontDesk = userDepts.includes("Front Desk");
    const isAdmin = req.user.role === "admin";

    if (!isAdmin && !isFrontDesk) {
      await cleanupUploadedFilesSafely(req);
      return res.status(403).json({
        message: "Not authorized to add feedback to this project.",
      });
    }

    const willMarkFeedbackComplete = FEEDBACK_COMPLETION_GATE_STATUSES.has(
      project.status,
    );
    if (willMarkFeedbackComplete && feedbackAttachments.length === 0) {
      await cleanupUploadedFilesSafely(req);
      return res.status(400).json({
        message:
          "Attach at least one photo, audio, or video before completing feedback.",
      });
    }

    const feedbackEntry = {
      type,
      notes: typeof notes === "string" ? notes.trim() : "",
      attachments: feedbackAttachments,
      createdBy: req.user._id,
      createdByName:
        `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
    };

    project.feedbacks = project.feedbacks || [];
    project.feedbacks.push(feedbackEntry);
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.feedbacks = new Date();

    const oldStatus = project.status;
    if (willMarkFeedbackComplete) {
      project.status = "Feedback Completed";
    }

    const updatedProject = await project.save();

    await logActivity(
      updatedProject._id,
      req.user.id,
      "feedback_add",
      `Feedback added (${type})`,
      {
        feedback: feedbackEntry,
        statusChange:
          oldStatus !== updatedProject.status
            ? { from: oldStatus, to: updatedProject.status }
            : undefined,
      },
    );

    await notifyAdmins(
      req.user.id,
      updatedProject._id,
      "UPDATE",
      "Project Feedback Added",
      `Feedback (${type}) added to project #${updatedProject.orderId || updatedProject._id} by ${req.user.firstName}`,
    );

    res.json(updatedProject);
  } catch (error) {
    await cleanupUploadedFilesSafely(req);
    console.error("Error adding feedback:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete feedback from project
// @route   DELETE /api/projects/:id/feedback/:feedbackId
// @access  Private (Front Desk / Admin)
const deleteFeedbackFromProject = async (req, res) => {
  try {
    const { id, feedbackId } = req.params;

    const project = await Project.findById(id);
    if (!ensureProjectMutationAccess(req, res, project, "feedback")) return;

    const userDepts = Array.isArray(req.user.department)
      ? req.user.department
      : req.user.department
        ? [req.user.department]
        : [];
    const isFrontDesk = userDepts.includes("Front Desk");
    const isAdmin = req.user.role === "admin";

    if (!isAdmin && !isFrontDesk) {
      return res.status(403).json({
        message: "Not authorized to delete feedback from this project.",
      });
    }

    const feedback = project.feedbacks?.id(feedbackId);
    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    const deletedType = feedback.type;
    feedback.remove();
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.feedbacks = new Date();

    const oldStatus = project.status;
    if (
      project.feedbacks.length === 0 &&
      project.status === "Feedback Completed"
    ) {
      project.status = "Pending Feedback";
    }

    const updatedProject = await project.save();

    await logActivity(
      updatedProject._id,
      req.user.id,
      "feedback_delete",
      `Feedback deleted (${deletedType})`,
      {
        feedbackId,
        statusChange:
          oldStatus !== updatedProject.status
            ? { from: oldStatus, to: updatedProject.status }
            : undefined,
      },
    );

    await notifyAdmins(
      req.user.id,
      updatedProject._id,
      "UPDATE",
      "Project Feedback Deleted",
      `Feedback (${deletedType}) removed from project #${updatedProject.orderId || updatedProject._id} by ${req.user.firstName}`,
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error deleting feedback:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Add challenge to project
// @route   POST /api/projects/:id/challenges
// @access  Private
const addChallengeToProject = async (req, res) => {
  try {
    const { title, description, assistance, status } = req.body;
    // Debug logging

    const newChallenge = {
      title,
      description,
      assistance,
      status: status || "Open",
      reporter: {
        name: `${req.user.firstName} ${req.user.lastName}`,
        initials: `${req.user.firstName[0]}${req.user.lastName[0]}`,
        initialsColor: "blue", // Default color for now
        date: new Date().toLocaleString(),
        userId: req.user._id,
      },
      resolvedDate: status === "Resolved" ? new Date().toLocaleString() : "--",
    };

    const projectForAccess = await Project.findById(req.params.id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "department"))
      return;

    const updatedProject = await Project.findByIdAndUpdate(
      req.params.id,
      {
        $push: { challenges: newChallenge },
        "sectionUpdates.challenges": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      req.params.id,
      req.user.id,
      "challenge_add",
      `Reported new challenge: ${title}`,
      { challengeId: newChallenge._id },
    );

    // Notify Admins
    await notifyAdmins(
      req.user.id,
      req.params.id,
      "ACTIVITY",
      "Challenge Reported",
      `New challenge reported on project #${updatedProject.orderId}: ${title}`,
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error adding challenge:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Update challenge status
// @route   PATCH /api/projects/:id/challenges/:challengeId/status
// @access  Private
const updateChallengeStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id, challengeId } = req.params;

    const projectForAccess = await Project.findById(id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "department"))
      return;

    let updateFields = {
      "challenges.$.status": status,
      "sectionUpdates.challenges": new Date(),
    };

    if (status === "Resolved") {
      updateFields["challenges.$.resolvedDate"] = new Date().toLocaleString();
    } else {
      updateFields["challenges.$.resolvedDate"] = "--";
    }

    const updatedProject = await Project.findOneAndUpdate(
      { _id: id, "challenges._id": challengeId },
      { $set: updateFields },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res
        .status(404)
        .json({ message: "Project or Challenge not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "challenge_update",
      `Challenge status updated to ${status}`,
      { challengeId: challengeId, newStatus: status },
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating challenge status:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete a challenge
// @route   DELETE /api/projects/:id/challenges/:challengeId
// @access  Private
const deleteChallenge = async (req, res) => {
  try {
    const { id, challengeId } = req.params;

    const projectForAccess = await Project.findById(id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "department"))
      return;

    const updatedProject = await Project.findOneAndUpdate(
      { _id: id },
      {
        $pull: { challenges: { _id: challengeId } },
        "sectionUpdates.challenges": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "challenge_delete",
      `Deleted a challenge report`,
      { challengeId: challengeId },
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error deleting challenge:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get project activity log
// @route   GET /api/projects/:id/activity
// @access  Private
const getProjectActivity = async (req, res) => {
  try {
    const activities = await ActivityLog.find({ project: req.params.id })
      .populate("user", "firstName lastName") // Get user details
      .sort({ createdAt: -1 }); // Newest first

    res.json(activities);
  } catch (error) {
    console.error("Error fetching activity:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Suggest production risks from project details
// @route   POST /api/projects/ai/production-risk-suggestions
// @access  Private
const suggestProductionRisks = async (req, res) => {
  try {
    const projectData =
      req.body?.projectData && typeof req.body.projectData === "object"
        ? req.body.projectData
        : {};
    const context = buildRiskSuggestionContext(projectData);

    if (
      !context.projectName &&
      !context.briefOverview &&
      context.items.length === 0
    ) {
      return res.status(400).json({
        message:
          "Add project details or items first so Magic AI can generate relevant risks.",
      });
    }

    if (context.productionDepartments.length === 0) {
      return res.status(400).json({
        message:
          "Select at least one production engagement/sub-department first so Magic AI can suggest production-specific risks.",
      });
    }

    let suggestions = [];
    let source = "fallback";
    let openAiError = null;
    let ollamaError = null;
    let usedOpenAi = false;
    let usedOllama = false;

    try {
      const aiSuggestions = await requestAiRiskSuggestions(context);
      suggestions = filterExistingRiskSuggestions(
        aiSuggestions,
        context.existingRiskDescriptions,
      );
      if (suggestions.length > 0) {
        usedOpenAi = true;
        source = "openai";
      }
    } catch (error) {
      openAiError = error;
      console.error(
        "OpenAI production risk suggestion failed, trying Ollama backup:",
        error?.message || error,
      );
    }

    if (openAiError || suggestions.length < MIN_RISK_SUGGESTIONS) {
      try {
        const ollamaSuggestions = await requestOllamaRiskSuggestions(context);
        const filteredOllamaSuggestions = filterExistingRiskSuggestions(
          ollamaSuggestions,
          [
            ...context.existingRiskDescriptions,
            ...suggestions.map((entry) => entry.description),
          ],
        );

        if (filteredOllamaSuggestions.length > 0) {
          suggestions = mergeRiskSuggestions(
            suggestions,
            filteredOllamaSuggestions,
          );
          usedOllama = true;
        }
      } catch (error) {
        ollamaError = error;
        console.error(
          "Ollama production risk backup failed, using template fallback:",
          error?.message || error,
        );
      }
    }

    if (!usedOpenAi && usedOllama) {
      source = "ollama";
    }

    if (suggestions.length < MIN_RISK_SUGGESTIONS) {
      const preFallbackCount = suggestions.length;
      const fallbackSuggestions = buildFallbackRiskSuggestions(context);
      suggestions = mergeRiskSuggestions(suggestions, fallbackSuggestions);
      suggestions = filterExistingRiskSuggestions(
        suggestions,
        context.existingRiskDescriptions,
      );
      suggestions = prioritizeRiskSuggestions(
        suggestions,
        context,
        MAX_RISK_SUGGESTIONS,
      );

      if (suggestions.length > preFallbackCount) {
        if (usedOpenAi && source !== "openai+fallback") {
          source = "openai+fallback";
        } else if (usedOllama && source !== "ollama+fallback") {
          source = "ollama+fallback";
        } else {
          source = "fallback";
        }
      } else {
        if (usedOpenAi) source = "openai";
        else if (usedOllama) source = "ollama";
        else source = "fallback";
      }
    } else {
      suggestions = prioritizeRiskSuggestions(
        suggestions,
        context,
        MAX_RISK_SUGGESTIONS,
      );
      if (usedOpenAi) source = "openai";
      else if (usedOllama) source = "ollama";
    }

    if (openAiError && ollamaError) {
      console.error("Both OpenAI and Ollama risk suggestion attempts failed.");
    }

    if (suggestions.length === 0) {
      return res.status(400).json({
        message:
          "Not enough production context to generate risk suggestions. Add more item and department details, then try again.",
      });
    }

    res.json({ suggestions, source });
  } catch (error) {
    console.error("Error suggesting production risks:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Add production risk
// @route   POST /api/projects/:id/production-risks
// @access  Private
const addProductionRisk = async (req, res) => {
  try {
    const { description, preventive } = req.body;
    const { id } = req.params;

    const projectForAccess = await Project.findById(id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "department"))
      return;

    const newRisk = {
      description,
      preventive,
    };

    const updatedProject = await Project.findByIdAndUpdate(
      id,
      {
        $push: { productionRisks: newRisk },
        "sectionUpdates.productionRisks": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "risk_add",
      `Added production risk: ${description}`,
      { risk: newRisk },
    );

    // Notify Admins
    await notifyAdmins(
      id,
      req.user.id,
      "ACTIVITY",
      "Production Risk Reported",
      `New production risk reported on project #${updatedProject.orderId}: ${description}`,
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error adding production risk:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update production risk
// @route   PATCH /api/projects/:id/production-risks/:riskId
// @access  Private
const updateProductionRisk = async (req, res) => {
  try {
    const { description, preventive } = req.body;
    const { id, riskId } = req.params;

    const projectForAccess = await Project.findById(id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "department"))
      return;

    const updatedProject = await Project.findOneAndUpdate(
      { _id: id, "productionRisks._id": riskId },
      {
        $set: {
          "productionRisks.$.description": description,
          "productionRisks.$.preventive": preventive,
          "sectionUpdates.productionRisks": new Date(),
        },
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project or Risk not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "risk_update",
      `Updated production risk: ${description}`,
      { riskId, description, preventive },
    );

    // Notify Admins
    await notifyAdmins(
      id,
      req.user.id,
      "UPDATE",
      "Production Risk Updated",
      `${req.user.firstName} updated a production risk on project #${updatedProject.orderId || id}: ${description}`,
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating production risk:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete production risk
// @route   DELETE /api/projects/:id/production-risks/:riskId
// @access  Private
const deleteProductionRisk = async (req, res) => {
  try {
    const { id, riskId } = req.params;

    const projectForAccess = await Project.findById(id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "department"))
      return;

    const updatedProject = await Project.findByIdAndUpdate(
      id,
      {
        $pull: { productionRisks: { _id: riskId } },
        "sectionUpdates.productionRisks": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "risk_update", // Using update/generic action as placeholder
      `Deleted production risk`,
      { riskId },
    );

    // Notify Admins
    await notifyAdmins(
      id,
      req.user.id,
      "UPDATE",
      "Production Risk Deleted",
      `${req.user.firstName} deleted a production risk from project #${updatedProject.orderId || id}`,
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error deleting production risk:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Add uncontrollable factor
// @route   POST /api/projects/:id/uncontrollable-factors
// @access  Private
const addUncontrollableFactor = async (req, res) => {
  try {
    const { description, responsible, status } = req.body;
    const { id } = req.params;

    const projectForAccess = await Project.findById(id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "department"))
      return;

    const newFactor = {
      description,
      responsible, // Expecting { label, value } or string
      status, // Expecting { label, value } or string
    };

    const updatedProject = await Project.findByIdAndUpdate(
      id,
      {
        $push: { uncontrollableFactors: newFactor },
        "sectionUpdates.uncontrollableFactors": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "factor_add",
      `Added uncontrollable factor: ${description}`,
      { factor: newFactor },
    );

    // Notify Admins
    await notifyAdmins(
      id,
      req.user.id,
      "ACTIVITY",
      "Uncontrollable Factor Added",
      `New uncontrollable factor added to project #${updatedProject.orderId}: ${description}`,
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error adding uncontrollable factor:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update uncontrollable factor
// @route   PATCH /api/projects/:id/uncontrollable-factors/:factorId
// @access  Private
const updateUncontrollableFactor = async (req, res) => {
  try {
    const { description, responsible, status } = req.body;
    const { id, factorId } = req.params;

    const projectForAccess = await Project.findById(id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "department"))
      return;

    const updatedProject = await Project.findOneAndUpdate(
      { _id: id, "uncontrollableFactors._id": factorId },
      {
        $set: {
          "uncontrollableFactors.$.description": description,
          "uncontrollableFactors.$.responsible": responsible,
          "uncontrollableFactors.$.status": status,
          "sectionUpdates.uncontrollableFactors": new Date(),
        },
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project or Factor not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "factor_update",
      `Updated uncontrollable factor: ${description}`,
      { factorId, description },
    );

    // Notify Admins
    await notifyAdmins(
      id,
      req.user.id,
      "UPDATE",
      "Uncontrollable Factor Updated",
      `${req.user.firstName} updated an uncontrollable factor on project #${updatedProject.orderId || id}: ${description}`,
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating uncontrollable factor:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete uncontrollable factor
// @route   DELETE /api/projects/:id/uncontrollable-factors/:factorId
// @access  Private
const deleteUncontrollableFactor = async (req, res) => {
  try {
    const { id, factorId } = req.params;

    const projectForAccess = await Project.findById(id).select(
      PROJECT_MUTATION_ACCESS_FIELDS,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "department"))
      return;

    const updatedProject = await Project.findByIdAndUpdate(
      id,
      {
        $pull: { uncontrollableFactors: { _id: factorId } },
        "sectionUpdates.uncontrollableFactors": new Date(),
      },
      { new: true, runValidators: false },
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    await logActivity(
      id,
      req.user.id,
      "factor_delete",
      `Deleted uncontrollable factor`,
      { factorId },
    );

    // Notify Admins
    await notifyAdmins(
      id,
      req.user.id,
      "UPDATE",
      "Uncontrollable Factor Deleted",
      `${req.user.firstName} deleted an uncontrollable factor from project #${updatedProject.orderId || id}`,
    );

    res.json(updatedProject);
  } catch (error) {
    console.error("Error deleting uncontrollable factor:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// Get user specific activity
const getUserActivity = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await ActivityLog.countDocuments({ user: req.user.id });
    const activities = await ActivityLog.find({ user: req.user.id })
      .populate("project", "details.projectName")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      activities,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalActivities: total,
    });
  } catch (error) {
    console.error("Error fetching user activity:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete activities for completed projects
const deleteOldUserActivity = async (req, res) => {
  try {
    // Find all completed projects
    const completedProjects = await Project.find({
      status: "Completed",
    }).select("_id");
    const completedProjectIds = completedProjects.map((p) => p._id);

    if (completedProjectIds.length === 0) {
      return res
        .status(200)
        .json({ message: "No completed projects found to clean up." });
    }

    // Delete activities where project is in completedProjectIds AND user is current user
    const result = await ActivityLog.deleteMany({
      user: req.user.id,
      project: { $in: completedProjectIds },
    });

    res.json({
      message: "Cleanup successful",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error cleaning up activities:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// @desc    Update entire project details (e.g. from Step 1-5 Wizard)
// @route   PUT /api/projects/:id
// @access  Private
const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    let {
      orderId,
      orderRef,
      orderDate,
      receivedTime,
      lead,
      client,
      clientEmail, // [NEW]
      clientPhone, // [NEW]
      projectName,
      briefOverview,
      deliveryDate,
      deliveryTime,
      deliveryLocation,
      contactType,
      supplySource,
      packagingType,
      departments,
      items,
      uncontrollableFactors,
      productionRisks,
      status,
      currentStep,
      projectLeadId,
      assistantLeadId,
      description,
      details,
      attachments, // Existing attachments (urls)
      existingAttachments, // Backward-compatible alias for attachments
      existingSampleImage, // Preserve or clear sample image when no new upload
      quoteDetails, // [NEW]
      projectType, // [NEW]
      priority, // [NEW]
      corporateEmergency, // [NEW]
      workstreamCode,
    } = req.body;
    const requestedOrderNumber = normalizeOrderNumber(orderId);
    const hasOrderNumberUpdate = Boolean(requestedOrderNumber);
    const hasOrderRefUpdate = orderRef !== undefined;

    // Parse JSON fields if they are strings (Multipart/form-data behavior)
    if (typeof items === "string") items = JSON.parse(items);
    if (typeof departments === "string") departments = JSON.parse(departments);
    if (typeof uncontrollableFactors === "string")
      uncontrollableFactors = JSON.parse(uncontrollableFactors);
    if (typeof productionRisks === "string")
      productionRisks = JSON.parse(productionRisks);
    if (typeof details === "string") details = JSON.parse(details);
    if (typeof attachments === "string") attachments = JSON.parse(attachments);
    if (typeof existingAttachments === "string")
      existingAttachments = JSON.parse(existingAttachments);
    if (typeof quoteDetails === "string")
      quoteDetails = JSON.parse(quoteDetails);
    if (typeof corporateEmergency === "string" && corporateEmergency.startsWith("{"))
      corporateEmergency = JSON.parse(corporateEmergency);
    if (typeof lead === "string" && lead.startsWith("{"))
      lead = JSON.parse(lead);
    if (typeof assistantLeadId === "string" && assistantLeadId.startsWith("{"))
      assistantLeadId = JSON.parse(assistantLeadId);
    if (typeof orderRef === "string" && orderRef.startsWith("{"))
      orderRef = JSON.parse(orderRef);

    const normalizedAttachments = Array.isArray(attachments)
      ? attachments
      : Array.isArray(existingAttachments)
        ? existingAttachments
        : null;

    const project = await Project.findById(id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    // Helper
    const getValue = (field) => (field && field.value ? field.value : field);

    const currentOrderNumber = normalizeOrderNumber(project.orderId);
    const currentOrderRefId = toObjectIdString(project.orderRef);
    const requestedOrderRefValue = hasOrderRefUpdate
      ? normalizeOptionalText(getValue(orderRef))
      : "";
    const canApplyRequestedOrderRef =
      !requestedOrderRefValue || isValidObjectId(requestedOrderRefValue);
    const orderNumberChangeRequested =
      hasOrderNumberUpdate && requestedOrderNumber !== currentOrderNumber;
    const orderRefChangeRequested =
      hasOrderRefUpdate &&
      canApplyRequestedOrderRef &&
      requestedOrderRefValue !== currentOrderRefId;

    if (
      (orderNumberChangeRequested || orderRefChangeRequested) &&
      !canEditOrderNumber(req.user)
    ) {
      return res.status(403).json({
        message:
          "Only Front Desk and Admin users can edit the order number or order link.",
      });
    }

    // Capture old values for logging
    const oldValues = {
      client: project.details?.client,
      clientEmail: project.details?.clientEmail,
      clientPhone: project.details?.clientPhone,
      briefOverview: project.details?.briefOverview || "",
      sampleImage: project.details?.sampleImage || "",
      attachments: Array.isArray(project.details?.attachments)
        ? [...project.details.attachments]
        : [],
      orderDate: project.orderDate,
      receivedTime: project.receivedTime,
      deliveryDate: project.details?.deliveryDate,
      deliveryTime: project.details?.deliveryTime,
      deliveryLocation: project.details?.deliveryLocation,
      contactType: project.details?.contactType,
      supplySource: project.details?.supplySource,
      packagingType: project.details?.packagingType || "",
      lead: project.projectLeadId,
      assistantLead: project.assistantLeadId,
      orderRef: project.orderRef,
      status: project.status,
    };

    // Track if details changed for sectionUpdates
    let detailsChanged = false;

    // Update Top Level
    if (hasOrderNumberUpdate) {
      project.orderId = requestedOrderNumber;
      detailsChanged = true;
    }
    if (orderRef !== undefined) {
      const normalizedOrderRef = getValue(orderRef);
      if (!normalizedOrderRef || isValidObjectId(normalizedOrderRef)) {
        project.orderRef = normalizedOrderRef || null;
        detailsChanged = true;
      }
    }
    if (orderDate) {
      project.orderDate = orderDate;
      detailsChanged = true;
    }
    if (receivedTime) {
      project.receivedTime = getValue(receivedTime);
      detailsChanged = true;
    }
    if (projectLeadId) {
      project.projectLeadId = projectLeadId;
      detailsChanged = true;
    }
    if (assistantLeadId !== undefined) {
      const normalizedAssistantLeadId = getValue(assistantLeadId);
      project.assistantLeadId = normalizedAssistantLeadId || null;
      detailsChanged = true;
    }

    // Update Details
    if (lead) {
      project.details.lead = lead?.label || lead?.value || lead;
      detailsChanged = true;
    }
    if (client) {
      project.details.client = client;
      detailsChanged = true;
    }
    if (clientEmail) {
      project.details.clientEmail = clientEmail;
      detailsChanged = true;
    }
    if (clientPhone) {
      project.details.clientPhone = clientPhone;
      detailsChanged = true;
    }
    if (projectName) {
      project.details.projectName = projectName;
      detailsChanged = true;
    }
    if (briefOverview !== undefined) {
      project.details.briefOverview = getValue(briefOverview) || "";
      detailsChanged = true;
    }
    if (deliveryDate) {
      project.details.deliveryDate = deliveryDate;
      detailsChanged = true;
    }
    if (deliveryTime) {
      project.details.deliveryTime = getValue(deliveryTime);
      detailsChanged = true;
    }
    if (deliveryLocation) {
      project.details.deliveryLocation = deliveryLocation;
      detailsChanged = true;
    }
    if (contactType) {
      project.details.contactType = getValue(contactType);
      detailsChanged = true;
    }
    if (supplySource !== undefined) {
      project.details.supplySource = normalizeSupplySourceSelection(
        getValue(supplySource),
      );
      detailsChanged = true;
    }
    const resolvedPackagingType =
      packagingType !== undefined
        ? packagingType
        : details &&
            Object.prototype.hasOwnProperty.call(details, "packagingType")
          ? details.packagingType
          : undefined;
    if (resolvedPackagingType !== undefined) {
      project.details.packagingType = normalizeOptionalText(
        getValue(resolvedPackagingType),
      );
      detailsChanged = true;
    }

    // Handle Files
    if (req.files) {
      if (req.files.sampleImage && req.files.sampleImage[0]) {
        project.details.sampleImage = `/uploads/${req.files.sampleImage[0].filename}`;
        detailsChanged = true;
      } else if (existingSampleImage !== undefined) {
        project.details.sampleImage = existingSampleImage || "";
        detailsChanged = true;
      }

      const newAttachments = req.files.attachments
        ? req.files.attachments.map((file) => `/uploads/${file.filename}`)
        : [];

      // Combine existing and new attachments
      // If 'attachments' is sent in body, use it as the base (allows deletion)
      // If not sent, keep existing
      if (normalizedAttachments && Array.isArray(normalizedAttachments)) {
        project.details.attachments = [...normalizedAttachments, ...newAttachments];
        detailsChanged = true;
      } else if (newAttachments.length > 0) {
        // If only new files sent and no body list, just append?
        // Or if attachments body is missing, do we assume no logical change to existing?
        project.details.attachments = [
          ...(project.details.attachments || []),
          ...newAttachments,
        ];
        detailsChanged = true;
      }
    } else if (normalizedAttachments && Array.isArray(normalizedAttachments)) {
      // Case: No new files, but attachments list updated (e.g. deletion)
      project.details.attachments = normalizedAttachments;
      detailsChanged = true;
    }

    // Initialize sectionUpdates if not exists
    project.sectionUpdates = project.sectionUpdates || {};

    if (detailsChanged) {
      project.sectionUpdates.details = new Date();
    }

    // Update Arrays and their timestamps
    if (departments) {
      project.departments = departments;
      project.sectionUpdates.departments = new Date();
    }
    if (items) {
      project.items = items;
      project.sectionUpdates.items = new Date();
    }
    if (uncontrollableFactors) {
      project.uncontrollableFactors = uncontrollableFactors;
      project.sectionUpdates.uncontrollableFactors = new Date();
    }
    if (productionRisks) {
      project.productionRisks = productionRisks;
      project.sectionUpdates.productionRisks = new Date();
    }

    if (currentStep) project.currentStep = currentStep;
    if (status) project.status = status;
    if (projectType) project.projectType = projectType;
    if (priority) project.priority = priority;
    if (project.projectType !== "Corporate Job") {
      project.corporateEmergency = {
        ...(project.corporateEmergency || {}),
        isEnabled: false,
        updatedAt:
          project.corporateEmergency?.updatedAt ||
          project.updatedAt ||
          new Date(),
        updatedBy:
          project.corporateEmergency?.updatedBy || req.user._id || req.user.id,
      };
    } else if (corporateEmergency !== undefined) {
      const nextCorporateEmergency = parseCorporateEmergencyFlag(
        corporateEmergency,
        Boolean(project?.corporateEmergency?.isEnabled),
      );
      project.corporateEmergency = {
        ...(project.corporateEmergency || {}),
        isEnabled: nextCorporateEmergency,
        updatedAt: new Date(),
        updatedBy: req.user._id || req.user.id,
      };
    }
    if (quoteDetails) project.quoteDetails = quoteDetails;
    if (workstreamCode !== undefined) {
      project.workstreamCode = normalizeOptionalText(workstreamCode);
      detailsChanged = true;
    }

    const linkedOrder = await ensureOrderRecord({
      orderNumber: hasOrderNumberUpdate
        ? project.orderId
        : hasOrderRefUpdate
          ? ""
          : project.orderId,
      orderDate: project.orderDate,
      client: project.details?.client,
      clientEmail: project.details?.clientEmail,
      clientPhone: project.details?.clientPhone,
      createdBy: project.createdBy || req.user._id,
      requestedOrderRefId: project.orderRef,
    });
    if (linkedOrder) {
      project.orderRef = linkedOrder._id;
      project.orderId = linkedOrder.orderNumber;
    }

    const updatedProject = await project.save();

    // --- Activity Logging (Diff) ---
    const changes = [];
    if (oldValues.client !== updatedProject.details?.client)
      changes.push(`Client: ${updatedProject.details?.client}`);

    const oldOD = oldValues.orderDate
      ? new Date(oldValues.orderDate).toISOString().split("T")[0]
      : "";
    const newOD = updatedProject.orderDate
      ? new Date(updatedProject.orderDate).toISOString().split("T")[0]
      : "";
    if (oldOD !== newOD) changes.push(`Order Date: ${newOD}`);

    if (oldValues.receivedTime !== updatedProject.receivedTime)
      changes.push(`Received Time: ${updatedProject.receivedTime}`);

    const oldDD = oldValues.deliveryDate
      ? new Date(oldValues.deliveryDate).toISOString().split("T")[0]
      : "";
    const newDD = updatedProject.details?.deliveryDate
      ? new Date(updatedProject.details?.deliveryDate)
          .toISOString()
          .split("T")[0]
      : "";
    if (oldDD !== newDD) changes.push(`Delivery Date: ${newDD}`);

    if (oldValues.deliveryTime !== updatedProject.details?.deliveryTime)
      changes.push(`Delivery Time: ${updatedProject.details?.deliveryTime}`);
    if (oldValues.deliveryLocation !== updatedProject.details?.deliveryLocation)
      changes.push(`Location: ${updatedProject.details?.deliveryLocation}`);
    if (
      String(oldValues.packagingType || "") !==
      String(updatedProject.details?.packagingType || "")
    ) {
      changes.push(
        `Packaging Type: ${updatedProject.details?.packagingType || "Not specified"}`,
      );
    }
    if (oldValues.status !== updatedProject.status)
      changes.push(`Status: ${updatedProject.status}`);

    const previousBriefOverview = String(oldValues.briefOverview || "").trim();
    const nextBriefOverview = String(updatedProject.details?.briefOverview || "").trim();
    const briefOverviewChanged = previousBriefOverview !== nextBriefOverview;

    const previousSampleImage = String(oldValues.sampleImage || "").trim();
    const nextSampleImage = String(updatedProject.details?.sampleImage || "").trim();
    const sampleImageChanged = previousSampleImage !== nextSampleImage;

    const previousAttachments = Array.isArray(oldValues.attachments)
      ? oldValues.attachments
      : [];
    const nextAttachments = Array.isArray(updatedProject.details?.attachments)
      ? updatedProject.details.attachments
      : [];
    const attachmentsChanged =
      previousAttachments.length !== nextAttachments.length ||
      previousAttachments.some((item, index) => item !== nextAttachments[index]);

    if (briefOverviewChanged) {
      changes.push("Brief Overview updated");
    }
    if (sampleImageChanged) {
      changes.push("Primary Reference Image updated");
    }
    if (attachmentsChanged) {
      changes.push(`Reference Materials updated (${nextAttachments.length} file(s))`);
    }
    const orderRevisionChanged =
      briefOverviewChanged || sampleImageChanged || attachmentsChanged;

    const prevLeadId = oldValues.lead ? oldValues.lead.toString() : null;
    const nextLeadId = updatedProject.projectLeadId
      ? updatedProject.projectLeadId.toString()
      : null;
    const prevAssistantId = oldValues.assistantLead
      ? oldValues.assistantLead.toString()
      : null;
    const nextAssistantId = updatedProject.assistantLeadId
      ? updatedProject.assistantLeadId.toString()
      : null;
    const leadId = nextLeadId;
    const leadChanged = prevLeadId !== nextLeadId;

    let previousLeadName = "Unassigned";
    let nextLeadName = "Unassigned";

    if (leadChanged) {
      const [previousLead, nextLead] = await Promise.all([
        prevLeadId
          ? User.findById(prevLeadId)
              .select("firstName lastName name employeeId")
              .lean()
          : Promise.resolve(null),
        nextLeadId
          ? User.findById(nextLeadId)
              .select("firstName lastName name employeeId")
              .lean()
          : Promise.resolve(null),
      ]);

      const getUserDisplayName = (user) => {
        if (!user) return "Unassigned";
        const firstName = String(user.firstName || "").trim();
        const lastName = String(user.lastName || "").trim();
        const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
        return fullName || user.name || user.employeeId || "Unknown User";
      };

      previousLeadName = getUserDisplayName(previousLead);
      nextLeadName = getUserDisplayName(nextLead);
      changes.push(`Project Lead: ${nextLeadName}`);
    }

    if (changes.length > 0) {
      await logActivity(
        updatedProject._id,
        req.user._id,
        "update",
        `Updated details: ${changes.join(", ")}`,
        { changes },
      );
    } else {
      // Generic log if no specific changes detected but save occurred (e.g. arrays)
      await logActivity(
        updatedProject._id,
        req.user.id,
        "update",
        `Updated project #${updatedProject.orderId || updatedProject._id}`,
      );
    }

    const directlyNotifiedUserIds = new Set();

    // Notify Lead / Assistant Lead assignments
    if (leadChanged && nextLeadId) {
      const leadAssignmentTitle = prevLeadId
        ? "Project Lead Reassigned"
        : "New Project Assigned";
      const leadAssignmentMessage = prevLeadId
        ? `Project #${getProjectDisplayRef(updatedProject)}: You have been assigned as the new lead for project "${getProjectDisplayName(updatedProject)}" (reassigned from ${previousLeadName}).`
        : `Project #${getProjectDisplayRef(updatedProject)}: You have been assigned as the lead for project "${getProjectDisplayName(updatedProject)}".`;
      await createNotification(
        nextLeadId,
        req.user._id,
        updatedProject._id,
        "ASSIGNMENT",
        leadAssignmentTitle,
        leadAssignmentMessage,
      );
      directlyNotifiedUserIds.add(nextLeadId);
    }

    if (leadChanged && prevLeadId) {
      const previousLeadMessage = nextLeadId
        ? `Project #${getProjectDisplayRef(updatedProject)}: You are no longer the lead for project "${getProjectDisplayName(updatedProject)}". New lead: ${nextLeadName}.`
        : `Project #${getProjectDisplayRef(updatedProject)}: Your lead assignment for project "${getProjectDisplayName(updatedProject)}" has been removed.`;
      await createNotification(
        prevLeadId,
        req.user._id,
        updatedProject._id,
        "ASSIGNMENT",
        "Project Lead Assignment Updated",
        previousLeadMessage,
      );
      directlyNotifiedUserIds.add(prevLeadId);
    }

    if (
      nextAssistantId &&
      nextAssistantId !== prevAssistantId &&
      nextAssistantId !== leadId
    ) {
      await createNotification(
        updatedProject.assistantLeadId,
        req.user._id,
        updatedProject._id,
        "ASSIGNMENT",
        "Assistant Lead Assigned",
        `Project #${updatedProject.orderId || updatedProject._id}: You have been added as an assistant lead for project: ${updatedProject.details?.projectName || "Unnamed Project"}`,
      );
      directlyNotifiedUserIds.add(nextAssistantId);
    }

    // Notify current lead(s) when front desk/admin revises client brief/reference files.
    if (orderRevisionChanged) {
      const revisionParts = [];
      if (briefOverviewChanged) revisionParts.push("Brief Overview");
      if (sampleImageChanged) revisionParts.push("Primary Reference Image");
      if (attachmentsChanged) revisionParts.push("Reference Materials");
      const revisionSummary = revisionParts.join(", ");
      const revisionRecipientIds = [
        updatedProject.projectLeadId,
        updatedProject.assistantLeadId,
      ]
        .map((value) => toObjectIdString(value))
        .filter(Boolean);

      for (const recipientId of new Set(revisionRecipientIds)) {
        await createNotification(
          recipientId,
          req.user._id,
          updatedProject._id,
          "UPDATE",
          "Order Revision Updated",
          `Project #${getProjectDisplayRef(updatedProject)}: ${req.user.firstName} ${req.user.lastName} updated ${revisionSummary} for "${getProjectDisplayName(updatedProject)}".`,
        );
        directlyNotifiedUserIds.add(recipientId);
      }
    }

    // Notify Admins of significant updates (if changes > 0)
    if (changes.length > 0) {
      await notifyAdmins(
        req.user.id,
        updatedProject._id,
        "UPDATE",
        "Project Details Updated",
        `${req.user.firstName} updated details for project #${updatedProject.orderId || updatedProject._id}: ${changes.join(", ")}`,
        { excludeUserIds: Array.from(directlyNotifiedUserIds) },
      );
    }

    // [New] Notify Production Team on Acceptance
    if (updatedProject.status === "Pending Production") {
      const productionUsers = await User.find({
        department: { $in: getProjectProductionDepartmentFilters(updatedProject) },
      });
      for (const prodUser of productionUsers) {
        await createNotification(
          prodUser._id,
          req.user._id,
          updatedProject._id,
          "ACCEPTANCE",
          "Project Accepted",
          `Project #${updatedProject.orderId}: Project "${updatedProject.details.projectName}" has been accepted and is ready for production.`,
        );
      }
    }

    const populatedProject = await Project.findById(updatedProject._id)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName employeeId email")
      .populate("assistantLeadId", "firstName lastName employeeId email")
      .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone");

    res.json(populatedProject);
  } catch (error) {
    console.error("Error updating project:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Get all clients with their projects
// @route   GET /api/projects/clients
// @access  Private (Admin only)
const getClients = async (req, res) => {
  try {
    // Only admins can access this endpoint
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Not authorized. Only admins can view clients." });
    }

    // Aggregate clients from all projects
    const projects = await Project.find({})
      .populate("createdBy", "firstName lastName email")
      .populate("projectLeadId", "firstName lastName")
      .populate("assistantLeadId", "firstName lastName")
      .sort({ createdAt: -1 });

    // Group projects by client
    const clientsMap = new Map();

    projects.forEach((project) => {
      const clientName = project.details?.client || "Unknown Client";

      if (!clientsMap.has(clientName)) {
        clientsMap.set(clientName, {
          name: clientName,
          projects: [],
          projectCount: 0,
        });
      }

      const clientData = clientsMap.get(clientName);
      clientData.projects.push(project);
      clientData.projectCount++;
    });

    // Convert map to array and sort by name
    const clients = Array.from(clientsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    res.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Reopen a completed project
// @route   PATCH /api/projects/:id/reopen
// @access  Private
const reopenProject = async (req, res) => {
  try {
    const sourceProject = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, sourceProject, "reopen")) return;

    // Check if project is in a terminal status
    if (
      sourceProject.status !== "Completed" &&
      sourceProject.status !== "Delivered" &&
      sourceProject.status !== "Feedback Completed" &&
      sourceProject.status !== "Finished"
    ) {
      return res.status(400).json({
        message:
          "Only completed, delivered, feedback-completed, or finished projects can be reopened",
      });
    }

    const lineageId = sourceProject.lineageId || sourceProject._id;
    const lineageQuery = { $or: [{ lineageId }, { _id: lineageId }] };
    const sourceVersion =
      Number.isFinite(sourceProject.versionNumber) &&
      sourceProject.versionNumber > 0
        ? sourceProject.versionNumber
        : 1;
    const latestInLineage = await Project.findOne(lineageQuery)
      .select("_id versionNumber createdAt")
      .sort({ versionNumber: -1, createdAt: -1 });
    const sourceIsLatest =
      !latestInLineage ||
      latestInLineage._id.toString() === sourceProject._id.toString();

    if (!sourceIsLatest) {
      return res.status(400).json({
        message:
          "Only the latest project revision can be reopened. Please reopen the latest version.",
      });
    }

    const now = new Date();
    const reopenReason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const sourceStatus = sourceProject.status;
    const nextVersion = sourceVersion + 1;

    const sourceObject = sourceProject.toObject({ depopulate: true });
    delete sourceObject._id;
    delete sourceObject.__v;
    delete sourceObject.createdAt;
    delete sourceObject.updatedAt;

    // Reopened revision starts a fresh active cycle while preserving core details.
    const reopenedProject = new Project({
      ...sourceObject,
      status: "Pending Scope Approval",
      currentStep: 1,
      orderDate: now,
      createdBy: req.user._id,
      hold: {
        isOnHold: false,
        reason: "",
        heldAt: null,
        heldBy: null,
        previousStatus: null,
        releasedAt: null,
        releasedBy: null,
      },
      acknowledgements: [],
      feedbacks: [],
      invoice: {
        sent: false,
        sentAt: null,
        sentBy: null,
      },
      paymentVerifications: [],
      sampleRequirement: {
        ...(sourceObject.sampleRequirement || {}),
        isRequired: Boolean(sourceObject?.sampleRequirement?.isRequired),
        updatedAt: now,
        updatedBy: req.user._id,
      },
      sampleApproval: {
        status: "pending",
        approvedAt: null,
        approvedBy: null,
        note: "",
      },
      mockup: {},
      endOfDayUpdate: "",
      endOfDayUpdateDate: null,
      endOfDayUpdateBy: null,
      updates: [],
      sectionUpdates: {
        details: now,
      },
      lineageId,
      parentProjectId: sourceProject._id,
      versionNumber: nextVersion,
      isLatestVersion: true,
      versionState: "active",
      reopenMeta: {
        reason: reopenReason || "",
        reopenedBy: req.user._id,
        reopenedAt: now,
        sourceProjectId: sourceProject._id,
        sourceStatus,
      },
    });

    if (isQuoteProject(reopenedProject)) {
      reopenedProject.quoteDetails = {
        ...(reopenedProject.quoteDetails || {}),
        emailResponseSent: false,
        clientFeedback: "",
        finalUpdate: {
          accepted: false,
          cancelled: false,
        },
        submissionDate: null,
      };
    }

    sourceProject.lineageId = lineageId;
    sourceProject.versionNumber = sourceVersion;
    sourceProject.isLatestVersion = false;
    sourceProject.versionState = "superseded";

    // Keep a single "latest" revision in this lineage.
    await Project.updateMany(lineageQuery, {
      $set: { isLatestVersion: false },
    });
    await sourceProject.save();
    const savedReopenedProject = await reopenedProject.save();

    await logActivity(
      sourceProject._id,
      req.user.id,
      "system",
      `Project reopened as revision v${nextVersion}.`,
      {
        reopen: {
          sourceVersion,
          newVersion: nextVersion,
          newProjectId: savedReopenedProject._id,
          reason: reopenReason || null,
        },
      },
    );

    await logActivity(
      savedReopenedProject._id,
      req.user.id,
      "create",
      `Created reopened revision v${nextVersion} from v${sourceVersion}.`,
      {
        reopen: {
          sourceProjectId: sourceProject._id,
          sourceVersion,
          reason: reopenReason || null,
          sourceStatus,
        },
      },
    );

    if (savedReopenedProject.projectLeadId) {
      await createNotification(
        savedReopenedProject.projectLeadId,
        req.user._id,
        savedReopenedProject._id,
        "ASSIGNMENT",
        "Project Reopened",
        `Project #${savedReopenedProject.orderId || savedReopenedProject._id} has been reopened as revision v${nextVersion} and is now pending scope approval.`,
      );
    }

    if (
      savedReopenedProject.assistantLeadId &&
      savedReopenedProject.assistantLeadId.toString() !==
        savedReopenedProject.projectLeadId?.toString()
    ) {
      await createNotification(
        savedReopenedProject.assistantLeadId,
        req.user._id,
        savedReopenedProject._id,
        "ASSIGNMENT",
        "Project Reopened",
        `Project #${savedReopenedProject.orderId || savedReopenedProject._id} has been reopened as revision v${nextVersion} and is now pending scope approval.`,
      );
    }

    const notifyMessage = `${req.user.firstName} ${req.user.lastName} reopened project #${savedReopenedProject.orderId || savedReopenedProject._id} as revision v${nextVersion}${reopenReason ? `: ${reopenReason}` : "."}`;

    await notifyAdmins(
      req.user.id,
      savedReopenedProject._id,
      "SYSTEM",
      "Project Reopened",
      notifyMessage,
    );

    const populatedReopenedProject = await Project.findById(
      savedReopenedProject._id,
    )
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName employeeId email")
      .populate("assistantLeadId", "firstName lastName employeeId email");

    res.json(populatedReopenedProject);
  } catch (error) {
    console.error("Error reopening project:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    const lineageId = project.lineageId || project._id;
    const lineageQuery = { $or: [{ lineageId }, { _id: lineageId }] };
    const wasLatest = project.isLatestVersion !== false;

    await Project.deleteOne({ _id: req.params.id });
    // Cleanup activities
    await ActivityLog.deleteMany({ project: req.params.id });

    // If the deleted record was latest (or flags drifted), promote the highest
    // remaining revision in the lineage to be latest so reopen remains available.
    const remainingInLineage = await Project.find({
      $and: [lineageQuery, { _id: { $ne: req.params.id } }],
    })
      .select("_id versionNumber createdAt isLatestVersion")
      .sort({ versionNumber: -1, createdAt: -1 });

    if (remainingInLineage.length > 0) {
      const hasLatest = remainingInLineage.some(
        (entry) => entry.isLatestVersion !== false,
      );

      if (wasLatest || !hasLatest) {
        const promoted = remainingInLineage[0];
        await Project.updateMany(lineageQuery, {
          $set: { isLatestVersion: false, versionState: "superseded" },
        });
        await Project.findByIdAndUpdate(promoted._id, {
          $set: {
            isLatestVersion: true,
            versionState: "active",
            lineageId: promoted.lineageId || lineageId,
          },
        });
      }
    }

    res.json({ message: "Project removed" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const SCOPE_APPROVAL_READY_STATUSES = new Set([
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
  "Finished",
  "In Progress",
  "Completed",
  "On Hold",
]);

// @desc    Acknowledge project engagement by a department
// @route   POST /api/projects/:id/acknowledge
// @access  Private
const acknowledgeProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { department } = req.body;

    if (!department) {
      return res.status(400).json({ message: "Department is required" });
    }

    const project = await Project.findById(id);
    if (!ensureProjectMutationAccess(req, res, project, "acknowledge")) return;

    const isAdmin = req.user.role === "admin";
    if (!projectHasDepartment(project.departments, department)) {
      return res.status(400).json({
        message: "This department is not engaged on the selected project.",
      });
    }

    if (!isAdmin && !userHasDepartmentMatch(req.user.department, department)) {
      return res.status(403).json({
        message: "Not authorized to acknowledge for this department.",
      });
    }

    if (!SCOPE_APPROVAL_READY_STATUSES.has(project.status)) {
      return res.status(400).json({
        message:
          "Scope approval must be completed before engagement can be accepted.",
      });
    }

    // Check if department has already acknowledged
    const existingIndex = (project.acknowledgements || []).findIndex(
      (a) => a.department === department,
    );

    if (existingIndex > -1) {
      return res
        .status(400)
        .json({ message: "Department already acknowledged" });
    }

    project.acknowledgements.push({
      department,
      user: req.user._id,
      date: new Date(),
    });

    const previousStatus = project.status;
    const missingAcknowledgements = getMissingDepartmentAcknowledgements(project);
    const shouldMarkDepartmentalEngagementComplete =
      missingAcknowledgements.length === 0 &&
      ["Pending Departmental Engagement", "Scope Approval Completed"].includes(
        project.status,
      );

    if (shouldMarkDepartmentalEngagementComplete) {
      project.status = "Departmental Engagement Completed";
    }

    await project.save();

    // Log Activity
    await logActivity(
      project._id,
      req.user._id,
      "engagement_acknowledge",
      `${department} department has acknowledged the project engagement.`,
      { department },
    );

    if (previousStatus !== project.status) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${project.status}`,
        {
          statusChange: { from: previousStatus, to: project.status },
        },
      );
    }

    // Notify Project Lead
    if (project.projectLeadId) {
      await createNotification(
        project.projectLeadId,
        req.user._id,
        project._id,
        "ACTIVITY",
        "Department Acknowledgement",
        `${department} department has acknowledged project #${project.orderId || project._id.slice(-6).toUpperCase()}: ${project.details.projectName}`,
      );
    }

    res.json(project);
  } catch (error) {
    console.error("Error acknowledging project:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Undo project engagement acknowledgement (Admin only)
// @route   DELETE /api/projects/:id/acknowledge
// @access  Private (Admin)
const undoAcknowledgeProject = async (req, res) => {
  try {
    const { id } = req.params;
    const { department } = req.body;

    if (!department) {
      return res.status(400).json({ message: "Department is required" });
    }

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Not authorized to undo acknowledgements" });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const ackIndex = (project.acknowledgements || []).findIndex(
      (ack) => ack.department === department,
    );

    if (ackIndex === -1) {
      return res
        .status(400)
        .json({ message: "Acknowledgement not found for department" });
    }

    const previousStatus = project.status;
    project.acknowledgements.splice(ackIndex, 1);
    if (project.status === "Departmental Engagement Completed") {
      project.status = "Pending Departmental Engagement";
    }
    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "engagement_unacknowledge",
      `${department} acknowledgement was removed by ${req.user.firstName} ${req.user.lastName}.`,
      { department },
    );

    if (previousStatus !== project.status) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${project.status}`,
        {
          statusChange: { from: previousStatus, to: project.status },
        },
      );
    }

    if (project.projectLeadId) {
      await createNotification(
        project.projectLeadId,
        req.user._id,
        project._id,
        "ACTIVITY",
        "Department Acknowledgement Removed",
        `${department} department acknowledgement was removed for project #${project.orderId || project._id.slice(-6).toUpperCase()}: ${project.details?.projectName || "Unnamed Project"}`,
      );
    }

    res.json(project);
  } catch (error) {
    console.error("Error undoing acknowledgement:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  createProject,
  getProjects,
  getStageBottlenecks,
  getOrderGroups,
  getOrderGroupByNumber,
  getUserStats,
  getProjectById,
  addItemToProject,
  deleteItemFromProject,
  setProjectHold,
  cancelProject,
  reactivateProject,
  updateProjectStatus,
  markInvoiceSent,
  verifyPayment,
  undoInvoiceSent,
  undoPaymentVerification,
  updateSampleRequirement,
  updateCorporateEmergency,
  updateProjectType,
  confirmProjectSampleApproval,
  resetProjectSampleApproval,
  uploadProjectMockup,
  approveProjectMockup,
  rejectProjectMockup,
  addFeedbackToProject,
  deleteFeedbackFromProject,
  addChallengeToProject,
  updateChallengeStatus,
  deleteChallenge,
  getProjectActivity,
  suggestProductionRisks,
  addProductionRisk,
  updateProductionRisk,
  deleteProductionRisk,
  addUncontrollableFactor,
  updateUncontrollableFactor,
  deleteUncontrollableFactor,
  updateItemInProject,
  updateProjectDepartments,
  getUserActivity,
  deleteOldUserActivity,
  updateProject, // Full Update
  deleteProject, // [NEW]
  getClients, // [NEW]
  reopenProject, // [NEW]
  acknowledgeProject,
  undoAcknowledgeProject,
};
