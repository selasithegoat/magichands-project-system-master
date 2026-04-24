const mongoose = require("mongoose");
const fs = require("fs");
const Project = require("../models/Project");
const Order = require("../models/Order");
const ActivityLog = require("../models/ActivityLog");
const ProjectUpdate = require("../models/ProjectUpdate");
const SmsPrompt = require("../models/SmsPrompt");
const OrderMeeting = require("../models/OrderMeeting");
const Reminder = require("../models/Reminder");
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
const {
  resolveProgressPercent,
  buildStatusSmsMessage,
  buildFeedbackSmsMessage,
} = require("../utils/smsPromptService");
const { sendSms } = require("../utils/arkeselSmsClient");
const {
  sendProjectCreationEmail,
  sendProjectRevisionEmail,
} = require("../utils/projectCreationEmailService");
const { sendEmailDetailed } = require("../utils/emailService");

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
  "local-outsourcing",
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
  "local-outsourcing",
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
const SMS_APPRECIATION_STATUSES = new Set([
  "Delivered",
  "Pending Feedback",
  "Feedback Completed",
  "Completed",
  "Finished",
]);
const SMS_STATUS_STAGE_STATUSES = {
  start: new Set([
    "Pending Scope Approval",
    "Scope Approval Completed",
    "Pending Departmental Engagement",
    "Departmental Engagement Completed",
    "In Progress",
  ]),
  mockup: new Set(["Pending Mockup", "Mockup Completed"]),
  production: new Set(["Pending Production", "Production Completed"]),
  delivery: new Set([
    "Photography Completed",
    "Pending Delivery/Pickup",
    "Delivered",
  ]),
};
const SMS_DEDUPE_WINDOW_MS_RAW = Number.parseInt(
  process.env.NOTIFICATION_DEDUPE_WINDOW_MS,
  10,
);
const SMS_DEDUPE_WINDOW_MS = Number.isFinite(SMS_DEDUPE_WINDOW_MS_RAW)
  ? SMS_DEDUPE_WINDOW_MS_RAW
  : 20000;
const REVISION_LOCKED_STATUSES = new Set([
  "Completed",
  "Delivered",
  "Feedback Completed",
  "Finished",
]);

const normalizeAttachmentNote = (value) =>
  String(value || "").trim();

const resolveAttachmentUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    if (typeof value.fileUrl === "string") return value.fileUrl.trim();
    if (typeof value.url === "string") return value.url.trim();
    if (typeof value.path === "string") return value.path.trim();
  }
  return "";
};

const resolveAttachmentName = (value, fallbackUrl = "") => {
  if (value && typeof value === "object") {
    if (typeof value.fileName === "string" && value.fileName.trim()) {
      return value.fileName.trim();
    }
    if (typeof value.name === "string" && value.name.trim()) {
      return value.name.trim();
    }
  }
  const url = fallbackUrl || resolveAttachmentUrl(value);
  if (!url) return "";
  const rawName = url.split("?")[0].split("/").pop() || url;
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
};

const resolveAttachmentType = (value) => {
  if (value && typeof value === "object") {
    if (typeof value.fileType === "string") return value.fileType.trim();
    if (typeof value.type === "string") return value.type.trim();
  }
  return "";
};

const normalizeAttachmentItem = (value) => {
  const fileUrl = resolveAttachmentUrl(value);
  if (!fileUrl) return null;
  return {
    fileUrl,
    fileName: resolveAttachmentName(value, fileUrl),
    fileType: resolveAttachmentType(value),
    note: normalizeAttachmentNote(value?.note || value?.notes || ""),
  };
};

const normalizeStoredAttachmentRecord = (value) => {
  const normalized = normalizeAttachmentItem(value);
  if (!normalized) return null;
  return {
    ...normalized,
    uploadedBy: value?.uploadedBy || null,
    uploadedAt: value?.uploadedAt ? new Date(value.uploadedAt) : null,
  };
};

const normalizeStoredAttachmentList = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeStoredAttachmentRecord).filter(Boolean);
};

const normalizeAttachmentList = (value) => {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeAttachmentItem).filter(Boolean);
};

const normalizeAttachmentNotes = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeAttachmentNote(entry));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed)
          ? parsed.map((entry) => normalizeAttachmentNote(entry))
          : [];
      } catch {
        return [];
      }
    }
    return [normalizeAttachmentNote(trimmed)];
  }
  return [];
};

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

const mapBidSubmissionDocuments = (req, userId) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const notes = normalizeAttachmentNotes(req.body?.documentNotes);
  return files
    .filter((file) => file?.filename)
    .map((file, index) => ({
      fileUrl: `/uploads/${file.filename}`,
      fileName: file.originalname || "",
      fileType: file.mimetype || "",
      note: notes[index] || "",
      uploadedBy: userId || undefined,
      uploadedAt: new Date(),
    }));
};

const mapAttachmentUploads = (req, userId) =>
  upload
    .getUploadedFiles(req)
    .filter((file) => file?.filename)
    .map((file) => ({
      fileUrl: `/uploads/${file.filename}`,
      fileName: file.originalname || "",
      fileType: file.mimetype || "",
      uploadedBy: userId || undefined,
      uploadedAt: new Date(),
    }));

const buildInitialIntakeMockupVersions = (
  req,
  userId,
  {
    fileField = "clientMockup",
    notesField = "clientMockupNotes",
    noteCandidates = ["clientMockupNote", "mockupNote"],
    clientApprovedAtIntake = false,
  } = {},
) => {
  const files = Array.isArray(req.files?.[fileField]) ? req.files[fileField] : [];
  const notes = normalizeAttachmentNotes(req.body?.[notesField]);
  const sharedNote = noteCandidates
    .map((fieldName) => toText(req.body?.[fieldName]))
    .find(Boolean);
  const baseUploadTime = new Date();

  return files
    .filter((file) => file?.filename)
    .map((file, index) => {
      const note = notes[index] || sharedNote;
      return buildMockupVersionRecord(
        {
          version: 1,
          fileUrl: `/uploads/${file.filename}`,
          fileName: file.originalname || "",
          fileType: file.mimetype || "",
          note,
          uploadedBy: userId || undefined,
          uploadedAt: new Date(baseUploadTime.getTime() + index),
          source: "client",
          intakeUpload: true,
          clientApprovedAtIntake,
          graphicsReview: {
            status: "pending",
            reviewedAt: null,
            reviewedBy: null,
            note,
          },
          clientApproval: {
            status: "pending",
            isApproved: false,
            approvedAt: null,
            approvedBy: null,
            rejectedAt: null,
            rejectedBy: null,
            rejectionReason: "",
            note: "",
            rejectionAttachment: null,
            rejectionAttachments: [],
          },
        },
        1,
      );
    });
};

const cleanupUploadedFilesSafely = async (req) => {
  try {
    await upload.cleanupRequestFiles(req);
  } catch (cleanupError) {
    console.error("Failed to clean up uploaded files:", cleanupError);
  }
};

const MOCKUP_UPLOADER_POPULATE_FIELDS = "firstName lastName department";
const populateMockupUploaders = (query) =>
  query
    .populate("mockup.uploadedBy", MOCKUP_UPLOADER_POPULATE_FIELDS)
    .populate("mockup.graphicsReview.reviewedBy", MOCKUP_UPLOADER_POPULATE_FIELDS)
    .populate("mockup.versions.uploadedBy", MOCKUP_UPLOADER_POPULATE_FIELDS)
    .populate(
      "mockup.versions.graphicsReview.reviewedBy",
      MOCKUP_UPLOADER_POPULATE_FIELDS,
    );
const buildProjectResponseQuery = (projectId) =>
  populateMockupUploaders(
    Project.findById(projectId)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName employeeId email")
      .populate("assistantLeadId", "firstName lastName employeeId email")
      .populate("endOfDayUpdateBy", "firstName lastName department")
      .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone"),
  );

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
const isGraphicsDepartmentUser = (user) => {
  if (!user) return false;
  const departments = Array.isArray(user.department)
    ? user.department
    : user.department
      ? [user.department]
      : [];
  return departments
    .map(normalizeDepartmentValue)
    .includes("graphics");
};

const canValidateClientMockup = (user) => {
  if (!user) return false;
  if (user.role === "admin") return true;
  return isGraphicsDepartmentUser(user);
};

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

const getLatestProjectFeedbackTimestamp = (feedbackEntries = []) =>
  feedbackEntries.reduce((latest, feedback) => {
    const rawDate = feedback?.createdAt || feedback?.date;
    if (!rawDate) return latest;
    const parsedMs = new Date(rawDate).getTime();
    if (Number.isNaN(parsedMs)) return latest;
    return Math.max(latest, parsedMs);
  }, 0);

const shouldProjectAppearInEndOfDayByDefault = (
  project,
  nowMs = Date.now(),
) => {
  if (!project || project?.cancellation?.isCancelled) return false;
  if (project?.status === "Completed") return false;
  if (project?.status !== "Finished") return true;

  const feedbackEntries = Array.isArray(project?.feedbacks)
    ? project.feedbacks
    : [];
  if (feedbackEntries.length === 0) return true;

  const latestFeedbackMs = getLatestProjectFeedbackTimestamp(feedbackEntries);
  if (!latestFeedbackMs) return true;

  const elapsedHours = (nowMs - latestFeedbackMs) / (1000 * 60 * 60);
  return elapsedHours < 24;
};

const shouldProjectAppearInEndOfDay = (project, nowMs = Date.now()) => {
  if (!project || project?.cancellation?.isCancelled) return false;
  if (project?.includeInEndOfDayUpdates) return true;
  if (project?.excludeFromEndOfDayUpdates) return false;
  return shouldProjectAppearInEndOfDayByDefault(project, nowMs);
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
    const normalized = String(optionValue).trim().toLowerCase();
    return normalized.replace(/\s+/g, "-") === "outside-production"
      ? "local-outsourcing"
      : normalized;
  }
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized.replace(/\s+/g, "-") === "outside-production"
    ? "local-outsourcing"
    : normalized;
};

const PRODUCTION_SUB_DEPARTMENT_TOKENS = new Set(
  Array.from(PRODUCTION_DEPARTMENTS)
    .map(normalizeDepartmentValue)
    .filter((token) => token && token !== "production"),
);

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

const normalizeProjectDepartmentSelections = (value) =>
  Array.from(
    new Set(
      toDepartmentArray(value)
        .map(normalizeDepartmentValue)
        .filter(Boolean),
    ),
  );

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

const getAcknowledgedDepartmentTokens = (project = {}) =>
  new Set(
    (project?.acknowledgements || [])
      .map((ack) => normalizeDepartmentValue(ack?.department))
      .filter(Boolean),
  );

const getMatchedProjectDepartmentTokensForUser = ({
  project,
  user,
  allowedDepartments = [],
} = {}) => {
  const projectTokens = toDepartmentArray(project?.departments)
    .map(normalizeDepartmentValue)
    .filter(Boolean);
  const userTokens = toDepartmentArray(user?.department)
    .map(normalizeDepartmentValue)
    .filter(Boolean);

  if (!projectTokens.length || !userTokens.length) return [];

  const allowedCanonicalDepartments = new Set(
    toDepartmentArray(allowedDepartments)
      .map(canonicalizeDepartment)
      .filter(Boolean),
  );

  return Array.from(
    new Set(
      projectTokens.filter((projectToken) => {
        const projectCanonical = canonicalizeDepartment(projectToken);
        if (
          allowedCanonicalDepartments.size > 0 &&
          !allowedCanonicalDepartments.has(projectCanonical)
        ) {
          return false;
        }

        return userTokens.some((userToken) => {
          if (userToken === projectToken) return true;

          const userCanonical = canonicalizeDepartment(userToken);
          if (!userCanonical || userCanonical !== projectCanonical) {
            return false;
          }

          if (userCanonical === "production") {
            return userToken === "production" || projectToken === "production";
          }

          return true;
        });
      }),
    ),
  );
};

const getQuoteDepartmentEngagementGuard = ({
  project,
  user,
  allowedDepartments = [],
} = {}) => {
  if (!isQuoteProject(project)) return null;

  if (!isQuoteScopeApprovalReadyForDepartments(project)) {
    return {
      code: "QUOTE_SCOPE_APPROVAL_REQUIRED",
      missing: [],
      message:
        "Scope approval must be completed before departments can acknowledge or take action on this quote.",
    };
  }

  if (user?.role === "admin") return null;

  const matchedDepartmentTokens = getMatchedProjectDepartmentTokensForUser({
    project,
    user,
    allowedDepartments,
  });

  if (!matchedDepartmentTokens.length) return null;

  const isGraphicsLeadException =
    isUserAssignedProjectLead(user, project) &&
    isGraphicsDepartmentUser(user) &&
    matchedDepartmentTokens.some(
      (departmentToken) => normalizeDepartmentValue(departmentToken) === "graphics",
    );
  if (isGraphicsLeadException) {
    return null;
  }

  const acknowledgedDepartmentTokens = getAcknowledgedDepartmentTokens(project);
  if (
    matchedDepartmentTokens.some((departmentToken) =>
      acknowledgedDepartmentTokens.has(departmentToken),
    )
  ) {
    return null;
  }

  return {
    code: "QUOTE_DEPARTMENT_ACKNOWLEDGEMENT_REQUIRED",
    missing: matchedDepartmentTokens,
    message: `Acknowledge your engaged department first before taking action on this quote. Pending acknowledgement: ${matchedDepartmentTokens.join(", ")}.`,
  };
};

const isUserAssignedProjectLead = (user, project) => {
  if (!user || !project) return false;
  const userId = toObjectIdString(user._id || user.id);
  const projectLeadId = toObjectIdString(project.projectLeadId);
  return Boolean(userId && projectLeadId && userId === projectLeadId);
};

const isUserAssignedAssistantLead = (user, project) => {
  if (!user || !project) return false;
  const userId = toObjectIdString(user._id || user.id);
  const assistantLeadId = toObjectIdString(project.assistantLeadId);
  return Boolean(userId && assistantLeadId && userId === assistantLeadId);
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
    case "revision":
      return isFrontDesk || user?.role === "admin";
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
    isAdminPortalMutation &&
    action !== "revision"
  ) {
    res.status(403).json({
      message:
        "You cannot modify this project from the admin portal while you are the assigned Project Lead. Ask another admin to make this change.",
    });
    return false;
  }
  const engagedActionTypes = new Set(["acknowledge", "status", "mockup"]);
  const isEngagedPortalMutation = isEngagedPortalRequest(req);
  const requestedStatus = toText(req.body?.status);
  const isGraphicsLeadOwnMockupAction =
    isEngagedPortalMutation &&
    isUserAssignedProjectLead(req.user, project) &&
    isGraphicsDepartmentUser(req.user) &&
    (action === "mockup" ||
      (action === "status" && requestedStatus === "Mockup Completed"));
  if (
    isUserAssignedProjectLead(req.user, project) &&
    isEngagedPortalMutation &&
    engagedActionTypes.has(action) &&
    !isGraphicsLeadOwnMockupAction
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

const resolveEngagedDepartmentFilters = (departments = []) => {
  const tokens = toDepartmentArray(departments)
    .map(normalizeDepartmentValue)
    .filter(Boolean);

  const filters = new Set();

  tokens.forEach((token) => {
    if (PRODUCTION_SUB_DEPARTMENT_TOKENS.has(token)) {
      filters.add(token);
      return;
    }

    if (GRAPHICS_DEPARTMENT_TOKENS.has(token)) {
      filters.add("graphics");
      return;
    }

    if (PHOTOGRAPHY_DEPARTMENT_TOKENS.has(token)) {
      filters.add("photography");
      return;
    }

    if (STORES_DEPARTMENT_TOKENS.has(token)) {
      if (token === "stores") {
        filters.add("stock");
        filters.add("packaging");
      } else {
        filters.add(token);
      }
      return;
    }

    if (token === "production") {
      filters.add("production");
      PRODUCTION_SUB_DEPARTMENT_TOKENS.forEach((subDeptToken) =>
        filters.add(subDeptToken),
      );
    }
  });

  return Array.from(filters);
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
  const engagedDepartmentFilters = isEngagedMode
    ? resolveEngagedDepartmentFilters(userDepartments)
    : [];
  const isEngagedDept = engagedDepartmentFilters.length > 0;

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

  if (isEngagedMode && !(hasAdminPortalAccess(req.user) && isAdminPortal)) {
    query = mergeQueryWithCondition(query, {
      departments: { $in: engagedDepartmentFilters },
    });
  }

  if (isReportMode) {
    query = mergeQueryWithCondition(query, {
      excludeFromEndOfDayUpdates: { $ne: true },
    });
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
  "Declined",
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
    const orderIdNumber = normalizeOrderNumber(project?.orderId);
    const orderRefNumber = normalizeOrderNumber(project?.orderRef?.orderNumber);
    const canUseOrderRef =
      Boolean(orderRefNumber) && (!orderIdNumber || orderRefNumber === orderIdNumber);
    const orderNumber = orderIdNumber || orderRefNumber || "UNASSIGNED";
    // Group by the explicit project orderId first to avoid merging different orders
    // that might share an orderRef or have mismatched orderRef numbers.
    const groupKey =
      orderIdNumber || orderRefNumber || orderRefId || toObjectIdString(project?._id);

    if (!groups.has(groupKey)) {
      const clientFromDetails = normalizeOptionalText(project?.details?.client);
      const clientFromOrderRef = canUseOrderRef
        ? normalizeOptionalText(project?.orderRef?.client)
        : "";
      const clientEmailFromDetails = normalizeOptionalText(
        project?.details?.clientEmail,
      );
      const clientEmailFromOrderRef = canUseOrderRef
        ? normalizeOptionalText(project?.orderRef?.clientEmail)
        : "";
      const clientPhoneFromDetails = normalizeOptionalText(
        project?.details?.clientPhone,
      );
      const clientPhoneFromOrderRef = canUseOrderRef
        ? normalizeOptionalText(project?.orderRef?.clientPhone)
        : "";
      const orderDateFromOrderRef = canUseOrderRef
        ? project?.orderRef?.orderDate
        : null;

      groups.set(groupKey, {
        id: groupKey,
        orderRef: canUseOrderRef ? orderRefId || null : null,
        orderNumber,
        orderDate: orderDateFromOrderRef || project?.orderDate || null,
        client: clientFromDetails || clientFromOrderRef || "",
        clientEmail: clientEmailFromDetails || clientEmailFromOrderRef || "",
        clientPhone: clientPhoneFromDetails || clientPhoneFromOrderRef || "",
        totalProjects: 0,
        openProjects: 0,
        leads: [],
        projects: [],
      });
    }

    const group = groups.get(groupKey);
    if (!group.orderRef && canUseOrderRef && orderRefId) {
      group.orderRef = orderRefId;
    }
    if (group.orderNumber === "UNASSIGNED" && orderNumber !== "UNASSIGNED") {
      group.orderNumber = orderNumber;
    }
    if (!group.orderDate && (project?.orderRef?.orderDate || project?.orderDate)) {
      group.orderDate =
        (canUseOrderRef ? project?.orderRef?.orderDate : null) ||
        project?.orderDate ||
        null;
    }
    if (!group.client) {
      group.client =
        normalizeOptionalText(project?.details?.client) ||
        (canUseOrderRef
          ? normalizeOptionalText(project?.orderRef?.client)
          : "") ||
        "";
    }
    if (!group.clientEmail) {
      group.clientEmail =
        normalizeOptionalText(project?.details?.clientEmail) ||
        (canUseOrderRef
          ? normalizeOptionalText(project?.orderRef?.clientEmail)
          : "") ||
        "";
    }
    if (!group.clientPhone) {
      group.clientPhone =
        normalizeOptionalText(project?.details?.clientPhone) ||
        (canUseOrderRef
          ? normalizeOptionalText(project?.orderRef?.clientPhone)
          : "") ||
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

const normalizeMeetingDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeMeetingReminderOffsets = (value) => {
  const list = Array.isArray(value) ? value : [];
  const unique = new Set();
  list.forEach((entry) => {
    const parsed = Number.parseInt(entry, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    unique.add(parsed);
  });
  return Array.from(unique).sort((a, b) => b - a);
};

const normalizeMeetingStatus = (value, fallback = "scheduled") => {
  const token = String(value || "").trim().toLowerCase();
  if (["scheduled", "completed", "cancelled"].includes(token)) return token;
  return fallback;
};

const resolveOrderGroupProjects = async ({
  orderNumber,
  orderRefId,
  includeCancelled = true,
} = {}) => {
  const normalizedOrderNumber = normalizeOrderNumber(orderNumber);
  let useOrderRef = Boolean(orderRefId);
  if (orderRefId && normalizedOrderNumber) {
    const linkedOrder = await Order.findById(orderRefId)
      .select("orderNumber")
      .lean();
    const linkedOrderNumber = normalizeOrderNumber(linkedOrder?.orderNumber);
    if (linkedOrderNumber && linkedOrderNumber !== normalizedOrderNumber) {
      useOrderRef = false;
    }
  }
  const conditions = [];
  if (normalizedOrderNumber) {
    conditions.push({ orderId: normalizedOrderNumber });
  }
  if (useOrderRef) {
    conditions.push({ orderRef: orderRefId });
  }
  if (conditions.length === 0) return [];

  const baseQuery = conditions.length === 1 ? conditions[0] : { $or: conditions };
  const query = includeCancelled
    ? baseQuery
    : {
        $and: [baseQuery, { "cancellation.isCancelled": { $ne: true } }],
      };

  const projects = await Project.find(query)
    .select(
      "_id orderId orderRef projectLeadId assistantLeadId departments projectType status createdAt lineageId versionNumber isLatestVersion",
    )
    .lean();

  return collapseToLatestLineageProjects(projects);
};

const resolveOrderMeeting = async ({ orderNumber, orderRefId } = {}) => {
  const normalizedOrderNumber = normalizeOrderNumber(orderNumber);
  if (!normalizedOrderNumber && !orderRefId) {
    return {
      meeting: null,
      meetings: [],
      meetingScheduled: false,
      meetingCompleted: false,
    };
  }

  const criteria = [];
  if (orderRefId) {
    criteria.push({ orderRef: orderRefId });
  }
  if (normalizedOrderNumber) {
    criteria.push({ orderNumber: normalizedOrderNumber });
  }
  if (!criteria.length) {
    return {
      meeting: null,
      meetings: [],
      meetingScheduled: false,
      meetingCompleted: false,
    };
  }

  const query = criteria.length === 1 ? criteria[0] : { $or: criteria };
  const meetings = await OrderMeeting.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  const meeting = meetings[0] || null;
  const latestScheduled = meetings.find((item) => item.status === "scheduled");
  const latestCompleted = meetings.find((item) => item.status === "completed");

  const scheduledUpdatedAt = latestScheduled
    ? new Date(latestScheduled.updatedAt || latestScheduled.createdAt || 0).getTime()
    : 0;
  const completedUpdatedAt = latestCompleted
    ? new Date(latestCompleted.updatedAt || latestCompleted.createdAt || 0).getTime()
    : 0;

  const meetingScheduled = Boolean(latestScheduled);
  const meetingCompleted =
    Boolean(latestCompleted) && completedUpdatedAt >= scheduledUpdatedAt;

  return {
    meeting,
    meetings,
    meetingScheduled,
    meetingCompleted,
  };
};

const resolveMeetingGateState = async (project = {}) => {
  const orderNumber = normalizeOrderNumber(
    project?.orderRef?.orderNumber || project?.orderId,
  );
  const orderRefId = toObjectIdString(project?.orderRef);
  const meetingSkipped = Boolean(project?.meetingOverride?.skipped);
  if (!orderNumber && !orderRefId) {
    return {
      orderNumber: "",
      orderRefId: "",
      required: false,
      meetingSkipped,
      meeting: null,
      grouped: false,
    };
  }

  const groupProjects = await resolveOrderGroupProjects({
    orderNumber,
    orderRefId,
  });
  const grouped = groupProjects.length > 1;
  const isCorporate = toText(project?.projectType) === "Corporate Job";
  const required = grouped || isCorporate;
  const meetingSummary = await resolveOrderMeeting({ orderNumber, orderRefId });

  return {
    orderNumber,
    orderRefId,
    required,
    meetingSkipped,
    meeting: meetingSummary.meeting,
    meetingScheduled: meetingSummary.meetingScheduled,
    meetingCompleted: meetingSummary.meetingCompleted,
    grouped,
    groupProjects,
  };
};

const advanceProjectsPastPendingMeeting = async (projects = []) => {
  const targetIds = (Array.isArray(projects) ? projects : [])
    .filter((entry) => entry?.status === "Pending Departmental Meeting")
    .map((entry) => entry?._id)
    .filter(Boolean);

  if (targetIds.length === 0) return;

  await Project.updateMany(
    { _id: { $in: targetIds } },
    { $set: { status: "Pending Departmental Engagement" } },
  );
};

// @desc    Skip or restore departmental meeting requirement (Admin only)
// @route   PATCH /api/projects/:id/meeting-override
// @access  Private (Admin)
const updateMeetingOverride = async (req, res) => {
  try {
    const { id } = req.params;
    const project = await Project.findById(id);
    if (!ensureProjectMutationAccess(req, res, project, "status")) return;

    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Not authorized to override meeting requirement." });
    }

    const rawValue = req.body?.skipped;
    let skipped = true;
    if (typeof rawValue === "boolean") {
      skipped = rawValue;
    } else if (typeof rawValue === "string") {
      skipped = rawValue.trim().toLowerCase() === "true";
    }

    const skippedAt = skipped ? new Date() : null;
    const skippedBy = skipped ? req.user._id || req.user.id : null;

    const orderNumber = normalizeOrderNumber(
      project?.orderRef?.orderNumber || project?.orderId,
    );
    const orderRefId = toObjectIdString(project?.orderRef);
    const groupProjects =
      orderNumber || orderRefId
        ? await resolveOrderGroupProjects({ orderNumber, orderRefId })
        : [];
    const targetIds = groupProjects.length
      ? groupProjects.map((entry) => entry._id).filter(Boolean)
      : [project._id];

    await Project.updateMany(
      { _id: { $in: targetIds } },
      {
        $set: {
          "meetingOverride.skipped": skipped,
          "meetingOverride.skippedAt": skippedAt,
          "meetingOverride.skippedBy": skippedBy,
        },
      },
    );

    if (skipped) {
      await advanceProjectsPastPendingMeeting(
        groupProjects.length ? groupProjects : [project],
      );
    }

    await logActivity(
      project._id,
      req.user._id || req.user.id,
      "update",
      skipped
        ? "Departmental meeting requirement was skipped."
        : "Departmental meeting requirement was restored.",
      { meetingOverride: { skipped } },
    );

    const updatedProject = await Project.findById(id);
    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    normalizeProjectStatusFields(updatedProject);
    res.json(updatedProject);
  } catch (error) {
    console.error("Error updating meeting override:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Toggle whether a project appears in the Front Desk End of Day report
// @route   PATCH /api/projects/:id/end-of-day-visibility
// @access  Private (Admin portal)
const updateProjectEndOfDayVisibility = async (req, res) => {
  try {
    if (!hasAdminPortalAccess(req.user) || !isAdminPortalRequest(req)) {
      return res.status(403).json({
        message: "Only admin portal users can manage End of Day visibility.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;
    if (project?.cancellation?.isCancelled) {
      return res.status(400).json({
        message: "Cancelled projects are already excluded from End of Day.",
      });
    }

    const requestBody =
      req.body && typeof req.body === "object" ? req.body : {};
    const previousExcluded = Boolean(project?.excludeFromEndOfDayUpdates);
    const previousIncluded = Boolean(project?.includeInEndOfDayUpdates);
    const previousVisible = shouldProjectAppearInEndOfDay(project);
    const defaultVisible = shouldProjectAppearInEndOfDayByDefault(project);
    const hasVisibleFlag = Object.prototype.hasOwnProperty.call(
      requestBody,
      "visible",
    );
    const hasExcludedFlag = Object.prototype.hasOwnProperty.call(
      requestBody,
      "excluded",
    );

    let nextVisible = !previousVisible;
    if (hasVisibleFlag) {
      nextVisible = parseBooleanFlag(requestBody.visible, !previousVisible);
    } else if (hasExcludedFlag) {
      nextVisible = !parseBooleanFlag(requestBody.excluded, !previousExcluded);
    }

    const nextExcluded = !nextVisible;
    const nextIncluded = nextVisible && !defaultVisible;

    if (
      nextExcluded !== previousExcluded ||
      nextIncluded !== previousIncluded
    ) {
      project.excludeFromEndOfDayUpdates = nextExcluded;
      project.includeInEndOfDayUpdates = nextIncluded;
      await project.save();

      await logActivity(
        project._id,
        req.user._id || req.user.id,
        "update",
        nextExcluded
          ? "Project removed from End of Day Updates report."
          : "Project restored to End of Day Updates report.",
        {
          endOfDayVisibility: {
            previousExcluded,
            nextExcluded,
            previousIncluded,
            nextIncluded,
            previousVisible,
            nextVisible,
          },
        },
      );
    }

    const updatedProject = await buildProjectResponseQuery(project._id).populate(
      "acknowledgements.user",
      "firstName lastName name avatarUrl",
    );

    if (!updatedProject) {
      return res.status(404).json({ message: "Project not found" });
    }

    normalizeProjectStatusFields(updatedProject);
    return res.json(updatedProject);
  } catch (error) {
    console.error("Error updating End of Day visibility:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const normalizeMeetingRecipientDepartmentToken = (value) => {
  const token = normalizeDepartmentValue(value);
  if (!token) return "";
  return PRODUCTION_DEPARTMENT_ALIASES[token] || token;
};

const resolveMeetingRecipientIds = async (projects = []) => {
  const leadIds = new Set();
  const engagedGroups = new Set();
  const engagedProductionSubDepartments = new Set();
  let hasGenericProduction = false;

  projects.forEach((project) => {
    const leadId = toObjectIdString(project?.projectLeadId);
    const assistantId = toObjectIdString(project?.assistantLeadId);
    if (leadId) leadIds.add(leadId);
    if (assistantId) leadIds.add(assistantId);

    const departments = toDepartmentArray(project?.departments);
    departments.forEach((dept) => {
      const token = normalizeMeetingRecipientDepartmentToken(dept);
      if (!token) return;
      if (PRODUCTION_SUB_DEPARTMENT_TOKENS.has(token)) {
        engagedProductionSubDepartments.add(token);
        return;
      }
      if (token === "production") {
        hasGenericProduction = true;
        return;
      }
      const canonical = canonicalizeDepartment(token);
      if (canonical && canonical !== "production") {
        engagedGroups.add(canonical);
      }
    });
  });

  if (engagedProductionSubDepartments.size === 0 && hasGenericProduction) {
    PRODUCTION_SUB_DEPARTMENT_TOKENS.forEach((token) =>
      engagedProductionSubDepartments.add(token),
    );
  }

  const recipientIds = new Set(leadIds);
  const hasEngagedGroups = engagedGroups.size > 0;
  const hasProductionSubs = engagedProductionSubDepartments.size > 0;

  if (hasEngagedGroups || hasProductionSubs) {
    const users = await User.find({})
      .select("_id department")
      .lean();

    users.forEach((user) => {
      const userId = toObjectIdString(user?._id);
      if (!userId || recipientIds.has(userId)) return;
      const userDepartments = toDepartmentArray(user?.department);
      const userTokens = userDepartments.map(normalizeMeetingRecipientDepartmentToken);
      if (
        hasProductionSubs &&
        userTokens.some((token) => engagedProductionSubDepartments.has(token))
      ) {
        recipientIds.add(userId);
        return;
      }
      if (hasEngagedGroups) {
        const canonicalTokens = userTokens
          .map(canonicalizeDepartment)
          .filter(Boolean);
        if (canonicalTokens.some((token) => engagedGroups.has(token))) {
          recipientIds.add(userId);
        }
      }
    });
  }

  return Array.from(recipientIds);
};

const buildMeetingMessage = (meeting, { orderNumber = "" } = {}) => {
  const meetingTime = meeting?.meetingAt ? new Date(meeting.meetingAt) : null;
  const timeLabel = meetingTime
    ? meetingTime.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "TBD";
  const orderLabel = orderNumber ? `Order #${orderNumber}` : "the order";
  const parts = [
    `Departmental meeting scheduled for ${orderLabel} on ${timeLabel}.`,
  ];
  const location = toText(meeting?.location);
  const link = toText(meeting?.virtualLink);
  const agenda = toText(meeting?.agenda);
  if (location) parts.push(`Location: ${location}.`);
  if (link) parts.push(`Virtual link: ${link}.`);
  if (agenda) parts.push(`Agenda: ${agenda}.`);
  return parts.join(" ");
};

const buildMeetingReminderMessage = (meeting, { orderNumber = "" } = {}) => {
  const meetingTime = meeting?.meetingAt ? new Date(meeting.meetingAt) : null;
  const timeLabel = meetingTime
    ? meetingTime.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "soon";
  const orderLabel = orderNumber ? `Order #${orderNumber}` : "the order";
  const parts = [
    `Reminder: Departmental meeting for ${orderLabel} is scheduled for ${timeLabel}.`,
  ];
  const location = toText(meeting?.location);
  const link = toText(meeting?.virtualLink);
  if (location) parts.push(`Location: ${location}.`);
  if (link) parts.push(`Virtual link: ${link}.`);
  return parts.join(" ");
};

const cancelMeetingReminders = async (reminderIds = []) => {
  if (!Array.isArray(reminderIds) || reminderIds.length === 0) return;
  await Reminder.updateMany(
    { _id: { $in: reminderIds } },
    {
      $set: {
        status: "cancelled",
        isActive: false,
        cancelledAt: new Date(),
        processing: false,
        processingAt: null,
        lastError: "",
      },
    },
  );
};

const createMeetingReminders = async ({
  meeting,
  recipientIds,
  projectId,
  orderNumber,
  actorId,
} = {}) => {
  const meetingTime = meeting?.meetingAt ? new Date(meeting.meetingAt) : null;
  if (!meetingTime || Number.isNaN(meetingTime.getTime())) return [];
  const recipients = Array.isArray(recipientIds) ? recipientIds : [];
  if (recipients.length === 0) return [];

  const offsets = normalizeMeetingReminderOffsets(meeting?.reminderOffsets || []);
  const reminderOffsets = [0, ...offsets];
  const now = Date.now();
  const reminderIds = [];
  const message = buildMeetingReminderMessage(meeting, { orderNumber });

  for (const offset of reminderOffsets) {
    let remindAt = new Date(meetingTime.getTime() - offset * 60 * 1000);
    if (remindAt.getTime() <= now + 5000) {
      if (offset === 0) {
        // If meeting time is now/past, trigger reminder shortly.
        remindAt = new Date(now + 10000);
      } else {
        continue;
      }
    }

    const reminder = await Reminder.create({
      createdBy: actorId,
      project: projectId || null,
      title: "Departmental Meeting Reminder",
      message,
      triggerMode: "absolute_time",
      remindAt,
      nextTriggerAt: remindAt,
      watchStatus: "",
      delayMinutes: 0,
      stageMatchedAt: null,
      repeat: "none",
      timezone: toText(meeting?.timezone) || "UTC",
      conditionStatus: "",
      templateKey: "departmental_meeting",
      channels: {
        inApp: true,
        email: true,
      },
      recipients: recipients.map((id) => ({ user: id })),
    });
    reminderIds.push(reminder._id);
  }

  return reminderIds;
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
  "outside-production": "Local Outsourcing",
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
  "outside production": "local-outsourcing",
  "in house production": "in-house-production",
  "local outsourcing": "local-outsourcing",
};

const toSafeArray = (value) => (Array.isArray(value) ? value : []);
const toText = (value) => (typeof value === "string" ? value.trim() : "");
const FINAL_APPROVAL_EMAIL_RECIPIENT = toText(process.env.FINAL_APPROVAL_EMAIL);
const MOCKUP_EMAIL_MAX_BYTES_RAW = Number.parseInt(
  process.env.MOCKUP_EMAIL_MAX_BYTES,
  10,
);
const MOCKUP_EMAIL_MAX_BYTES = Number.isFinite(MOCKUP_EMAIL_MAX_BYTES_RAW)
  ? MOCKUP_EMAIL_MAX_BYTES_RAW
  : NaN;

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatFileSize = (bytes) => {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(size) / Math.log(1024)),
  );
  const value = size / 1024 ** index;
  const precision = value >= 10 || index === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[index]}`;
};

const formatEmailDateTime = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const sanitizeEmailAttachmentName = (value, fallback = "attachment") => {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
};

const buildApprovedMockupNotes = (version = {}) => {
  const notes = [];
  const mockupNote = toText(version?.note);
  const graphicsNote = toText(version?.graphicsReview?.note);
  const approvalNote = toText(version?.clientApproval?.note);

  if (mockupNote) {
    notes.push({ label: "Mockup note", value: mockupNote });
  }
  if (graphicsNote) {
    notes.push({ label: "Graphics note", value: graphicsNote });
  }
  if (approvalNote) {
    notes.push({ label: "Approval note", value: approvalNote });
  }

  return notes;
};

const getRequestBaseUrl = (req) => {
  const forwardedProto = Array.isArray(req?.headers?.["x-forwarded-proto"])
    ? req.headers["x-forwarded-proto"][0]
    : req?.headers?.["x-forwarded-proto"];
  const protocol = toText(forwardedProto) || toText(req?.protocol) || "http";
  const host =
    typeof req?.get === "function"
      ? toText(req.get("host"))
      : toText(req?.headers?.host);

  if (!host) return "";
  return `${protocol}://${host}`;
};
const normalizeProjectIndicator = (value) => {
  const trimmed = toText(value);
  return trimmed ? trimmed.toUpperCase() : "";
};
const normalizeProjectNameRaw = (value) => toText(value);
const buildProjectDisplayName = (projectName, projectIndicator) => {
  const name = normalizeProjectNameRaw(projectName);
  if (!name) return "";
  const indicator = normalizeProjectIndicator(projectIndicator);
  return indicator ? `${name} for ${indicator}` : name;
};
const BATCH_STATUSES = [
  "planned",
  "in_production",
  "produced",
  "in_packaging",
  "packaged",
  "delivered",
  "cancelled",
];
const BATCH_STATUS_FLOW = [
  "planned",
  "in_production",
  "produced",
  "in_packaging",
  "packaged",
  "delivered",
];
const BATCH_STATUS_SET = new Set(BATCH_STATUSES);
const BATCH_STAGE_OWNER = {
  in_production: "production",
  produced: "production",
  in_packaging: "packaging",
  packaged: "packaging",
  delivered: "frontdesk",
};
const BATCH_PRODUCED_STATUS_SET = new Set([
  "produced",
  "in_packaging",
  "packaged",
  "delivered",
]);
const isFrontDeskUser = (user) =>
  toDepartmentArray(user?.department)
    .map(normalizeDepartmentValue)
    .includes("front desk");
const isAdminUser = (user) => user?.role === "admin";
const isProductionUser = (user) =>
  toDepartmentArray(user?.department)
    .map(normalizeDepartmentValue)
    .some((token) => PRODUCTION_DEPARTMENT_TOKENS.has(token));
const isPackagingUser = (user) =>
  toDepartmentArray(user?.department)
    .map(normalizeDepartmentValue)
    .some((token) => STORES_DEPARTMENT_TOKENS.has(token));
const normalizeProductionSubDepartmentToken = (value) => {
  const token = normalizeDepartmentValue(value);
  return PRODUCTION_SUB_DEPARTMENT_TOKENS.has(token) ? token : "";
};
const getUserProductionSubDepartmentTokens = (user = {}) =>
  Array.from(
    new Set(
      toDepartmentArray(user?.department)
        .map(normalizeProductionSubDepartmentToken)
        .filter(Boolean),
    ),
  );
const getProjectProductionSubDepartmentTokens = (project = {}) =>
  Array.from(
    new Set(
      toDepartmentArray(project?.departments)
        .map(normalizeProductionSubDepartmentToken)
        .filter(Boolean),
    ),
  );
const getAllowedBatchProductionSubDepartmentTokens = ({
  project,
  user,
  isAdmin = false,
} = {}) => {
  const projectTokens = getProjectProductionSubDepartmentTokens(project);
  if (projectTokens.length === 0) return [];
  if (isAdmin) return projectTokens;

  const userTokens = new Set(getUserProductionSubDepartmentTokens(user));
  return projectTokens.filter((token) => userTokens.has(token));
};
const resolveBatchProductionSubDepartmentToken = ({
  project,
  user,
  requestedToken = "",
  existingToken = "",
  isAdmin = false,
} = {}) => {
  const allowedTokens = getAllowedBatchProductionSubDepartmentTokens({
    project,
    user,
    isAdmin,
  });
  const normalizedRequested = normalizeProductionSubDepartmentToken(requestedToken);
  const normalizedExisting = normalizeProductionSubDepartmentToken(existingToken);

  if (normalizedRequested) {
    if (!allowedTokens.includes(normalizedRequested)) {
      return {
        ok: false,
        message: "Select a valid engaged production subdepartment for this batch.",
      };
    }
    return { ok: true, token: normalizedRequested };
  }

  if (normalizedExisting && allowedTokens.includes(normalizedExisting)) {
    return { ok: true, token: normalizedExisting };
  }

  if (allowedTokens.length === 1) {
    return { ok: true, token: allowedTokens[0] };
  }

  if (allowedTokens.length === 0) {
    return {
      ok: false,
      message: isAdmin
        ? "This project must have an engaged production subdepartment before batches can be assigned."
        : "Your account must belong to an engaged production subdepartment to manage batches for this project.",
    };
  }

  return {
    ok: false,
    message: "Select the production subdepartment responsible for this batch.",
  };
};
const canUserAccessBatchByProductionSubDepartment = ({
  user,
  batch,
} = {}) => {
  if (isAdminUser(user) || isPackagingUser(user) || isFrontDeskUser(user)) {
    return true;
  }

  const userTokens = new Set(getUserProductionSubDepartmentTokens(user));
  if (userTokens.size === 0) return false;

  const batchToken = normalizeProductionSubDepartmentToken(
    batch?.productionSubDepartment,
  );
  if (!batchToken) {
    return (
      toObjectIdString(batch?.createdBy) !== "" &&
      toObjectIdString(batch?.createdBy) ===
        toObjectIdString(user?._id || user?.id)
    );
  }
  return userTokens.has(batchToken);
};
const getVisibleProjectBatchesForUser = ({ project, user } = {}) => {
  const batches = Array.isArray(project?.batches) ? project.batches : [];
  if (batches.length === 0) return batches;

  if (isAdminUser(user) || isPackagingUser(user) || isFrontDeskUser(user)) {
    return batches;
  }

  return batches.filter((batch) =>
    canUserAccessBatchByProductionSubDepartment({ user, batch }),
  );
};
const applyVisibleProjectBatchesForUser = (project, user) => {
  if (!project) return project;
  const batchAccessSummary = buildProjectBatchAccessSummary(project);
  project.batchAccessSummary = batchAccessSummary;
  if (project._doc) {
    project._doc.batchAccessSummary = batchAccessSummary;
  }
  project.batches = getVisibleProjectBatchesForUser({ project, user });
  return project;
};
const normalizeBatchStatus = (value) => {
  const token = String(value || "").trim().toLowerCase();
  return BATCH_STATUS_SET.has(token) ? token : "";
};
const normalizeBatchQty = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};
const getBatchTotalQty = (batch) =>
  (Array.isArray(batch?.items) ? batch.items : []).reduce(
    (acc, entry) => acc + (Number(entry?.qty) || 0),
    0,
  );
const resolveBatchReceivedQty = (batch, totalQty) => {
  const received = Number(batch?.packaging?.receivedQty);
  if (Number.isFinite(received)) return received;
  return totalQty;
};
const resolveBatchDeliveredQty = (batch, totalQty) => {
  const delivered = Number(batch?.delivery?.deliveredQty);
  if (Number.isFinite(delivered)) return delivered;
  return totalQty;
};
const getProjectItemQtyMap = (project = {}) => {
  const totals = new Map();
  (Array.isArray(project?.items) ? project.items : []).forEach((item, index) => {
    const itemId =
      toObjectIdString(item?._id) || `__project_item_${index}`;
    const qty = Number(item?.qty) || 0;
    if (!itemId || qty <= 0) return;
    totals.set(itemId, qty);
  });
  return totals;
};
const hasFullBatchAllocationCoverage = (project) => {
  const projectItemQtyMap = getProjectItemQtyMap(project);
  if (projectItemQtyMap.size === 0) return true;

  const allocations = buildBatchAllocationMap(project?.batches || []);
  for (const [itemId, requiredQty] of projectItemQtyMap.entries()) {
    if ((allocations.get(itemId) || 0) < requiredQty) {
      return false;
    }
  }

  return true;
};
const areAllBatchesProduced = (project) => {
  const batches = Array.isArray(project?.batches) ? project.batches : [];
  if (batches.length === 0) return true;
  const activeBatches = batches.filter((entry) => entry?.status !== "cancelled");
  if (activeBatches.length === 0) return false;
  if (!hasFullBatchAllocationCoverage(project)) return false;
  return activeBatches.every((entry) => {
    const status = normalizeBatchStatus(entry?.status);
    if (!status || !BATCH_PRODUCED_STATUS_SET.has(status)) return false;
    const totalQty = getBatchTotalQty(entry);
    if (totalQty <= 0) return true;
    const receivedQty = Number(entry?.packaging?.receivedQty);
    if (!Number.isFinite(receivedQty)) return false;
    return receivedQty >= totalQty;
  });
};
const areAllBatchesDelivered = (project) => {
  const batches = Array.isArray(project?.batches) ? project.batches : [];
  if (batches.length === 0) return true;
  const activeBatches = batches.filter((entry) => entry?.status !== "cancelled");
  if (activeBatches.length === 0) return false;
  if (!hasFullBatchAllocationCoverage(project)) return false;
  return activeBatches.every((entry) => {
    const status = normalizeBatchStatus(entry?.status);
    if (status !== "delivered") return false;
    const totalQty = getBatchTotalQty(entry);
    if (totalQty <= 0) return true;
    const deliveredQty = resolveBatchDeliveredQty(entry, totalQty);
    return deliveredQty >= totalQty;
  });
};
const getBatchProgressGuard = (project, targetStatus = "") => {
  if (isQuoteProject(project)) return null;
  if (!Array.isArray(project?.batches) || project.batches.length === 0) {
    return null;
  }

  const flow = STANDARD_STATUS_FLOW;
  const pendingProductionIndex = flow.indexOf("Pending Production");
  const pendingDeliveryIndex = flow.indexOf("Pending Delivery/Pickup");
  const targetIndex = flow.indexOf(toText(targetStatus));

  if (targetIndex === -1) return null;

  if (
    pendingProductionIndex !== -1 &&
    targetIndex > pendingProductionIndex &&
    !areAllBatchesProduced(project)
  ) {
    return {
      code: "BATCH_PRODUCTION_INCOMPLETE",
      targetStatus,
      message:
        "All project quantities must be assigned to active batches and fully produced before this project can move past Pending Production.",
    };
  }

  if (
    pendingDeliveryIndex !== -1 &&
    targetIndex > pendingDeliveryIndex &&
    !areAllBatchesDelivered(project)
  ) {
    return {
      code: "BATCH_DELIVERY_INCOMPLETE",
      targetStatus,
      message:
        "All project quantities must be assigned to active batches and fully delivered before this project can move past Pending Delivery/Pickup.",
    };
  }

  return null;
};
const reconcileProjectStatusForBatchProduction = async (
  project,
  actor,
) => {
  if (!project || isQuoteProject(project)) return false;
  if (!Array.isArray(project.batches) || project.batches.length === 0) {
    return false;
  }
  if (project.status === HOLD_STATUS) return false;

  const flow = STANDARD_STATUS_FLOW;
  const pendingProductionIndex = flow.indexOf("Pending Production");
  const currentIndex = flow.indexOf(toText(project.status));
  if (pendingProductionIndex === -1 || currentIndex === -1) return false;

  if (currentIndex > pendingProductionIndex && !areAllBatchesProduced(project)) {
    project.status = "Pending Production";
    await logActivity(
      project._id,
      actor?._id || actor?.id,
      "batch_status_reconciled",
      "Project reverted to Pending Production because batches are incomplete.",
      {},
    );
    return true;
  }
  return false;
};
const reconcileProjectStatusForBatchDelivery = async (
  project,
  actor,
) => {
  if (!project || isQuoteProject(project)) return false;
  if (!Array.isArray(project.batches) || project.batches.length === 0) {
    return false;
  }
  if (project.status === HOLD_STATUS) return false;

  const flow = STANDARD_STATUS_FLOW;
  const pendingDeliveryIndex = flow.indexOf("Pending Delivery/Pickup");
  const currentIndex = flow.indexOf(toText(project.status));
  if (pendingDeliveryIndex === -1 || currentIndex === -1) return false;

  if (currentIndex > pendingDeliveryIndex && !areAllBatchesDelivered(project)) {
    project.status = "Pending Delivery/Pickup";
    await logActivity(
      project._id,
      actor?._id || actor?.id,
      "batch_status_reconciled",
      "Project reverted to Pending Delivery/Pickup because batches are incomplete.",
      {},
    );
    return true;
  }
  return false;
};
const getNextBatchStatus = (status) => {
  const current = normalizeBatchStatus(status);
  const index = BATCH_STATUS_FLOW.indexOf(current);
  if (index < 0) return "";
  return BATCH_STATUS_FLOW[index + 1] || "";
};
const getBatchStatusIndex = (status) =>
  BATCH_STATUS_FLOW.indexOf(normalizeBatchStatus(status));
const buildBatchAllocationMap = (batches = [], options = {}) => {
  const totals = new Map();
  const excludeBatchId = String(options.excludeBatchId || "");
  (Array.isArray(batches) ? batches : []).forEach((batch) => {
    if (!batch) return;
    if (batch.status === "cancelled") return;
    if (excludeBatchId && String(batch.batchId || "") === excludeBatchId) return;
    (Array.isArray(batch.items) ? batch.items : []).forEach((item) => {
      const itemId = toObjectIdString(item?.itemId || item?._id);
      const qty = Number(item?.qty);
      if (!itemId || !Number.isFinite(qty)) return;
      totals.set(itemId, (totals.get(itemId) || 0) + qty);
    });
  });
  return totals;
};
const buildProjectBatchAccessSummary = (project = {}) => {
  const batches = Array.isArray(project?.batches) ? project.batches : [];
  const activeBatches = batches.filter(
    (batch) => normalizeBatchStatus(batch?.status) !== "cancelled",
  );
  const allocationByItem = {};
  buildBatchAllocationMap(batches).forEach((qty, itemId) => {
    allocationByItem[itemId] = qty;
  });
  return {
    totalCount: batches.length,
    activeCount: activeBatches.length,
    productionComplete:
      activeBatches.length === 0 ||
      activeBatches.every((batch) =>
        BATCH_PRODUCED_STATUS_SET.has(
          normalizeBatchStatus(batch?.status),
        ),
      ),
    allocationByItem,
  };
};
const normalizeBatchItemsPayload = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      itemId: toObjectIdString(item?.itemId || item?.item || item?._id),
      qty: Number(item?.qty),
    }))
    .filter((item) => item.itemId && Number.isFinite(item.qty) && item.qty > 0);
const validateBatchItems = (items, project, options = {}) => {
  const normalizedItems = normalizeBatchItemsPayload(items);
  if (normalizedItems.length === 0) {
    return {
      ok: false,
      message: "Select at least one item with a quantity greater than zero.",
    };
  }

  const projectItems = Array.isArray(project?.items) ? project.items : [];
  const projectItemMap = new Map(
    projectItems.map((item) => [toObjectIdString(item?._id), item]),
  );
  const allocations = buildBatchAllocationMap(project?.batches || [], options);

  for (const entry of normalizedItems) {
    const projectItem = projectItemMap.get(entry.itemId);
    if (!projectItem) {
      return { ok: false, message: "One or more selected items are invalid." };
    }
    const maxQty = Number(projectItem.qty) || 0;
    const allocatedQty = allocations.get(entry.itemId) || 0;
    const remaining = maxQty - allocatedQty;
    if (entry.qty > remaining) {
      return {
        ok: false,
        message: `Batch allocation for "${projectItem.description || "Item"}" exceeds remaining quantity.`,
      };
    }
  }

  return { ok: true, items: normalizedItems };
};
const canManageSmsForRequest = (req) => {
  if (!req?.user) return false;
  const isAdmin = req.user.role === "admin";
  const requestSource = String(req?.query?.source || "").trim().toLowerCase();
  if (requestSource === "frontdesk") return isFrontDeskUser(req.user);
  if (isAdminPortalRequest(req)) return isAdmin;
  if (isFrontDeskUser(req.user)) return true;
  if (isEngagedPortalRequest(req)) return false;
  return false;
};
const resolveStatusSmsStage = (status = "") => {
  const normalized = toText(status);
  if (!normalized) return "";
  for (const [stage, statuses] of Object.entries(SMS_STATUS_STAGE_STATUSES)) {
    if (statuses.has(normalized)) return stage;
  }
  return "";
};
const findExistingStatusSmsPrompt = async (projectId, stage) => {
  const statuses = SMS_STATUS_STAGE_STATUSES[stage];
  if (!projectId || !statuses) return null;
  return SmsPrompt.findOne({
    project: projectId,
    type: "status_update",
    projectStatus: { $in: Array.from(statuses) },
  }).sort({ createdAt: -1 });
};
const resolveSmsPromptDedupeWindowStart = () =>
  SMS_DEDUPE_WINDOW_MS > 0
    ? new Date(Date.now() - SMS_DEDUPE_WINDOW_MS)
    : null;
const findRecentSmsPrompt = async (criteria = {}) => {
  const windowStart = resolveSmsPromptDedupeWindowStart();
  if (!windowStart) return null;
  return SmsPrompt.findOne({
    ...criteria,
    createdAt: { $gte: windowStart },
  }).sort({ createdAt: -1 });
};
const createSmsPrompt = async ({
  project,
  actorId,
  type = "status_update",
  message = "",
  title = "",
  status = "",
  progressPercent,
}) => {
  const trimmedMessage = toText(message);
  const projectId = project?._id;
  if (!projectId || !trimmedMessage) return null;

  if (type !== "custom") {
    const dedupeQuery = {
      project: projectId,
      type,
    };
    if (status) dedupeQuery.projectStatus = status;
    const existing = await findRecentSmsPrompt(dedupeQuery);
    if (existing) return existing;
  }

  const fallbackStatus = toText(status) || toText(project?.status);
  const resolvedProgress =
    typeof progressPercent === "number" && Number.isFinite(progressPercent)
      ? progressPercent
      : resolveProgressPercent(fallbackStatus, toText(project?.projectType));

  return SmsPrompt.create({
    project: projectId,
    projectStatus: fallbackStatus,
    progressPercent: resolvedProgress,
    type,
    state: "pending",
    message: trimmedMessage,
    title: toText(title),
    originalMessage: trimmedMessage,
    createdBy: actorId || null,
  });
};
const PROJECT_TYPE_VALUES = new Set([
  "Standard",
  "Emergency",
  "Quote",
  "Corporate Job",
]);
const PRIORITY_VALUES = new Set(["Normal", "Urgent"]);
const QUOTE_ONLY_STATUSES = new Set([
  "Quote Created",
  "Pending Quote Requirements",
  "Pending Cost Verification",
  "Cost Verification Completed",
  "Pending Sample Retrieval",
  "Pending Quote Submission",
  "Quote Submission Completed",
  "Pending Client Decision",
  "Declined",
  // Legacy quote statuses (kept for migration compatibility)
  "Pending Quote Request",
  "Quote Request Completed",
  "Pending Send Response",
  "Response Sent",
]);
const NON_QUOTE_ONLY_STATUSES = new Set([
  "Pending Master Approval",
  "Master Approval Completed",
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
  Quote: "Quote Created",
  Standard: "Pending Departmental Engagement",
  Emergency: "Pending Departmental Engagement",
  "Corporate Job": "Pending Departmental Engagement",
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
const QUOTE_STATUS_FLOW = [
  "Quote Created",
  "Pending Scope Approval",
  "Scope Approval Completed",
  "Pending Quote Requirements",
  "Pending Mockup",
  "Mockup Completed",
  "Pending Production",
  "Production Completed",
  "Pending Sample Retrieval",
  "Pending Cost Verification",
  "Cost Verification Completed",
  "Pending Quote Submission",
  "Quote Submission Completed",
  "Pending Client Decision",
  "Completed",
  "Finished",
];
const MASTER_APPROVAL_STATUS_ALIASES = Object.freeze({
  "Pending Proof Reading": "Pending Master Approval",
  "Proof Reading Completed": "Master Approval Completed",
});
const QUOTE_STATUS_ALIAS_TO_STORED = Object.freeze({
  "pending decision": "Pending Client Decision",
  "pending quote requirements": "Pending Quote Requirements",
  "pending cost": "Pending Cost Verification",
  "decision completed": "Completed",
  "cost completed": "Cost Verification Completed",
  "pending sample production": "Pending Production",
  "sample production": "Pending Production",
  "sample production completed": "Production Completed",
  "pending bid submission / documents": "Pending Quote Submission",
  "pending bid submission": "Pending Quote Submission",
  completed: "Completed",
  declined: "Completed",
});
const QUOTE_STATUS_LEGACY_TO_STORED = Object.freeze({
  "Pending Quote Request": "Pending Cost Verification",
  "Quote Request Completed": "Cost Verification Completed",
  "Pending Send Response": "Pending Quote Submission",
  "Response Sent": "Pending Client Decision",
  "Pending Feedback": "Pending Client Decision",
  "Feedback Completed": "Completed",
});
const normalizeMasterApprovalStatus = (status = "") => {
  const normalizedStatus = toText(status);
  if (!normalizedStatus) return "";
  return MASTER_APPROVAL_STATUS_ALIASES[normalizedStatus] || normalizedStatus;
};
const normalizeStatusForStorageByProjectType = (status = "", projectType = "") => {
  const normalizedStatus = normalizeMasterApprovalStatus(status);
  if (!normalizedStatus) return "";
  if (projectType !== "Quote") return normalizedStatus;
  const legacyMapped = QUOTE_STATUS_LEGACY_TO_STORED[normalizedStatus];
  if (legacyMapped) return legacyMapped;
  const aliasKey = normalizedStatus.toLowerCase();
  return QUOTE_STATUS_ALIAS_TO_STORED[aliasKey] || normalizedStatus;
};

const QUOTE_PRE_SCOPE_APPROVAL_STATUSES = new Set([
  "Quote Created",
  "Pending Scope Approval",
]);

const isQuoteScopeApprovalReadyForDepartments = (project = {}) => {
  if (!isQuoteProject(project)) return false;
  const normalizedStatus = normalizeStatusForStorageByProjectType(
    project?.status,
    "Quote",
  );
  if (!normalizedStatus) return false;
  return !QUOTE_PRE_SCOPE_APPROVAL_STATUSES.has(normalizedStatus);
};

const getStatusFlowForProjectType = (projectType = "") =>
  projectType === "Quote" ? QUOTE_STATUS_FLOW : STANDARD_STATUS_FLOW;
const isStatusAtOrAfterMeetingGate = (status = "", projectType = "") => {
  const normalizedStatus = normalizeMasterApprovalStatus(status);
  if (!normalizedStatus) return false;
  if (projectType === "Quote") return false;
  const flow = getStatusFlowForProjectType(projectType);
  const gateIndex = flow.indexOf("Pending Departmental Engagement");
  const statusIndex = flow.indexOf(normalizedStatus);
  if (gateIndex === -1 || statusIndex === -1) return false;
  return statusIndex >= gateIndex;
};
const QUOTE_REQUIREMENT_KEYS = [
  "cost",
  "mockup",
  "previousSamples",
  "sampleProduction",
  "bidSubmission",
];
const DEFAULT_QUOTE_CHECKLIST = Object.freeze({
  cost: true,
  mockup: false,
  previousSamples: false,
  sampleProduction: false,
  bidSubmission: false,
});
const QUOTE_REQUIREMENT_LABELS = Object.freeze({
  cost: "Cost",
  mockup: "Mockup",
  previousSamples: "Previous Sample / Jobs Done",
  sampleProduction: "Sample Production",
  bidSubmission: "Bid Submission / Documents",
});
const QUOTE_REQUIREMENT_STATUS_VALUES = [
  "not_required",
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
const QUOTE_REQUIREMENT_STATUS_SET = new Set(QUOTE_REQUIREMENT_STATUS_VALUES);
const QUOTE_REQUIREMENT_APPROVED_STATUS = "client_approved";
const QUOTE_REQUIREMENT_ALLOWED_TRANSITIONS = {
  not_required: new Set(["assigned"]),
  assigned: new Set(["in_progress", "blocked", "cancelled"]),
  in_progress: new Set(["dept_submitted", "blocked", "cancelled"]),
  dept_submitted: new Set([
    "frontdesk_review",
    "in_progress",
    "blocked",
    "cancelled",
  ]),
  frontdesk_review: new Set(["sent_to_client", "in_progress", "blocked", "cancelled"]),
  sent_to_client: new Set([
    "client_approved",
    "client_revision_requested",
    "frontdesk_review",
    "blocked",
  ]),
  client_revision_requested: new Set([
    "in_progress",
    "frontdesk_review",
    "blocked",
    "cancelled",
  ]),
  client_approved: new Set(["in_progress", "frontdesk_review"]),
  blocked: new Set(["in_progress", "cancelled"]),
  cancelled: new Set(["assigned"]),
};
const QUOTE_REQUIREMENT_CUSTOM_ALLOWED_TRANSITIONS = {
  previousSamples: {
    assigned: new Set(["dept_submitted"]),
    dept_submitted: new Set(["sent_to_client"]),
    client_revision_requested: new Set(["dept_submitted"]),
  },
  bidSubmission: {
    assigned: new Set(["dept_submitted"]),
    in_progress: new Set(["dept_submitted"]),
    dept_submitted: new Set(["sent_to_client"]),
    frontdesk_review: new Set(["sent_to_client"]),
    client_revision_requested: new Set(["dept_submitted"]),
    sent_to_client: new Set(["assigned"]),
  },
};
const QUOTE_REQUIREMENT_FRONT_DESK_STAGES = new Set([
  "frontdesk_review",
  "sent_to_client",
  "client_approved",
  "client_revision_requested",
]);
const QUOTE_REQUIREMENT_FRONT_DESK_MANAGED_KEYS = new Set([
  "cost",
  "mockup",
  "previousSamples",
  "sampleProduction",
  "bidSubmission",
]);
const QUOTE_REQUIREMENT_DEPARTMENT_STAGES = new Set([
  "in_progress",
  "dept_submitted",
  "blocked",
]);
const QUOTE_REQUIREMENT_ADMIN_ONLY_TARGETS = new Set(["cancelled", "not_required"]);
const QUOTE_REQUIREMENT_DEPARTMENT_STAGE_ACCESS = {
  cost: new Set(["front desk"]),
  mockup: new Set(["graphics"]),
  previousSamples: new Set(["front desk", "stores"]),
  sampleProduction: new Set(["graphics", "production"]),
  bidSubmission: new Set(),
};
const QUOTE_DECISION_STATUS_VALUES = [
  "pending",
  "go_ahead",
  "declined",
  "no_response",
];
const QUOTE_DECISION_STATUS_SET = new Set(QUOTE_DECISION_STATUS_VALUES);
const QUOTE_DECISION_STATUS_ALIASES = {
  pending: "pending",
  undecided: "pending",
  reset: "pending",
  "go_ahead": "go_ahead",
  "go-ahead": "go_ahead",
  goahead: "go_ahead",
  proceed: "go_ahead",
  accepted: "go_ahead",
  approved: "go_ahead",
  yes: "go_ahead",
  declined: "declined",
  rejected: "declined",
  cancel: "declined",
  cancelled: "declined",
  no: "declined",
  "no_response": "no_response",
  "no-response": "no_response",
  noresponse: "no_response",
  "no response": "no_response",
  no_reply: "no_response",
  "no-reply": "no_response",
  noreply: "no_response",
  unresponsive: "no_response",
};

const getAutoProgressedStatus = (status, project = {}) => {
  if (isQuoteProject(project)) {
    const requirementMode = getQuoteRequirementMode(
      getNormalizedQuoteDetailsForProject(project),
    );
    if (requirementMode === "multi") {
      const progression = {
        "Scope Approval Completed": "Pending Quote Requirements",
        "Quote Submission Completed": "Pending Client Decision",
      };
      return progression[status] || status;
    }
    if (requirementMode === "mockup") {
      const progression = {
        "Scope Approval Completed": "Pending Mockup",
        "Mockup Completed": "Pending Quote Submission",
        "Quote Submission Completed": "Pending Client Decision",
      };
      return progression[status] || status;
    }
    if (requirementMode === "previousSamples") {
      const progression = {
        "Scope Approval Completed": "Pending Sample Retrieval",
        "Quote Submission Completed": "Pending Client Decision",
      };
      return progression[status] || status;
    }
    if (requirementMode === "bidSubmission") {
      const progression = {
        "Scope Approval Completed": "Pending Quote Submission",
        "Quote Submission Completed": "Pending Client Decision",
      };
      return progression[status] || status;
    }
    if (requirementMode === "sampleProduction") {
      const progression = {
        "Scope Approval Completed": "Pending Mockup",
        "Mockup Completed": "Pending Production",
        "Production Completed": "Pending Quote Submission",
        "Quote Submission Completed": "Pending Client Decision",
      };
      return progression[status] || status;
    }
    return status;
  }

  const progression = {
    // Standard workflow
    "Scope Approval Completed": "Pending Departmental Engagement",
    "Departmental Engagement Completed": "Pending Mockup",
    "Mockup Completed": "Pending Master Approval",
    "Master Approval Completed": "Pending Production",
    "Production Completed": "Pending Quality Control",
    "Quality Control Completed": "Pending Photography",
    "Photography Completed": "Pending Packaging",
    "Packaging Completed": "Pending Delivery/Pickup",
    Delivered: "Pending Feedback",
  };

  return progression[status] || status;
};

const isMockupWorkflowStatusAllowed = (project = {}, status = "") => {
  if (isQuoteProject(project)) {
    project.quoteDetails = normalizeQuoteDetailsWorkflow({
      quoteDetailsInput: project.quoteDetails || {},
      existingQuoteDetails: project.quoteDetails || {},
    });

    const requirementItem =
      project.quoteDetails?.requirementItems?.mockup || null;
    const requirementStatus =
      toText(requirementItem?.status).toLowerCase() || "assigned";

    if (!requirementItem?.isRequired) return false;

    return [
      "assigned",
      "in_progress",
      "blocked",
      "dept_submitted",
      "frontdesk_review",
      "client_revision_requested",
      "client_approved",
    ].includes(requirementStatus);
  }

  return status === "Pending Mockup";
};

const getMockupWorkflowStatusMessage = (project = {}) =>
  isQuoteProject(project)
    ? "Mockup action is only allowed after scope approval and while the quote mockup workflow is active."
    : "Mockup action is only allowed while status is Pending Mockup.";

const formatQuoteRequirementStatusLabel = (status = "") => {
  const normalized = toText(status).toLowerCase();
  if (!normalized) return "";
  return normalized
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
};

const toPlainObject = (value) => {
  if (!value) return {};
  if (typeof value.toObject === "function") return value.toObject();
  if (typeof value === "object") return value;
  return {};
};

const normalizeQuoteDecisionStatus = (value, fallback = "pending") => {
  const token = toText(value).toLowerCase();
  if (!token) return fallback;
  const mapped = QUOTE_DECISION_STATUS_ALIASES[token] || token;
  if (!QUOTE_DECISION_STATUS_SET.has(mapped)) return fallback;
  return mapped;
};

const normalizeQuoteDecision = (decision = {}) => {
  const source = toPlainObject(decision);
  const status = normalizeQuoteDecisionStatus(source.status, "pending");
  return {
    status,
    note: toText(source.note),
    validatedAt: toDateOrNull(source.validatedAt),
    validatedBy: source.validatedBy || null,
    convertedAt: toDateOrNull(source.convertedAt),
    convertedBy: source.convertedBy || null,
    convertedToType: normalizeProjectType(source.convertedToType, "Quote"),
  };
};

const getNormalizedQuoteDecision = (project = {}) => {
  const normalizedQuoteDetails = normalizeQuoteDetailsWorkflow({
    quoteDetailsInput: project?.quoteDetails || {},
    existingQuoteDetails: project?.quoteDetails || {},
  });
  return normalizeQuoteDecision(normalizedQuoteDetails?.decision || {});
};

const hasQuoteDecisionRecorded = (project = {}) =>
  ["go_ahead", "declined", "no_response"].includes(
    getNormalizedQuoteDecision(project).status,
  );

const normalizeQuoteChecklistValue = (checklist = {}) =>
  QUOTE_REQUIREMENT_KEYS.reduce((accumulator, key) => {
    accumulator[key] = parseBooleanFlag(checklist?.[key], false);
    if (key === "cost") {
      accumulator[key] = true;
    }
    return accumulator;
  }, { ...DEFAULT_QUOTE_CHECKLIST });

const normalizeQuoteCostVerification = (value = {}) => {
  const source = toPlainObject(value);
  const amount = Number.parseFloat(source.amount);
  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency: toText(source.currency),
    note: toText(source.note),
    completedAt: toDateOrNull(source.completedAt),
    completedBy: source.completedBy || null,
    updatedAt: toDateOrNull(source.updatedAt),
    updatedBy: source.updatedBy || null,
  };
};

const normalizeBidSubmissionDocuments = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const base = normalizeAttachmentItem(entry);
      if (!base) return null;
      return {
        ...base,
        uploadedAt: toDateOrNull(entry?.uploadedAt),
        uploadedBy: entry?.uploadedBy || null,
      };
    })
    .filter(Boolean);
};

const normalizeQuoteBidSubmission = (value = {}) => {
  const source = toPlainObject(value);
  return {
    isSensitive: parseBooleanFlag(source.isSensitive, false),
    documents: normalizeBidSubmissionDocuments(source.documents),
    updatedAt: toDateOrNull(source.updatedAt),
    updatedBy: source.updatedBy || null,
  };
};

const normalizeQuoteRequirementHistoryEntry = (entry = {}) => {
  const toStatus = toText(entry?.toStatus).toLowerCase();
  if (!QUOTE_REQUIREMENT_STATUS_SET.has(toStatus)) return null;

  const fromStatus = toText(entry?.fromStatus).toLowerCase();

  return {
    fromStatus: QUOTE_REQUIREMENT_STATUS_SET.has(fromStatus) ? fromStatus : undefined,
    toStatus,
    changedAt: toDateOrNull(entry?.changedAt) || new Date(),
    changedBy: entry?.changedBy || null,
    note: toText(entry?.note),
  };
};

const normalizeQuoteRequirementItem = ({ isRequired, item = {} } = {}) => {
  const source = toPlainObject(item);
  const historySource = Array.isArray(source.history) ? source.history : [];
  const normalizedHistory = historySource
    .map((historyEntry) => normalizeQuoteRequirementHistoryEntry(historyEntry))
    .filter(Boolean);

  let status = toText(source.status).toLowerCase();
  if (!QUOTE_REQUIREMENT_STATUS_SET.has(status)) {
    status = "";
  }

  if (!isRequired) {
    status = "not_required";
  } else if (!status || status === "not_required") {
    status = "assigned";
  }

  return {
    isRequired: Boolean(isRequired),
    status,
    updatedAt: toDateOrNull(source.updatedAt),
    updatedBy: source.updatedBy || null,
    completionConfirmedAt: toDateOrNull(source.completionConfirmedAt),
    completionConfirmedBy: source.completionConfirmedBy || null,
    note: toText(source.note),
    history: normalizedHistory,
  };
};

const normalizeQuoteDetailsWorkflow = ({
  quoteDetailsInput = {},
  existingQuoteDetails = {},
} = {}) => {
  const incoming = toPlainObject(quoteDetailsInput);
  const existing = toPlainObject(existingQuoteDetails);
  const merged = { ...existing, ...incoming };

  const normalizedChecklist = normalizeQuoteChecklistValue(
    incoming.checklist !== undefined ? incoming.checklist : existing.checklist,
  );

  const incomingRequirementItems = toPlainObject(incoming.requirementItems);
  const existingRequirementItems = toPlainObject(existing.requirementItems);
  const normalizedRequirementItems = {};
  const mockupRequiredForSampleProduction = Boolean(
    normalizedChecklist.mockup || normalizedChecklist.sampleProduction,
  );

  QUOTE_REQUIREMENT_KEYS.forEach((key) => {
    const sourceItem =
      incomingRequirementItems[key] !== undefined
        ? incomingRequirementItems[key]
        : existingRequirementItems[key];

    const isRequired =
      key === "mockup"
        ? mockupRequiredForSampleProduction
        : Boolean(normalizedChecklist[key]);

    normalizedRequirementItems[key] = normalizeQuoteRequirementItem({
      isRequired,
      item: sourceItem,
    });
  });

  const normalizedCostVerification = normalizeQuoteCostVerification(
    incoming.costVerification !== undefined
      ? incoming.costVerification
      : existing.costVerification,
  );

  const normalizedDecision = normalizeQuoteDecision(
    incoming.decision !== undefined ? incoming.decision : existing.decision,
  );
  const normalizedBidSubmission = normalizeQuoteBidSubmission(
    incoming.bidSubmission !== undefined
      ? incoming.bidSubmission
      : existing.bidSubmission,
  );

  return {
    ...merged,
    checklist: normalizedChecklist,
    costVerification: normalizedCostVerification,
    requirementItems: normalizedRequirementItems,
    bidSubmission: normalizedBidSubmission,
    decision: normalizedDecision,
  };
};

const getQuoteChecklistState = (quoteDetails = {}) => {
  const checklist = normalizeQuoteChecklistValue(quoteDetails?.checklist || {});
  const enabledKeys = QUOTE_REQUIREMENT_KEYS.filter((key) => checklist[key]);
  const effectiveEnabledKeys = checklist.sampleProduction
    ? enabledKeys.filter((key) => key !== "mockup")
    : enabledKeys;
  const nonCostRequirements = effectiveEnabledKeys.filter((key) => key !== "cost");
  const mode =
    effectiveEnabledKeys.length === 0
      ? "none"
      : effectiveEnabledKeys.length === 1
        ? effectiveEnabledKeys[0]
        : "multi";

  return {
    checklist,
    enabledKeys,
    effectiveEnabledKeys,
    nonCostRequirements,
    hasMultipleRequirements: effectiveEnabledKeys.length > 1,
    isCostOnly: mode === "cost",
    isMockupOnly: mode === "mockup",
    isPreviousSamplesOnly: mode === "previousSamples",
    isBidSubmissionOnly: mode === "bidSubmission",
    isSampleProductionOnly: mode === "sampleProduction",
    mode,
  };
};

const getQuoteRequirementMode = (quoteDetails = {}) =>
  getQuoteChecklistState(quoteDetails).mode;

const getNormalizedQuoteDetailsForProject = (project = {}) =>
  normalizeQuoteDetailsWorkflow({
    quoteDetailsInput: project?.quoteDetails || {},
    existingQuoteDetails: project?.quoteDetails || {},
  });

const hasQuoteRequirement = (project = {}, requirementKey = "", options = {}) => {
  if (!isQuoteProject(project)) return false;
  const { effective = false } = options;
  const checklistState = getQuoteChecklistState(
    getNormalizedQuoteDetailsForProject(project),
  );
  const keys = effective
    ? checklistState.effectiveEnabledKeys
    : checklistState.enabledKeys;
  return keys.includes(toText(requirementKey));
};

const isQuoteCostOnlyProject = (project = {}) => {
  if (!isQuoteProject(project)) return false;
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  return getQuoteChecklistState(normalizedQuoteDetails).mode === "cost";
};

const isQuoteMockupOnlyProject = (project = {}) => {
  if (!isQuoteProject(project)) return false;
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  return getQuoteChecklistState(normalizedQuoteDetails).mode === "mockup";
};

const isQuotePreviousSamplesOnlyProject = (project = {}) => {
  if (!isQuoteProject(project)) return false;
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  return (
    getQuoteChecklistState(normalizedQuoteDetails).mode === "previousSamples"
  );
};

const isQuoteSampleProductionOnlyProject = (project = {}) => {
  if (!isQuoteProject(project)) return false;
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  return (
    getQuoteChecklistState(normalizedQuoteDetails).mode === "sampleProduction"
  );
};

const isQuoteBidSubmissionOnlyProject = (project = {}) => {
  if (!isQuoteProject(project)) return false;
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  return (
    getQuoteChecklistState(normalizedQuoteDetails).mode === "bidSubmission"
  );
};

const isQuoteWorkflowSupported = (project = {}) => {
  if (!isQuoteProject(project)) return false;
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  const mode = getQuoteChecklistState(normalizedQuoteDetails).mode;
  return mode !== "none";
};

const isQuoteMockupApproved = (project = {}) => {
  if (!isQuoteProject(project)) return false;
  const latestVersion = getLatestMockupVersion(project);
  return isMockupReadyForCompletion(
    latestVersion || project?.mockup || {},
  );
};

const isQuoteMockupCompletionConfirmed = (project = {}) => {
  if (!isQuoteProject(project)) return false;

  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  const requirementMode = getQuoteChecklistState(normalizedQuoteDetails).mode;
  const requirementItem = normalizedQuoteDetails?.requirementItems?.mockup || {};

  if (requirementItem?.completionConfirmedAt || requirementItem?.completionConfirmedBy) {
    return true;
  }

  const normalizedStatus = normalizeStatusForStorageByProjectType(
    project?.status,
    "Quote",
  );

  if (normalizedStatus === "Mockup Completed") {
    return true;
  }

  if (requirementMode === "mockup") {
    return [
      "Pending Quote Submission",
      "Quote Submission Completed",
      "Pending Client Decision",
      "Completed",
      "Finished",
      "Declined",
    ].includes(normalizedStatus);
  }

  if (requirementMode === "sampleProduction") {
    return [
      "Pending Production",
      "Pending Sample Production",
      "Production Completed",
      "Pending Quote Submission",
      "Quote Submission Completed",
      "Pending Client Decision",
      "Completed",
      "Finished",
      "Declined",
    ].includes(normalizedStatus);
  }

  return false;
};

const isQuoteMockupReadyForSubmission = (project = {}) =>
  isQuoteMockupApproved(project);

const isQuoteCostVerified = (project = {}) => {
  if (!isQuoteProject(project)) return false;
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  const costVerification = normalizedQuoteDetails.costVerification || {};
  if (costVerification.completedAt || costVerification.completedBy) {
    return true;
  }
  const amount = Number.parseFloat(costVerification.amount);
  return Number.isFinite(amount) && amount > 0;
};

const getQuoteBidSubmissionState = (project = {}) => {
  if (!isQuoteProject(project)) {
    return {
      isSensitive: false,
      documents: [],
      hasDocuments: false,
      isReady: false,
    };
  }
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  const bidSubmission = normalizedQuoteDetails?.bidSubmission || {};
  const isSensitive = parseBooleanFlag(bidSubmission.isSensitive, false);
  const documents = normalizeBidSubmissionDocuments(
    bidSubmission.documents || [],
  );
  const hasDocuments = documents.length > 0;
  return {
    isSensitive,
    documents,
    hasDocuments,
    isReady: isSensitive || hasDocuments,
  };
};

const getNormalizedQuoteRequirementItems = (project = {}) => {
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  return normalizedQuoteDetails.requirementItems || {};
};

const isQuoteRequirementCompleted = (requirementKey = "", status = "") => {
  const normalizedKey = toText(requirementKey);
  const normalizedStatus = toText(status).toLowerCase();
  if (!normalizedStatus) return false;

  if (normalizedKey === "previousSamples" || normalizedKey === "bidSubmission") {
    return (
      normalizedStatus === "sent_to_client" ||
      normalizedStatus === QUOTE_REQUIREMENT_APPROVED_STATUS
    );
  }

  return normalizedStatus === QUOTE_REQUIREMENT_APPROVED_STATUS;
};

const getQuoteRequirementProgressState = (project = {}) => {
  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  const checklistState = getQuoteChecklistState(normalizedQuoteDetails);
  const requirementItems = normalizedQuoteDetails.requirementItems || {};
  const bidSubmissionState = getQuoteBidSubmissionState(project);
  const quoteStatus = normalizeStatusForStorageByProjectType(
    project?.status,
    "Quote",
  );

  const trackStates = checklistState.effectiveEnabledKeys.map((key) => {
    if (key === "cost") {
      return {
        key,
        isReadyForSubmission: isQuoteCostVerified(project),
        pendingStatus: "Pending Cost Verification",
      };
    }

    if (key === "mockup") {
      return {
        key,
        isReadyForSubmission: isQuoteMockupReadyForSubmission(project),
        pendingStatus: "Pending Mockup",
      };
    }

    if (key === "previousSamples") {
      const item = requirementItems.previousSamples || {};
      const status = toText(item.status).toLowerCase() || "assigned";
      return {
        key,
        isReadyForSubmission: [
          "dept_submitted",
          "frontdesk_review",
          "sent_to_client",
          "client_approved",
        ].includes(status),
        pendingStatus: "Pending Sample Retrieval",
      };
    }

    if (key === "sampleProduction") {
      const item = requirementItems.sampleProduction || {};
      const status = toText(item.status).toLowerCase() || "assigned";
      return {
        key,
        isReadyForSubmission: [
          "dept_submitted",
          "frontdesk_review",
          "sent_to_client",
          "client_approved",
        ].includes(status),
        pendingStatus: isQuoteMockupReadyForSubmission(project)
          ? "Pending Production"
          : "Pending Mockup",
      };
    }

    if (key === "bidSubmission") {
      return {
        key,
        isReadyForSubmission: bidSubmissionState.isReady,
        pendingStatus: "Pending Quote Submission",
      };
    }

    return {
      key,
      isReadyForSubmission: false,
      pendingStatus: "Pending Quote Requirements",
    };
  });

  const allRequirementsReadyForSubmission =
    trackStates.length > 0 &&
    trackStates.every((track) => Boolean(track.isReadyForSubmission));

  return {
    normalizedQuoteDetails,
    checklistState,
    trackStates,
    allRequirementsReadyForSubmission,
    missingRequirementKeys: trackStates
      .filter((track) => !track.isReadyForSubmission)
      .map((track) => track.key),
    currentStatus: quoteStatus,
  };
};

const areQuoteRequirementsCompleted = (project = {}) =>
  getQuoteRequirementProgressState(project).allRequirementsReadyForSubmission;

const syncQuoteProjectStatusByRequirements = (project = {}) => {
  if (!isQuoteProject(project)) {
    return {
      changed: false,
      fromStatus: toText(project?.status),
      toStatus: toText(project?.status),
      allRequirementsCompleted: false,
    };
  }

  const previousStatus = toText(project?.status);
  const quoteState = getQuoteRequirementProgressState(project);
  const requirementMode = quoteState.checklistState.mode;
  const lockedStatuses = new Set(["Completed", "Finished", "Declined"]);

  if (lockedStatuses.has(previousStatus)) {
    return {
      changed: false,
      fromStatus: previousStatus,
      toStatus: previousStatus,
      allRequirementsCompleted: quoteState.allRequirementsReadyForSubmission,
    };
  }

  let nextStatus = previousStatus;
  if (project?.invoice?.sent) {
    nextStatus = "Pending Client Decision";
  } else if (quoteState.allRequirementsReadyForSubmission) {
    nextStatus = "Pending Quote Submission";
  } else if (requirementMode === "multi") {
    nextStatus = "Pending Quote Requirements";
  } else if (requirementMode === "mockup") {
    nextStatus = "Pending Mockup";
  } else if (requirementMode === "previousSamples") {
    nextStatus = "Pending Sample Retrieval";
  } else if (requirementMode === "sampleProduction") {
    nextStatus = quoteState.trackStates.find(
      (track) => track.key === "sampleProduction",
    )?.pendingStatus || "Pending Mockup";
  } else if (requirementMode === "bidSubmission") {
    nextStatus = "Pending Quote Submission";
  } else if (requirementMode === "cost") {
    nextStatus = "Pending Cost Verification";
  }

  if (nextStatus && nextStatus !== previousStatus) {
    project.status = nextStatus;
  }

  return {
    changed: nextStatus !== previousStatus,
    fromStatus: previousStatus,
    toStatus: nextStatus,
    allRequirementsCompleted: quoteState.allRequirementsReadyForSubmission,
  };
};

const syncQuoteMockupRequirementDecision = ({
  project,
  targetStatus,
  actorId,
  note = "",
} = {}) => {
  if (!isQuoteProject(project)) {
    return {
      changed: false,
      fromStatus: "",
      toStatus: toText(targetStatus).toLowerCase(),
      statusSync: {
        changed: false,
        fromStatus: toText(project?.status),
        toStatus: toText(project?.status),
      },
    };
  }

  const normalizedTargetStatus = toText(targetStatus).toLowerCase();
  if (!QUOTE_REQUIREMENT_STATUS_SET.has(normalizedTargetStatus)) {
    return {
      changed: false,
      fromStatus: "",
      toStatus: normalizedTargetStatus,
      statusSync: {
        changed: false,
        fromStatus: toText(project?.status),
        toStatus: toText(project?.status),
      },
    };
  }

  project.quoteDetails = normalizeQuoteDetailsWorkflow({
    quoteDetailsInput: project.quoteDetails || {},
    existingQuoteDetails: project.quoteDetails || {},
  });
  const requirementItem = project.quoteDetails?.requirementItems?.mockup;
  if (!requirementItem?.isRequired) {
    const statusSync = syncQuoteProjectStatusByRequirements(project);
    return {
      changed: false,
      fromStatus: "",
      toStatus: normalizedTargetStatus,
      statusSync,
    };
  }

  const fromStatus = toText(requirementItem.status).toLowerCase() || "assigned";
  const transitionTime = new Date();
  if (fromStatus !== normalizedTargetStatus) {
    requirementItem.history = Array.isArray(requirementItem.history)
      ? requirementItem.history
      : [];
    requirementItem.history.push({
      fromStatus,
      toStatus: normalizedTargetStatus,
      changedAt: transitionTime,
      changedBy: actorId || null,
      note: toText(note),
    });
    requirementItem.status = normalizedTargetStatus;
    requirementItem.updatedAt = transitionTime;
    requirementItem.updatedBy = actorId || null;
    if (normalizedTargetStatus !== "client_approved") {
      requirementItem.completionConfirmedAt = null;
      requirementItem.completionConfirmedBy = null;
    }
    requirementItem.note = toText(note);
    project.markModified("quoteDetails.requirementItems");
  }

  const statusSync = syncQuoteProjectStatusByRequirements(project);
  return {
    changed: fromStatus !== normalizedTargetStatus,
    fromStatus,
    toStatus: normalizedTargetStatus,
    statusSync,
  };
};

const getUserCanonicalDepartments = (user = {}) =>
  new Set(
    toDepartmentArray(user?.department)
      .map(canonicalizeDepartment)
      .filter(Boolean),
  );

const canTransitionQuoteRequirementByRole = ({
  user,
  requirementKey,
  toStatus,
} = {}) => {
  if (!user) return false;
  if (user.role === "admin") return true;

  if (!QUOTE_REQUIREMENT_KEYS.includes(requirementKey)) return false;

  const normalizedTargetStatus = toText(toStatus).toLowerCase();
  if (!QUOTE_REQUIREMENT_STATUS_SET.has(normalizedTargetStatus)) return false;

  if (QUOTE_REQUIREMENT_ADMIN_ONLY_TARGETS.has(normalizedTargetStatus)) return false;

  const userDepartmentSet = getUserCanonicalDepartments(user);
  const isFrontDesk = userDepartmentSet.has(canonicalizeDepartment(FRONT_DESK_DEPARTMENT));

  if (normalizedTargetStatus === "assigned") {
    if (!QUOTE_REQUIREMENT_FRONT_DESK_MANAGED_KEYS.has(requirementKey)) {
      return false;
    }
    return isFrontDesk;
  }

  if (QUOTE_REQUIREMENT_FRONT_DESK_STAGES.has(normalizedTargetStatus)) {
    if (!QUOTE_REQUIREMENT_FRONT_DESK_MANAGED_KEYS.has(requirementKey)) {
      return false;
    }
    return isFrontDesk;
  }

  if (QUOTE_REQUIREMENT_DEPARTMENT_STAGES.has(normalizedTargetStatus)) {
    const allowedDepartments =
      QUOTE_REQUIREMENT_DEPARTMENT_STAGE_ACCESS[requirementKey] || new Set();

    for (const departmentToken of allowedDepartments) {
      if (userDepartmentSet.has(departmentToken)) return true;
    }
    return false;
  }

  return false;
};

const isQuoteRequirementTransitionAllowed = (
  fromStatus,
  toStatus,
  requirementKey = "",
) => {
  const normalizedFrom = toText(fromStatus).toLowerCase();
  const normalizedTo = toText(toStatus).toLowerCase();
  const allowedTargets = QUOTE_REQUIREMENT_ALLOWED_TRANSITIONS[normalizedFrom];
  if (allowedTargets?.has(normalizedTo)) return true;

  const requirementCustomTransitions =
    QUOTE_REQUIREMENT_CUSTOM_ALLOWED_TRANSITIONS[toText(requirementKey)] || {};
  const customAllowedTargets = requirementCustomTransitions[normalizedFrom];
  if (customAllowedTargets?.has(normalizedTo)) return true;

  return false;
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
  const normalizedStatus = normalizeMasterApprovalStatus(status);
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
  const normalized = allStatuses
    .map((status) => normalizeMasterApprovalStatus(status))
    .filter((status) => isStatusCompatibleWithProjectType(status, projectType));
  return Array.from(new Set(normalized));
};
const normalizeProjectStatusFields = (project) => {
  if (!project) return project;
  const normalizedStatus = normalizeMasterApprovalStatus(project.status);
  if (normalizedStatus && normalizedStatus !== project.status) {
    project.status = normalizedStatus;
  }
  const statusSla =
    typeof Project.buildStatusSla === "function"
      ? Project.buildStatusSla(project)
      : null;
  if (statusSla) {
    project.statusChangedAt = project.statusChangedAt || statusSla.since;
    if (typeof project.set === "function") {
      project.set("sla", statusSla, { strict: false });
    } else {
      project.sla = statusSla;
    }
  }
  if (project.hold?.previousStatus) {
    const normalizedPrevious = normalizeMasterApprovalStatus(
      project.hold.previousStatus,
    );
    if (normalizedPrevious && normalizedPrevious !== project.hold.previousStatus) {
      project.hold.previousStatus = normalizedPrevious;
    }
  }
  return project;
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

const RISK_FACETS = [
  "artwork",
  "setup",
  "material",
  "finishing",
  "installation",
  "schedule",
  "handoff",
  "vendor",
];

const RISK_FACET_LOOKUP = {
  artwork: "artwork",
  art: "artwork",
  setup: "setup",
  material: "material",
  finishing: "finishing",
  finish: "finishing",
  installation: "installation",
  install: "installation",
  schedule: "schedule",
  timeline: "schedule",
  handoff: "handoff",
  handoffs: "handoff",
  vendor: "vendor",
  supplier: "vendor",
};

const ITEM_FAMILY_RULES = [
  {
    id: "flag-banner",
    label: "Flags / Banners",
    keywords: [
      "flag",
      "flags",
      "banner",
      "banners",
      "backdrop",
      "feather flag",
      "fabric stand",
    ],
  },
  {
    id: "sticker-label",
    label: "Stickers / Labels",
    keywords: ["sticker", "stickers", "label", "labels", "decal", "decals", "wrap"],
  },
  {
    id: "garment-apparel",
    label: "Garments / Apparel",
    keywords: [
      "shirt",
      "shirts",
      "t shirt",
      "tshirt",
      "hoodie",
      "hoodies",
      "jersey",
      "uniform",
      "cap",
      "hat",
      "garment",
      "apparel",
      "wear",
    ],
  },
  {
    id: "card",
    label: "Cards / Badges",
    keywords: [
      "card",
      "cards",
      "business card",
      "business cards",
      "id card",
      "badge",
      "badges",
      "lanyard",
      "pvc",
    ],
  },
  {
    id: "rigid-sign-acrylic",
    label: "Rigid Signs / Acrylic",
    keywords: [
      "sign",
      "signage",
      "panel",
      "panels",
      "acrylic",
      "foam board",
      "forex",
      "sintra",
      "lightbox",
      "rigid",
    ],
  },
  {
    id: "fabrication-wood",
    label: "Fabrication / Wood",
    keywords: [
      "wood",
      "wooden",
      "mdf",
      "plywood",
      "frame",
      "metal",
      "fabrication",
      "weld",
      "welding",
      "cutout",
      "carving",
    ],
  },
  {
    id: "installation",
    label: "Installation",
    keywords: [
      "install",
      "installation",
      "mount",
      "mounted",
      "site",
      "wayfinding",
      "wall branding",
      "fitment",
    ],
  },
];

const ITEM_FAMILY_RISK_TEMPLATES = {
  "flag-banner": [
    {
      facet: "material",
      description:
        "Fabric stretch or pole-pocket sizing can distort the final flag/banner tension.",
      preventive:
        "Validate finished dimensions, hem allowances, and hardware fit on a pilot sample before bulk sewing or finishing.",
    },
    {
      facet: "finishing",
      description:
        "Flag/banner edge finishing can fray or curl if stitching and heat finishing are mismatched.",
      preventive:
        "Approve one finished sample with the exact stitch, hem, and finishing method before the main run.",
    },
  ],
  "sticker-label": [
    {
      facet: "material",
      description:
        "Sticker/label adhesive performance may fail on textured, dusty, or low-energy surfaces.",
      preventive:
        "Confirm the real application surface and run adhesion tests on a representative sample before production.",
    },
    {
      facet: "setup",
      description:
        "Kiss-cut depth or registration setup can make sticker/label weeding slow or inconsistent.",
      preventive:
        "Lock contour-cut settings and test peel/weeding on a short sample sheet before the full run.",
    },
  ],
  "garment-apparel": [
    {
      facet: "material",
      description:
        "Garment fabric blend and surface finish can change transfer, print, or embroidery holdout.",
      preventive:
        "Verify the actual garment fabric composition and approve a strike-off on the final stock before production.",
    },
    {
      facet: "finishing",
      description:
        "Garment size sorting and fold/packing can introduce mix-ups after decoration is complete.",
      preventive:
        "Use a size-based packing checklist and end-of-line verification before sealing finished garments.",
    },
  ],
  card: [
    {
      facet: "setup",
      description:
        "Card trim and slot/alignment tolerances can drift and make finished cards look inconsistent.",
      preventive:
        "Approve a first-piece card against trim and slot position checkpoints before batch finishing.",
    },
    {
      facet: "finishing",
      description:
        "Card lamination and stacking can trap dust or leave surface marks on finished pieces.",
      preventive:
        "Control lamination cleanliness and inspect finished stacks at batch intervals before packing.",
    },
  ],
  "rigid-sign-acrylic": [
    {
      facet: "material",
      description:
        "Rigid sign/acrylic substrate flatness and masking quality can affect print adhesion and finish.",
      preventive:
        "Inspect sheet flatness, surface prep, and masking quality before printing or fabrication starts.",
    },
    {
      facet: "installation",
      description:
        "Rigid sign/acrylic mounting details can fail if fixing method and site conditions are assumed.",
      preventive:
        "Confirm mounting hardware, wall type, and measured install positions before final fabrication.",
    },
  ],
  "fabrication-wood": [
    {
      facet: "setup",
      description:
        "Fabrication/wood tolerance stacking can create assembly gaps after cutting and joining.",
      preventive:
        "Add first-piece assembly checks and hold-point measurements before releasing full fabrication.",
    },
    {
      facet: "finishing",
      description:
        "Wood/fabrication finishing may expose surface defects that were not obvious during raw processing.",
      preventive:
        "Approve a sample finish panel and inspect all visible surfaces before paint or coating is completed.",
    },
  ],
  installation: [
    {
      facet: "installation",
      description:
        "Installation access windows and site readiness can delay final placement even after production is complete.",
      preventive:
        "Confirm site access, permits, and readiness checkpoints before dispatching finished work.",
    },
    {
      facet: "handoff",
      description:
        "Installation jobs can miss critical hardware or layout notes during production-to-site handoff.",
      preventive:
        "Send installers a signed install pack with hardware list, layout drawing, and site notes before dispatch.",
    },
  ],
};

const CONSTRAINT_RISK_TEMPLATES = {
  rush: [
    {
      facet: "schedule",
      description:
        "Compressed timelines may remove setup verification time and increase late rework risk.",
      preventive:
        "Freeze approval checkpoints early and reserve protected buffer time for first-piece validation.",
    },
  ],
  outsourced: [
    {
      facet: "vendor",
      description:
        "Outsourced steps may diverge from internal specs if the vendor brief is not production-ready.",
      preventive:
        "Share a signed production brief with visuals, tolerances, and QC checkpoints before release to vendor.",
    },
  ],
  "vendor-dependent": [
    {
      facet: "vendor",
      description:
        "Vendor or supplier dependency can delay the job if material readiness is assumed without confirmation.",
      preventive:
        "Confirm stock, turnaround, and escalation contacts with the vendor before locking the production plan.",
    },
  ],
  "client-supplied": [
    {
      facet: "material",
      description:
        "Client-supplied materials may behave differently from standard stock and cause process instability.",
      preventive:
        "Run incoming material QA and approve a sample output on the supplied stock before the full run.",
    },
  ],
  "high-volume": [
    {
      facet: "setup",
      description:
        "High-volume production can amplify small setup errors into large rework quantities.",
      preventive:
        "Lock a first-piece approval and scheduled in-run QC checkpoints before scaling up batch volume.",
    },
  ],
  "multi-department": [
    {
      facet: "handoff",
      description:
        "Multi-department jobs can lose critical production notes between design, output, finishing, and delivery.",
      preventive:
        "Use a stage handoff checklist with measurable acceptance criteria before each downstream release.",
    },
  ],
  installation: [
    {
      facet: "installation",
      description:
        "Installation sequencing can fail if site measurement, hardware, and final output are not aligned.",
      preventive:
        "Confirm final measurements, fixing method, and delivery order before packaging the install set.",
    },
  ],
};

const normalizeRiskFacet = (value) => {
  const token = normalizeTextToken(value);
  if (!token) return "";
  return RISK_FACET_LOOKUP[token] || "";
};

const inferRiskFacetFromSuggestion = (suggestion = {}) => {
  const explicitFacet = normalizeRiskFacet(suggestion?.facet);
  if (explicitFacet) return explicitFacet;

  const text = `${toText(suggestion?.description)} ${toText(suggestion?.preventive)}`.toLowerCase();

  if (/artwork|file|mockup|font|proof|approval|icc|profile/.test(text)) {
    return "artwork";
  }
  if (/setup|registration|align|first-piece|makeready|jig|fixture|calibrat/.test(text)) {
    return "setup";
  }
  if (/material|substrate|fabric|stock|sheet|adhesion|lamination|humidity|moisture|surface/.test(text)) {
    return "material";
  }
  if (/finish|packing|packaging|trim|lamination|fold|stitch|stack|scuff/.test(text)) {
    return "finishing";
  }
  if (/install|mount|site|dispatch|hardware|fitment/.test(text)) {
    return "installation";
  }
  if (/delay|timeline|schedule|dispatch|lead time|late|buffer/.test(text)) {
    return "schedule";
  }
  if (/handoff|handover|between departments|release|upstream|downstream/.test(text)) {
    return "handoff";
  }
  if (/vendor|supplier|third-party|third party|outsource|external/.test(text)) {
    return "vendor";
  }

  return "";
};

const resolveItemFamilyRule = (value = "") => {
  const normalized = normalizeTextToken(value);
  if (!normalized) return null;

  return (
    ITEM_FAMILY_RULES.find((rule) =>
      rule.keywords.some((keyword) => normalized.includes(normalizeTextToken(keyword))),
    ) || null
  );
};

const buildRiskItemInsight = (item = {}, index = 0) => {
  const subject = normalizeRiskItemSubject(item);
  const combinedText = [
    subject,
    toText(item?.description),
    toText(item?.breakdown),
    toText(item?.department),
    toText(item?.departmentRaw),
  ]
    .filter(Boolean)
    .join(" ");
  const familyRule = resolveItemFamilyRule(combinedText);
  const departmentId = normalizeProductionDepartment(
    item?.department || item?.departmentRaw,
  );
  const quantity =
    typeof item?.quantity === "number"
      ? item.quantity
      : Number.isFinite(Number(item?.qty))
        ? Number(item?.qty)
        : null;

  return {
    itemRef: subject || `Item ${index + 1}`,
    subject: subject || `Item ${index + 1}`,
    familyId: familyRule?.id || "",
    familyLabel: familyRule?.label || "",
    department: departmentId,
    departmentLabel: PRODUCTION_DEPARTMENT_LABELS[departmentId] || departmentId,
    quantity,
  };
};

const buildProcessConstraintTags = (context = {}, itemInsights = []) => {
  const tags = new Set();
  const supplySource = toText(context.supplySource).toLowerCase();
  const priority = toText(context.priority).toLowerCase();
  const deliveryDate = toDateOrNull(context.deliveryDate);
  const now = new Date();
  const totalQty = itemInsights.reduce(
    (sum, item) => sum + (Number.isFinite(item.quantity) ? item.quantity : 0),
    0,
  );

  if (
    /urgent|rush|critical|emergency/.test(priority) ||
    (deliveryDate && deliveryDate.getTime() - now.getTime() <= 3 * 24 * 60 * 60 * 1000)
  ) {
    tags.add("rush");
  }

  if (context.productionDepartments.length > 1) {
    tags.add("multi-department");
  }

  if (
    context.productionDepartments.some((dept) =>
      ["local-outsourcing", "overseas"].includes(dept),
    )
  ) {
    tags.add("outsourced");
    tags.add("vendor-dependent");
  }

  if (supplySource.includes("purchase")) {
    tags.add("vendor-dependent");
  }
  if (supplySource.includes("client-supply")) {
    tags.add("client-supplied");
  }
  if (context.productionDepartments.includes("installation")) {
    tags.add("installation");
  }
  if (
    itemInsights.some(
      (item) => item.familyId === "installation" || item.familyId === "rigid-sign-acrylic",
    )
  ) {
    tags.add("installation");
  }
  if (totalQty >= 300 || itemInsights.some((item) => Number(item.quantity) >= 100)) {
    tags.add("high-volume");
  }

  return Array.from(tags);
};

const buildRequiredRiskFacets = (context = {}, itemInsights = [], constraintTags = []) => {
  const required = [];
  const addFacet = (facet) => {
    const normalized = normalizeRiskFacet(facet);
    if (normalized && !required.includes(normalized)) {
      required.push(normalized);
    }
  };

  addFacet("setup");
  addFacet("material");
  addFacet("schedule");

  if (
    context.productionDepartments.includes("graphics") ||
    itemInsights.some((item) => ["flag-banner", "sticker-label", "garment-apparel", "card"].includes(item.familyId))
  ) {
    addFacet("artwork");
  }

  if (
    itemInsights.some((item) =>
      ["flag-banner", "garment-apparel", "card", "rigid-sign-acrylic", "fabrication-wood"].includes(
        item.familyId,
      ),
    )
  ) {
    addFacet("finishing");
  }

  if (constraintTags.includes("installation")) {
    addFacet("installation");
  }

  if (constraintTags.includes("multi-department")) {
    addFacet("handoff");
  }

  if (
    constraintTags.some((tag) =>
      ["outsourced", "vendor-dependent", "client-supplied"].includes(tag),
    )
  ) {
    addFacet("vendor");
  }

  return required;
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
  const acceptedEntries = [];
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
    const preventiveTokens = buildRiskTokenSet(preventive, 4);
    const isNearDuplicate = acceptedEntries.some(
      (entry) =>
        computeTokenOverlapRatio(descriptionTokens, entry.descriptionTokens) >=
          0.78 ||
        (computeTokenOverlapRatio(descriptionTokens, entry.descriptionTokens) >=
          0.62 &&
          computeTokenOverlapRatio(preventiveTokens, entry.preventiveTokens) >=
            0.62),
    );
    if (isNearDuplicate) return;

    const facet = inferRiskFacetFromSuggestion(item);
    const department = normalizeProductionDepartment(item?.department);
    const itemRef = toText(item?.itemRef);

    uniqueDescriptions.add(descriptionKey);
    acceptedEntries.push({
      descriptionTokens,
      preventiveTokens,
    });

    cleaned.push({
      description: description.slice(0, 160),
      preventive: preventive.slice(0, 220),
      facet,
      department,
      itemRef: itemRef.slice(0, 80),
    });
  });

  return cleaned.slice(0, limit);
};

const buildRiskSuggestionContext = (projectData = {}, requestMeta = {}) => {
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

  const existingRisks = toSafeArray(projectData?.productionRisks)
    .map((risk) => ({
      description: toText(risk?.description),
      preventive: toText(risk?.preventive),
      facet: inferRiskFacetFromSuggestion(risk),
    }))
    .filter((risk) => risk.description)
    .slice(0, 20);
  const existingRiskDescriptions = existingRisks
    .map((risk) => risk.description)
    .filter(Boolean);
  const supplySourceRaw =
    details && Object.prototype.hasOwnProperty.call(details, "supplySource")
      ? details.supplySource
      : projectData?.supplySource;
  const supplySource = toSupplySourceText(supplySourceRaw);
  const itemInsights = items
    .map((item, index) => buildRiskItemInsight(item, index))
    .filter((item) => item.subject)
    .slice(0, 12);
  const constraintTags = buildProcessConstraintTags(
    {
      priority: toText(projectData?.priority) || "Normal",
      deliveryDate: toText(details?.deliveryDate || projectData?.deliveryDate),
      supplySource,
      productionDepartments,
    },
    itemInsights,
  );
  const requiredFacets = buildRequiredRiskFacets(
    { productionDepartments },
    itemInsights,
    constraintTags,
  );
  const previousShownSuggestions = toSafeArray(requestMeta?.shownSuggestions)
    .map((entry) => ({
      description: toText(entry?.description),
      facet: normalizeRiskFacet(entry?.facet),
    }))
    .filter((entry) => entry.description)
    .slice(-20);
  const previousShownDescriptions = previousShownSuggestions.map(
    (entry) => entry.description,
  );

  return {
    projectType: toText(projectData?.projectType) || "Standard",
    priority: toText(projectData?.priority) || "Normal",
    projectName: toText(details?.projectName || projectData?.projectName),
    briefOverview: toText(details?.briefOverview || projectData?.briefOverview),
    client: toText(details?.client || projectData?.client),
    contactType: toText(details?.contactType || projectData?.contactType),
    supplySource,
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
    itemInsights,
    itemFamilyIds: Array.from(
      new Set(itemInsights.map((item) => item.familyId).filter(Boolean)),
    ),
    constraintTags,
    requiredFacets,
    uncontrollableFactors,
    existingRisks,
    existingRiskDescriptions,
    previousShownSuggestions,
    previousShownDescriptions,
    retryCount: Math.max(
      0,
      Number.parseInt(requestMeta?.retryCount, 10) || 0,
    ),
    currentProjectId: toText(requestMeta?.currentProjectId),
    currentLineageId: toText(requestMeta?.currentLineageId),
  };
};

const filterExistingRiskSuggestions = (
  suggestions = [],
  existingRiskDescriptions = [],
) => {
  const existingDescriptionSet = new Set(
    existingRiskDescriptions.map((description) => description.toLowerCase()),
  );
  const existingDescriptionTokenSets = existingRiskDescriptions
    .map((description) => buildRiskTokenSet(description, 4))
    .filter((tokenSet) => tokenSet.size > 0);

  return sanitizeRiskSuggestions(suggestions, Number.POSITIVE_INFINITY).filter(
    (suggestion) => {
      const key = suggestion.description.toLowerCase();
      if (existingDescriptionSet.has(key)) return false;
      const suggestionTokens = buildRiskTokenSet(suggestion.description, 4);
      const isNearDuplicate = existingDescriptionTokenSets.some(
        (tokenSet) => computeTokenOverlapRatio(suggestionTokens, tokenSet) >= 0.78,
      );
      if (isNearDuplicate) return false;
      existingDescriptionSet.add(key);
      if (suggestionTokens.size > 0) {
        existingDescriptionTokenSets.push(suggestionTokens);
      }
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

  toSafeArray(context.itemInsights).forEach((item) => {
    addTokens(item?.subject, 4);
    addTokens(item?.familyLabel, 4);
    addTokens(item?.departmentLabel, 3);
  });

  toSafeArray(context.constraintTags).forEach((tag) => addTokens(tag, 3));
  toSafeArray(context.requiredFacets).forEach((facet) => addTokens(facet, 3));

  toSafeArray(context.uncontrollableFactors).forEach((factor) => {
    addTokens(factor?.description, 4);
    addTokens(factor?.responsible, 3);
  });

  return keywords;
};

const scoreRiskSuggestionAgainstContext = (
  suggestion = {},
  context = {},
  contextKeywordSet = new Set(),
) => {
  const description = toText(suggestion.description);
  const preventive = toText(suggestion.preventive);
  if (!description) return Number.NEGATIVE_INFINITY;

  const suggestionFacet = inferRiskFacetFromSuggestion(suggestion);
  const suggestionDepartment = normalizeProductionDepartment(suggestion?.department);
  const itemRef = toText(suggestion?.itemRef);
  let score = 0;
  buildRiskTokenSet(description, 3).forEach((token) => {
    if (contextKeywordSet.has(token)) score += 2;
  });
  buildRiskTokenSet(preventive, 3).forEach((token) => {
    if (contextKeywordSet.has(token)) score += 1;
  });

  if (suggestionFacet && toSafeArray(context.requiredFacets).includes(suggestionFacet))
    score += 3;
  if (
    suggestionDepartment &&
    toSafeArray(context.productionDepartments).includes(suggestionDepartment)
  ) {
    score += 2.5;
  }
  if (itemRef) {
    const itemRefTokens = buildRiskTokenSet(itemRef, 3);
    const hasItemMatch = toSafeArray(context.itemInsights).some((item) => {
      const subjectTokens = buildRiskTokenSet(item?.subject, 3);
      return computeTokenOverlapRatio(itemRefTokens, subjectTokens) >= 0.5;
    });
    if (hasItemMatch) score += 2.5;
  }

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

  const scored = sanitized
    .map((suggestion, index) => ({
      suggestion,
      index,
      score: scoreRiskSuggestionAgainstContext(
        suggestion,
        context,
        contextKeywordSet,
      ),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    });

  const selected = [];
  const usedIndexes = new Set();
  const desiredFacets = toSafeArray(context.requiredFacets).length
    ? toSafeArray(context.requiredFacets)
    : RISK_FACETS;

  desiredFacets.forEach((facet) => {
    const matched = scored.find(
      (entry, index) =>
        !usedIndexes.has(index) &&
        inferRiskFacetFromSuggestion(entry.suggestion) === facet,
    );
    if (!matched) return;
    const matchedIndex = scored.indexOf(matched);
    usedIndexes.add(matchedIndex);
    selected.push(matched.suggestion);
  });

  scored.forEach((entry, index) => {
    if (selected.length >= limit || usedIndexes.has(index)) return;
    usedIndexes.add(index);
    selected.push(entry.suggestion);
  });

  return selected.slice(0, limit);
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
  departmentId = "",
  departmentLabel,
  itemSubject,
  itemRef = "",
  projectName,
}) => {
  if (!itemSubject) {
    if (projectName) {
      return {
        description: `[${departmentLabel}] ${stripSentencePeriod(template.description)} for "${projectName}".`,
        preventive: `${stripSentencePeriod(template.preventive)} for "${projectName}".`,
        facet: normalizeRiskFacet(template?.facet) || inferRiskFacetFromSuggestion(template),
        department: departmentId,
        itemRef: itemRef || projectName,
      };
    }

    return {
      description: `[${departmentLabel}] ${template.description}`,
      preventive: template.preventive,
      facet: normalizeRiskFacet(template?.facet) || inferRiskFacetFromSuggestion(template),
      department: departmentId,
      itemRef,
    };
  }

  return {
    description: `[${departmentLabel}] ${stripSentencePeriod(template.description)} for "${itemSubject}".`,
    preventive: `${stripSentencePeriod(template.preventive)} for "${itemSubject}".`,
    facet: normalizeRiskFacet(template?.facet) || inferRiskFacetFromSuggestion(template),
    department: departmentId,
    itemRef: itemRef || itemSubject,
  };
};

const scoreContextOverlap = (left = [], right = []) => {
  const rightSet = new Set(toSafeArray(right).filter(Boolean));
  return toSafeArray(left).filter((entry) => rightSet.has(entry)).length;
};

const buildContextItemTokenSet = (context = {}) => {
  const tokenSet = new Set();
  toSafeArray(context.itemInsights).forEach((item) => {
    buildRiskTokenSet(item?.subject, 3).forEach((token) => tokenSet.add(token));
    buildRiskTokenSet(item?.familyLabel, 3).forEach((token) => tokenSet.add(token));
  });
  return tokenSet;
};

const preferLatestRiskHistoryProject = (currentProject, candidateProject) => {
  if (!currentProject) return candidateProject;
  if (candidateProject?.isLatestVersion && !currentProject?.isLatestVersion) {
    return candidateProject;
  }
  if (!candidateProject?.isLatestVersion && currentProject?.isLatestVersion) {
    return currentProject;
  }

  const currentVersion = Number(currentProject?.versionNumber) || 1;
  const candidateVersion = Number(candidateProject?.versionNumber) || 1;
  if (candidateVersion !== currentVersion) {
    return candidateVersion > currentVersion ? candidateProject : currentProject;
  }

  const currentTimestamp = new Date(
    currentProject?.updatedAt || currentProject?.createdAt || 0,
  ).getTime();
  const candidateTimestamp = new Date(
    candidateProject?.updatedAt || candidateProject?.createdAt || 0,
  ).getTime();
  return candidateTimestamp >= currentTimestamp ? candidateProject : currentProject;
};

const scoreHistoricalRiskMatch = (candidateContext = {}, currentContext = {}) => {
  const candidateTokens = buildContextItemTokenSet(candidateContext);
  const currentTokens = buildContextItemTokenSet(currentContext);

  let score = 0;
  score +=
    scoreContextOverlap(
      candidateContext.productionDepartments,
      currentContext.productionDepartments,
    ) * 10;
  score += scoreContextOverlap(candidateContext.itemFamilyIds, currentContext.itemFamilyIds) * 8;
  score += computeTokenOverlapRatio(candidateTokens, currentTokens) * 6;
  score += scoreContextOverlap(candidateContext.constraintTags, currentContext.constraintTags) * 2;

  if (
    candidateContext.projectType &&
    candidateContext.projectType === currentContext.projectType
  ) {
    score += 2;
  }
  if (
    candidateContext.supplySource &&
    candidateContext.supplySource === currentContext.supplySource
  ) {
    score += 2;
  }

  return score;
};

const fetchHistoricalRiskExamples = async (context = {}) => {
  const currentProjectId = toText(context.currentProjectId);
  const currentLineageId = toText(context.currentLineageId);
  const projectDocs = await Project.find({ "productionRisks.0": { $exists: true } })
    .select(
      "_id lineageId versionNumber isLatestVersion projectType priority details departments items productionRisks createdAt updatedAt",
    )
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(250)
    .lean();

  const latestByLineage = new Map();
  projectDocs.forEach((project) => {
    const lineageKey =
      toObjectIdString(project?.lineageId) || toObjectIdString(project?._id);
    if (!lineageKey) return;
    latestByLineage.set(
      lineageKey,
      preferLatestRiskHistoryProject(latestByLineage.get(lineageKey), project),
    );
  });

  return Array.from(latestByLineage.values())
    .filter((project) => {
      const projectId = toObjectIdString(project?._id);
      const lineageId =
        toObjectIdString(project?.lineageId) || toObjectIdString(project?._id);
      if (currentProjectId && projectId === currentProjectId) return false;
      if (
        currentLineageId &&
        (lineageId === currentLineageId || projectId === currentLineageId)
      ) {
        return false;
      }
      return true;
    })
    .map((project) => {
      const candidateContext = buildRiskSuggestionContext(project);
      const score = scoreHistoricalRiskMatch(candidateContext, context);
      const exampleRisks = filterExistingRiskSuggestions(
        candidateContext.existingRisks,
        [
          ...context.existingRiskDescriptions,
          ...context.previousShownDescriptions,
        ],
      ).slice(0, 2);

      return {
        project,
        candidateContext,
        score,
        exampleRisks,
      };
    })
    .filter((entry) => entry.score > 0 && entry.exampleRisks.length > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rightTime = new Date(
        right.project?.updatedAt || right.project?.createdAt || 0,
      ).getTime();
      const leftTime = new Date(
        left.project?.updatedAt || left.project?.createdAt || 0,
      ).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 5)
    .map((entry) => ({
      projectId: toObjectIdString(entry.project?._id),
      projectName: entry.candidateContext.projectName || "Unnamed Project",
      projectType: entry.candidateContext.projectType,
      productionDepartments: entry.candidateContext.productionDepartmentLabels.slice(
        0,
        4,
      ),
      itemSubjects: entry.candidateContext.itemInsights
        .map((item) => item.subject)
        .filter(Boolean)
        .slice(0, 3),
      exampleRisks: entry.exampleRisks.map((risk) => ({
        facet: risk.facet || "",
        description: risk.description,
        preventive: risk.preventive,
      })),
    }));
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
      const matchingInsight = toSafeArray(context.itemInsights).find(
        (item) =>
          item.department === departmentId && item.subject === itemSubject,
      );

      fallbackSuggestions.push(
        buildDepartmentScopedFallbackSuggestion({
          template,
          departmentId,
          departmentLabel: label,
          itemSubject,
          itemRef: matchingInsight?.itemRef || itemSubject,
          projectName: context.projectName,
        }),
      );
    });
  });

  toSafeArray(context.itemInsights).forEach((item) => {
    const familyTemplates = ITEM_FAMILY_RISK_TEMPLATES[item.familyId] || [];
    familyTemplates.forEach((template) => {
      fallbackSuggestions.push({
        description: `[${item.departmentLabel || item.familyLabel || "Production"}] ${stripSentencePeriod(
          template.description,
        )} for "${item.subject}".`,
        preventive: `${stripSentencePeriod(template.preventive)} for "${item.subject}".`,
        facet: normalizeRiskFacet(template?.facet) || inferRiskFacetFromSuggestion(template),
        department: item.department || "",
        itemRef: item.itemRef,
      });
    });
  });

  toSafeArray(context.constraintTags).forEach((tag) => {
    const templates = CONSTRAINT_RISK_TEMPLATES[tag] || [];
    const primaryItem = toSafeArray(context.itemInsights)[0];
    templates.forEach((template) => {
      fallbackSuggestions.push({
        description: primaryItem?.subject
          ? `${stripSentencePeriod(template.description)} for "${primaryItem.subject}".`
          : template.description,
        preventive: primaryItem?.subject
          ? `${stripSentencePeriod(template.preventive)} for "${primaryItem.subject}".`
          : template.preventive,
        facet: normalizeRiskFacet(template?.facet) || inferRiskFacetFromSuggestion(template),
        department: primaryItem?.department || "",
        itemRef: primaryItem?.itemRef || "",
      });
    });
  });

  const filteredSuggestions = filterExistingRiskSuggestions(
    fallbackSuggestions,
    [...context.existingRiskDescriptions, ...context.previousShownDescriptions],
  );

  return prioritizeRiskSuggestions(
    shuffleArray(filteredSuggestions),
    context,
    MAX_RISK_SUGGESTIONS,
  );
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
    retryContext: {
      retryCount: context.retryCount || 0,
      priorSessionSuggestions: toSafeArray(context.previousShownSuggestions)
        .slice(-8)
        .map((entry) => ({
          description: entry.description,
          facet: entry.facet || "",
        })),
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
    itemInsights: toSafeArray(context.itemInsights).slice(0, 12).map((item) => ({
      itemRef: item.itemRef,
      subject: item.subject,
      family: item.familyLabel || item.familyId || "",
      department: item.departmentLabel || item.department || "",
      quantity: Number.isFinite(item.quantity) ? item.quantity : null,
    })),
    constraints: toSafeArray(context.constraintTags).slice(0, 10),
    requiredFacets: toSafeArray(context.requiredFacets).slice(0, 8),
    uncontrollableFactors: toSafeArray(context.uncontrollableFactors)
      .slice(0, 8)
      .map((factor) => ({
        description: toText(factor?.description),
        responsible: toText(factor?.responsible),
        status: toText(factor?.status),
      })),
    existingRisks: toSafeArray(context.existingRisks).slice(0, 15),
    similarProjectPatterns: toSafeArray(context.historyExamples).slice(0, 5),
  };

  return [
    "Analyze the project snapshot and suggest production execution risks.",
    "Return STRICT JSON only. Do not wrap in markdown.",
    "Required format:",
    '{"suggestions":[{"facet":"...","department":"...","itemRef":"...","description":"...","preventive":"..."}]}',
    "",
    "Rules:",
    "- Return 4 to 5 suggestions.",
    `- Use only these facet values: ${RISK_FACETS.join(", ")}.`,
    "- Each description must mention the relevant item or production type for this project.",
    "- Each description must be specific to this project (items, departments, timeline, or constraints).",
    "- Each preventive measure must be actionable and directly mitigate its paired risk.",
    "- Keep description <= 160 chars and preventive <= 220 chars.",
    "- Spread suggestions across different facets instead of repeating one failure mode.",
    "- Avoid generic wording and avoid repeating/paraphrasing any existing risk.",
    "- Avoid repeating or closely paraphrasing prior session suggestions.",
    "- Use similar project patterns only as inspiration. Do not copy their wording.",
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
                "You are a senior production planner for print and fabrication workflows. Return only valid JSON with concrete, project-specific, facet-diverse risk and preventive pairs.",
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
const getProjectDisplayName = (project) => {
  const details = project?.details || {};
  const baseName =
    normalizeProjectNameRaw(details.projectNameRaw) ||
    normalizeProjectNameRaw(details.projectName);
  const indicator = normalizeProjectIndicator(details.projectIndicator);
  if (baseName) {
    return indicator ? `${baseName} for ${indicator}` : baseName;
  }
  return "Unnamed Project";
};
const getUserDisplayName = (user) => {
  if (!user) return "Someone";
  const firstName = String(user.firstName || "").trim();
  const lastName = String(user.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  return fullName || user.name || user.employeeId || "Someone";
};
const getOrderItemTotalsSummary = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  const totalQty = list.reduce(
    (sum, item) => sum + (Number(item?.qty) || 0),
    0,
  );
  return `${list.length} item(s), ${totalQty} total qty`;
};
const formatRevisionItemSummary = (item = {}) => {
  const parts = [];
  const description = toText(item?.description);
  const breakdown = toText(item?.breakdown);
  const qty = Number(item?.qty);

  if (description) parts.push(description);
  if (breakdown) parts.push(breakdown);
  if (Number.isFinite(qty) && qty > 0) parts.push(`Qty: ${qty}`);

  return parts.join(" | ") || "N/A";
};
const sendProjectRevisionEmailSafely = async ({
  projectId,
  actor,
  requestBaseUrl = "",
  revisionParts = [],
  changeDetails = [],
  eventType = "update",
  reopenContext = null,
}) => {
  try {
    return await sendProjectRevisionEmail({
      projectId,
      actor,
      requestBaseUrl,
      revisionParts,
      changeDetails,
      eventType,
      reopenContext,
    });
  } catch (error) {
    console.error("Error sending order revision email:", error);
    return {
      skipped: false,
      sent: false,
      status: "failed",
      message: "Revision email failed to send.",
    };
  }
};
const getRequestSource = (req) => toText(req?.query?.source).toLowerCase();
const isAdminOrderManagementRequest = (req) =>
  getRequestSource(req) === "admin";
const formatBatchStatusLabel = (status = "") => {
  const base = toText(status).replace(/_/g, " ");
  if (!base) return "Unknown";
  return base.replace(/\b\w/g, (match) => match.toUpperCase());
};
const notifyLeadFromAdminOrderManagement = async ({
  req,
  project,
  title,
  message,
  type = "UPDATE",
}) => {
  try {
    if (!req?.user || req.user.role !== "admin") return;
    if (!isAdminOrderManagementRequest(req)) return;
    const projectId = toObjectIdString(project?._id);
    const leadId = toObjectIdString(project?.projectLeadId);
    if (!projectId || !leadId) return;

    await createNotification(
      leadId,
      req.user._id || req.user.id,
      projectId,
      type,
      title,
      message,
      { source: "admin_order_management" },
    );
  } catch (error) {
    console.error(
      "Error notifying lead for admin order management action:",
      error,
    );
  }
};
const normalizeOrderItems = (items = []) => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    description: String(item?.description || "").trim(),
    breakdown: String(item?.breakdown || "").trim(),
    qty: Number.isFinite(Number(item?.qty)) ? Number(item?.qty) : 0,
  }));
};
const hasItemListChanged = (previousItems = [], nextItems = []) => {
  const normalizedPrevious = normalizeOrderItems(previousItems);
  const normalizedNext = normalizeOrderItems(nextItems);
  if (normalizedPrevious.length !== normalizedNext.length) return true;
  return normalizedPrevious.some((item, index) => {
    const next = normalizedNext[index];
    if (!next) return true;
    return (
      item.description !== next.description ||
      item.breakdown !== next.breakdown ||
      item.qty !== next.qty
    );
  });
};
const getReviewEngagedRecipients = async (project = {}) => {
  const projectDepartments = toDepartmentArray(project?.departments);
  if (!projectDepartments.length) return [];

  const canonicalDepartments = new Set(
    projectDepartments.map(canonicalizeDepartment).filter(Boolean),
  );
  const hasProduction = canonicalDepartments.has("production");
  const hasGraphics = canonicalDepartments.has("graphics");
  if (!hasProduction && !hasGraphics) return [];

  const departmentFilters = new Set();
  if (hasProduction) {
    departmentFilters.add("Production");
    projectDepartments.forEach((dept) => {
      if (canonicalizeDepartment(dept) === "production") {
        departmentFilters.add(dept);
      }
    });
  }
  if (hasGraphics) {
    departmentFilters.add("Graphics/Design");
    projectDepartments.forEach((dept) => {
      if (canonicalizeDepartment(dept) === "graphics") {
        departmentFilters.add(dept);
      }
    });
  }

  const users = await User.find({
    department: { $in: Array.from(departmentFilters) },
  })
    .select("_id department")
    .lean();

  const recipients = new Set();
  users.forEach((user) => {
    if (!hasDepartmentOverlap(user?.department, projectDepartments)) return;
    const userCanonical = new Set(
      toDepartmentArray(user?.department)
        .map(canonicalizeDepartment)
        .filter(Boolean),
    );
    const matchesProduction = hasProduction && userCanonical.has("production");
    const matchesGraphics = hasGraphics && userCanonical.has("graphics");
    if (!matchesProduction && !matchesGraphics) return;
    const userId = toObjectIdString(user?._id);
    if (userId) recipients.add(userId);
  });

  return Array.from(recipients);
};
const notifyReviewUpdated = async ({ project, actor, revisionParts }) => {
  try {
    const projectId = toObjectIdString(project?._id);
    const actorId = toObjectIdString(actor?._id || actor?.id);
    const normalizedParts = Array.isArray(revisionParts)
      ? revisionParts.filter(Boolean)
      : [];
    if (!projectId || !actorId || normalizedParts.length === 0) return [];

    const actorName = getUserDisplayName(actor);
    const title = "Project Review";
    const message = `Project review for ${getProjectDisplayRef(project)}, ${getProjectDisplayName(project)}, by ${actorName}`;

    const directRecipients = new Set();
    const leadId = toObjectIdString(project?.projectLeadId);
    const assistantId = toObjectIdString(project?.assistantLeadId);
    if (leadId) directRecipients.add(leadId);
    if (assistantId) directRecipients.add(assistantId);

    const engagedRecipients = await getReviewEngagedRecipients(project);
    engagedRecipients.forEach((id) => directRecipients.add(id));

    for (const recipientId of directRecipients) {
      await createNotification(
        recipientId,
        actorId,
        projectId,
        "REVISION",
        title,
        message,
        { source: "order_revision" },
      );
    }

    await notifyAdmins(actorId, projectId, "REVISION", title, message, {
      excludeUserIds: Array.from(directRecipients),
    });

    return Array.from(directRecipients);
  } catch (error) {
    console.error("Error sending order revision notifications:", error);
    return [];
  }
};
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
    toText(approval?.rejectionReason) ||
    toText(approval?.rejectionAttachment?.fileUrl) ||
    normalizeStoredAttachmentList(approval?.rejectionAttachments).length > 0
  ) {
    return "rejected";
  }
  return "pending";
};

const MOCKUP_SOURCE_SET = new Set(["client", "graphics"]);
const MOCKUP_GRAPHICS_REVIEW_STATUS_SET = new Set([
  "pending",
  "validated",
  "superseded",
  "not_required",
]);

const getMockupSource = (value, fallback = "graphics") => {
  const normalizedValue = toText(value).toLowerCase();
  if (MOCKUP_SOURCE_SET.has(normalizedValue)) return normalizedValue;
  return fallback;
};

const getMockupGraphicsReviewStatus = (
  review = {},
  source = "graphics",
  intakeUpload = false,
) => {
  const explicitStatus = toText(review?.status).toLowerCase();
  if (MOCKUP_GRAPHICS_REVIEW_STATUS_SET.has(explicitStatus)) {
    return explicitStatus;
  }

  if (source === "client" || intakeUpload) {
    if (review?.reviewedAt || review?.reviewedBy) {
      return "validated";
    }
    return "pending";
  }

  return "not_required";
};

const buildMockupGraphicsReviewState = (
  review = {},
  source = "graphics",
  intakeUpload = false,
) => ({
  status: getMockupGraphicsReviewStatus(review, source, intakeUpload),
  reviewedAt: review?.reviewedAt || null,
  reviewedBy: review?.reviewedBy || null,
  note: toText(review?.note),
});

const buildMockupVersionRecord = (entry = {}, fallbackVersion = 1) => {
  const parsedVersion = Number.parseInt(entry?.version, 10);
  const version =
    Number.isFinite(parsedVersion) && parsedVersion > 0
      ? parsedVersion
      : fallbackVersion;
  const source = getMockupSource(
    entry?.source,
    parseBooleanFlag(entry?.intakeUpload, false) ? "client" : "graphics",
  );
  const intakeUpload = parseBooleanFlag(
    entry?.intakeUpload,
    source === "client",
  );

  return {
    entryId: entry?._id || entry?.id || null,
    version,
    fileUrl: toText(entry?.fileUrl),
    fileName: toText(entry?.fileName),
    fileType: toText(entry?.fileType),
    note: toText(entry?.note),
    uploadedBy: entry?.uploadedBy || null,
    uploadedAt: entry?.uploadedAt ? new Date(entry.uploadedAt) : null,
    source,
    intakeUpload,
    clientApprovedAtIntake: parseBooleanFlag(
      entry?.clientApprovedAtIntake,
      false,
    ),
    graphicsReview: buildMockupGraphicsReviewState(
      entry?.graphicsReview || {},
      source,
      intakeUpload,
    ),
    clientApproval: {
      status: getMockupApprovalStatus(entry?.clientApproval || {}),
      isApproved:
        getMockupApprovalStatus(entry?.clientApproval || {}) === "approved",
      approvedAt: entry?.clientApproval?.approvedAt || null,
      approvedBy: entry?.clientApproval?.approvedBy || null,
      rejectedAt: entry?.clientApproval?.rejectedAt || null,
      rejectedBy: entry?.clientApproval?.rejectedBy || null,
      rejectionReason: toText(entry?.clientApproval?.rejectionReason),
      note: toText(entry?.clientApproval?.note),
      rejectionAttachment: normalizeStoredAttachmentRecord(
        entry?.clientApproval?.rejectionAttachment,
      ),
      rejectionAttachments: normalizeStoredAttachmentList(
        entry?.clientApproval?.rejectionAttachments,
      ),
    },
  };
};

const ensureProjectMockupVersions = (project = {}) => {
  project.mockup = project.mockup || {};
  if (!Array.isArray(project.mockup.versions)) {
    project.mockup.versions = [];
  }

  if (project.mockup.versions.length === 0 && project.mockup.fileUrl) {
    project.mockup.versions.push({
      version: project.mockup.version || 1,
      fileUrl: project.mockup.fileUrl,
      fileName: project.mockup.fileName,
      fileType: project.mockup.fileType,
      note: project.mockup.note || "",
      uploadedBy: project.mockup.uploadedBy || null,
      uploadedAt: project.mockup.uploadedAt || null,
      source: getMockupSource(
        project.mockup.source,
        parseBooleanFlag(project.mockup.intakeUpload, false)
          ? "client"
          : "graphics",
      ),
      intakeUpload: parseBooleanFlag(project.mockup.intakeUpload, false),
      clientApprovedAtIntake: parseBooleanFlag(
        project.mockup.clientApprovedAtIntake,
        false,
      ),
      graphicsReview: buildMockupGraphicsReviewState(
        project.mockup.graphicsReview || {},
        getMockupSource(
          project.mockup.source,
          parseBooleanFlag(project.mockup.intakeUpload, false)
            ? "client"
            : "graphics",
        ),
        parseBooleanFlag(project.mockup.intakeUpload, false),
      ),
      clientApproval: {
        status: getMockupApprovalStatus(project.mockup?.clientApproval || {}),
        isApproved:
          getMockupApprovalStatus(project.mockup?.clientApproval || {}) ===
          "approved",
        approvedAt: project.mockup?.clientApproval?.approvedAt || null,
        approvedBy: project.mockup?.clientApproval?.approvedBy || null,
        rejectedAt: project.mockup?.clientApproval?.rejectedAt || null,
        rejectedBy: project.mockup?.clientApproval?.rejectedBy || null,
        rejectionReason:
          project.mockup?.clientApproval?.rejectionReason || "",
        note: project.mockup?.clientApproval?.note || "",
        rejectionAttachment: normalizeStoredAttachmentRecord(
          project.mockup?.clientApproval?.rejectionAttachment,
        ),
        rejectionAttachments: normalizeStoredAttachmentList(
          project.mockup?.clientApproval?.rejectionAttachments,
        ),
      },
    });
  }

  return project.mockup.versions;
};

const syncProjectMockupFromVersion = (
  project = {},
  versionEntry,
  { approvedVersion = null } = {},
) => {
  if (!project || !versionEntry) return;

  const source = getMockupSource(
    versionEntry?.source,
    parseBooleanFlag(versionEntry?.intakeUpload, false) ? "client" : "graphics",
  );
  const intakeUpload = parseBooleanFlag(versionEntry?.intakeUpload, false);
  const graphicsReview = buildMockupGraphicsReviewState(
    versionEntry?.graphicsReview || {},
    source,
    intakeUpload,
  );
  const approvalStatus = getMockupApprovalStatus(versionEntry?.clientApproval || {});

  project.mockup = project.mockup || {};
  project.mockup.fileUrl = versionEntry?.fileUrl || "";
  project.mockup.fileName = versionEntry?.fileName || "";
  project.mockup.fileType = versionEntry?.fileType || "";
  project.mockup.note = versionEntry?.note || "";
  project.mockup.uploadedBy = versionEntry?.uploadedBy || null;
  project.mockup.uploadedAt = versionEntry?.uploadedAt || null;
  project.mockup.version = Number.parseInt(versionEntry?.version, 10) || 1;
  project.mockup.source = source;
  project.mockup.intakeUpload = intakeUpload;
  project.mockup.clientApprovedAtIntake = parseBooleanFlag(
    versionEntry?.clientApprovedAtIntake,
    false,
  );
  project.mockup.graphicsReview = graphicsReview;
  project.mockup.clientApproval = {
    status: approvalStatus,
    isApproved: approvalStatus === "approved",
    approvedAt: versionEntry?.clientApproval?.approvedAt || null,
    approvedBy: versionEntry?.clientApproval?.approvedBy || null,
    rejectedAt: versionEntry?.clientApproval?.rejectedAt || null,
    rejectedBy: versionEntry?.clientApproval?.rejectedBy || null,
    rejectionReason: versionEntry?.clientApproval?.rejectionReason || "",
    note: versionEntry?.clientApproval?.note || "",
    rejectionAttachment:
      normalizeStoredAttachmentRecord(
        versionEntry?.clientApproval?.rejectionAttachment,
      ) || null,
    rejectionAttachments: normalizeStoredAttachmentList(
      versionEntry?.clientApproval?.rejectionAttachments,
    ),
    approvedVersion: approvedVersion ?? null,
  };
};

const resetProjectMockupState = (project = {}) => {
  project.mockup = project.mockup || {};
  project.mockup.fileUrl = "";
  project.mockup.fileName = "";
  project.mockup.fileType = "";
  project.mockup.note = "";
  project.mockup.uploadedBy = null;
  project.mockup.uploadedAt = null;
  project.mockup.source = "graphics";
  project.mockup.intakeUpload = false;
  project.mockup.clientApprovedAtIntake = false;
  project.mockup.graphicsReview = buildMockupGraphicsReviewState(
    { status: "not_required" },
    "graphics",
    false,
  );
  project.mockup.version = 1;
  project.mockup.clientApproval = {
    status: "pending",
    isApproved: false,
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: "",
    note: "",
    rejectionAttachment: null,
    rejectionAttachments: [],
    approvedVersion: null,
  };
};

const isClientProvidedMockupVersion = (version = {}) =>
  getMockupSource(version?.source, version?.intakeUpload ? "client" : "graphics") ===
  "client";

const isMockupGraphicsValidated = (version = {}) =>
  Boolean(version?.fileUrl) &&
  isClientProvidedMockupVersion(version) &&
  getMockupGraphicsReviewStatus(
    version?.graphicsReview || {},
    getMockupSource(version?.source, version?.intakeUpload ? "client" : "graphics"),
    parseBooleanFlag(version?.intakeUpload, false),
  ) === "validated";

const isMockupReadyForCompletion = (version = {}) =>
  Boolean(version?.fileUrl) &&
  (isMockupGraphicsValidated(version) ||
    getMockupApprovalStatus(version?.clientApproval || {}) === "approved");

const getNormalizedMockupVersions = (project = {}) => {
  const mockup = project?.mockup || {};
  const rawVersions = Array.isArray(mockup.versions) ? mockup.versions : [];

  const versions = rawVersions
    .map((entry, index) => buildMockupVersionRecord(entry, index + 1))
    .filter((entry) => entry.fileUrl);

  if (versions.length === 0 && toText(mockup.fileUrl)) {
    versions.push(buildMockupVersionRecord(mockup, 1));
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
  if (isMockupReadyForCompletion(latestVersion)) {
    return null;
  }

  const versionLabel = buildMockupVersionLabel(latestVersion.version);
  if (isClientProvidedMockupVersion(latestVersion)) {
    const graphicsReviewStatus = getMockupGraphicsReviewStatus(
      latestVersion.graphicsReview || {},
      latestVersion.source,
      latestVersion.intakeUpload,
    );

    if (graphicsReviewStatus === "superseded") {
      return {
        code: "MOCKUP_CLIENT_VERSION_SUPERSEDED",
        message: `Client mockup ${versionLabel} has been superseded. Complete the latest revised mockup instead.`,
        latestVersion,
      };
    }

    return {
      code: "MOCKUP_GRAPHICS_VALIDATION_REQUIRED",
      message: `Graphics validation is required for client mockup ${versionLabel} before completing this stage.`,
      latestVersion,
    };
  }

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

  const [adminsAndFrontDesk, graphicsUsers] = await Promise.all([
    User.find({
      $or: [{ role: "admin" }, { department: FRONT_DESK_DEPARTMENT }],
    })
      .select("_id")
      .lean(),
    User.find({
      department: { $in: ["Graphics/Design", "graphics", "design"] },
    })
      .select("_id")
      .lean(),
  ]);

  adminsAndFrontDesk.forEach((entry) => {
    const userId = toObjectIdString(entry?._id);
    if (userId) {
      recipients.add(userId);
    }
  });

  graphicsUsers.forEach((entry) => {
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
  fileName = "",
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
    const safeFileName = toText(fileName);
    const fileSuffix = safeFileName ? ` (${safeFileName})` : "";
    const reasonSuffix = safeReason ? ` Reason: ${safeReason}.` : "";
    const message = `Client rejected ${versionLabel}${fileSuffix} for project #${getProjectDisplayRef(project)} (${getProjectDisplayName(project)}). Graphics should upload a revised mockup.${reasonSuffix}`;

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
      orderId,
      orderRef,
      orderDate,
      receivedTime,
      lead,
      client,
      clientEmail, // [NEW]
      clientPhone, // [NEW]
      projectName,
      projectIndicator,
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

    // Helper to extract value if object
    const getValue = (field) => {
      if (field && typeof field === "object") {
        if (field.value) return field.value;
        if (field._id) return field._id;
        if (field.id) return field.id;
      }
      return field;
    };
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

    const normalizedExistingAttachments = normalizeAttachmentList(
      existingAttachments,
    );
    const attachmentNotes = normalizeAttachmentNotes(req.body.attachmentNotes);
    const rawSampleImageNote = req.body.sampleImageNote;

    if (req.files) {
      // Handle 'sampleImage' (single file)
      if (req.files.sampleImage && req.files.sampleImage.length > 0) {
        sampleImagePath = `/uploads/${req.files.sampleImage[0].filename}`;
      }

      // Handle 'attachments' (multiple files)
      if (req.files.attachments && req.files.attachments.length > 0) {
        const newAttachments = req.files.attachments.map((file, index) => ({
          fileUrl: `/uploads/${file.filename}`,
          fileName: file.originalname || file.filename || "",
          fileType: file.mimetype || "",
          note: normalizeAttachmentNote(attachmentNotes[index]),
        }));
        normalizedExistingAttachments.push(...newAttachments);
      }
    } else if (req.file) {
      // Fallback for single file upload middleware (if used elsewhere)
      sampleImagePath = `/uploads/${req.file.filename}`;
    }

    const resolvedSampleImageNote = sampleImagePath
      ? normalizeAttachmentNote(rawSampleImageNote)
      : "";
    const clientMockupVersions = buildInitialIntakeMockupVersions(
      req,
      req.user?._id,
    );
    const approvedMockupVersions = buildInitialIntakeMockupVersions(req, req.user?._id, {
      fileField: "approvedMockup",
      notesField: "approvedMockupNotes",
      noteCandidates: ["approvedMockupNote"],
      clientApprovedAtIntake: true,
    });
    if (clientMockupVersions.length > 0 && approvedMockupVersions.length > 0) {
      await cleanupUploadedFilesSafely(req);
      return res.status(400).json({
        message:
          "Choose either Client Mockup or Already Approved Mockup for a new order, not both.",
      });
    }
    const initialMockupVersions =
      approvedMockupVersions.length > 0
        ? approvedMockupVersions
        : clientMockupVersions;
    const latestInitialMockupVersion =
      initialMockupVersions.length > 0
        ? initialMockupVersions[initialMockupVersions.length - 1]
        : null;

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
    const finalOrderId = normalizeOrderNumber(orderId);
    if (!finalOrderId) {
      await cleanupUploadedFilesSafely(req);
      return res.status(400).json({
        message: "Order number is required. Front Desk must enter it manually.",
      });
    }
    const normalizedDeliveryTime = toText(finalDeliveryTime);
    if (normalizedProjectType === "Quote" && !normalizedDeliveryTime) {
      return res.status(400).json({
        message: "Delivery time is required when creating a quote order.",
      });
    }
    const isCorporateEmergency =
      normalizedProjectType === "Corporate Job" &&
      parseCorporateEmergencyFlag(corporateEmergency, false);
    const normalizedQuoteDetails =
      normalizedProjectType === "Quote"
        ? normalizeQuoteDetailsWorkflow({
            quoteDetailsInput: finalQuoteDetails,
          })
        : finalQuoteDetails;
    if (normalizedProjectType === "Quote") {
      const { mode } = getQuoteChecklistState(normalizedQuoteDetails);
      if (mode === "none") {
        return res.status(400).json({
          code: "QUOTE_REQUIREMENTS_BLOCKED",
          message:
            "Quote must include Cost, Mockup, Previous Sample / Jobs Done, Sample Production, or Bid Submission / Documents requirement to continue.",
        });
      }
    }
    const isSampleRequired = parseBooleanFlag(sampleRequired, false);
    const normalizedProjectNameRaw = normalizeProjectNameRaw(projectName);
    const normalizedProjectIndicator = normalizeProjectIndicator(
      projectIndicator !== undefined
        ? projectIndicator
        : details?.projectIndicator,
    );
    const resolvedProjectName =
      buildProjectDisplayName(normalizedProjectNameRaw, normalizedProjectIndicator) ||
      normalizedProjectNameRaw;
    const linkedOrder = await ensureOrderRecord({
      orderNumber: finalOrderId,
      orderDate: orderDate || now,
      client,
      clientEmail,
      clientPhone,
      createdBy: req.user._id,
      requestedOrderRefId: normalizedOrderRefId,
    });

    const resolvedOrderId = linkedOrder?.orderNumber || finalOrderId;

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
        projectName: resolvedProjectName,
        projectNameRaw: normalizedProjectNameRaw,
        projectIndicator: normalizedProjectIndicator,
        briefOverview: getValue(req.body.briefOverview) || description, // [NEW] Map briefOverview, fallback to description if legacy
        deliveryDate,
        deliveryTime: normalizedDeliveryTime, // [NEW]
        deliveryLocation,
        contactType: getValue(contactType) || "None",
        supplySource: normalizedSupplySource,
        packagingType: normalizedPackagingType,
        sampleImage: sampleImagePath, // [NEW]
        sampleImageNote: resolvedSampleImageNote, // [NEW]
        attachments: normalizedExistingAttachments, // [NEW]
      },
      departments: normalizeProjectDepartmentSelections(departments),
      items: finalItems || [], // [NEW] Use parsed items
      uncontrollableFactors: uncontrollableFactors || [],
      productionRisks: productionRisks || [],
      currentStep: status ? 1 : 2, // If assigned status provided, likely Step 1 needs completion. Else Step 2.
      status:
        status ||
        (normalizedProjectType === "Quote"
          ? "Quote Created"
          : "Order Created"), // Default or Explicit
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
      quoteDetails: normalizedQuoteDetails,
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
      ...(latestInitialMockupVersion
        ? {
            mockup: {
              fileUrl: latestInitialMockupVersion.fileUrl,
              fileName: latestInitialMockupVersion.fileName,
              fileType: latestInitialMockupVersion.fileType,
              note: latestInitialMockupVersion.note,
              uploadedBy: latestInitialMockupVersion.uploadedBy,
              uploadedAt: latestInitialMockupVersion.uploadedAt,
              source: latestInitialMockupVersion.source,
              intakeUpload: latestInitialMockupVersion.intakeUpload,
              clientApprovedAtIntake:
                latestInitialMockupVersion.clientApprovedAtIntake,
              graphicsReview: latestInitialMockupVersion.graphicsReview,
              version: latestInitialMockupVersion.version,
              clientApproval: latestInitialMockupVersion.clientApproval,
              versions: initialMockupVersions,
            },
          }
        : {}),
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

    if (latestInitialMockupVersion) {
      const versionLabel = buildMockupVersionLabel(
        latestInitialMockupVersion.version,
      );
      const intakeMockupLabel = latestInitialMockupVersion.clientApprovedAtIntake
        ? "Client-approved mockup"
        : "Client provided mockup";
      const intakeMockupUpdateLabel = latestInitialMockupVersion.clientApprovedAtIntake
        ? "Approved client mockup"
        : "Client mockup";
      await logActivity(
        savedProject._id,
        req.user.id,
        "mockup_upload",
        `${intakeMockupLabel} ${versionLabel} at intake.`,
        {
          mockup: {
            version: latestInitialMockupVersion.version,
            source: latestInitialMockupVersion.source,
            intakeUpload: true,
            clientApprovedAtIntake: Boolean(
              latestInitialMockupVersion.clientApprovedAtIntake,
            ),
            fileName: latestInitialMockupVersion.fileName,
            fileUrl: latestInitialMockupVersion.fileUrl,
            graphicsReviewStatus:
              latestInitialMockupVersion.graphicsReview?.status || "pending",
          },
        },
      );

      await createProjectSystemUpdateAndSnapshot({
        project: savedProject,
        authorId: req.user._id || req.user.id,
        category: "Graphics",
        content: `${intakeMockupUpdateLabel} ${versionLabel} uploaded at intake. Graphics review pending.`,
      });
    }

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
      const excludeAdminRecipientIds = [
        savedProject.projectLeadId?.toString(),
        savedProject.assistantLeadId?.toString(),
      ].filter(Boolean);

      await notifyAdmins(
        req.user._id,
        savedProject._id,
        "SYSTEM",
        "New Project Created",
        `${req.user.firstName} ${req.user.lastName} created a new project #${savedProject.orderId || savedProject._id}: ${savedProject.details.projectName}`,
        { excludeUserIds: excludeAdminRecipientIds },
      );
    }

    const requestBaseUrl = getRequestBaseUrl(req);
    let emailNotification = {
      skipped: false,
      sent: false,
      status: "failed",
      message: "Order created, but notification email failed to send.",
    };

    try {
      emailNotification = await sendProjectCreationEmail({
        projectId: savedProject._id,
        creator: req.user,
        requestBaseUrl,
      });
    } catch (emailError) {
      console.error("Failed to send project creation email:", emailError);
    }

    const responsePayload = savedProject.toObject
      ? savedProject.toObject()
      : savedProject;
    responsePayload.emailNotification = emailNotification;

    res.status(201).json(responsePayload);
    return;
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

    const projects = await populateMockupUploaders(
      Project.find(query)
        .populate("createdBy", "firstName lastName")
        .populate("projectLeadId", "firstName lastName avatarUrl")
        .populate(
          "assistantLeadId",
          "firstName lastName employeeId email avatarUrl",
        )
        .populate("acknowledgements.user", "firstName lastName name avatarUrl")
        .populate("endOfDayUpdateBy", "firstName lastName department")
        .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone")
        .sort({ createdAt: -1 }),
    ).lean();

    projects.forEach(normalizeProjectStatusFields);
    if (String(req.query.mode || "").toLowerCase() === "engaged") {
      projects.forEach((project) => applyVisibleProjectBatchesForUser(project, req.user));
    }

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
      .select(
        "_id orderId details.projectName details.projectIndicator status statusChangedAt hold createdAt",
      )
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
        project?.statusChangedAt ||
        stageEntryMap.get(`${projectId}|${status}`) ||
        project?.createdAt;
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
        projectIndicator: toText(project?.details?.projectIndicator) || "",
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

    const projects = await populateMockupUploaders(
      Project.find(query)
        .populate("createdBy", "firstName lastName")
        .populate("projectLeadId", "firstName lastName avatarUrl")
        .populate(
          "assistantLeadId",
          "firstName lastName employeeId email avatarUrl",
        )
        .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone")
        .sort({ createdAt: -1 }),
    ).lean();

    projects.forEach(normalizeProjectStatusFields);
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
      populateMockupUploaders(
        Project.find(criteria)
          .populate("createdBy", "firstName lastName")
          .populate("projectLeadId", "firstName lastName avatarUrl")
          .populate(
            "assistantLeadId",
            "firstName lastName employeeId email avatarUrl",
          )
          .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone")
          .sort({ createdAt: -1 }),
      ).lean();

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

    projects.forEach(normalizeProjectStatusFields);
    const groups = buildOrderGroups(projects, {
      collapseRevisions:
        String(req.query.collapseRevisions || "true").toLowerCase() !== "false",
    });
    const group = groups.find((entry) => {
      if (entry.orderNumber === orderNumber) return true;
      if (!Array.isArray(entry.projects)) return false;
      return entry.projects.some((project) => {
        const projectOrderId = normalizeOrderNumber(project?.orderId);
        const projectOrderRef = normalizeOrderNumber(project?.orderRef?.orderNumber);
        return projectOrderId === orderNumber || projectOrderRef === orderNumber;
      });
    });

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
    const project = await populateMockupUploaders(
      Project.findById(req.params.id)
        .populate("createdBy", "firstName lastName")
        .populate(
          "projectLeadId",
          "firstName lastName employeeId email avatarUrl",
        )
        .populate(
          "assistantLeadId",
          "firstName lastName employeeId email avatarUrl",
        )
        .populate("acknowledgements.user", "firstName lastName name avatarUrl")
        .populate("orderRef", "orderNumber orderDate client clientEmail clientPhone"),
    );

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

      const requestSource = String(req.query.source || "")
        .trim()
        .toLowerCase();
      const isFrontDesk = toDepartmentArray(req.user?.department)
        .map(normalizeDepartmentValue)
        .includes("front desk");
      const canFrontDeskAccessProject =
        isFrontDesk && requestSource === "frontdesk";

      if (
        req.user.role !== "admin" &&
        !isLead &&
        !isAssistant &&
        !canFrontDeskAccessProject
      ) {
        return res
          .status(403)
          .json({ message: "Not authorized to view this project" });
      }

      normalizeProjectStatusFields(project);
      if (
        String(req.query.mode || "").toLowerCase() === "engaged" ||
        String(req.query.source || "").toLowerCase() === "engaged"
      ) {
        applyVisibleProjectBatchesForUser(project, req.user);
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
    const previousItemTotals = getOrderItemTotalsSummary(project?.items);

    const newItem = {
      description,
      breakdown: breakdown || "",
      qty: Number(qty),
    };

    project.items.push(newItem);
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.items = new Date();
    project.orderRevisionMeta = {
      updatedAt: new Date(),
      updatedBy: req.user._id || req.user.id,
      updatedByName: getUserDisplayName(req.user),
    };
    project.orderRevisionCount = Number(project.orderRevisionCount || 0) + 1;
    await project.save();

    await logActivity(
      project._id,
      req.user.id,
      "item_add",
      `Added order item: ${description} (Qty: ${qty})`,
      { item: newItem },
    );

    if (canManageBilling(req.user)) {
      await notifyReviewUpdated({
        project,
        actor: req.user,
        revisionParts: ["Order Items"],
      });
      await sendProjectRevisionEmailSafely({
        projectId: project._id,
        actor: req.user,
        requestBaseUrl: getRequestBaseUrl(req),
        revisionParts: ["Order Items"],
        changeDetails: [
          {
            label: "Order Items Summary",
            before: previousItemTotals,
            after: getOrderItemTotalsSummary(project?.items),
          },
          {
            label: "Added Item",
            before: "N/A",
            after: formatRevisionItemSummary(newItem),
          },
        ],
      });
    }

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
      `${PROJECT_MUTATION_ACCESS_FIELDS} items`,
    );
    if (!ensureProjectMutationAccess(req, res, projectForAccess, "manage")) return;
    const existingItem = Array.isArray(projectForAccess?.items)
      ? projectForAccess.items.find(
          (item) => item?._id?.toString?.() === String(itemId),
        )
      : null;
    const previousItemTotals = getOrderItemTotalsSummary(projectForAccess?.items);
    const nextItemSummary = formatRevisionItemSummary({
      description,
      breakdown,
      qty: Number(qty),
    });

    const revisionMetaUpdate = {
      "orderRevisionMeta.updatedAt": new Date(),
      "orderRevisionMeta.updatedBy": req.user._id || req.user.id,
      "orderRevisionMeta.updatedByName": getUserDisplayName(req.user),
    };

    const revisionCountUpdate = { $inc: { orderRevisionCount: 1 } };

    const project = await Project.findOneAndUpdate(
      { _id: id, "items._id": itemId },
      {
        $set: {
          "items.$.description": description,
          "items.$.breakdown": breakdown,
          "items.$.qty": Number(qty),
          "sectionUpdates.items": new Date(),
          ...revisionMetaUpdate,
        },
        ...revisionCountUpdate,
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

    if (canManageBilling(req.user)) {
      await notifyReviewUpdated({
        project,
        actor: req.user,
        revisionParts: ["Order Items"],
      });
      await sendProjectRevisionEmailSafely({
        projectId: project._id,
        actor: req.user,
        requestBaseUrl: getRequestBaseUrl(req),
        revisionParts: ["Order Items"],
        changeDetails: [
          {
            label: "Order Items Summary",
            before: previousItemTotals,
            after: getOrderItemTotalsSummary(project?.items),
          },
          {
            label: "Updated Item",
            before: formatRevisionItemSummary(existingItem),
            after: nextItemSummary,
          },
        ],
      });
    }

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
    const removedItem = Array.isArray(project?.items)
      ? project.items.find((item) => item?._id?.toString?.() === String(itemId))
      : null;
    const previousItemTotals = getOrderItemTotalsSummary(project?.items);

    // Pull item from array
    project.items.pull({ _id: itemId });
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.items = new Date();
    project.orderRevisionMeta = {
      updatedAt: new Date(),
      updatedBy: req.user._id || req.user.id,
      updatedByName: getUserDisplayName(req.user),
    };
    project.orderRevisionCount = Number(project.orderRevisionCount || 0) + 1;
    await project.save();

    await logActivity(id, req.user.id, "item_delete", `Deleted order item`, {
      itemId,
    });

    if (canManageBilling(req.user)) {
      await notifyReviewUpdated({
        project,
        actor: req.user,
        revisionParts: ["Order Items"],
      });
      await sendProjectRevisionEmailSafely({
        projectId: project._id,
        actor: req.user,
        requestBaseUrl: getRequestBaseUrl(req),
        revisionParts: ["Order Items"],
        changeDetails: [
          {
            label: "Order Items Summary",
            before: previousItemTotals,
            after: getOrderItemTotalsSummary(project?.items),
          },
          {
            label: "Removed Item",
            before: formatRevisionItemSummary(removedItem),
            after: "Removed",
          },
        ],
      });
    }

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

    const oldDepartments = normalizeProjectDepartmentSelections(project.departments);
    const newDepartments = normalizeProjectDepartmentSelections(departments);

    // Reset acknowledgements for removed departments
    // If a department is no longer in the engaged list, remove its acknowledgement
    project.acknowledgements = (project.acknowledgements || []).filter((ack) =>
      newDepartments.includes(normalizeDepartmentValue(ack?.department)),
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
      { departments: newDepartments },
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
    const requestedStatus = toText(req.body?.status);
    if (!requestedStatus) {
      return res.status(400).json({ message: "Status is required" });
    }

    if (requestedStatus === HOLD_STATUS) {
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
    const newStatus = normalizeStatusForStorageByProjectType(
      requestedStatus,
      normalizeProjectType(project?.projectType, "Standard"),
    );

    if (isQuoteProject(project)) {
      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });
    }

    // Project Lead can transition from "Completed" to "Finished".
    const isLead =
      project.projectLeadId &&
      project.projectLeadId.toString() === req.user.id.toString();
    const isFinishing =
      newStatus === "Finished" &&
      (project.status === "Completed" ||
        (isQuoteProject(project) && project.status === "Declined"));
    const adminOnlyStageCompletions = new Set([
      "Master Approval Completed",
      "Quality Control Completed",
    ]);
    const adminOnlyStagePrerequisites = {
      "Master Approval Completed": "Pending Master Approval",
      "Quality Control Completed": "Pending Quality Control",
    };
    const departmentManagedStatusTargets = {
      "Mockup Completed": ["graphics"],
      "Production Completed": ["production"],
      "Photography Completed": ["photography"],
      "Packaging Completed": ["stores"],
    };

    if (
      isQuoteProject(project) &&
      Object.prototype.hasOwnProperty.call(
        departmentManagedStatusTargets,
        newStatus,
      )
    ) {
      const engagementGuard = getQuoteDepartmentEngagementGuard({
        project,
        user: req.user,
        allowedDepartments: departmentManagedStatusTargets[newStatus],
      });
      if (engagementGuard) {
        return res.status(400).json({
          code: engagementGuard.code,
          missing: engagementGuard.missing,
          message: engagementGuard.message,
        });
      }
    }

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

      const allowQuoteMockupCompletionFromSubmission =
        newStatus === "Mockup Completed" &&
        isQuoteMockupOnlyProject(project) &&
        project.status === "Pending Quote Submission" &&
        isQuoteMockupApproved(project);
      if (project.status !== deptAction.from && !allowQuoteMockupCompletionFromSubmission) {
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

    if (isQuoteProject(project) && !isQuoteWorkflowSupported(project)) {
      return res.status(400).json({
        code: "QUOTE_REQUIREMENTS_BLOCKED",
        message:
          "Quote requirements are not configured yet. Configure at least one quote requirement before progressing this quote.",
      });
    }

    if (isQuoteProject(project) && newStatus === "Cost Verification Completed") {
      if (!isQuoteCostVerified(project)) {
        return res.status(400).json({
          code: "QUOTE_COST_MISSING",
          message: "Complete quote cost before completing this stage.",
        });
      }
    }

    if (
      isQuoteProject(project) &&
      ["Quote Submission Completed", "Pending Client Decision"].includes(
        newStatus,
      ) &&
      !project.invoice?.sent
    ) {
      return res.status(400).json({
        message:
          "Mark quote as sent from billing before setting status to Quote Submission.",
      });
    }

    if (isQuoteProject(project) && newStatus === "Finished") {
      if (!hasQuoteDecisionRecorded(project)) {
        return res.status(400).json({
          code: "QUOTE_DECISION_PENDING",
          message:
            "Client quote decision must be validated before marking this quote as Finished.",
        });
      }
    }

    const meetingGate = await resolveMeetingGateState(project);
    const meetingRequired = meetingGate.required;
    const meetingScheduled = Boolean(meetingGate.meetingScheduled);
    const meetingSkipped = Boolean(meetingGate.meetingSkipped);
    const meetingCompleted = Boolean(meetingGate.meetingCompleted) || meetingSkipped;
    const meetingIncomplete = (meetingRequired || meetingScheduled) && !meetingCompleted;
    const shouldForcePendingMeeting =
      meetingIncomplete && newStatus === "Scope Approval Completed";

    if (
      meetingIncomplete &&
      newStatus !== "Pending Departmental Meeting" &&
      !shouldForcePendingMeeting &&
      isStatusAtOrAfterMeetingGate(newStatus, project?.projectType)
    ) {
      return res.status(400).json({
        code: "MEETING_REQUIRED",
        message:
          "Departmental meeting must be completed before progressing this project.",
      });
    }

    // If the selected status has an auto-advancement, use it
    let finalStatus = getAutoProgressedStatus(newStatus, project);
    if (shouldForcePendingMeeting) {
      finalStatus = "Pending Departmental Meeting";
    }

    if (isQuoteProject(project) && newStatus === "Mockup Completed") {
      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });

      const mockupRequirement = project.quoteDetails?.requirementItems?.mockup || null;
      const sampleProductionRequirement =
        project.quoteDetails?.requirementItems?.sampleProduction || null;
      if (mockupRequirement && (mockupRequirement.isRequired || sampleProductionRequirement?.isRequired)) {
        mockupRequirement.completionConfirmedAt = new Date();
        mockupRequirement.completionConfirmedBy = req.user._id || req.user.id;
        project.markModified("quoteDetails.requirementItems");
      }

      const statusSync = syncQuoteProjectStatusByRequirements(project);
      finalStatus = statusSync.toStatus || finalStatus;
    }

    const isStandardProject = !isQuoteProject(project);
    if (isStandardProject) {
      const batchProgressGuard = getBatchProgressGuard(project, finalStatus);
      if (batchProgressGuard) {
        return res.status(400).json(batchProgressGuard);
      }
    }

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

      if (!isQuoteProject(project)) {
        try {
          const smsStage = resolveStatusSmsStage(finalStatus);
          if (smsStage) {
            const existingStagePrompt = await findExistingStatusSmsPrompt(
              project._id,
              smsStage,
            );
            if (!existingStagePrompt) {
              const { message, progressPercent, title } = buildStatusSmsMessage({
                project,
                status: finalStatus,
              });
              await createSmsPrompt({
                project,
                actorId: req.user._id || req.user.id,
                type: "status_update",
                message,
                title,
                status: finalStatus,
                progressPercent,
              });
            }
          }
        } catch (smsError) {
          console.error("Failed to create SMS prompt:", smsError);
        }
      }

      const actorName = getUserDisplayName(req.user);
      const projectRef = getProjectDisplayRef(project);
      const projectName = getProjectDisplayName(project);
      await notifyLeadFromAdminOrderManagement({
        req,
        project,
        title: "Order Status Updated",
        message: `Admin ${actorName} updated project #${projectRef} (${projectName}) status to ${finalStatus}.`,
        type: "UPDATE",
      });
    }

    // Notify Lead when mockup is marked complete
    if (newStatus === "Mockup Completed" && project.projectLeadId) {
      await createNotification(
        project.projectLeadId,
        req.user._id,
        project._id,
        "UPDATE",
        "Mockup Completed",
        `Project #${project.orderId || project._id.slice(-6).toUpperCase()}: Mockup has been completed and is ready for Master Approval.`,
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

// @desc    Transition quote requirement workflow item
// @route   PATCH /api/projects/:id/quote-requirements/:requirementKey/transition
// @access  Private (Role-restricted by requirement and stage)
const transitionQuoteRequirement = async (req, res) => {
  try {
    const requestedRequirementKey = toText(req.params.requirementKey);
    const requirementKey = QUOTE_REQUIREMENT_KEYS.find(
      (key) => key.toLowerCase() === requestedRequirementKey.toLowerCase(),
    );
    const toStatus = toText(req.body?.toStatus).toLowerCase();
    const note = toText(req.body?.note).slice(0, 500);

    if (!requirementKey) {
      return res.status(400).json({
        message: "Invalid quote requirement key.",
        allowed: QUOTE_REQUIREMENT_KEYS,
      });
    }

    if (!QUOTE_REQUIREMENT_STATUS_SET.has(toStatus)) {
      return res.status(400).json({
        message: "Invalid quote requirement status.",
        allowed: QUOTE_REQUIREMENT_STATUS_VALUES,
      });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const isAdminPortalMutation = isAdminPortalRequest(req);
    if (
      req.user?.role === "admin" &&
      isUserAssignedProjectLead(req.user, project) &&
      isAdminPortalMutation
    ) {
      return res.status(403).json({
        message:
          "You cannot modify this project from the admin portal while you are the assigned Project Lead. Ask another admin to make this change.",
      });
    }

    const isEngagedPortalMutation = isEngagedPortalRequest(req);
    if (
      isUserAssignedProjectLead(req.user, project) &&
      isEngagedPortalMutation
    ) {
      return res.status(403).json({
        message:
          "Project Leads cannot perform engagement actions on their own projects from the engaged departments page.",
      });
    }

    if (project?.cancellation?.isCancelled) {
      return res.status(400).json({
        message:
          "This project is cancelled and frozen. Reactivate it before making changes.",
      });
    }

    if (!isQuoteProject(project)) {
      return res.status(400).json({
        message: "Quote requirement workflow is only available for quote projects.",
      });
    }

    const normalizedQuoteDetails = normalizeQuoteDetailsWorkflow({
      quoteDetailsInput: project.quoteDetails || {},
      existingQuoteDetails: project.quoteDetails || {},
    });
    const checklistState = getQuoteChecklistState(normalizedQuoteDetails);
    const requirementMode = checklistState.mode;
    const userDepartmentSet = getUserCanonicalDepartments(req.user);
    const isFrontDeskUser = userDepartmentSet.has(
      canonicalizeDepartment(FRONT_DESK_DEPARTMENT),
    );
    if (requirementMode === "none") {
      return res.status(400).json({
        code: "QUOTE_REQUIREMENTS_BLOCKED",
        message:
          "Quote requirements are not configured yet. Select at least one quote requirement before progressing this quote.",
      });
    }

    if (requirementKey === "cost" && !checklistState.enabledKeys.includes("cost")) {
      return res.status(400).json({
        message:
          "Cost transitions are only available when Cost is selected for this quote.",
      });
    }

    if (
      requirementKey === "mockup" &&
      !(
        checklistState.enabledKeys.includes("mockup") ||
        checklistState.enabledKeys.includes("sampleProduction")
      )
    ) {
      return res.status(400).json({
        message:
          "Mockup transitions are only available when Mockup or Sample Production is selected for this quote.",
      });
    }

    if (
      requirementKey === "previousSamples" &&
      !checklistState.enabledKeys.includes("previousSamples")
    ) {
      return res.status(400).json({
        message:
          "Previous sample transitions are only available when Previous Sample / Work done is selected for this quote.",
      });
    }

    if (
      requirementKey === "sampleProduction" &&
      !checklistState.enabledKeys.includes("sampleProduction")
    ) {
      return res.status(400).json({
        message:
          "Sample production transitions are only available when Sample Production is selected for this quote.",
      });
    }

    if (
      requirementKey === "bidSubmission" &&
      !checklistState.enabledKeys.includes("bidSubmission")
    ) {
      return res.status(400).json({
        message:
          "Bid Submission / Documents transitions are only available when that requirement is selected for this quote.",
      });
    }

    if (!["cost", "mockup", "previousSamples", "sampleProduction", "bidSubmission"].includes(requirementKey)) {
      return res.status(400).json({
        message:
          "Quote requirement transitions are disabled for this requirement.",
      });
    }

    const isDepartmentStageTransition =
      QUOTE_REQUIREMENT_DEPARTMENT_STAGES.has(toStatus) && requirementKey !== "cost";
    if (
      isDepartmentStageTransition &&
      (isEngagedPortalMutation || !isFrontDeskUser)
    ) {
      const engagementGuard = getQuoteDepartmentEngagementGuard({
        project,
        user: req.user,
        allowedDepartments: Array.from(
          QUOTE_REQUIREMENT_DEPARTMENT_STAGE_ACCESS[requirementKey] || [],
        ),
      });
      if (engagementGuard) {
        return res.status(400).json({
          code: engagementGuard.code,
          missing: engagementGuard.missing,
          message: engagementGuard.message,
        });
      }
    }

    project.quoteDetails = normalizedQuoteDetails;

    const requirementItem =
      project.quoteDetails?.requirementItems?.[requirementKey] || null;
    if (!requirementItem) {
      return res.status(400).json({
        message: "Quote requirement workflow item is missing.",
      });
    }

    let fromStatus =
      toText(requirementItem.status).toLowerCase() || "not_required";
    const allowImplicitMockup =
      requirementKey === "mockup" && requirementMode === "sampleProduction";
    if (allowImplicitMockup && fromStatus === "not_required") {
      fromStatus = "assigned";
      requirementItem.status = "assigned";
      requirementItem.isRequired = true;
    }
    const currentlyRequired = Boolean(requirementItem.isRequired);

    if (
      !currentlyRequired &&
      !["assigned", "not_required"].includes(toStatus) &&
      req.user?.role !== "admin"
    ) {
      return res.status(400).json({
        message:
          "This requirement is currently not required. Assign it first before progressing.",
      });
    }

    if (fromStatus === toStatus) {
      return res.json(project);
    }

    if (
      requirementKey === "bidSubmission" &&
      !["sent_to_client", "assigned", "not_required"].includes(toStatus)
    ) {
      return res.status(400).json({
        message:
          "Bid Submission / Documents can only be marked as sent for quote validation.",
      });
    }

    if (!isQuoteRequirementTransitionAllowed(fromStatus, toStatus, requirementKey)) {
      return res.status(400).json({
        message: `Transition from '${formatQuoteRequirementStatusLabel(fromStatus)}' to '${formatQuoteRequirementStatusLabel(toStatus)}' is not allowed.`,
      });
    }

    if (
      requirementKey === "sampleProduction" &&
      ["in_progress", "dept_submitted"].includes(toStatus)
    ) {
      const mockupGuard = getMockupCompletionGuard(project);
      if (mockupGuard) {
        return res.status(400).json({
          code: "MOCKUP_COMPLETION_REQUIRED_FOR_SAMPLE_PRODUCTION",
          message:
            "Complete mockup approval/completion first before starting sample production.",
        });
      }
    }

    if (
      !canTransitionQuoteRequirementByRole({
        user: req.user,
        requirementKey,
        toStatus,
      })
    ) {
      return res.status(403).json({
        message:
          "Not authorized to perform this quote requirement transition for your role/department.",
      });
    }

    const transitionTime = new Date();
    requirementItem.status = toStatus;
    requirementItem.updatedAt = transitionTime;
    requirementItem.updatedBy = req.user._id;
    requirementItem.note = note;
    requirementItem.history = Array.isArray(requirementItem.history)
      ? requirementItem.history
      : [];
    requirementItem.history.push({
      fromStatus,
      toStatus,
      changedAt: transitionTime,
      changedBy: req.user._id,
      note,
    });

    const shouldSyncChecklist = !(
      requirementKey === "mockup" && requirementMode === "sampleProduction"
    );

    if (toStatus === "not_required") {
      requirementItem.isRequired = false;
      if (shouldSyncChecklist) {
        project.quoteDetails.checklist = {
          ...(project.quoteDetails.checklist || {}),
          [requirementKey]: false,
        };
      }
    } else {
      requirementItem.isRequired = true;
      if (shouldSyncChecklist) {
        project.quoteDetails.checklist = {
          ...(project.quoteDetails.checklist || {}),
          [requirementKey]: true,
        };
      }
    }

    project.markModified("quoteDetails.requirementItems");
    project.markModified("quoteDetails.checklist");

    const statusSync = syncQuoteProjectStatusByRequirements(project);
    await project.save();

    const requirementLabel =
      QUOTE_REQUIREMENT_LABELS[requirementKey] || requirementKey;
    await logActivity(
      project._id,
      req.user._id,
      "update",
      `Quote requirement '${requirementLabel}' moved to ${formatQuoteRequirementStatusLabel(toStatus)}.`,
      {
        quoteRequirement: {
          key: requirementKey,
          label: requirementLabel,
          fromStatus,
          toStatus,
          note,
        },
      },
    );

    if (statusSync.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${statusSync.toStatus}`,
        {
          statusChange: {
            from: statusSync.fromStatus,
            to: statusSync.toStatus,
          },
        },
      );
    }

    const actorName =
      `${toText(req.user?.firstName)} ${toText(req.user?.lastName)}`.trim() ||
      "A user";

    await notifyAdmins(
      req.user._id,
      project._id,
      "SYSTEM",
      "Quote Requirement Updated",
      `${actorName} moved '${requirementLabel}' from ${formatQuoteRequirementStatusLabel(
        fromStatus,
      )} to ${formatQuoteRequirementStatusLabel(toStatus)} on project #${getProjectDisplayRef(
        project,
      )}.`,
    );

    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: "Quote Requirement Updated",
      message: `Admin ${actorName} moved '${requirementLabel}' from ${formatQuoteRequirementStatusLabel(
        fromStatus,
      )} to ${formatQuoteRequirementStatusLabel(toStatus)} on project #${projectRef} (${projectName}).`,
      type: "UPDATE",
    });

    return res.json(project);
  } catch (error) {
    console.error("Error transitioning quote requirement:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

const NEXT_ACTION_DEFAULT_LIMIT = 8;
const NEXT_ACTION_MAX_LIMIT = 100;
const NEXT_ACTION_PROJECT_LIMIT = 500;
const NEXT_ACTION_CLOSED_STATUSES = new Set([
  "Completed",
  "Finished",
  "Declined",
]);
const NEXT_ACTION_DEPARTMENT_CONFIG = {
  graphics: {
    label: "Graphics",
    pendingStatuses: new Set(["Pending Mockup"]),
    completeLabel: "Confirm mockup completion",
  },
  production: {
    label: "Production",
    pendingStatuses: new Set(["Pending Production", "Pending Sample Production"]),
    completeLabel: "Complete production stage",
  },
  photography: {
    label: "Photography",
    pendingStatuses: new Set(["Pending Photography"]),
    completeLabel: "Complete photography stage",
  },
  stores: {
    label: "Stores",
    pendingStatuses: new Set(["Pending Packaging"]),
    completeLabel: "Complete packaging stage",
  },
};
const NEXT_ACTION_PRIORITY_RANK = {
  critical: 0,
  high: 1,
  medium: 2,
  normal: 3,
  low: 4,
};

const normalizeNextActionLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return NEXT_ACTION_DEFAULT_LIMIT;
  return Math.min(parsed, NEXT_ACTION_MAX_LIMIT);
};

const isFrontDeskUserForNextActions = (user) =>
  toDepartmentArray(user?.department)
    .map(normalizeDepartmentValue)
    .includes(normalizeDepartmentValue(FRONT_DESK_DEPARTMENT));

const isNextActionDepartmentTokenMatch = (projectToken, userToken) => {
  const projectDepartment = normalizeDepartmentValue(projectToken);
  const userDepartment = normalizeDepartmentValue(userToken);
  if (!projectDepartment || !userDepartment) return false;
  if (projectDepartment === userDepartment) return true;

  const projectCanonical = canonicalizeDepartment(projectDepartment);
  const userCanonical = canonicalizeDepartment(userDepartment);
  if (!projectCanonical || projectCanonical !== userCanonical) return false;

  if (userCanonical === "production") {
    return userDepartment === "production" || projectDepartment === "production";
  }

  if (userCanonical === "stores") {
    return userDepartment === "stores" || projectDepartment === "stores";
  }

  return userCanonical === "graphics" || userCanonical === "photography";
};

const getProjectActionRoute = (project, routeType = "detail") => {
  const projectId = toObjectIdString(project?._id);
  if (!projectId) return "";
  if (routeType === "engaged") return `/engaged-projects/actions/${projectId}`;
  if (routeType === "frontdesk") return `/new-orders/actions/${projectId}`;
  return `/detail/${projectId}`;
};

const parseProjectDeliveryDeadline = (project = {}) => {
  const deliveryDate = project?.details?.deliveryDate;
  if (!deliveryDate) return null;
  const parsed = new Date(deliveryDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const deliveryTime = toText(project?.details?.deliveryTime);
  if (!deliveryTime) {
    parsed.setHours(23, 59, 59, 999);
    return parsed;
  }

  const match24h = deliveryTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  const match12h = deliveryTime.match(
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i,
  );

  if (match24h || match12h) {
    const match = match24h || match12h;
    let hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const seconds = Number.parseInt(match[3] || "0", 10);
    if (match12h) {
      const period = match[4].toUpperCase();
      if (period === "PM" && hours < 12) hours += 12;
      if (period === "AM" && hours === 12) hours = 0;
    }
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      parsed.setHours(hours, minutes, seconds, 0);
      return parsed;
    }
  }

  parsed.setHours(23, 59, 59, 999);
  return parsed;
};

const resolveNextActionPriority = (project = {}, basePriority = "normal") => {
  const dueAt = parseProjectDeliveryDeadline(project);
  const isEmergency =
    project?.priority === "Urgent" || project?.projectType === "Emergency";

  if (dueAt) {
    const diffMs = dueAt.getTime() - Date.now();
    if (diffMs < 0) return "critical";
    if (diffMs <= 24 * 60 * 60 * 1000) return isEmergency ? "critical" : "high";
  }

  if (isEmergency && ["high", "medium", "normal", "low"].includes(basePriority)) {
    return "high";
  }

  return basePriority;
};

const buildNextActionPayload = ({
  type,
  title,
  description,
  project = null,
  department = "",
  route = "",
  ctaLabel = "Open",
  basePriority = "normal",
  createdAt = null,
}) => {
  const priority = project
    ? resolveNextActionPriority(project, basePriority)
    : basePriority;
  const projectId = project ? toObjectIdString(project?._id) : "";
  const dueAt = project ? parseProjectDeliveryDeadline(project) : null;

  return {
    id: [
      type,
      projectId || "global",
      normalizeDepartmentValue(department) || "general",
    ].join(":"),
    type,
    priority,
    priorityRank: NEXT_ACTION_PRIORITY_RANK[priority] ?? 3,
    projectId,
    orderId: project ? getProjectDisplayRef(project) : "",
    projectName: project ? getProjectDisplayName(project) : "",
    projectType: project?.projectType || "",
    status: project?.status || "",
    department,
    title,
    description,
    ctaLabel,
    route,
    dueAt: dueAt ? dueAt.toISOString() : null,
    createdAt:
      createdAt ||
      project?.updatedAt ||
      project?.createdAt ||
      (project ? new Date().toISOString() : null),
  };
};

const getNextActionProjectQuery = (req) => {
  const queries = [buildProjectAccessQuery(req).query];

  if (isFrontDeskUserForNextActions(req.user)) {
    const reportRequest = {
      ...req,
      query: {
        ...(req.query || {}),
        mode: "report",
      },
    };
    queries.push(buildProjectAccessQuery(reportRequest).query);
  }

  const engagedDepartmentFilters = resolveEngagedDepartmentFilters(
    req.user?.department,
  );
  if (engagedDepartmentFilters.length > 0) {
    const engagedRequest = {
      ...req,
      query: {
        ...(req.query || {}),
        mode: "engaged",
      },
    };
    queries.push(buildProjectAccessQuery(engagedRequest).query);
  }

  const dedupedQueries = [];
  const seen = new Set();
  queries.forEach((query) => {
    const key = JSON.stringify(query || {});
    if (seen.has(key)) return;
    seen.add(key);
    dedupedQueries.push(query || {});
  });

  const accessQuery =
    dedupedQueries.length === 1 ? dedupedQueries[0] : { $or: dedupedQueries };

  return mergeQueryWithCondition(accessQuery, {
    status: { $nin: Array.from(NEXT_ACTION_CLOSED_STATUSES) },
  });
};

const getNextActionDepartmentMatches = (project, user) => {
  const userDepartmentTokens = toDepartmentArray(user?.department)
    .map(normalizeDepartmentValue)
    .filter(Boolean);
  const matchedTokens = normalizeProjectDepartmentSelections(
    project?.departments,
  ).filter((projectToken) =>
    userDepartmentTokens.some((userToken) =>
      isNextActionDepartmentTokenMatch(projectToken, userToken),
    ),
  );
  const byCanonical = new Map();

  matchedTokens.forEach((token) => {
    const canonical = canonicalizeDepartment(token);
    if (!NEXT_ACTION_DEPARTMENT_CONFIG[canonical]) return;
    if (!byCanonical.has(canonical)) byCanonical.set(canonical, []);
    byCanonical.get(canonical).push(token);
  });

  return Array.from(byCanonical.entries()).map(([key, tokens]) => ({
    key,
    tokens,
    label: NEXT_ACTION_DEPARTMENT_CONFIG[key].label,
  }));
};

const hasPendingAcknowledgementForTokens = (project, tokens = []) => {
  const acknowledged = getAcknowledgedDepartmentTokens(project);
  return tokens.some((token) => !acknowledged.has(normalizeDepartmentValue(token)));
};

const hasAcknowledgementForTokens = (project, tokens = []) => {
  const acknowledged = getAcknowledgedDepartmentTokens(project);
  return tokens.some((token) => acknowledged.has(normalizeDepartmentValue(token)));
};

const canUserCompleteDepartmentAction = ({ project, user, match }) => {
  const currentUserId = toObjectIdString(user?._id || user?.id);
  const leadId = toObjectIdString(project?.projectLeadId);
  const isProjectLead = Boolean(currentUserId && leadId && currentUserId === leadId);

  if (isProjectLead && match.key !== "graphics") return false;
  if (isProjectLead && match.key === "graphics") return true;

  return hasAcknowledgementForTokens(project, match.tokens);
};

const addDepartmentNextActions = ({ project, user, actions }) => {
  const matches = getNextActionDepartmentMatches(project, user);
  if (!matches.length) return;

  const scopeReady = isQuoteProject(project)
    ? isQuoteScopeApprovalReadyForDepartments(project)
    : SCOPE_APPROVAL_READY_STATUSES.has(project?.status);

  matches.forEach((match) => {
    const config = NEXT_ACTION_DEPARTMENT_CONFIG[match.key];
    const departmentLabel = config.label;
    const currentUserId = toObjectIdString(user?._id || user?.id);
    const leadId = toObjectIdString(project?.projectLeadId);
    const isProjectLead = Boolean(
      currentUserId && leadId && currentUserId === leadId,
    );

    if (
      scopeReady &&
      !isProjectLead &&
      hasPendingAcknowledgementForTokens(project, match.tokens)
    ) {
      actions.push(
        buildNextActionPayload({
          type: "acknowledge_engagement",
          project,
          department: departmentLabel,
          title: `Acknowledge ${departmentLabel} engagement`,
          description: `${getProjectDisplayRef(project)} is ready for your department acknowledgement.`,
          route: getProjectActionRoute(project, "engaged"),
          ctaLabel: "Acknowledge",
          basePriority: "medium",
        }),
      );
      return;
    }

    if (!canUserCompleteDepartmentAction({ project, user, match })) return;
    if (!config.pendingStatuses.has(project?.status)) return;

    if (match.key === "graphics") {
      const latestMockup = getLatestMockupVersion(project);
      const approvalStatus = getMockupApprovalStatus(
        latestMockup?.clientApproval || {},
      );
      const isClientProvided =
        latestMockup && isClientProvidedMockupVersion(latestMockup);
      const graphicsReviewStatus = latestMockup
        ? getMockupGraphicsReviewStatus(
            latestMockup?.graphicsReview || {},
            getMockupSource(
              latestMockup?.source,
              latestMockup?.intakeUpload ? "client" : "graphics",
            ),
            parseBooleanFlag(latestMockup?.intakeUpload, false),
          )
        : "";

      if (!latestMockup?.fileUrl || approvalStatus === "rejected") {
        actions.push(
          buildNextActionPayload({
            type: "upload_mockup",
            project,
            department: departmentLabel,
            title: "Upload mockup",
            description: `${getProjectDisplayRef(project)} is waiting for Graphics mockup upload.`,
            route: getProjectActionRoute(project, "engaged"),
            ctaLabel: "Upload",
            basePriority: "high",
          }),
        );
        return;
      }

      if (isClientProvided && graphicsReviewStatus === "pending") {
        actions.push(
          buildNextActionPayload({
            type: "validate_client_mockup",
            project,
            department: departmentLabel,
            title: "Validate client mockup",
            description: `${getProjectDisplayRef(project)} has a client mockup waiting for Graphics validation.`,
            route: getProjectActionRoute(project, "engaged"),
            ctaLabel: "Validate",
            basePriority: "high",
          }),
        );
        return;
      }

      if (!isMockupReadyForCompletion(latestMockup)) return;
    }

    actions.push(
      buildNextActionPayload({
        type: "complete_department_stage",
        project,
        department: departmentLabel,
        title: config.completeLabel,
        description: `${getProjectDisplayRef(project)} is waiting for ${departmentLabel} before the next stage.`,
        route: getProjectActionRoute(project, "engaged"),
        ctaLabel: "Complete",
        basePriority: "high",
      }),
    );
  });
};

const getSampleApprovalStatusForNextActions = (project = {}) => {
  const explicit = toText(project?.sampleApproval?.status).toLowerCase();
  if (explicit === "approved") return "approved";
  if (project?.sampleApproval?.approvedAt || project?.sampleApproval?.approvedBy) {
    return "approved";
  }
  return "pending";
};

const addFrontDeskNextActions = ({ project, actions }) => {
  const route = getProjectActionRoute(project, "frontdesk");
  const latestMockup = getLatestMockupVersion(project);
  const latestMockupApprovalStatus = getMockupApprovalStatus(
    latestMockup?.clientApproval || {},
  );
  const latestMockupNeedsClientDecision =
    Boolean(latestMockup?.fileUrl) &&
    !isClientProvidedMockupVersion(latestMockup) &&
    latestMockupApprovalStatus === "pending";

  if (latestMockupNeedsClientDecision) {
    actions.push(
      buildNextActionPayload({
        type: "mockup_client_approval",
        project,
        title: "Review mockup client decision",
        description: `${getProjectDisplayRef(project)} has an uploaded mockup waiting for Front Desk/Admin approval.`,
        route,
        ctaLabel: "Review",
        basePriority: "high",
      }),
    );
  }

  if (!isQuoteProject(project)) {
    const paymentTypes = getPaymentVerificationTypes(project);
    const productionMissing =
      ["Pending Master Approval", "Pending Production"].includes(project?.status)
        ? getPendingProductionBillingMissing({
            invoiceSent: Boolean(project?.invoice?.sent),
            paymentTypes,
          })
        : [];
    const deliveryMissing =
      ["Pending Packaging", "Pending Delivery/Pickup"].includes(project?.status)
        ? getPendingDeliveryBillingMissing({ paymentTypes })
        : [];
    const missingBilling = [...productionMissing, ...deliveryMissing];

    if (missingBilling.length > 0) {
      actions.push(
        buildNextActionPayload({
          type: "billing_block",
          project,
          title: "Resolve billing block",
          description: `${getProjectDisplayRef(project)} needs ${formatBillingRequirementLabels(
            missingBilling,
          )} before moving forward.`,
          route,
          ctaLabel: "Resolve",
          basePriority: "critical",
        }),
      );
    }

    if (
      project?.sampleRequirement?.isRequired &&
      getSampleApprovalStatusForNextActions(project) !== "approved"
    ) {
      actions.push(
        buildNextActionPayload({
          type: "sample_approval",
          project,
          title: "Confirm sample approval",
          description: `${getProjectDisplayRef(project)} requires client sample approval before production can close.`,
          route,
          ctaLabel: "Confirm",
          basePriority: "high",
        }),
      );
    }

    if (project?.status === "Pending Delivery/Pickup") {
      actions.push(
        buildNextActionPayload({
          type: "delivery_pickup",
          project,
          title: "Coordinate delivery or pickup",
          description: `${getProjectDisplayRef(project)} is ready for delivery/pickup handling.`,
          route,
          ctaLabel: "Open",
          basePriority: "medium",
        }),
      );
    }

    return;
  }

  const normalizedQuoteDetails = getNormalizedQuoteDetailsForProject(project);
  const requirementItems = normalizedQuoteDetails?.requirementItems || {};
  const quoteStatus = normalizeStatusForStorageByProjectType(
    project?.status,
    "Quote",
  );
  const costStatus = toText(requirementItems?.cost?.status).toLowerCase();

  if (
    quoteStatus === "Pending Cost Verification" ||
    ["assigned", "in_progress", "blocked"].includes(costStatus)
  ) {
    actions.push(
      buildNextActionPayload({
        type: "quote_cost",
        project,
        title: "Complete quote cost",
        description: `${getProjectDisplayRef(project)} is waiting for quote cost verification.`,
        route,
        ctaLabel: "Complete Cost",
        basePriority: "high",
      }),
    );
  }

  if (quoteStatus === "Pending Quote Submission") {
    actions.push(
      buildNextActionPayload({
        type: "quote_submission",
        project,
        title: "Send quote to client",
        description: `${getProjectDisplayRef(project)} is ready for quote submission.`,
        route,
        ctaLabel: "Send Quote",
        basePriority: "high",
      }),
    );
  }

  if (quoteStatus === "Pending Client Decision") {
    actions.push(
      buildNextActionPayload({
        type: "quote_client_decision",
        project,
        title: "Record quote client decision",
        description: `${getProjectDisplayRef(project)} is waiting for the client's quote decision.`,
        route,
        ctaLabel: "Record Decision",
        basePriority: "medium",
      }),
    );
  }
};

const isProjectLeadForNextActions = (project, user) => {
  const userId = toObjectIdString(user?._id || user?.id);
  if (!userId) return false;
  return [project?.projectLeadId, project?.assistantLeadId].some(
    (value) => toObjectIdString(value) === userId,
  );
};

const addLeadNextActions = ({ project, user, actions }) => {
  if (!isProjectLeadForNextActions(project, user)) return;

  if (["Order Created", "Quote Created", "Pending Acceptance"].includes(project?.status)) {
    actions.push(
      buildNextActionPayload({
        type: "lead_acceptance",
        project,
        title: "Accept assigned project",
        description: `${getProjectDisplayRef(project)} is waiting for your acceptance.`,
        route:
          project?.projectType === "Quote"
            ? `/create/quote-wizard?edit=${toObjectIdString(project?._id)}`
            : `/create/wizard?edit=${toObjectIdString(project?._id)}`,
        ctaLabel: "Accept",
        basePriority: "high",
      }),
    );
  }

  if (project?.status === "Pending Scope Approval") {
    actions.push(
      buildNextActionPayload({
        type: "scope_approval",
        project,
        title: "Review scope approval",
        description: `${getProjectDisplayRef(project)} needs scope approval before departments can proceed.`,
        route: getProjectActionRoute(project, "detail"),
        ctaLabel: "Review",
        basePriority: "high",
      }),
    );
  }

  if (project?.status === "Pending Master Approval") {
    actions.push(
      buildNextActionPayload({
        type: "master_approval",
        project,
        title: "Complete master approval",
        description: `${getProjectDisplayRef(project)} is waiting for master approval.`,
        route: getProjectActionRoute(project, "detail"),
        ctaLabel: "Review",
        basePriority: "high",
      }),
    );
  }
};

const isSameLocalDay = (left, right = new Date()) => {
  const parsed = new Date(left);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getFullYear() === right.getFullYear() &&
    parsed.getMonth() === right.getMonth() &&
    parsed.getDate() === right.getDate()
  );
};

const shouldProjectNeedEndOfDayUpdate = (project = {}) => {
  if (project?.cancellation?.isCancelled) return false;
  if (project?.excludeFromEndOfDayUpdates) return false;
  if (NEXT_ACTION_CLOSED_STATUSES.has(project?.status)) return false;
  if (!toText(project?.endOfDayUpdate)) return true;
  return !isSameLocalDay(project?.endOfDayUpdateDate);
};

const addEndOfDayNextAction = ({ projects, actions }) => {
  const eodCount = projects.filter(shouldProjectNeedEndOfDayUpdate).length;
  if (eodCount === 0) return;

  actions.push(
    buildNextActionPayload({
      type: "end_of_day_update",
      title: "Post End of Day updates",
      description: `${eodCount} active project${eodCount === 1 ? "" : "s"} need today's EOD update.`,
      route: "/end-of-day",
      ctaLabel: "Update",
      basePriority: "low",
      createdAt: new Date().toISOString(),
    }),
  );
};

// @desc    Get role-based next actions for the current user
// @route   GET /api/projects/next-actions
// @access  Private
const getNextActions = async (req, res) => {
  try {
    const limit = normalizeNextActionLimit(req.query.limit);
    const query = getNextActionProjectQuery(req);
    const projects = await Project.find(query)
      .select(
        [
          "_id",
          "orderId",
          "projectType",
          "priority",
          "status",
          "details",
          "departments",
          "acknowledgements",
          "invoice",
          "paymentVerifications",
          "sampleRequirement",
          "sampleApproval",
          "mockup",
          "quoteDetails",
          "projectLeadId",
          "assistantLeadId",
          "endOfDayUpdate",
          "endOfDayUpdateDate",
          "excludeFromEndOfDayUpdates",
          "cancellation",
          "createdAt",
          "updatedAt",
        ].join(" "),
      )
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(NEXT_ACTION_PROJECT_LIMIT)
      .lean();

    const actions = [];
    const canSeeFrontDeskActions = isFrontDeskUserForNextActions(req.user);

    projects.forEach((project) => {
      addLeadNextActions({ project, user: req.user, actions });
      addDepartmentNextActions({ project, user: req.user, actions });
      if (canSeeFrontDeskActions) {
        addFrontDeskNextActions({ project, actions });
      }
    });

    if (canSeeFrontDeskActions) {
      addEndOfDayNextAction({ projects, actions });
    }

    const deduped = Array.from(
      new Map(actions.map((action) => [action.id, action])).values(),
    ).sort((left, right) => {
      if (left.priorityRank !== right.priorityRank) {
        return left.priorityRank - right.priorityRank;
      }

      const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Infinity;
      const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Infinity;
      if (leftDue !== rightDue) return leftDue - rightDue;

      return (
        new Date(left.createdAt || 0).getTime() -
        new Date(right.createdAt || 0).getTime()
      );
    });

    return res.json({
      actions: deduped.slice(0, limit),
      total: deduped.length,
    });
  } catch (error) {
    console.error("Error fetching next actions:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get lightweight dashboard counts for the current user
// @route   GET /api/projects/dashboard-counts
// @access  Private
const getDashboardCounts = async (req, res) => {
  try {
    const { query: activeAccessQuery } = buildProjectAccessQuery(req);
    const activeProjectsQuery = mergeQueryWithCondition(activeAccessQuery, {
      status: { $ne: "Finished" },
    });

    const engagedRequest = {
      ...req,
      query: {
        ...(req.query || {}),
        mode: "engaged",
      },
    };
    const engagedDepartmentFilters = resolveEngagedDepartmentFilters(
      req.user?.department,
    );
    const engagedProjectsQuery =
      engagedDepartmentFilters.length > 0
        ? mergeQueryWithCondition(buildProjectAccessQuery(engagedRequest).query, {
            status: {
              $nin: [
                "Completed",
                "Delivered",
                "Pending Feedback",
                "Feedback Completed",
                "Finished",
              ],
            },
          })
        : null;

    const [activeProjects, engagedProjects] = await Promise.all([
      Project.countDocuments(activeProjectsQuery),
      engagedProjectsQuery ? Project.countDocuments(engagedProjectsQuery) : 0,
    ]);

    return res.json({
      activeProjects,
      engagedProjects,
    });
  } catch (error) {
    console.error("Error fetching dashboard counts:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Complete quote cost (Cost requirement)
// @route   PATCH /api/projects/:id/quote-cost
// @access  Private (Admin or Front Desk)
const updateQuoteCostVerification = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to complete quote cost.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    if (!isQuoteProject(project)) {
      return res.status(400).json({
        message: "Quote cost completion is only available for quote projects.",
      });
    }

    project.quoteDetails = normalizeQuoteDetailsWorkflow({
      quoteDetailsInput: project.quoteDetails || {},
      existingQuoteDetails: project.quoteDetails || {},
    });

    if (!project.quoteDetails?.checklist?.cost) {
      return res.status(400).json({
        code: "QUOTE_REQUIREMENTS_BLOCKED",
        message:
          "Cost completion is only available when Cost is selected for this quote.",
      });
    }

    const reset = parseBooleanFlag(req.body?.reset, false);
    const nextUpdatedAt = new Date();
    const previousCostVerification = normalizeQuoteCostVerification(
      project.quoteDetails?.costVerification || {},
    );
    const hasAmountField = Object.prototype.hasOwnProperty.call(req.body || {}, "amount");
    const nextAmount = hasAmountField
      ? (() => {
          const parsedAmount = Number.parseFloat(req.body?.amount);
          return Number.isFinite(parsedAmount) && parsedAmount > 0
            ? parsedAmount
            : null;
        })()
      : previousCostVerification.amount;
    const nextCurrency = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "currency",
    )
      ? toText(req.body?.currency).slice(0, 10)
      : previousCostVerification.currency;
    const nextNote = Object.prototype.hasOwnProperty.call(req.body || {}, "note")
      ? toText(req.body?.note).slice(0, 500)
      : previousCostVerification.note;

    const previousStatus = project.status;

    if (reset) {
      project.quoteDetails.costVerification = {
        amount: null,
        currency: "",
        note: "",
        completedAt: null,
        completedBy: null,
        updatedAt: nextUpdatedAt,
        updatedBy: req.user._id,
      };
      project.quoteDetails.decision = {
        ...normalizeQuoteDecision(project.quoteDetails?.decision || {}),
        status: "pending",
        note: "",
        validatedAt: null,
        validatedBy: null,
        convertedAt: null,
        convertedBy: null,
        convertedToType: "Quote",
      };
      project.invoice = {
        sent: false,
        sentAt: null,
        sentBy: null,
      };
      project.markModified("quoteDetails.decision");
      syncQuoteProjectStatusByRequirements(project);
    } else {
      project.quoteDetails.costVerification = {
        amount: nextAmount,
        currency: nextCurrency,
        note: nextNote,
        completedAt: nextUpdatedAt,
        completedBy: req.user._id,
        updatedAt: nextUpdatedAt,
        updatedBy: req.user._id,
      };
      syncQuoteProjectStatusByRequirements(project);
    }

    project.markModified("quoteDetails.costVerification");
    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      reset ? "Quote cost reset." : "Quote cost completed.",
      {
        quoteCost: {
          amount: reset ? null : nextAmount,
          currency: reset ? "" : nextCurrency,
          note: reset ? "" : nextNote,
          completedAt: reset ? null : nextUpdatedAt,
          reset,
        },
      },
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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: reset ? "Quote Cost Reset" : "Quote Cost Completed",
      message: `Admin ${actorName} ${
        reset ? "reset" : "completed"
      } quote cost for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
    });

    return res.json(project);
  } catch (error) {
    console.error("Error updating quote cost:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Rework quote mockup (Mockup requirement)
// @route   PATCH /api/projects/:id/quote-mockup
// @access  Private (Admin or Front Desk)
const resetQuoteMockup = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to rework quote mockup.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    if (!isQuoteProject(project)) {
      return res.status(400).json({
        message: "Quote mockup rework is only available for quote projects.",
      });
    }

    const quoteState = getQuoteChecklistState(
      getNormalizedQuoteDetailsForProject(project),
    );

    if (!quoteState.effectiveEnabledKeys.includes("mockup")) {
      return res.status(400).json({
        code: "QUOTE_REQUIREMENTS_BLOCKED",
        message:
          "Mockup rework is only available when Mockup is an active quote requirement.",
      });
    }

    const note = toText(req.body?.note).slice(0, 500);
    const previousStatus = project.status;

    project.quoteDetails = normalizeQuoteDetailsWorkflow({
      quoteDetailsInput: project.quoteDetails || {},
      existingQuoteDetails: project.quoteDetails || {},
    });

    project.quoteDetails.decision = {
      ...normalizeQuoteDecision(project.quoteDetails?.decision || {}),
      status: "pending",
      note: "",
      validatedAt: null,
      validatedBy: null,
      convertedAt: null,
      convertedBy: null,
      convertedToType: "Quote",
    };

    project.invoice = {
      sent: false,
      sentAt: null,
      sentBy: null,
    };

    project.markModified("quoteDetails.decision");

    const requirementItem = project.quoteDetails?.requirementItems?.mockup;
    if (requirementItem?.isRequired) {
      const fromStatus = toText(requirementItem.status).toLowerCase() || "assigned";
      const transitionTime = new Date();
      requirementItem.history = Array.isArray(requirementItem.history)
        ? requirementItem.history
        : [];
      requirementItem.history.push({
        fromStatus,
        toStatus: "client_revision_requested",
        changedAt: transitionTime,
        changedBy: req.user._id,
        note: note || "Mockup rework requested after quote decision.",
      });
      requirementItem.status = "client_revision_requested";
      requirementItem.updatedAt = transitionTime;
      requirementItem.updatedBy = req.user._id;
      requirementItem.note = note || "Mockup rework requested.";
      project.markModified("quoteDetails.requirementItems");
    }

    const normalizedVersions = getNormalizedMockupVersions(project);
    const latestVersion = normalizedVersions[normalizedVersions.length - 1] || null;
    if (latestVersion?.entryId && Array.isArray(project.mockup?.versions)) {
      const versionEntry = project.mockup.versions.find(
        (entry) => toObjectIdString(entry?._id) === toObjectIdString(latestVersion.entryId),
      );
      if (versionEntry) {
        versionEntry.clientApproval = {
          status: "rejected",
          isApproved: false,
          approvedAt: null,
          approvedBy: null,
          rejectedAt: new Date(),
          rejectedBy: req.user._id,
          rejectionReason: note || "Mockup rework requested.",
          note: note || "Mockup rework requested.",
          rejectionAttachment: null,
          rejectionAttachments: [],
        };
      }
    }

    if (project.mockup) {
      project.mockup.clientApproval = {
        status: "rejected",
        isApproved: false,
        approvedAt: null,
        approvedBy: null,
        rejectedAt: new Date(),
        rejectedBy: req.user._id,
        rejectionReason: note || "Mockup rework requested.",
        note: note || "Mockup rework requested.",
        rejectionAttachment: null,
        rejectionAttachments: [],
        approvedVersion: null,
      };
    }

    project.status = quoteState.hasMultipleRequirements
      ? "Pending Quote Requirements"
      : "Pending Mockup";

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      "Quote mockup rework requested.",
      {
        quoteMockup: {
          reset: true,
          note,
        },
      },
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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: "Quote Mockup Rework",
      message: `Admin ${actorName} requested mockup rework for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
    });

    return res.json(project);
  } catch (error) {
    console.error("Error resetting quote mockup:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Rework quote previous samples (Previous Samples requirement)
// @route   PATCH /api/projects/:id/quote-previous-samples
// @access  Private (Admin or Front Desk)
const resetQuotePreviousSamples = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to rework quote samples.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    if (!isQuoteProject(project)) {
      return res.status(400).json({
        message:
          "Quote sample rework is only available for quote projects.",
      });
    }

    const quoteState = getQuoteChecklistState(
      getNormalizedQuoteDetailsForProject(project),
    );

    if (!quoteState.effectiveEnabledKeys.includes("previousSamples")) {
      return res.status(400).json({
        code: "QUOTE_REQUIREMENTS_BLOCKED",
        message:
          "Sample rework is only available when Previous Sample / Work done is selected for this quote.",
      });
    }

    const note = toText(req.body?.note).slice(0, 500);
    const previousStatus = project.status;

    project.quoteDetails = normalizeQuoteDetailsWorkflow({
      quoteDetailsInput: project.quoteDetails || {},
      existingQuoteDetails: project.quoteDetails || {},
    });

    project.quoteDetails.decision = {
      ...normalizeQuoteDecision(project.quoteDetails?.decision || {}),
      status: "pending",
      note: "",
      validatedAt: null,
      validatedBy: null,
      convertedAt: null,
      convertedBy: null,
      convertedToType: "Quote",
    };

    project.invoice = {
      sent: false,
      sentAt: null,
      sentBy: null,
    };

    project.markModified("quoteDetails.decision");

    const requirementItem = project.quoteDetails?.requirementItems?.previousSamples;
    if (requirementItem?.isRequired) {
      const fromStatus = toText(requirementItem.status).toLowerCase() || "assigned";
      const transitionTime = new Date();
      requirementItem.history = Array.isArray(requirementItem.history)
        ? requirementItem.history
        : [];
      requirementItem.history.push({
        fromStatus,
        toStatus: "client_revision_requested",
        changedAt: transitionTime,
        changedBy: req.user._id,
        note: note || "Sample rework requested after quote decision.",
      });
      requirementItem.status = "client_revision_requested";
      requirementItem.updatedAt = transitionTime;
      requirementItem.updatedBy = req.user._id;
      requirementItem.note = note || "Sample rework requested.";
      project.markModified("quoteDetails.requirementItems");
    }

    project.status = quoteState.hasMultipleRequirements
      ? "Pending Quote Requirements"
      : "Pending Sample Retrieval";

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      "Quote sample rework requested.",
      {
        quotePreviousSamples: {
          reset: true,
          note,
        },
      },
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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: "Quote Sample Rework",
      message: `Admin ${actorName} requested sample rework for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
    });

    return res.json(project);
  } catch (error) {
    console.error("Error resetting quote samples:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Rework quote sample production (Sample Production requirement)
// @route   PATCH /api/projects/:id/quote-sample-production
// @access  Private (Admin or Front Desk)
const resetQuoteSampleProduction = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to rework sample production.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    if (!isQuoteProject(project)) {
      return res.status(400).json({
        message:
          "Sample production rework is only available for quote projects.",
      });
    }

    const quoteState = getQuoteChecklistState(
      getNormalizedQuoteDetailsForProject(project),
    );

    if (!quoteState.effectiveEnabledKeys.includes("sampleProduction")) {
      return res.status(400).json({
        code: "QUOTE_REQUIREMENTS_BLOCKED",
        message:
          "Sample production rework is only available when Sample Production is selected for this quote.",
      });
    }

    const note = toText(req.body?.note).slice(0, 500);
    const previousStatus = project.status;

    project.quoteDetails = normalizeQuoteDetailsWorkflow({
      quoteDetailsInput: project.quoteDetails || {},
      existingQuoteDetails: project.quoteDetails || {},
    });

    project.quoteDetails.decision = {
      ...normalizeQuoteDecision(project.quoteDetails?.decision || {}),
      status: "pending",
      note: "",
      validatedAt: null,
      validatedBy: null,
      convertedAt: null,
      convertedBy: null,
      convertedToType: "Quote",
    };

    project.invoice = {
      sent: false,
      sentAt: null,
      sentBy: null,
    };

    project.markModified("quoteDetails.decision");

    const requirementItem =
      project.quoteDetails?.requirementItems?.sampleProduction;
    if (requirementItem?.isRequired) {
      const fromStatus = toText(requirementItem.status).toLowerCase() || "assigned";
      const transitionTime = new Date();
      requirementItem.history = Array.isArray(requirementItem.history)
        ? requirementItem.history
        : [];
      requirementItem.history.push({
        fromStatus,
        toStatus: "client_revision_requested",
        changedAt: transitionTime,
        changedBy: req.user._id,
        note: note || "Sample production rework requested after quote decision.",
      });
      requirementItem.status = "client_revision_requested";
      requirementItem.updatedAt = transitionTime;
      requirementItem.updatedBy = req.user._id;
      requirementItem.note = note || "Sample production rework requested.";
      project.markModified("quoteDetails.requirementItems");
    }

    project.status = quoteState.hasMultipleRequirements
      ? "Pending Quote Requirements"
      : "Pending Production";

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      "Quote sample production rework requested.",
      {
        quoteSampleProduction: {
          reset: true,
          note,
        },
      },
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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: "Quote Sample Production Rework",
      message: `Admin ${actorName} requested sample production rework for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
    });

    return res.json(project);
  } catch (error) {
    console.error("Error resetting quote sample production:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update bid submission documents for a quote
// @route   PATCH /api/projects/:id/quote-bid-documents
// @access  Private (Admin or Front Desk)
const updateQuoteBidSubmissionDocuments = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to update bid submission documents.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "billing")) return;

    if (!isQuoteProject(project)) {
      return res.status(400).json({
        message: "Bid submission documents are only available for quote projects.",
      });
    }

    project.quoteDetails = normalizeQuoteDetailsWorkflow({
      quoteDetailsInput: project.quoteDetails || {},
      existingQuoteDetails: project.quoteDetails || {},
    });

    if (!isQuoteWorkflowSupported(project)) {
      return res.status(400).json({
        code: "QUOTE_REQUIREMENTS_BLOCKED",
        message:
          "Quote requirements are not configured yet. Select Bid Submission / Documents before updating this section.",
      });
    }

    if (!project.quoteDetails?.checklist?.bidSubmission) {
      return res.status(400).json({
        message:
          "Bid submission documents are only available when Bid Submission / Documents is selected for this quote.",
      });
    }

    const existingBidSubmission = normalizeQuoteBidSubmission(
      project.quoteDetails?.bidSubmission || {},
    );
    const isSensitive =
      req.body?.isSensitive === undefined
        ? existingBidSubmission.isSensitive
        : parseBooleanFlag(req.body?.isSensitive, existingBidSubmission.isSensitive);

    let baseDocuments = existingBidSubmission.documents || [];
    if (req.body?.existingDocuments !== undefined) {
      try {
        const parsed =
          typeof req.body.existingDocuments === "string"
            ? JSON.parse(req.body.existingDocuments)
            : req.body.existingDocuments;
        baseDocuments = normalizeBidSubmissionDocuments(parsed);
      } catch {
        baseDocuments = existingBidSubmission.documents || [];
      }
    }

    const newDocuments = mapBidSubmissionDocuments(req, req.user?._id);
    const documents = [...baseDocuments, ...newDocuments];
    const updatedAt = new Date();

    project.quoteDetails.bidSubmission = {
      ...existingBidSubmission,
      isSensitive,
      documents,
      updatedAt,
      updatedBy: req.user._id,
    };
    project.markModified("quoteDetails.bidSubmission");

    const requirementItem =
      project.quoteDetails?.requirementItems?.bidSubmission || null;
    if (requirementItem?.isRequired) {
      const fromStatus =
        toText(requirementItem.status).toLowerCase() || "assigned";
      const lockedStatuses = new Set(["sent_to_client", "client_approved"]);
      const isReady = isSensitive || documents.length > 0;
      const nextStatus = isReady ? "dept_submitted" : "assigned";

      if (!lockedStatuses.has(fromStatus) && fromStatus !== nextStatus) {
        requirementItem.history = Array.isArray(requirementItem.history)
          ? requirementItem.history
          : [];
        requirementItem.history.push({
          fromStatus,
          toStatus: nextStatus,
          changedAt: updatedAt,
          changedBy: req.user._id,
          note: isReady
            ? "Bid submission documents prepared."
            : "Bid submission documents cleared.",
        });
        requirementItem.status = nextStatus;
        requirementItem.updatedAt = updatedAt;
        requirementItem.updatedBy = req.user._id;
        requirementItem.note = isReady
          ? "Bid submission documents prepared."
          : "Bid submission documents cleared.";
        project.markModified("quoteDetails.requirementItems");
      }
    }

    syncQuoteProjectStatusByRequirements(project);
    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
      "Bid submission documents updated.",
      {
        bidSubmission: {
          isSensitive,
          documentCount: documents.length,
        },
      },
    );

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: "Bid Documents Updated",
      message: `Admin ${actorName} updated bid submission documents for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
    });

    return res.json(project);
  } catch (error) {
    console.error("Error updating bid submission documents:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Validate quote decision after response is sent
// @route   PATCH /api/projects/:id/quote-decision
// @access  Private (Admin or Front Desk)
const updateQuoteDecision = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message: "Not authorized to validate quote decision.",
      });
    }

    const rawDecisionValue = req.body?.decision ?? req.body?.status;
    const normalizedDecision = normalizeQuoteDecisionStatus(
      rawDecisionValue,
      "",
    );
    const note = toText(req.body?.note).slice(0, 500);

    if (!normalizedDecision) {
      return res.status(400).json({
        message: "Invalid quote decision.",
        allowed: QUOTE_DECISION_STATUS_VALUES.filter(
          (status) => status !== "pending",
        ),
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    if (!isQuoteProject(project)) {
      return res.status(400).json({
        message: "Quote decision is only available for quote projects.",
      });
    }

    project.quoteDetails = normalizeQuoteDetailsWorkflow({
      quoteDetailsInput: project.quoteDetails || {},
      existingQuoteDetails: project.quoteDetails || {},
    });

    const normalizedStatus = normalizeStatusForStorageByProjectType(
      project.status,
      "Quote",
    );
    if (!isQuoteWorkflowSupported(project)) {
      return res.status(400).json({
        code: "QUOTE_REQUIREMENTS_BLOCKED",
        message:
          "Quote requirements are not configured yet. Configure at least one quote requirement before validating the decision.",
      });
    }

    const decisionGateStatuses = new Set([
      "Pending Client Decision",
      "Quote Submission Completed",
      "Completed",
      "Declined",
    ]);

    if (
      normalizedDecision !== "pending" &&
      !decisionGateStatuses.has(normalizedStatus)
    ) {
      return res.status(400).json({
        code: "QUOTE_DECISION_REQUIRES_SUBMISSION",
        message:
          "Quote decision can only be validated after quote submission is completed.",
      });
    }

    const existingDecision = normalizeQuoteDecision(
      project.quoteDetails?.decision || {},
    );
    const now = new Date();
    const nextDecision = {
      ...existingDecision,
      status: normalizedDecision,
      note,
      validatedAt: normalizedDecision === "pending" ? null : now,
      validatedBy: normalizedDecision === "pending" ? null : req.user._id,
    };

    if (normalizedDecision !== "go_ahead") {
      nextDecision.convertedAt = null;
      nextDecision.convertedBy = null;
      nextDecision.convertedToType = "Quote";
    }

    const previousStatus = project.status;
    let nextStatus = previousStatus;
    if (normalizedDecision === "pending") {
      nextStatus = "Pending Client Decision";
    } else if (
      ["declined", "go_ahead", "no_response"].includes(normalizedDecision)
    ) {
      nextStatus = "Completed";
    }

    project.quoteDetails.decision = nextDecision;
    project.status = nextStatus;
    project.markModified("quoteDetails.decision");
    await project.save();

    const decisionLabel =
      normalizedDecision === "go_ahead"
        ? "Go Ahead"
        : normalizedDecision === "declined"
          ? "Declined"
          : normalizedDecision === "no_response"
            ? "No Response"
          : "Pending";

    await logActivity(
      project._id,
      req.user._id,
      "update",
      `Quote decision validated as ${decisionLabel}.`,
      {
        quoteDecision: {
          status: normalizedDecision,
          note,
        },
      },
    );

    if (previousStatus !== nextStatus) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${nextStatus}`,
        {
          statusChange: { from: previousStatus, to: nextStatus },
        },
      );
    }

    const actorName =
      `${toText(req.user?.firstName)} ${toText(req.user?.lastName)}`.trim() ||
      "A user";

    await notifyAdmins(
      req.user._id,
      project._id,
      "SYSTEM",
      "Quote Decision Updated",
      `${actorName} validated quote decision as ${decisionLabel} for project #${getProjectDisplayRef(
        project,
      )}.`,
    );

    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: "Quote Decision Updated",
      message: `Admin ${actorName} validated quote decision as ${decisionLabel} for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
    });

    return res.json(project);
  } catch (error) {
    console.error("Error updating quote decision:", error);
    return res.status(500).json({ message: "Server Error" });
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
    const oldStatus = project.status;

    if (isQuoteProject(project)) {
      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });
      if (!isQuoteWorkflowSupported(project)) {
        return res.status(400).json({
          code: "QUOTE_REQUIREMENTS_BLOCKED",
          message:
            "Quote requirements are not configured yet. Configure at least one quote requirement before sending the quote.",
          });
      }
      const quoteProgress = getQuoteRequirementProgressState(project);
      if (!quoteProgress.allRequirementsReadyForSubmission) {
        const missingLabels = quoteProgress.missingRequirementKeys
          .map((key) => QUOTE_REQUIREMENT_LABELS[key] || key)
          .filter(Boolean);
        return res.status(400).json({
          code: "QUOTE_REQUIREMENTS_PENDING",
          message:
            missingLabels.length > 0
              ? `Complete all selected quote requirements before sending the quote. Pending: ${missingLabels.join(", ")}.`
              : "Complete all selected quote requirements before sending the quote.",
        });
      }
    }

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
    if (isQuoteProject(project)) {
      ["previousSamples", "sampleProduction", "bidSubmission"].forEach(
        (requirementKey) => {
          const requirementItem =
            project.quoteDetails?.requirementItems?.[requirementKey] || null;
          if (!requirementItem?.isRequired) return;
          const fromStatus =
            toText(requirementItem.status).toLowerCase() || "assigned";
          if (["sent_to_client", "client_approved"].includes(fromStatus)) return;

          const transitionTime = new Date();
          requirementItem.history = Array.isArray(requirementItem.history)
            ? requirementItem.history
            : [];
          requirementItem.history.push({
            fromStatus,
            toStatus: "sent_to_client",
            changedAt: transitionTime,
            changedBy: req.user._id,
            note: "Quote sent to client.",
          });
          requirementItem.status = "sent_to_client";
          requirementItem.updatedAt = transitionTime;
          requirementItem.updatedBy = req.user._id;
          requirementItem.note = "Quote sent to client.";
          project.markModified("quoteDetails.requirementItems");
        },
      );
      project.status = getAutoProgressedStatus(
        "Quote Submission Completed",
        project,
      );
    }
    const billingGuardAfter = getBillingGuardMissingByTarget(project);

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
        `${billingDocumentLabel} marked as sent.`,
        { invoice: { sent: true } },
      );

    if (oldStatus !== project.status) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${project.status}`,
        {
          statusChange: { from: oldStatus, to: project.status },
        },
      );
    }

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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: `${billingDocumentLabel} Sent`,
      message: `Admin ${actorName} marked ${billingDocumentLabel.toLowerCase()} as sent for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: "Payment Verified",
      message: `Admin ${actorName} verified ${formatPaymentTypeLabel(
        type,
      )} payment for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
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
    const oldStatus = project.status;

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
    if (isQuoteProject(project)) {
      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });
      ["previousSamples", "sampleProduction", "bidSubmission"].forEach(
        (requirementKey) => {
          const requirementItem =
            project.quoteDetails?.requirementItems?.[requirementKey] || null;
          if (!requirementItem?.isRequired) return;

          const fromStatus =
            toText(requirementItem.status).toLowerCase() || "assigned";
          if (!["sent_to_client", "client_approved"].includes(fromStatus)) return;

          const transitionTime = new Date();
          requirementItem.history = Array.isArray(requirementItem.history)
            ? requirementItem.history
            : [];
          requirementItem.history.push({
            fromStatus,
            toStatus: "dept_submitted",
            changedAt: transitionTime,
            changedBy: req.user._id,
            note: "Quote send status reset.",
          });
          requirementItem.status = "dept_submitted";
          requirementItem.updatedAt = transitionTime;
          requirementItem.updatedBy = req.user._id;
          requirementItem.note = "Quote send status reset.";
          project.markModified("quoteDetails.requirementItems");
        },
      );

      const quoteState = getQuoteRequirementProgressState(project);
      if (quoteState.checklistState.mode === "mockup") {
        project.status = isQuoteMockupReadyForSubmission(project)
          ? "Pending Quote Submission"
          : "Pending Mockup";
      } else {
        syncQuoteProjectStatusByRequirements(project);
      }
    }

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "update",
        `${billingDocumentLabel} status reset.`,
        { invoice: { sent: false } },
      );

    if (oldStatus !== project.status) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${project.status}`,
        {
          statusChange: { from: oldStatus, to: project.status },
        },
      );
    }

    await notifyBillingOptionChange({
      project,
      senderId: req.user._id,
      title: `${billingDocumentLabel} Status Reset`,
      message: `${billingDocumentLabel} status reset for project #${getProjectDisplayRef(project)}: ${getProjectDisplayName(project)}`,
    });

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: `${billingDocumentLabel} Status Reset`,
      message: `Admin ${actorName} reset ${billingDocumentLabel.toLowerCase()} status for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: "Payment Verification Removed",
      message: `Admin ${actorName} removed ${formatPaymentTypeLabel(
        type,
      )} payment verification for project #${projectRef} (${projectName}).`,
      type: "UPDATE",
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
// @access  Private (Admin or Front Desk)
const updateProjectType = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res.status(403).json({
        message:
          "Only Admin or Front Desk can change project types.",
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
    const requestedStatus = normalizeStatusForStorageByProjectType(
      req.body?.targetStatus || req.body?.status,
      requestedType,
    );
    const previousStatus = toText(project.status);
    const isFrontDeskUser =
      req.user?.role !== "admin" && canManageBilling(req.user);
    const isQuoteToProjectConversion =
      previousType === "Quote" && requestedType !== "Quote";

    if (isFrontDeskUser && previousType !== "Quote") {
      return res.status(403).json({
        message:
          "Front Desk can only convert quote projects to a production project type.",
      });
    }

    if (isFrontDeskUser && requestedType === "Quote") {
      return res.status(403).json({
        message: "Front Desk cannot convert projects back to Quote type.",
      });
    }

    const currentQuoteDecision = normalizeQuoteDecision(
      project?.quoteDetails?.decision || {},
    );

    if (isQuoteToProjectConversion) {
      const normalizedStatus = normalizeStatusForStorageByProjectType(
        previousStatus,
        "Quote",
      );
      if (
        ![
          "Pending Client Decision",
          "Quote Submission Completed",
          "Completed",
          "Declined",
        ].includes(normalizedStatus)
      ) {
        return res.status(400).json({
          code: "QUOTE_CONVERSION_REQUIRES_SUBMISSION",
          message:
            "Quote can only be converted to a project type after quote submission and client decision.",
        });
      }

      if (currentQuoteDecision.status !== "go_ahead") {
        return res.status(400).json({
          code: "QUOTE_DECISION_REQUIRED_FOR_CONVERSION",
          message:
            "Client quote decision must be validated as Go Ahead before conversion.",
        });
      }
    }

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

    if (isQuoteToProjectConversion && !requestedStatus) {
      // Quote conversion restarts the full standard workflow from scope approval
      // unless a target status is explicitly provided.
      nextStatus = "Pending Scope Approval";
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
    if (hadStatusChange) {
      const batchProgressGuard = getBatchProgressGuard(project, nextStatus);
      if (batchProgressGuard) {
        return res.status(400).json(batchProgressGuard);
      }
    }
    if (requestedType === "Quote") {
      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });
    }

    if (isQuoteToProjectConversion) {
      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });
      const nextDecision = {
        ...normalizeQuoteDecision(project.quoteDetails?.decision || {}),
        status: "go_ahead",
        validatedAt:
          currentQuoteDecision.validatedAt || toDateOrNull(now) || now,
        validatedBy: currentQuoteDecision.validatedBy || req.user._id,
        convertedAt: now,
        convertedBy: req.user._id,
        convertedToType: requestedType,
      };
      project.quoteDetails.decision = nextDecision;
      project.markModified("quoteDetails.decision");

      // Converted projects must follow normal workflow/billing gates from scratch.
      project.acknowledgements = [];
      project.invoice = {
        sent: false,
        sentAt: null,
        sentBy: null,
      };
      project.paymentVerifications = [];
    }

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
    const files = Array.isArray(req.files)
      ? req.files
      : req.file
        ? [req.file]
        : [];
    const trimmedNote = String(note || "").trim();

    if (files.length === 0) {
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

    if (isQuoteProject(project)) {
      const engagementGuard = getQuoteDepartmentEngagementGuard({
        project,
        user: req.user,
        allowedDepartments: ["graphics"],
      });
      if (engagementGuard) {
        return res.status(400).json({
          code: engagementGuard.code,
          missing: engagementGuard.missing,
          message: engagementGuard.message,
        });
      }
    }

    if (!isMockupWorkflowStatusAllowed(project, project.status)) {
      return res.status(400).json({
        message: getMockupWorkflowStatusMessage(project),
      });
    }

    ensureProjectMockupVersions(project);
    const existingVersions = Array.isArray(project?.mockup?.versions)
      ? [...project.mockup.versions]
      : [];

    const highestVersion = existingVersions.reduce((maxVersion, entry) => {
      const parsedVersion = Number.parseInt(entry?.version, 10);
      if (!Number.isFinite(parsedVersion) || parsedVersion <= 0) {
        return maxVersion;
      }
      return Math.max(maxVersion, parsedVersion);
    }, 0);

    const appendToLatest = parseBooleanFlag(
      req.body?.appendToLatest ??
        req.body?.append ??
        req.query?.appendToLatest ??
        req.query?.append,
      false,
    );
    const latestExistingEntry = existingVersions.reduce((latest, entry) => {
      if (!latest) return entry;
      const latestVersionNumber = Number.parseInt(latest?.version, 10) || 0;
      const entryVersionNumber = Number.parseInt(entry?.version, 10) || 0;
      if (entryVersionNumber !== latestVersionNumber) {
        return entryVersionNumber > latestVersionNumber ? entry : latest;
      }
      const latestTime = latest?.uploadedAt
        ? new Date(latest.uploadedAt).getTime()
        : 0;
      const entryTime = entry?.uploadedAt
        ? new Date(entry.uploadedAt).getTime()
        : 0;
      return entryTime >= latestTime ? entry : latest;
    }, null);

    const latestExistingSource = getMockupSource(
      latestExistingEntry?.source,
      parseBooleanFlag(latestExistingEntry?.intakeUpload, false)
        ? "client"
        : "graphics",
    );
    const canAppendToLatest =
      appendToLatest &&
      existingVersions.length > 0 &&
      latestExistingSource === "graphics";

    const nextVersionNumber = canAppendToLatest
      ? highestVersion || 1
      : highestVersion + 1;
    const baseUploadTime = new Date();
    const newEntries = files.map((file, index) => {
      const versionNumber = nextVersionNumber;
      const uploadedAt = new Date(baseUploadTime.getTime() + index);
      return {
        version: versionNumber,
        fileUrl: `/uploads/${file.filename}`,
        fileName: file.originalname,
        fileType: file.mimetype,
        note: trimmedNote,
        uploadedBy: req.user._id,
        uploadedAt,
        source: "graphics",
        intakeUpload: false,
        graphicsReview: {
          status: "not_required",
          reviewedAt: null,
          reviewedBy: null,
          note: "",
        },
        clientApproval: {
          status: "pending",
          isApproved: false,
          approvedAt: null,
          approvedBy: null,
          rejectedAt: null,
          rejectedBy: null,
          rejectionReason: "",
          note: "",
          rejectionAttachment: null,
          rejectionAttachments: [],
        },
      };
    });

    const latestEntry = newEntries[newEntries.length - 1];
    const latestVersion = latestEntry?.version || nextVersionNumber;

    if (latestExistingEntry?.fileUrl && latestExistingSource === "client") {
      latestExistingEntry.source = "client";
      latestExistingEntry.intakeUpload = parseBooleanFlag(
        latestExistingEntry?.intakeUpload,
        true,
      );
      latestExistingEntry.graphicsReview = buildMockupGraphicsReviewState(
        {
          status: "superseded",
          reviewedAt: new Date(),
          reviewedBy: req.user._id,
          note:
            trimmedNote ||
            `Graphics uploaded revised mockup ${buildMockupVersionLabel(latestVersion)}.`,
        },
        "client",
        latestExistingEntry.intakeUpload,
      );
    }

    const mergedVersions = [...existingVersions, ...newEntries].sort(
      (left, right) => {
        const leftVersion = Number.parseInt(left?.version, 10) || 0;
        const rightVersion = Number.parseInt(right?.version, 10) || 0;
        return leftVersion - rightVersion;
      },
    );
    project.mockup = project.mockup || {};
    project.mockup.versions = mergedVersions;
    syncProjectMockupFromVersion(project, latestEntry, {
      approvedVersion: null,
    });

    let quoteMockupRequirementAutoMoved = null;
    if (isQuoteProject(project)) {
      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });

      const requirementItem = project.quoteDetails?.requirementItems?.mockup;
      const fromStatus = toText(requirementItem?.status).toLowerCase() || "assigned";
      const shouldAutoMove =
        Boolean(requirementItem?.isRequired) &&
        ["assigned", "in_progress", "client_revision_requested", "blocked"].includes(
          fromStatus,
        );

      if (shouldAutoMove) {
        const transitionSequence =
          fromStatus === "in_progress"
            ? ["dept_submitted"]
            : ["in_progress", "dept_submitted"];
        const transitionTime = new Date();
        const transitionNote =
          trimmedNote ||
          `Mockup ${buildMockupVersionLabel(latestVersion)} uploaded.`;

        requirementItem.history = Array.isArray(requirementItem.history)
          ? requirementItem.history
          : [];

        let previousStatus = fromStatus;
        transitionSequence.forEach((toStatus) => {
          requirementItem.history.push({
            fromStatus: previousStatus,
            toStatus,
            changedAt: transitionTime,
            changedBy: req.user._id,
            note: transitionNote,
          });
          previousStatus = toStatus;
        });

        requirementItem.status = "dept_submitted";
        requirementItem.updatedAt = transitionTime;
        requirementItem.updatedBy = req.user._id;
        requirementItem.completionConfirmedAt = null;
        requirementItem.completionConfirmedBy = null;
        requirementItem.note = transitionNote;
        project.markModified("quoteDetails.requirementItems");

        const statusSync = syncQuoteProjectStatusByRequirements(project);
        quoteMockupRequirementAutoMoved = {
          fromStatus,
          toStatus: "dept_submitted",
          statusSync,
        };
      }
    }

    await project.save();

    for (const entry of newEntries) {
      await createProjectSystemUpdateAndSnapshot({
        project,
        authorId: req.user._id || req.user.id,
        category: "Graphics",
        content: buildMockupPendingApprovalUpdateText(entry.version),
      });

      await logActivity(
        project._id,
        req.user._id,
        "mockup_upload",
        `Mockup ${buildMockupVersionLabel(entry.version)} uploaded${
          entry.fileName ? ` (${entry.fileName})` : ""
        }.`,
        {
          mockup: {
            version: entry.version,
            fileUrl: entry.fileUrl,
            fileName: entry.fileName,
            note: entry.note,
          },
        },
      );
    }

    if (quoteMockupRequirementAutoMoved) {
      await logActivity(
        project._id,
        req.user._id,
        "update",
        `Quote requirement 'Mockup' moved from ${formatQuoteRequirementStatusLabel(
          quoteMockupRequirementAutoMoved.fromStatus,
        )} to ${formatQuoteRequirementStatusLabel(
          quoteMockupRequirementAutoMoved.toStatus,
        )} after upload.`,
        {
          quoteRequirement: {
            key: "mockup",
            label: "Mockup",
            fromStatus: quoteMockupRequirementAutoMoved.fromStatus,
            toStatus: quoteMockupRequirementAutoMoved.toStatus,
          },
        },
      );

      if (quoteMockupRequirementAutoMoved.statusSync?.changed) {
        await logActivity(
          project._id,
          req.user._id,
          "status_change",
          `Project status updated to ${quoteMockupRequirementAutoMoved.statusSync.toStatus}`,
          {
            statusChange: {
              from: quoteMockupRequirementAutoMoved.statusSync.fromStatus,
              to: quoteMockupRequirementAutoMoved.statusSync.toStatus,
            },
          },
        );
      }
    }

    for (const entry of newEntries) {
      await notifyMockupVersionUploaded({
        project,
        senderId: req.user._id,
        version: entry.version,
      });
    }

    const populatedProject = await buildProjectResponseQuery(project._id);
    res.json(populatedProject || project);
  } catch (error) {
    console.error("Error uploading mockup:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Delete a mockup version for a project
// @route   DELETE /api/projects/:id/mockup/:version
// @access  Private (Graphics/Design or Admin)
const deleteProjectMockupVersion = async (req, res) => {
  try {
    const { id, version } = req.params;
    const requestedToken = String(version || "").trim();
    const requestedEntryId = toObjectIdString(requestedToken);
    const hasEntryId = mongoose.isValidObjectId(requestedEntryId);
    const parsedVersion = Number.parseInt(requestedToken, 10);
    const requestedVersion =
      Number.isFinite(parsedVersion) && parsedVersion > 0 ? parsedVersion : null;

    if (!hasEntryId && !requestedVersion) {
      return res.status(400).json({
        message: "A valid mockup entry is required.",
      });
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
      return res.status(403).json({
        message: "Not authorized to delete mockups",
      });
    }

    if (isQuoteProject(project)) {
      const engagementGuard = getQuoteDepartmentEngagementGuard({
        project,
        user: req.user,
        allowedDepartments: ["graphics"],
      });
      if (engagementGuard) {
        return res.status(400).json({
          code: engagementGuard.code,
          missing: engagementGuard.missing,
          message: engagementGuard.message,
        });
      }
    }

    if (!isMockupWorkflowStatusAllowed(project, project.status)) {
      return res.status(400).json({
        message: getMockupWorkflowStatusMessage(project),
      });
    }

    ensureProjectMockupVersions(project);

    if (project.mockup.versions.length === 0) {
      return res.status(400).json({
        message: "No mockup has been uploaded yet.",
      });
    }

    let targetEntry = null;
    if (hasEntryId) {
      targetEntry = project.mockup.versions.find(
        (entry) => toObjectIdString(entry?._id) === requestedEntryId,
      );
    }

    if (!targetEntry && requestedVersion) {
      const candidates = project.mockup.versions.filter((entry) => {
        const parsed = Number.parseInt(entry?.version, 10);
        return Number.isFinite(parsed) && parsed === requestedVersion;
      });
      if (candidates.length > 0) {
        candidates.sort((left, right) => {
          const leftTime = left?.uploadedAt
            ? new Date(left.uploadedAt).getTime()
            : 0;
          const rightTime = right?.uploadedAt
            ? new Date(right.uploadedAt).getTime()
            : 0;
          return leftTime - rightTime;
        });
        targetEntry = candidates[candidates.length - 1];
      }
    }

    if (!targetEntry?.fileUrl) {
      return res.status(400).json({
        message: "Selected mockup version is not available.",
      });
    }

    const targetFileUrl = targetEntry.fileUrl;
    const targetFileName = targetEntry.fileName;
    const targetVersionNumber =
      Number.parseInt(targetEntry?.version, 10) || requestedVersion || 1;

    if (typeof targetEntry.remove === "function") {
      targetEntry.remove();
    } else {
      project.mockup.versions = project.mockup.versions.filter(
        (entry) => toObjectIdString(entry?._id) !== toObjectIdString(targetEntry?._id),
      );
    }

    const remainingVersions = project.mockup.versions;

    if (remainingVersions.length === 0) {
      resetProjectMockupState(project);
    } else {
      const latestVersion = remainingVersions.reduce((latest, entry) => {
        if (!latest) return entry;
        const latestVersionNumber = Number.parseInt(latest?.version, 10) || 0;
        const entryVersionNumber = Number.parseInt(entry?.version, 10) || 0;
        if (entryVersionNumber !== latestVersionNumber) {
          return entryVersionNumber > latestVersionNumber ? entry : latest;
        }
        const latestTime = latest?.uploadedAt
          ? new Date(latest.uploadedAt).getTime()
          : 0;
        const entryTime = entry?.uploadedAt
          ? new Date(entry.uploadedAt).getTime()
          : 0;
        return entryTime >= latestTime ? entry : latest;
      }, null);
      const approvalStatus = getMockupApprovalStatus(
        latestVersion?.clientApproval || {},
      );
      syncProjectMockupFromVersion(project, latestVersion, {
        approvedVersion:
          approvalStatus === "approved" ? latestVersion?.version || null : null,
      });
    }

    await project.save();

    const versionLabel = buildMockupVersionLabel(targetVersionNumber);
    await createProjectSystemUpdateAndSnapshot({
      project,
      authorId: req.user._id || req.user.id,
      category: "Graphics",
      content: `Mockup ${versionLabel} deleted by Graphics.`,
    });

    await logActivity(
      project._id,
      req.user._id,
      "mockup_delete",
      `Mockup ${versionLabel} deleted.`,
      {
        mockup: {
          version: targetVersionNumber,
          entryId: toObjectIdString(targetEntry?._id),
          fileUrl: targetFileUrl,
          fileName: targetFileName,
        },
      },
    );

    const filePath = upload.resolveUploadPathFromUrl(targetFileUrl);
    if (filePath) {
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.error("Failed to remove mockup file:", error);
        }
      }
    }

    const populatedProject = await buildProjectResponseQuery(project._id);
    res.json(populatedProject || project);
  } catch (error) {
    console.error("Error deleting mockup:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Confirm client approval for a mockup version
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
    const requestedEntryId = toObjectIdString(req.body?.entryId);
    const hasEntryId = mongoose.isValidObjectId(requestedEntryId);
    const requestedVersionRaw = Number.parseInt(req.body?.version, 10);
    let requestedVersion =
      Number.isFinite(requestedVersionRaw) && requestedVersionRaw > 0
        ? requestedVersionRaw
        : latestVersion.version;
    const approvalNote = toText(req.body?.note);
    let versionEntry = null;

    ensureProjectMockupVersions(project);

    if (hasEntryId) {
      versionEntry = project.mockup.versions.find(
        (entry) => toObjectIdString(entry?._id) === requestedEntryId,
      );
    }

    if (!versionEntry) {
      versionEntry = project.mockup.versions.find((entry) => {
        const parsed = Number.parseInt(entry?.version, 10);
        return Number.isFinite(parsed) && parsed === requestedVersion;
      });
    }

    if (!versionEntry?.fileUrl) {
      return res.status(400).json({
        message: "Selected mockup version is not available.",
      });
    }

    if (isClientProvidedMockupVersion(versionEntry)) {
      return res.status(400).json({
        message:
          "Client-provided mockups must be validated or revised by Graphics before Front Desk review.",
      });
    }

    requestedVersion =
      Number.parseInt(versionEntry?.version, 10) || latestVersion.version;
    const requestedVersionLabel = buildMockupVersionLabel(requestedVersion);
    const isLatestRequested = latestVersion?.entryId
      ? toObjectIdString(versionEntry?._id) === toObjectIdString(latestVersion.entryId)
      : requestedVersion === latestVersion.version;

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
      rejectionAttachment: null,
      rejectionAttachments: [],
    };

    versionEntry.clientApproval = approvalState;

    if (isLatestRequested) {
      syncProjectMockupFromVersion(project, versionEntry, {
        approvedVersion: requestedVersion,
      });
    }

    const quoteMockupDecisionSync = isLatestRequested
      ? syncQuoteMockupRequirementDecision({
          project,
          targetStatus: "client_approved",
          actorId: req.user._id,
          note:
            approvalNote ||
            `Client approved ${requestedVersionLabel} via Front Desk/Admin review.`,
        })
      : null;

    const previousStatus = project.status;
    let autoStatusApplied = false;
    if (isLatestRequested && isQuoteMockupOnlyProject(project)) {
      if (project.status !== "Pending Mockup") {
        project.status = "Pending Mockup";
        autoStatusApplied = true;
      }
    }

    await project.save();

    const approvalFileName = toText(versionEntry?.fileName);
    const approvalFileSuffix = approvalFileName ? ` (${approvalFileName})` : "";

    await logActivity(
      project._id,
      req.user._id,
      "mockup_approval",
      `Client approval confirmed for mockup ${requestedVersionLabel}${approvalFileSuffix}.`,
      {
        mockupApproval: {
          version: requestedVersion,
          entryId: toObjectIdString(versionEntry?._id),
          note: approvalNote,
          fileName: approvalFileName,
        },
      },
    );

    if (quoteMockupDecisionSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "update",
        `Quote requirement 'Mockup' moved from ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.fromStatus,
        )} to ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.toStatus,
        )} after client mockup approval.`,
        {
          quoteRequirement: {
            key: "mockup",
            label: "Mockup",
            fromStatus: quoteMockupDecisionSync.fromStatus,
            toStatus: quoteMockupDecisionSync.toStatus,
            note: approvalNote,
          },
        },
      );
    }

    if (quoteMockupDecisionSync?.statusSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${quoteMockupDecisionSync.statusSync.toStatus}`,
        {
          statusChange: {
            from: quoteMockupDecisionSync.statusSync.fromStatus,
            to: quoteMockupDecisionSync.statusSync.toStatus,
          },
        },
      );
    }

    if (autoStatusApplied && previousStatus !== project.status) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${project.status}`,
        {
          statusChange: {
            from: previousStatus,
            to: project.status,
          },
        },
      );
    }

    if (isLatestRequested) {
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
    }

    const populatedProject = await buildProjectResponseQuery(project._id);
    res.json(populatedProject || project);
  } catch (error) {
    console.error("Error approving mockup:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Record client rejection for a mockup version
// @route   POST /api/projects/:id/mockup/reject
// @access  Private (Front Desk or Admin)
const rejectProjectMockup = async (req, res) => {
  let persistedRejectionAttachment = false;
  try {
    if (!canManageMockupApproval(req.user)) {
      await cleanupUploadedFilesSafely(req);
      return res.status(403).json({
        message: "Not authorized to reject mockups.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "mockup")) {
      await cleanupUploadedFilesSafely(req);
      return;
    }

    const rejectWithCleanup = async (status, message) => {
      await cleanupUploadedFilesSafely(req);
      return res.status(status).json({ message });
    };

    if (!isMockupWorkflowStatusAllowed(project, project.status)) {
      return rejectWithCleanup(400, getMockupWorkflowStatusMessage(project));
    }

    const normalizedVersions = getNormalizedMockupVersions(project);
    if (!normalizedVersions.length) {
      return rejectWithCleanup(400, "No mockup has been uploaded yet.");
    }

    const latestVersion = normalizedVersions[normalizedVersions.length - 1];
    const requestedEntryId = toObjectIdString(req.body?.entryId);
    const hasEntryId = mongoose.isValidObjectId(requestedEntryId);
    const requestedVersionRaw = Number.parseInt(req.body?.version, 10);
    let requestedVersion =
      Number.isFinite(requestedVersionRaw) && requestedVersionRaw > 0
        ? requestedVersionRaw
        : latestVersion.version;

    const rejectionReason = toText(req.body?.reason);
    const rejectionAttachments = mapAttachmentUploads(req, req.user?._id);
    const primaryRejectionAttachment = rejectionAttachments[0] || null;

    ensureProjectMockupVersions(project);

    let versionEntry = null;
    if (hasEntryId) {
      versionEntry = project.mockup.versions.find(
        (entry) => toObjectIdString(entry?._id) === requestedEntryId,
      );
    }

    if (!versionEntry) {
      versionEntry = project.mockup.versions.find((entry) => {
        const parsed = Number.parseInt(entry?.version, 10);
        return Number.isFinite(parsed) && parsed === requestedVersion;
      });
    }

    if (!versionEntry?.fileUrl) {
      return rejectWithCleanup(400, "Selected mockup version is not available.");
    }

    if (isClientProvidedMockupVersion(versionEntry)) {
      return rejectWithCleanup(
        400,
        "Client-provided mockups must be validated or revised by Graphics before Front Desk review.",
      );
    }

    requestedVersion =
      Number.parseInt(versionEntry?.version, 10) || latestVersion.version;
    const versionLabel = buildMockupVersionLabel(requestedVersion);
    const isLatestRequested = latestVersion?.entryId
      ? toObjectIdString(versionEntry?._id) === toObjectIdString(latestVersion.entryId)
      : requestedVersion === latestVersion.version;

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
      rejectionAttachment: primaryRejectionAttachment,
      rejectionAttachments,
    };

    versionEntry.clientApproval = decisionState;
    if (isLatestRequested) {
      syncProjectMockupFromVersion(project, versionEntry, {
        approvedVersion: null,
      });
    }

    const quoteMockupDecisionSync = isLatestRequested
      ? syncQuoteMockupRequirementDecision({
          project,
          targetStatus: "client_revision_requested",
          actorId: req.user._id,
          note:
            rejectionReason ||
            `Client requested revision for ${versionLabel} via Front Desk/Admin review.`,
        })
      : null;

    const previousStatus = project.status;
    let autoStatusApplied = false;
    if (isLatestRequested && isQuoteMockupOnlyProject(project)) {
      if (project.status !== "Pending Mockup") {
        project.status = "Pending Mockup";
        autoStatusApplied = true;
      }
    }

    await project.save();
    persistedRejectionAttachment = rejectionAttachments.length > 0;

    const rejectionFileName = toText(versionEntry?.fileName);
    const rejectionFileSuffix = rejectionFileName ? ` (${rejectionFileName})` : "";
    const rejectionAttachmentNames = rejectionAttachments
      .map((attachment) => toText(attachment?.fileName))
      .filter(Boolean);

    await logActivity(
      project._id,
      req.user._id,
      "mockup_rejection",
      `Client rejected mockup ${versionLabel}${rejectionFileSuffix}.`,
      {
        mockupRejection: {
          version: requestedVersion,
          reason: rejectionReason,
          entryId: toObjectIdString(versionEntry?._id),
          fileName: rejectionFileName,
          rejectionAttachmentNames,
          rejectionAttachments,
        },
      },
    );

    if (quoteMockupDecisionSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "update",
        `Quote requirement 'Mockup' moved from ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.fromStatus,
        )} to ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.toStatus,
        )} after client requested revision.`,
        {
          quoteRequirement: {
            key: "mockup",
            label: "Mockup",
            fromStatus: quoteMockupDecisionSync.fromStatus,
            toStatus: quoteMockupDecisionSync.toStatus,
            note: rejectionReason,
          },
        },
      );
    }

    if (quoteMockupDecisionSync?.statusSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${quoteMockupDecisionSync.statusSync.toStatus}`,
        {
          statusChange: {
            from: quoteMockupDecisionSync.statusSync.fromStatus,
            to: quoteMockupDecisionSync.statusSync.toStatus,
          },
        },
      );
    }

    if (autoStatusApplied && previousStatus !== project.status) {
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

    await notifyMockupRejected({
      project,
      senderId: req.user._id,
      version: requestedVersion,
      rejectionReason,
      fileName: rejectionFileName,
    });

    const populatedProject = await buildProjectResponseQuery(project._id);
    res.json(populatedProject || project);
  } catch (error) {
    if (!persistedRejectionAttachment) {
      await cleanupUploadedFilesSafely(req);
    }
    console.error("Error rejecting mockup:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Validate a client-provided mockup so the workflow can continue
// @route   POST /api/projects/:id/mockup/validate-client
// @access  Private (Graphics/Design or Admin)
const validateClientProjectMockup = async (req, res) => {
  try {
    if (!canValidateClientMockup(req.user)) {
      return res.status(403).json({
        message: "Not authorized to validate client mockups.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "mockup")) return;

    if (!isMockupWorkflowStatusAllowed(project, project.status)) {
      return res.status(400).json({
        message: getMockupWorkflowStatusMessage(project),
      });
    }

    if (isQuoteProject(project)) {
      const engagementGuard = getQuoteDepartmentEngagementGuard({
        project,
        user: req.user,
        allowedDepartments: ["graphics"],
      });
      if (engagementGuard) {
        return res.status(400).json({
          code: engagementGuard.code,
          missing: engagementGuard.missing,
          message: engagementGuard.message,
        });
      }
    }

    const normalizedVersions = getNormalizedMockupVersions(project);
    if (!normalizedVersions.length) {
      return res.status(400).json({
        message: "No mockup has been uploaded yet.",
      });
    }

    const latestVersion = normalizedVersions[normalizedVersions.length - 1];
    if (!latestVersion?.fileUrl) {
      return res.status(400).json({
        message: "No mockup has been uploaded yet.",
      });
    }

    if (!isClientProvidedMockupVersion(latestVersion)) {
      return res.status(400).json({
        message: "Latest mockup is not a client-provided mockup.",
      });
    }

    const versionLabel = buildMockupVersionLabel(latestVersion.version);
    const reviewStatus = getMockupGraphicsReviewStatus(
      latestVersion.graphicsReview || {},
      latestVersion.source,
      latestVersion.intakeUpload,
    );

    if (reviewStatus === "validated") {
      return res.status(400).json({
        message: `Client mockup ${versionLabel} is already validated.`,
      });
    }

    if (reviewStatus === "superseded") {
      return res.status(400).json({
        message: `Client mockup ${versionLabel} has already been replaced by a Graphics revision.`,
      });
    }

    ensureProjectMockupVersions(project);
    const versionEntry = project.mockup.versions.find((entry) =>
      latestVersion?.entryId
        ? toObjectIdString(entry?._id) === toObjectIdString(latestVersion.entryId)
        : Number.parseInt(entry?.version, 10) === latestVersion.version,
    );

    if (!versionEntry?.fileUrl) {
      return res.status(400).json({
        message: "Latest client mockup is not available.",
      });
    }

    const validationNote = toText(req.body?.note);
    const validatedAt = new Date();
    const reviewNote =
      validationNote || `Graphics validated client mockup ${versionLabel}.`;

    versionEntry.source = "client";
    versionEntry.intakeUpload = parseBooleanFlag(versionEntry.intakeUpload, true);
    versionEntry.graphicsReview = buildMockupGraphicsReviewState(
      {
        status: "validated",
        reviewedAt: validatedAt,
        reviewedBy: req.user._id,
        note: reviewNote,
      },
      "client",
      true,
    );

    syncProjectMockupFromVersion(project, versionEntry, {
      approvedVersion: null,
    });

    const previousStatus = project.status;
    let quoteMockupDecisionSync = null;

    if (isQuoteProject(project)) {
      quoteMockupDecisionSync = syncQuoteMockupRequirementDecision({
        project,
        targetStatus: "client_approved",
        actorId: req.user._id,
        note: reviewNote,
      });

      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });

      const mockupRequirement = project.quoteDetails?.requirementItems?.mockup;
      const sampleProductionRequirement =
        project.quoteDetails?.requirementItems?.sampleProduction;
      if (
        mockupRequirement &&
        (mockupRequirement.isRequired || sampleProductionRequirement?.isRequired)
      ) {
        mockupRequirement.completionConfirmedAt = validatedAt;
        mockupRequirement.completionConfirmedBy = req.user._id || req.user.id;
        mockupRequirement.note = reviewNote;
        project.markModified("quoteDetails.requirementItems");
      }
    } else {
      project.status = getAutoProgressedStatus("Mockup Completed", project);
    }

    await project.save();

    const validationFileName = toText(versionEntry?.fileName);
    const validationFileSuffix = validationFileName
      ? ` (${validationFileName})`
      : "";

    await logActivity(
      project._id,
      req.user._id,
      "mockup_validation",
      `Graphics validated client mockup ${versionLabel}${validationFileSuffix}.`,
      {
        mockupValidation: {
          version: latestVersion.version,
          entryId: toObjectIdString(versionEntry?._id),
          note: validationNote,
          fileName: validationFileName,
          source: "client",
        },
      },
    );

    if (quoteMockupDecisionSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "update",
        `Quote requirement 'Mockup' moved from ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.fromStatus,
        )} to ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.toStatus,
        )} after Graphics validated client mockup.`,
        {
          quoteRequirement: {
            key: "mockup",
            label: "Mockup",
            fromStatus: quoteMockupDecisionSync.fromStatus,
            toStatus: quoteMockupDecisionSync.toStatus,
            note: reviewNote,
          },
        },
      );
    }

    if (quoteMockupDecisionSync?.statusSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${quoteMockupDecisionSync.statusSync.toStatus}`,
        {
          statusChange: {
            from: quoteMockupDecisionSync.statusSync.fromStatus,
            to: quoteMockupDecisionSync.statusSync.toStatus,
          },
        },
      );
    } else if (!isQuoteProject(project) && previousStatus !== project.status) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${project.status}`,
        {
          statusChange: {
            from: previousStatus,
            to: project.status,
          },
        },
      );
    }

    await createProjectSystemUpdateAndSnapshot({
      project,
      authorId: req.user._id || req.user.id,
      category: "Graphics",
      content: `Graphics validated client mockup ${versionLabel}.`,
    });

    const populatedProject = await buildProjectResponseQuery(project._id);
    res.json(populatedProject || project);
  } catch (error) {
    console.error("Error validating client mockup:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Undo Graphics validation for the latest client-provided mockup
// @route   POST /api/projects/:id/mockup/undo-client-validation
// @access  Private (Graphics/Design or Admin)
const undoClientProjectMockupValidation = async (req, res) => {
  try {
    if (!canValidateClientMockup(req.user)) {
      return res.status(403).json({
        message: "Not authorized to undo client mockup validation.",
      });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "mockup")) return;

    if (isQuoteProject(project)) {
      if (!isMockupWorkflowStatusAllowed(project, project.status)) {
        return res.status(400).json({
          message: getMockupWorkflowStatusMessage(project),
        });
      }

      const engagementGuard = getQuoteDepartmentEngagementGuard({
        project,
        user: req.user,
        allowedDepartments: ["graphics"],
      });
      if (engagementGuard) {
        return res.status(400).json({
          code: engagementGuard.code,
          missing: engagementGuard.missing,
          message: engagementGuard.message,
        });
      }
    }

    const normalizedVersions = getNormalizedMockupVersions(project);
    if (!normalizedVersions.length) {
      return res.status(400).json({
        message: "No mockup has been uploaded yet.",
      });
    }

    const latestVersion = normalizedVersions[normalizedVersions.length - 1];
    if (!latestVersion?.fileUrl) {
      return res.status(400).json({
        message: "No mockup has been uploaded yet.",
      });
    }

    if (!isClientProvidedMockupVersion(latestVersion)) {
      return res.status(400).json({
        message: "Latest mockup is not a client-provided mockup.",
      });
    }

    const versionLabel = buildMockupVersionLabel(latestVersion.version);
    const reviewStatus = getMockupGraphicsReviewStatus(
      latestVersion.graphicsReview || {},
      latestVersion.source,
      latestVersion.intakeUpload,
    );

    if (reviewStatus === "pending") {
      return res.status(400).json({
        message: `Client mockup ${versionLabel} is already pending Graphics validation.`,
      });
    }

    if (reviewStatus === "superseded") {
      return res.status(400).json({
        message: `Client mockup ${versionLabel} has already been replaced by a Graphics revision.`,
      });
    }

    ensureProjectMockupVersions(project);
    const versionEntry = project.mockup.versions.find((entry) =>
      latestVersion?.entryId
        ? toObjectIdString(entry?._id) === toObjectIdString(latestVersion.entryId)
        : Number.parseInt(entry?.version, 10) === latestVersion.version,
    );

    if (!versionEntry?.fileUrl) {
      return res.status(400).json({
        message: "Latest client mockup is not available.",
      });
    }

    const undoNote = toText(req.body?.note);
    const resetNote =
      undoNote || `Graphics validation undone for client mockup ${versionLabel}.`;

    versionEntry.source = "client";
    versionEntry.intakeUpload = parseBooleanFlag(versionEntry.intakeUpload, true);
    versionEntry.graphicsReview = buildMockupGraphicsReviewState(
      {
        status: "pending",
        reviewedAt: null,
        reviewedBy: null,
        note: resetNote,
      },
      "client",
      true,
    );

    syncProjectMockupFromVersion(project, versionEntry, {
      approvedVersion: null,
    });

    const previousStatus = project.status;
    let quoteMockupDecisionSync = null;

    if (isQuoteProject(project)) {
      quoteMockupDecisionSync = syncQuoteMockupRequirementDecision({
        project,
        targetStatus: "in_progress",
        actorId: req.user._id,
        note: resetNote,
      });

      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });

      const mockupRequirement = project.quoteDetails?.requirementItems?.mockup;
      if (mockupRequirement) {
        mockupRequirement.completionConfirmedAt = null;
        mockupRequirement.completionConfirmedBy = null;
        mockupRequirement.note = resetNote;
        project.markModified("quoteDetails.requirementItems");
      }
    } else if (project.status !== "Pending Mockup") {
      project.status = "Pending Mockup";
    }

    await project.save();

    const validationFileName = toText(versionEntry?.fileName);
    const validationFileSuffix = validationFileName
      ? ` (${validationFileName})`
      : "";

    await logActivity(
      project._id,
      req.user._id,
      "mockup_validation_reset",
      `Graphics validation undone for client mockup ${versionLabel}${validationFileSuffix}.`,
      {
        mockupValidationReset: {
          version: latestVersion.version,
          entryId: toObjectIdString(versionEntry?._id),
          note: undoNote,
          fileName: validationFileName,
          source: "client",
        },
      },
    );

    if (quoteMockupDecisionSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "update",
        `Quote requirement 'Mockup' moved from ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.fromStatus,
        )} to ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.toStatus,
        )} after Graphics validation was undone.`,
        {
          quoteRequirement: {
            key: "mockup",
            label: "Mockup",
            fromStatus: quoteMockupDecisionSync.fromStatus,
            toStatus: quoteMockupDecisionSync.toStatus,
            note: resetNote,
          },
        },
      );
    }

    if (quoteMockupDecisionSync?.statusSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${quoteMockupDecisionSync.statusSync.toStatus}`,
        {
          statusChange: {
            from: quoteMockupDecisionSync.statusSync.fromStatus,
            to: quoteMockupDecisionSync.statusSync.toStatus,
          },
        },
      );
    } else if (!isQuoteProject(project) && previousStatus !== project.status) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${project.status}`,
        {
          statusChange: {
            from: previousStatus,
            to: project.status,
          },
        },
      );
    }

    await createProjectSystemUpdateAndSnapshot({
      project,
      authorId: req.user._id || req.user.id,
      category: "Graphics",
      content: `Graphics validation undone for client mockup ${versionLabel}. Review required again.`,
    });

    const populatedProject = await buildProjectResponseQuery(project._id);
    res.json(populatedProject || project);
  } catch (error) {
    console.error("Error undoing client mockup validation:", error);
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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(updatedProject);
    const projectName = getProjectDisplayName(updatedProject);
    await notifyLeadFromAdminOrderManagement({
      req,
      project: updatedProject,
      title: "Feedback Added",
      message: `Admin ${actorName} added ${String(type).toLowerCase()} feedback on project #${projectRef} (${projectName}).`,
      type: "UPDATE",
    });

    if (
      type === "Positive" &&
      !isQuoteProject(updatedProject) &&
      SMS_APPRECIATION_STATUSES.has(updatedProject.status)
    ) {
      try {
        const message = buildFeedbackSmsMessage({ project: updatedProject });
        await createSmsPrompt({
          project: updatedProject,
          actorId: req.user._id || req.user.id,
          type: "feedback_appreciation",
          message,
          status: updatedProject.status,
          progressPercent: resolveProgressPercent(
            updatedProject.status,
            toText(updatedProject.projectType),
          ),
        });
      } catch (smsError) {
        console.error("Failed to create appreciation SMS prompt:", smsError);
      }
    }

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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(updatedProject);
    const projectName = getProjectDisplayName(updatedProject);
    await notifyLeadFromAdminOrderManagement({
      req,
      project: updatedProject,
      title: "Feedback Deleted",
      message: `Admin ${actorName} deleted ${String(deletedType).toLowerCase()} feedback on project #${projectRef} (${projectName}).`,
      type: "UPDATE",
    });

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
    const requestMeta =
      req.body?.requestMeta && typeof req.body.requestMeta === "object"
        ? req.body.requestMeta
        : {};
    let context = buildRiskSuggestionContext(projectData, requestMeta);

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

    let historyExamples = [];
    try {
      historyExamples = await fetchHistoricalRiskExamples(context);
    } catch (error) {
      console.error(
        "Historical production risk lookup failed, continuing without history:",
        error?.message || error,
      );
    }
    context = {
      ...context,
      historyExamples,
    };

    let suggestions = [];
    let source = "fallback";
    let openAiError = null;
    let ollamaError = null;
    let usedOpenAi = false;
    let usedOllama = false;
    const blockedDescriptions = [
      ...context.existingRiskDescriptions,
      ...context.previousShownDescriptions,
    ];

    try {
      const aiSuggestions = await requestAiRiskSuggestions(context);
      suggestions = filterExistingRiskSuggestions(
        aiSuggestions,
        blockedDescriptions,
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
            ...blockedDescriptions,
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
        blockedDescriptions,
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

    res.json({
      suggestions,
      source,
      meta: {
        matchedHistoryCount: historyExamples.length,
        coveredFacets: Array.from(
          new Set(
            suggestions
              .map((suggestion) => inferRiskFacetFromSuggestion(suggestion))
              .filter(Boolean),
          ),
        ),
        retryCount: context.retryCount || 0,
      },
    });
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
      projectIndicator,
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
      sampleImageNote,
      attachmentNotes,
      quoteDetails, // [NEW]
      projectType, // [NEW]
      priority, // [NEW]
      corporateEmergency, // [NEW]
      workstreamCode,
    } = req.body;

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
    if (typeof projectLeadId === "string" && projectLeadId.startsWith("{"))
      projectLeadId = JSON.parse(projectLeadId);
    if (typeof assistantLeadId === "string" && assistantLeadId.startsWith("{"))
      assistantLeadId = JSON.parse(assistantLeadId);
    if (typeof orderRef === "string" && orderRef.startsWith("{"))
      orderRef = JSON.parse(orderRef);

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    const leadOnlyKeys = new Set(["projectLeadId", "assistantLeadId", "lead"]);
    const bodyKeys = Object.keys(req.body || {});
    const hasLeadKey = bodyKeys.some((key) => leadOnlyKeys.has(key));
    const hasNonLeadKey = bodyKeys.some((key) => !leadOnlyKeys.has(key));
    const isLeadOnlyUpdate = hasLeadKey && !hasNonLeadKey;

    const normalizedProjectType = normalizeProjectType(
      project.projectType,
      "Standard",
    );
    const requestedStatus = status
      ? normalizeStatusForStorageByProjectType(status, normalizedProjectType)
      : "";
    const isLeadOrAssistant =
      isUserAssignedProjectLead(req.user, project) ||
      isUserAssignedAssistantLead(req.user, project);
    const canManageBillingUser = canManageBilling(req.user);
    const isLeadAcceptance =
      !canManageBillingUser &&
      requestedStatus === "Pending Scope Approval" &&
      ["Order Created", "Quote Created"].includes(toText(project.status)) &&
      isLeadOrAssistant;

    if (!canManageBillingUser && !isLeadAcceptance) {
      console.warn("[updateProject] Access denied: not front desk/admin", {
        projectId: id,
        userId: req.user?._id || req.user?.id,
        status: project?.status,
        projectType: project?.projectType,
      });
      return res.status(403).json({
        message: "Only Front Desk and Admin can revise order details.",
      });
    }

    const mutationAction = isLeadAcceptance ? "manage" : "revision";
    if (!ensureProjectMutationAccess(req, res, project, mutationAction)) return;
    if (
      REVISION_LOCKED_STATUSES.has(toText(project?.status)) &&
      !isLeadOnlyUpdate
    ) {
      console.warn("[updateProject] Revision locked", {
        projectId: id,
        userId: req.user?._id || req.user?.id,
        status: project?.status,
        projectType: project?.projectType,
        isLeadOnlyUpdate,
      });
      return res.status(400).json({
        message:
          "Order revision is locked after completion. Reopen the project to revise it.",
      });
    }

    if (isLeadAcceptance) {
      orderId = undefined;
      orderRef = undefined;
      orderDate = undefined;
      receivedTime = undefined;
      lead = undefined;
      client = undefined;
      clientEmail = undefined;
      clientPhone = undefined;
      projectName = undefined;
      projectIndicator = undefined;
      briefOverview = undefined;
      deliveryDate = undefined;
      deliveryTime = undefined;
      deliveryLocation = undefined;
      contactType = undefined;
      supplySource = undefined;
      packagingType = undefined;
      projectLeadId = undefined;
      assistantLeadId = undefined;
      description = undefined;
      details = undefined;
      attachments = undefined;
      existingAttachments = undefined;
      existingSampleImage = undefined;
      sampleImageNote = undefined;
      attachmentNotes = undefined;
      quoteDetails = undefined;
      projectType = undefined;
      priority = undefined;
      corporateEmergency = undefined;
      workstreamCode = undefined;
    }

    const requestedOrderNumber = normalizeOrderNumber(orderId);
    const hasOrderNumberUpdate = Boolean(requestedOrderNumber);
    const hasOrderRefUpdate = orderRef !== undefined;

    const normalizedAttachments = Array.isArray(attachments)
      ? attachments
      : Array.isArray(existingAttachments)
        ? existingAttachments
        : null;
    const normalizedAttachmentNotes = normalizeAttachmentNotes(attachmentNotes);
    const hasSampleImageNoteUpdate = sampleImageNote !== undefined;
    const normalizedSampleImageNote = hasSampleImageNoteUpdate
      ? normalizeAttachmentNote(sampleImageNote)
      : "";

    // Helper
    const getValue = (field) => {
      if (field && typeof field === "object") {
        if (field.value) return field.value;
        if (field._id) return field._id;
        if (field.id) return field.id;
      }
      return field;
    };

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
      sampleImageNote: project.details?.sampleImageNote || "",
      attachments: Array.isArray(project.details?.attachments)
        ? [...project.details.attachments]
        : [],
      items: Array.isArray(project.items)
        ? project.items.map((item) => ({
            description: item?.description || "",
            breakdown: item?.breakdown || "",
            qty: item?.qty,
          }))
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
    if (projectLeadId !== undefined) {
      const normalizedLeadId = getValue(projectLeadId);
      project.projectLeadId = normalizedLeadId || null;
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
    const hasProjectNameUpdate =
      projectName !== undefined ||
      (details && Object.prototype.hasOwnProperty.call(details, "projectName"));
    const hasProjectIndicatorUpdate =
      projectIndicator !== undefined ||
      (details && Object.prototype.hasOwnProperty.call(details, "projectIndicator"));

    if (hasProjectNameUpdate || hasProjectIndicatorUpdate) {
      const incomingProjectName = hasProjectNameUpdate
        ? projectName !== undefined
          ? projectName
          : details?.projectName
        : "";
      const fallbackProjectName =
        normalizeProjectNameRaw(project.details?.projectNameRaw) ||
        normalizeProjectNameRaw(project.details?.projectName);
      const normalizedProjectNameRaw =
        normalizeProjectNameRaw(incomingProjectName) || fallbackProjectName;

      const incomingIndicator = hasProjectIndicatorUpdate
        ? projectIndicator !== undefined
          ? projectIndicator
          : details?.projectIndicator
        : project.details?.projectIndicator;
      const normalizedProjectIndicator = normalizeProjectIndicator(incomingIndicator);

      const resolvedProjectName = buildProjectDisplayName(
        normalizedProjectNameRaw,
        normalizedProjectIndicator,
      );

      if (normalizedProjectNameRaw) {
        project.details.projectNameRaw = normalizedProjectNameRaw;
      }
      project.details.projectIndicator = normalizedProjectIndicator;
      if (resolvedProjectName) {
        project.details.projectName = resolvedProjectName;
      }
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
    const hasAttachmentListUpdate = Array.isArray(normalizedAttachments);
    const normalizedAttachmentItems = hasAttachmentListUpdate
      ? normalizeAttachmentList(normalizedAttachments)
      : null;

    if (req.files) {
      if (req.files.sampleImage && req.files.sampleImage[0]) {
        project.details.sampleImage = `/uploads/${req.files.sampleImage[0].filename}`;
        project.details.sampleImageNote = hasSampleImageNoteUpdate
          ? normalizedSampleImageNote
          : "";
        detailsChanged = true;
      } else if (existingSampleImage !== undefined) {
        project.details.sampleImage = existingSampleImage || "";
        project.details.sampleImageNote =
          existingSampleImage && hasSampleImageNoteUpdate
            ? normalizedSampleImageNote
            : existingSampleImage
              ? project.details.sampleImageNote || ""
              : "";
        detailsChanged = true;
      } else if (hasSampleImageNoteUpdate) {
        project.details.sampleImageNote = normalizedSampleImageNote;
        detailsChanged = true;
      }

      const newAttachments = req.files.attachments
        ? req.files.attachments.map((file, index) => ({
            fileUrl: `/uploads/${file.filename}`,
            fileName: file.originalname || file.filename || "",
            fileType: file.mimetype || "",
            note: normalizeAttachmentNote(normalizedAttachmentNotes[index]),
          }))
        : [];

      // Combine existing and new attachments
      // If 'attachments' is sent in body, use it as the base (allows deletion)
      // If not sent, keep existing
      if (hasAttachmentListUpdate) {
        project.details.attachments = [
          ...(normalizedAttachmentItems || []),
          ...newAttachments,
        ];
        detailsChanged = true;
      } else if (newAttachments.length > 0) {
        const existingAttachmentItems = normalizeAttachmentList(
          project.details.attachments || [],
        );
        project.details.attachments = [
          ...existingAttachmentItems,
          ...newAttachments,
        ];
        detailsChanged = true;
      }
    } else if (hasAttachmentListUpdate) {
      // Case: No new files, but attachments list updated (e.g. deletion or note change)
      project.details.attachments = normalizedAttachmentItems || [];
      detailsChanged = true;
    } else if (hasSampleImageNoteUpdate) {
      project.details.sampleImageNote = normalizedSampleImageNote;
      detailsChanged = true;
    }

    // Initialize sectionUpdates if not exists
    project.sectionUpdates = project.sectionUpdates || {};

    if (detailsChanged) {
      project.sectionUpdates.details = new Date();
    }

    // Update Arrays and their timestamps
    if (departments) {
      project.departments = normalizeProjectDepartmentSelections(departments);
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
    if (projectType) project.projectType = projectType;
    if (status) {
      project.status = normalizeStatusForStorageByProjectType(
        status,
        normalizeProjectType(project.projectType, "Standard"),
      );
    }
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
    if (quoteDetails) {
      const existingQuoteDetails = toPlainObject(project.quoteDetails);
      const incomingQuoteDetails = toPlainObject(quoteDetails);
      const mergedQuoteDetails = {
        ...existingQuoteDetails,
        ...incomingQuoteDetails,
      };

      if (incomingQuoteDetails.checklist !== undefined) {
        mergedQuoteDetails.checklist = incomingQuoteDetails.checklist;
      }

      if (incomingQuoteDetails.requirementItems !== undefined) {
        mergedQuoteDetails.requirementItems = {
          ...toPlainObject(existingQuoteDetails.requirementItems),
          ...toPlainObject(incomingQuoteDetails.requirementItems),
        };
      }

      project.quoteDetails =
        project.projectType === "Quote"
          ? normalizeQuoteDetailsWorkflow({
              quoteDetailsInput: mergedQuoteDetails,
              existingQuoteDetails: existingQuoteDetails,
            })
          : mergedQuoteDetails;
    } else if (project.projectType === "Quote") {
      project.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: project.quoteDetails || {},
        existingQuoteDetails: project.quoteDetails || {},
      });
    }

    if (!isLeadOnlyUpdate && project.projectType === "Quote") {
      const { mode, enabledKeys } = getQuoteChecklistState(
        project.quoteDetails || {},
      );
      if (mode === "none") {
        return res.status(400).json({
          code: "QUOTE_REQUIREMENTS_BLOCKED",
          message:
            "Quote must include Cost, Mockup, Previous Sample / Jobs Done, Sample Production, or Bid Submission / Documents requirement to continue.",
        });
      }
    }

    if (
      toText(project.status) === "Finished" &&
      project.projectType === "Quote" &&
      !hasQuoteDecisionRecorded(project)
    ) {
      console.warn("[updateProject] Quote decision pending", {
        projectId: id,
        userId: req.user?._id || req.user?.id,
        status: project?.status,
      });
      return res.status(400).json({
        code: "QUOTE_DECISION_PENDING",
        message:
          "Client quote decision must be validated before marking this quote as Finished.",
      });
    }

    if (requestedStatus) {
      const batchProgressGuard = getBatchProgressGuard(project, project.status);
      if (batchProgressGuard) {
        return res.status(400).json(batchProgressGuard);
      }
    }

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
    const previousSampleImageNote = String(
      oldValues.sampleImageNote || "",
    ).trim();
    const nextSampleImageNote = String(
      updatedProject.details?.sampleImageNote || "",
    ).trim();
    const sampleImageNoteChanged = previousSampleImageNote !== nextSampleImageNote;
    const sampleImageChanged =
      previousSampleImage !== nextSampleImage || sampleImageNoteChanged;

    const previousAttachments = normalizeAttachmentList(oldValues.attachments);
    const nextAttachments = normalizeAttachmentList(
      updatedProject.details?.attachments,
    );
    const attachmentsChanged =
      previousAttachments.length !== nextAttachments.length ||
      previousAttachments.some((item, index) => {
        const next = nextAttachments[index];
        if (!next) return true;
        return (
          String(item.fileUrl || "") !== String(next.fileUrl || "") ||
          normalizeAttachmentNote(item.note) !==
            normalizeAttachmentNote(next.note)
        );
      });
    const itemsChanged = hasItemListChanged(
      oldValues.items,
      updatedProject.items,
    );

    if (briefOverviewChanged) {
      changes.push("Brief Overview updated");
    }
    if (sampleImageChanged) {
      changes.push("Primary Reference Image updated");
    }
    if (attachmentsChanged) {
      changes.push(`Reference Materials updated (${nextAttachments.length} file(s))`);
    }
    if (itemsChanged) {
      changes.push("Order Items updated");
    }
    const orderRevisionChangeDetails = [];
    if (briefOverviewChanged) {
      orderRevisionChangeDetails.push({
        label: "Brief Overview",
        before: previousBriefOverview || "N/A",
        after: nextBriefOverview || "N/A",
      });
    }
    if (itemsChanged) {
      orderRevisionChangeDetails.push({
        label: "Order Items Summary",
        before: getOrderItemTotalsSummary(oldValues.items),
        after: getOrderItemTotalsSummary(updatedProject.items),
      });
    }
    if (sampleImageChanged) {
      orderRevisionChangeDetails.push({
        label: "Primary Reference Image",
        before:
          [
            previousSampleImage
              ? path.basename(previousSampleImage.split("?")[0])
              : "",
            previousSampleImageNote ? `Note: ${previousSampleImageNote}` : "",
          ]
            .filter(Boolean)
            .join(" | ") || "N/A",
        after:
          [
            nextSampleImage ? path.basename(nextSampleImage.split("?")[0]) : "",
            nextSampleImageNote ? `Note: ${nextSampleImageNote}` : "",
          ]
            .filter(Boolean)
            .join(" | ") || "N/A",
      });
    }
    if (attachmentsChanged) {
      orderRevisionChangeDetails.push({
        label: "Reference Materials",
        before: `${previousAttachments.length} file(s)`,
        after: `${nextAttachments.length} file(s)`,
      });
    }
    const orderRevisionChanged =
      briefOverviewChanged ||
      sampleImageChanged ||
      attachmentsChanged ||
      itemsChanged;

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

    // Notify Lead/Admin + engaged Production/Design on order revision updates.
    if (orderRevisionChanged) {
      const revisionParts = [];
      if (briefOverviewChanged) revisionParts.push("Brief Overview");
      if (itemsChanged) revisionParts.push("Order Items");
      if (sampleImageChanged) revisionParts.push("Primary Reference Image");
      if (attachmentsChanged) revisionParts.push("Reference Materials");

      updatedProject.orderRevisionMeta = {
        updatedAt: new Date(),
        updatedBy: req.user._id || req.user.id,
        updatedByName: getUserDisplayName(req.user),
      };
      updatedProject.orderRevisionCount =
        Number(updatedProject.orderRevisionCount || 0) + 1;
      await updatedProject.save();

      const notifiedIds = await notifyReviewUpdated({
        project: updatedProject,
        actor: req.user,
        revisionParts,
      });
      notifiedIds.forEach((id) => directlyNotifiedUserIds.add(id));
      await sendProjectRevisionEmailSafely({
        projectId: updatedProject._id,
        actor: req.user,
        requestBaseUrl: getRequestBaseUrl(req),
        revisionParts,
        changeDetails: orderRevisionChangeDetails,
      });
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
    const safeStringify = (value) => {
      if (value === undefined) return "undefined";
      if (value === null) return "null";
      if (typeof value === "string") return value;
      try {
        const json = JSON.stringify(value);
        return json.length > 2000 ? `${json.slice(0, 2000)}…` : json;
      } catch (err) {
        try {
          return String(value);
        } catch {
          return "[unserializable]";
        }
      }
    };

    console.error("Error updating project:", {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
      projectId: req?.params?.id,
      userId: req?.user?._id || req?.user?.id,
      bodyKeys: req?.body ? Object.keys(req.body) : [],
      projectLeadId: safeStringify(req?.body?.projectLeadId),
      assistantLeadId: safeStringify(req?.body?.assistantLeadId),
      lead: safeStringify(req?.body?.lead),
      orderRef: safeStringify(req?.body?.orderRef),
      status: safeStringify(req?.body?.status),
      validationErrors: error?.errors
        ? Object.keys(error.errors).reduce((acc, key) => {
            acc[key] = error.errors[key]?.message || "Validation error";
            return acc;
          }, {})
        : null,
    });
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// @desc    Reset client decision for a mockup version
// @route   POST /api/projects/:id/mockup/reset
// @access  Private (Front Desk or Admin)
const resetProjectMockupDecision = async (req, res) => {
  try {
    if (!canManageMockupApproval(req.user)) {
      return res.status(403).json({
        message: "Not authorized to reset mockup decisions.",
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
    const requestedEntryId = toObjectIdString(req.body?.entryId);
    const hasEntryId = mongoose.isValidObjectId(requestedEntryId);
    const requestedVersionRaw = Number.parseInt(req.body?.version, 10);
    let requestedVersion =
      Number.isFinite(requestedVersionRaw) && requestedVersionRaw > 0
        ? requestedVersionRaw
        : latestVersion.version;

    ensureProjectMockupVersions(project);

    let versionEntry = null;
    if (hasEntryId) {
      versionEntry = project.mockup.versions.find(
        (entry) => toObjectIdString(entry?._id) === requestedEntryId,
      );
    }

    if (!versionEntry) {
      versionEntry = project.mockup.versions.find((entry) => {
        const parsed = Number.parseInt(entry?.version, 10);
        return Number.isFinite(parsed) && parsed === requestedVersion;
      });
    }

    if (!versionEntry?.fileUrl) {
      return res.status(400).json({
        message: "Selected mockup version is not available.",
      });
    }

    if (isClientProvidedMockupVersion(versionEntry)) {
      return res.status(400).json({
        message:
          "Client-provided mockups must be validated or revised by Graphics before Front Desk review.",
      });
    }

    requestedVersion =
      Number.parseInt(versionEntry?.version, 10) || latestVersion.version;
    const versionLabel = buildMockupVersionLabel(requestedVersion);
    const isLatestRequested = latestVersion?.entryId
      ? toObjectIdString(versionEntry?._id) === toObjectIdString(latestVersion.entryId)
      : requestedVersion === latestVersion.version;

    const currentDecision = getMockupApprovalStatus(versionEntry.clientApproval || {});
    if (currentDecision === "pending") {
      return res.status(400).json({
        message: `Mockup ${versionLabel} is already pending.`,
      });
    }

    const resetState = {
      status: "pending",
      isApproved: false,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: "",
      note: "",
      rejectionAttachment: null,
      rejectionAttachments: [],
    };

    versionEntry.clientApproval = resetState;

    if (isLatestRequested) {
      syncProjectMockupFromVersion(project, versionEntry, {
        approvedVersion: null,
      });
    }

    const decisionNote = `Mockup ${versionLabel} decision reset to pending.`;
    const quoteMockupDecisionSync = isLatestRequested
      ? syncQuoteMockupRequirementDecision({
          project,
          targetStatus: "frontdesk_review",
          actorId: req.user._id,
          note: decisionNote,
        })
      : null;

    const previousStatus = project.status;
    let autoStatusApplied = false;
    if (isLatestRequested && isQuoteMockupOnlyProject(project)) {
      if (project.status !== "Pending Mockup") {
        project.status = "Pending Mockup";
        autoStatusApplied = true;
      }
    }

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "mockup_decision_reset",
      decisionNote,
      {
        mockupDecisionReset: {
          version: requestedVersion,
          entryId: toObjectIdString(versionEntry?._id),
          fileName: toText(versionEntry?.fileName),
        },
      },
    );

    if (quoteMockupDecisionSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "update",
        `Quote requirement 'Mockup' moved from ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.fromStatus,
        )} to ${formatQuoteRequirementStatusLabel(
          quoteMockupDecisionSync.toStatus,
        )} after mockup decision reset.`,
        {
          quoteRequirement: {
            key: "mockup",
            label: "Mockup",
            fromStatus: quoteMockupDecisionSync.fromStatus,
            toStatus: quoteMockupDecisionSync.toStatus,
            note: decisionNote,
          },
        },
      );
    }

    if (quoteMockupDecisionSync?.statusSync?.changed) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${quoteMockupDecisionSync.statusSync.toStatus}`,
        {
          statusChange: {
            from: quoteMockupDecisionSync.statusSync.fromStatus,
            to: quoteMockupDecisionSync.statusSync.toStatus,
          },
        },
      );
    }

    if (autoStatusApplied && previousStatus !== project.status) {
      await logActivity(
        project._id,
        req.user._id,
        "status_change",
        `Project status updated to ${project.status}`,
        {
          statusChange: {
            from: previousStatus,
            to: project.status,
          },
        },
      );
    }

    if (isLatestRequested) {
      await createProjectSystemUpdateAndSnapshot({
        project,
        authorId: req.user._id || req.user.id,
        category: "Graphics",
        content: "Client mockup decision reset to pending.",
      });
    }

    const populatedProject = await buildProjectResponseQuery(project._id);
    res.json(populatedProject || project);
  } catch (error) {
    console.error("Error resetting mockup decision:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Email approved mockups for a project to the final approval inbox
// @route   POST /api/projects/:id/mockup/email-approved
// @access  Private (Front Desk or Admin)
const emailApprovedProjectMockups = async (req, res) => {
  try {
    if (!canManageMockupApproval(req.user)) {
      return res.status(403).json({
        message: "Not authorized to email approved mockups.",
      });
    }

    const project = await buildProjectResponseQuery(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "mockup")) return;

    const normalizedVersions = getNormalizedMockupVersions(project);
    const approvedVersions = normalizedVersions.filter(
      (version) =>
        getMockupApprovalStatus(version?.clientApproval || {}) === "approved",
    );

    if (!approvedVersions.length) {
      return res.status(400).json({
        message: "No approved mockups are available to email for this project.",
      });
    }

    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    const leadName =
      toUserDisplayName(project?.projectLeadId) ||
      toText(project?.details?.lead) ||
      "Unassigned";
    const recipient = FINAL_APPROVAL_EMAIL_RECIPIENT;

    if (!recipient) {
      return res.status(500).json({
        message:
          "FINAL_APPROVAL_EMAIL is not configured. Please set it in server/.env before sending approved mockups.",
      });
    }

    if (!Number.isFinite(MOCKUP_EMAIL_MAX_BYTES) || MOCKUP_EMAIL_MAX_BYTES <= 0) {
      return res.status(500).json({
        message:
          "MOCKUP_EMAIL_MAX_BYTES is not configured correctly. Please set a positive byte value in server/.env before sending approved mockups.",
      });
    }

    const attachmentEntries = [];
    const missingFiles = [];
    let totalAttachmentBytes = 0;

    for (const version of approvedVersions) {
      const versionNumber = Number.parseInt(version?.version, 10) || 1;
      const versionLabel = buildMockupVersionLabel(versionNumber);
      const sourceLabel =
        String(version?.source || "").trim().toLowerCase() === "client"
          ? "Client"
          : "Graphics";
      const fileName =
        toText(version?.fileName) || `${projectRef}-approved-mockup-${versionLabel}`;
      const filePath = upload.resolveUploadPathFromUrl(version?.fileUrl);

      if (!filePath) {
        missingFiles.push(`${sourceLabel} ${versionLabel} (${fileName})`);
        continue;
      }

      let fileStats = null;
      try {
        fileStats = await fs.promises.stat(filePath);
      } catch (error) {
        missingFiles.push(`${sourceLabel} ${versionLabel} (${fileName})`);
        continue;
      }

      if (!fileStats?.isFile()) {
        missingFiles.push(`${sourceLabel} ${versionLabel} (${fileName})`);
        continue;
      }

      const notes = buildApprovedMockupNotes(version);
      const noteContent = notes.length
        ? notes.map((entry) => `${entry.label}: ${entry.value}`).join("\n\n")
        : "";

      attachmentEntries.push({
        versionNumber,
        versionLabel,
        sourceLabel,
        fileName,
        approvedAt: version?.clientApproval?.approvedAt || null,
        notes,
        filePath,
        fileSize: fileStats.size,
        noteAttachment:
          noteContent
            ? {
                filename: `${sanitizeEmailAttachmentName(
                  `${projectRef}-mockup-${versionLabel}-notes`,
                  `mockup-${versionLabel}-notes`,
                )}.txt`,
                content: noteContent,
                contentType: "text/plain; charset=utf-8",
              }
            : null,
      });

      totalAttachmentBytes += fileStats.size;
      if (noteContent) {
        totalAttachmentBytes += Buffer.byteLength(noteContent, "utf8");
      }
    }

    if (missingFiles.length > 0) {
      return res.status(400).json({
        message: `Cannot send approved mockups because these files are missing on the server: ${missingFiles.join(", ")}`,
      });
    }

    if (!attachmentEntries.length) {
      return res.status(400).json({
        message: "No approved mockup files were available to attach.",
      });
    }

    if (totalAttachmentBytes > MOCKUP_EMAIL_MAX_BYTES) {
      return res.status(400).json({
        message: `Approved mockup email is too large to send (${formatFileSize(
          totalAttachmentBytes,
        )}). Current limit is ${formatFileSize(MOCKUP_EMAIL_MAX_BYTES)}.`,
      });
    }

    const subject = `Approved Mockups - ${projectRef} - ${projectName}`;
    const totalAttachmentCount =
      attachmentEntries.length +
      attachmentEntries.filter((entry) => entry.noteAttachment).length;
    const actorName = getUserDisplayName(req.user);

    const textSections = attachmentEntries.map((entry) => {
      const lines = [
        `${entry.sourceLabel} ${entry.versionLabel}`,
        `File: ${entry.fileName}`,
      ];

      if (entry.approvedAt) {
        lines.push(`Approved: ${formatEmailDateTime(entry.approvedAt)}`);
      }

      if (entry.notes.length > 0) {
        lines.push("Notes:");
        entry.notes.forEach((note) => {
          lines.push(`- ${note.label}: ${note.value}`);
        });
      } else {
        lines.push("Notes: None");
      }

      return lines.join("\n");
    });

    const text = [
      "Approved mockups ready for final approval.",
      `Project ID: ${projectRef}`,
      `Lead Name: ${leadName}`,
      `Project Name: ${projectName}`,
      `Prepared By: ${actorName}`,
      `Approved Mockups: ${attachmentEntries.length}`,
      "",
      ...textSections,
    ].join("\n");

    const versionCardsHtml = attachmentEntries
      .map((entry) => {
        const notesHtml =
          entry.notes.length > 0
            ? `<ul style="margin:8px 0 0 18px;padding:0;color:#111827;font-size:14px;line-height:1.6;">${entry.notes
                .map(
                  (note) =>
                    `<li><strong>${escapeHtml(note.label)}:</strong> ${escapeHtml(
                      note.value,
                    )}</li>`,
                )
                .join("")}</ul>`
            : `<p style="margin:8px 0 0;color:#6b7280;font-size:14px;">No notes saved for this approved mockup.</p>`;

        const approvedAtText = entry.approvedAt
          ? formatEmailDateTime(entry.approvedAt)
          : "Not recorded";

        return `
          <div style="margin:0 0 14px;padding:16px 18px;border:1px solid #dbe3ef;border-radius:12px;background:#ffffff;">
            <div style="font-size:16px;font-weight:700;color:#111827;">${escapeHtml(
              `${entry.sourceLabel} ${entry.versionLabel}`,
            )}</div>
            <div style="margin-top:6px;font-size:14px;color:#374151;">
              <strong>File:</strong> ${escapeHtml(entry.fileName)}
            </div>
            <div style="margin-top:4px;font-size:14px;color:#374151;">
              <strong>Approved:</strong> ${escapeHtml(approvedAtText)}
            </div>
            ${notesHtml}
          </div>
        `;
      })
      .join("");

    const html = `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${escapeHtml(subject)}</title>
        </head>
        <body style="margin:0;padding:24px;background:#f3f4f6;font-family:Segoe UI,Arial,sans-serif;color:#111827;">
          <div style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;">
            <div style="padding:24px 28px;background:linear-gradient(135deg,#0f172a 0%,#1f2937 100%);color:#f9fafb;">
              <div style="font-size:28px;font-weight:800;line-height:1.2;">Approved Mockups</div>
              <div style="margin-top:8px;font-size:15px;line-height:1.6;color:#d1d5db;">
                Final approval package prepared for the current project.
              </div>
            </div>
            <div style="padding:24px 28px;">
              <div style="margin:0 0 18px;padding:16px 18px;border-radius:12px;background:#f8fafc;border:1px solid #dbe3ef;">
                <div style="font-size:14px;line-height:1.7;color:#111827;"><strong>Project ID:</strong> ${escapeHtml(
                  projectRef,
                )}</div>
                <div style="font-size:14px;line-height:1.7;color:#111827;"><strong>Lead Name:</strong> ${escapeHtml(
                  leadName,
                )}</div>
                <div style="font-size:14px;line-height:1.7;color:#111827;"><strong>Project Name:</strong> ${escapeHtml(
                  projectName,
                )}</div>
                <div style="font-size:14px;line-height:1.7;color:#111827;"><strong>Prepared By:</strong> ${escapeHtml(
                  actorName,
                )}</div>
                <div style="font-size:14px;line-height:1.7;color:#111827;"><strong>Approved Mockups:</strong> ${escapeHtml(
                  String(attachmentEntries.length),
                )}</div>
              </div>
              ${versionCardsHtml}
              <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                Attached files: ${escapeHtml(String(totalAttachmentCount))} total, including companion note files where notes were available.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const delivery = await sendEmailDetailed(recipient, subject, text, {
      html,
      attachments: attachmentEntries.flatMap((entry) => [
        {
          filename: entry.fileName,
          path: entry.filePath,
        },
        ...(entry.noteAttachment ? [entry.noteAttachment] : []),
      ]),
    });

    if (!delivery.sent) {
      return res.status(500).json({
        message: "Approved mockup email failed to send.",
      });
    }

    await logActivity(
      project._id,
      req.user._id,
      "mockup_email_sent",
      `Approved mockups emailed to ${recipient}.`,
      {
        approvedMockupEmail: {
          recipient,
          projectId: projectRef,
          leadName,
          approvedMockupCount: attachmentEntries.length,
          attachmentCount: totalAttachmentCount,
          messageId: delivery.messageId || "",
          versions: attachmentEntries.map((entry) => ({
            version: entry.versionNumber,
            fileName: entry.fileName,
            approvedAt: entry.approvedAt || null,
            notes: entry.notes.map((note) => ({
              label: note.label,
              value: note.value,
            })),
          })),
        },
      },
    );

    return res.json({
      message: `${attachmentEntries.length} approved mockup${
        attachmentEntries.length === 1 ? "" : "s"
      } emailed to ${recipient}.`,
      recipient,
      projectId: projectRef,
      leadName,
      approvedMockupCount: attachmentEntries.length,
      attachmentCount: totalAttachmentCount,
    });
  } catch (error) {
    console.error("Error emailing approved mockups:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get all clients with their projects
// @route   GET /api/projects/clients
// @access  Private (Admin or Front Desk)
const getClients = async (req, res) => {
  try {
    if (!canManageBilling(req.user)) {
      return res
        .status(403)
        .json({ message: "Not authorized. Only Admin and Front Desk can view clients." });
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
      excludeFromEndOfDayUpdates: false,
      includeInEndOfDayUpdates: false,
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
      const resetQuoteDetails = {
        ...(reopenedProject.quoteDetails || {}),
        emailResponseSent: false,
        clientFeedback: "",
        finalUpdate: {
          accepted: false,
          cancelled: false,
        },
        decision: {
          status: "pending",
          note: "",
          validatedAt: null,
          validatedBy: null,
          convertedAt: null,
          convertedBy: null,
          convertedToType: "Quote",
        },
        submissionDate: null,
        requirementItems: {},
      };
      reopenedProject.quoteDetails = normalizeQuoteDetailsWorkflow({
        quoteDetailsInput: resetQuoteDetails,
      });
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

    await sendProjectRevisionEmailSafely({
      projectId: savedReopenedProject._id,
      actor: req.user,
      requestBaseUrl: getRequestBaseUrl(req),
      revisionParts: ["Project Reopened"],
      changeDetails: [
        {
          label: "Revision Version",
          before: `v${sourceVersion}`,
          after: `v${nextVersion}`,
        },
        {
          label: "Project Status",
          before: sourceStatus || "N/A",
          after: savedReopenedProject.status || "N/A",
        },
        {
          label: "Reopen Reason",
          before: "N/A",
          after: reopenReason || "N/A",
        },
      ],
      eventType: "reopen",
      reopenContext: {
        sourceVersion,
        reason: reopenReason,
      },
    });

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
  // Quote workflow statuses that occur after scope approval
  "Pending Cost Verification",
  "Cost Verification Completed",
  "Pending Sample Retrieval",
  "Pending Sample / Work done Retrieval",
  "Pending Quote Requirements",
  "Pending Sample Production",
  "Pending Bid Submission / Documents",
  "Pending Quote Submission",
  "Quote Submission Completed",
  "Pending Client Decision",
  "Declined",
]);

// @desc    Acknowledge project engagement by a department
// @route   POST /api/projects/:id/acknowledge
// @access  Private
const acknowledgeProject = async (req, res) => {
  try {
    const { id } = req.params;
    const department = normalizeDepartmentValue(req.body?.department);

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

    const scopeApprovalReady =
      isQuoteProject(project)
        ? isQuoteScopeApprovalReadyForDepartments(project)
        : SCOPE_APPROVAL_READY_STATUSES.has(project.status);
    if (!scopeApprovalReady) {
      return res.status(400).json({
        message:
          "Scope approval must be completed before engagement can be accepted.",
      });
    }

    const meetingGate = await resolveMeetingGateState(project);
    const meetingRequired = meetingGate.required;
    const meetingScheduled = Boolean(meetingGate.meetingScheduled);
    const meetingSkipped = Boolean(meetingGate.meetingSkipped);
    const meetingCompleted = Boolean(meetingGate.meetingCompleted) || meetingSkipped;
    if ((meetingRequired || meetingScheduled) && !meetingCompleted) {
      return res.status(400).json({
        message:
          "Departmental meeting must be completed before engagement can be accepted.",
      });
    }

    // Check if department has already acknowledged
    const existingIndex = (project.acknowledgements || []).findIndex(
      (a) => normalizeDepartmentValue(a?.department) === department,
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
      project.status = getAutoProgressedStatus(
        "Departmental Engagement Completed",
        project,
      );
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

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);

    // Notify Project Lead
    if (project.projectLeadId) {
      await createNotification(
        project.projectLeadId,
        req.user._id,
        project._id,
        "ACTIVITY",
        "Department Acknowledgement",
        `${actorName} acknowledged ${department} engagement for project #${projectRef}: ${projectName}`,
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
    const department = normalizeDepartmentValue(req.body?.department);

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
      (ack) => normalizeDepartmentValue(ack?.department) === department,
    );

    if (ackIndex === -1) {
      return res
        .status(400)
        .json({ message: "Acknowledgement not found for department" });
    }

    const previousStatus = project.status;
    project.acknowledgements.splice(ackIndex, 1);
    const progressedDepartmentStatus = getAutoProgressedStatus(
      "Departmental Engagement Completed",
      project,
    );
    if (
      project.status === "Departmental Engagement Completed" ||
      project.status === progressedDepartmentStatus
    ) {
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

// @desc    Get SMS prompts for a project
// @route   GET /api/projects/:id/sms-prompts
// @access  Private (Front Desk / Admin)
const getProjectSmsPrompts = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "feedback")) return;
    if (!canManageSmsForRequest(req)) {
      return res.status(403).json({
        message: "Not authorized to manage SMS prompts for this project.",
      });
    }
    if (isQuoteProject(project)) {
      return res.status(400).json({
        message: "SMS prompts are not available for quote projects.",
      });
    }

    const prompts = await SmsPrompt.find({ project: project._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json(prompts);
  } catch (error) {
    console.error("Error fetching SMS prompts:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get pending SMS prompts across projects
// @route   GET /api/projects/sms-prompts/pending
// @access  Private (Front Desk / Admin)
const getPendingSmsPrompts = async (req, res) => {
  try {
    if (!canManageSmsForRequest(req)) {
      return res.status(403).json({
        message: "Not authorized to manage SMS prompts.",
      });
    }

    const prompts = await SmsPrompt.find({
      state: { $in: ["pending", "failed"] },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate({
        path: "project",
        select:
          "orderId status projectType details.client details.clientName details.clientPhone details.projectName orderRef",
        populate: {
          path: "orderRef",
          select: "clientPhone client orderNumber",
        },
      })
      .lean();

    const filtered = prompts.filter(
      (prompt) =>
        prompt.project && toText(prompt.project.projectType) !== "Quote",
    );
    res.json(filtered);
  } catch (error) {
    console.error("Error fetching pending SMS prompts:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Create a custom SMS prompt for a project
// @route   POST /api/projects/:id/sms-prompts
// @access  Private (Front Desk / Admin)
const createProjectSmsPrompt = async (req, res) => {
  try {
    const { message } = req.body || {};
    const trimmedMessage = toText(message);
    if (!trimmedMessage) {
      return res.status(400).json({ message: "Message is required." });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "feedback")) return;
    if (!canManageSmsForRequest(req)) {
      return res.status(403).json({
        message: "Not authorized to manage SMS prompts for this project.",
      });
    }
    if (isQuoteProject(project)) {
      return res.status(400).json({
        message: "SMS prompts are not available for quote projects.",
      });
    }

    const created = await createSmsPrompt({
      project,
      actorId: req.user._id || req.user.id,
      type: "custom",
      message: trimmedMessage,
      status: project.status,
      progressPercent: resolveProgressPercent(
        project.status,
        toText(project.projectType),
      ),
    });

    if (!created) {
      return res.status(400).json({ message: "Unable to create SMS prompt." });
    }

    res.status(201).json(created);
  } catch (error) {
    console.error("Error creating SMS prompt:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update an SMS prompt (edit or skip)
// @route   PATCH /api/projects/:id/sms-prompts/:promptId
// @access  Private (Front Desk / Admin)
const updateProjectSmsPrompt = async (req, res) => {
  try {
    const { message, state } = req.body || {};
    const trimmedMessage = toText(message);
    const clientNameProvided = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "clientName",
    );
    const clientPhoneProvided = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "clientPhone",
    );
    const trimmedClientName = toText(req.body?.clientName);
    const trimmedClientPhone = toText(req.body?.clientPhone);

    if (
      !trimmedMessage &&
      !state &&
      !clientNameProvided &&
      !clientPhoneProvided
    ) {
      return res.status(400).json({ message: "No updates provided." });
    }

    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "feedback")) return;
    if (!canManageSmsForRequest(req)) {
      return res.status(403).json({
        message: "Not authorized to manage SMS prompts for this project.",
      });
    }
    if (isQuoteProject(project)) {
      return res.status(400).json({
        message: "SMS prompts are not available for quote projects.",
      });
    }

    const prompt = await SmsPrompt.findOne({
      _id: req.params.promptId,
      project: project._id,
    });
    if (!prompt) {
      return res.status(404).json({ message: "SMS prompt not found." });
    }
    if (prompt.state === "sent") {
      return res
        .status(400)
        .json({ message: "Sent SMS prompts cannot be edited." });
    }

    if (trimmedMessage) {
      prompt.message = trimmedMessage;
      if (!prompt.originalMessage) {
        prompt.originalMessage = trimmedMessage;
      }
    }

    if (clientNameProvided) {
      prompt.overrideClientName = trimmedClientName;
    }

    if (clientPhoneProvided) {
      prompt.overrideClientPhone = trimmedClientPhone;
    }

    if (state === "skipped") {
      prompt.state = "skipped";
      prompt.skippedAt = new Date();
    }

    if (state === "pending") {
      prompt.state = "pending";
      prompt.skippedAt = null;
    }

    prompt.updatedBy = req.user._id || req.user.id;
    await prompt.save();

    res.json(prompt);
  } catch (error) {
    console.error("Error updating SMS prompt:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Send an SMS prompt via Arkesel
// @route   POST /api/projects/:id/sms-prompts/:promptId/send
// @access  Private (Front Desk / Admin)
const sendProjectSmsPrompt = async (req, res) => {
  try {
    const { message } = req.body || {};
    const project = await Project.findById(req.params.id).populate(
      "orderRef",
      "clientPhone",
    );
    if (!ensureProjectMutationAccess(req, res, project, "feedback")) return;
    if (!canManageSmsForRequest(req)) {
      return res.status(403).json({
        message: "Not authorized to manage SMS prompts for this project.",
      });
    }
    if (isQuoteProject(project)) {
      return res.status(400).json({
        message: "SMS prompts are not available for quote projects.",
      });
    }

    const prompt = await SmsPrompt.findOne({
      _id: req.params.promptId,
      project: project._id,
    });
    if (!prompt) {
      return res.status(404).json({ message: "SMS prompt not found." });
    }
    if (prompt.state === "sent") {
      return res.status(400).json({ message: "SMS has already been sent." });
    }

    const resolvedMessage = toText(message) || toText(prompt.message);
    if (!resolvedMessage) {
      return res.status(400).json({ message: "SMS message is required." });
    }

    const clientNameProvided = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "clientName",
    );
    const clientPhoneProvided =
      Object.prototype.hasOwnProperty.call(req.body || {}, "clientPhone") ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "to");
    const overrideClientName = toText(req.body?.clientName);
    const overridePhone = toText(req.body?.clientPhone || req.body?.to);

    if (clientNameProvided) {
      prompt.overrideClientName = overrideClientName;
    }
    if (clientPhoneProvided) {
      prompt.overrideClientPhone = overridePhone;
    }

    const clientPhone =
      overridePhone ||
      toText(prompt.overrideClientPhone) ||
      toText(project?.details?.clientPhone) ||
      toText(project?.orderRef?.clientPhone);
    if (!clientPhone) {
      return res.status(400).json({
        message: "Client phone number is missing for this project.",
      });
    }

    try {
      const response = await sendSms({
        to: clientPhone,
        message: resolvedMessage,
      });

      prompt.message = resolvedMessage;
      prompt.state = "sent";
      prompt.sentAt = new Date();
      prompt.lastError = "";
      prompt.providerResponse = response;
      prompt.updatedBy = req.user._id || req.user.id;
      await prompt.save();

      res.json({ prompt, response });
    } catch (error) {
      prompt.state = "failed";
      prompt.lastError = toText(error?.message) || "Failed to send SMS.";
      prompt.providerResponse = error?.response || null;
      prompt.updatedBy = req.user._id || req.user.id;
      await prompt.save();

      res.status(500).json({
        message: prompt.lastError || "Failed to send SMS.",
        response: error?.response || null,
      });
    }
  } catch (error) {
    console.error("Error sending SMS prompt:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const canManageMeetings = (user) =>
  Boolean(user && (user.role === "admin" || isFrontDeskUser(user)));

// @desc    Get order meeting by order number
// @route   GET /api/meetings/order/:orderNumber
// @access  Private
const getOrderMeetingByNumber = async (req, res) => {
  try {
    const orderNumber = normalizeOrderNumber(
      decodeURIComponent(req.params.orderNumber || ""),
    );
    if (!orderNumber) {
      return res.status(400).json({ message: "orderNumber is required." });
    }

    const { query } = buildProjectAccessQuery(req);
    const order = await Order.findOne({ orderNumber }).select("_id").lean();
    const baseConditions = [{ orderId: orderNumber }];
    if (order?._id) {
      baseConditions.push({ orderRef: order._id });
    }
    const baseQuery =
      baseConditions.length === 1 ? baseConditions[0] : { $or: baseConditions };
    const scopedQuery =
      query && Object.keys(query).length > 0 ? { $and: [baseQuery, query] } : baseQuery;

    const accessible = await Project.find(scopedQuery)
      .select("_id orderId orderRef projectType")
      .lean();
    if (!accessible || accessible.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }

    const orderRefIds = Array.from(
      new Set(
        accessible
          .map((project) => toObjectIdString(project?.orderRef))
          .filter(Boolean),
      ),
    );

    const meetingCriteria = [];
    if (orderRefIds.length > 0) {
      meetingCriteria.push({ orderRef: { $in: orderRefIds } });
    }
    meetingCriteria.push({ orderNumber });

    const meetings = await OrderMeeting.find(
      meetingCriteria.length === 1 ? meetingCriteria[0] : { $or: meetingCriteria },
    )
      .sort({ meetingAt: -1, createdAt: -1 })
      .lean();

    const scheduledMeeting =
      meetings.find((item) => item.status === "scheduled") || null;
    const latestScheduled = scheduledMeeting;
    const latestCompleted = meetings.find((item) => item.status === "completed") || null;
    const scheduledUpdatedAt = latestScheduled
      ? new Date(latestScheduled.updatedAt || latestScheduled.createdAt || 0).getTime()
      : 0;
    const completedUpdatedAt = latestCompleted
      ? new Date(latestCompleted.updatedAt || latestCompleted.createdAt || 0).getTime()
      : 0;
    const meetingScheduled = Boolean(latestScheduled);
    const meetingCompleted =
      Boolean(latestCompleted) && completedUpdatedAt >= scheduledUpdatedAt;
    const grouped = accessible.length > 1;
    const hasCorporate = accessible.some(
      (entry) => toText(entry?.projectType) === "Corporate Job",
    );

    return res.json({
      meeting: scheduledMeeting || meetings[0] || null,
      meetings,
      meetingGate: {
        required: grouped || hasCorporate,
        grouped,
        hasCorporate,
        meetingScheduled,
        meetingCompleted,
      },
    });
  } catch (error) {
    console.error("Error fetching order meeting:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Create or schedule a departmental meeting for an order
// @route   POST /api/meetings
// @access  Private (Admin/Front Desk)
const createOrderMeeting = async (req, res) => {
  try {
    if (!canManageMeetings(req.user)) {
      return res.status(403).json({ message: "Not authorized to manage meetings." });
    }

    const orderNumber = normalizeOrderNumber(req.body?.orderNumber);
    if (!orderNumber) {
      return res.status(400).json({ message: "orderNumber is required." });
    }

    const meetingAt = normalizeMeetingDate(req.body?.meetingAt);
    if (!meetingAt) {
      return res.status(400).json({ message: "meetingAt is required." });
    }
    if (meetingAt.getTime() <= Date.now()) {
      return res
        .status(400)
        .json({ message: "Meeting time must be in the future." });
    }

    const order = await Order.findOne({ orderNumber });
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const projects = await resolveOrderGroupProjects({
      orderNumber,
      orderRefId: order._id,
    });
    if (!projects.length) {
      return res.status(404).json({ message: "No projects found for this order." });
    }

    const recipientIds = await resolveMeetingRecipientIds(projects);
    const primaryProject = projects
      .slice()
      .sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      )[0];

    const scheduledMeetings = await OrderMeeting.find({
      orderRef: order._id,
      status: "scheduled",
    }).sort({ createdAt: -1 });

    for (const scheduledMeeting of scheduledMeetings) {
      await cancelMeetingReminders(scheduledMeeting.reminderIds || []);
      scheduledMeeting.status = "cancelled";
      scheduledMeeting.reminderIds = [];
      await scheduledMeeting.save();
    }

    const reminderOffsets = normalizeMeetingReminderOffsets(req.body?.reminderOffsets);
    const channels = {
      inApp: req.body?.channels?.inApp !== false,
      email: req.body?.channels?.email !== false,
    };

    const meeting = new OrderMeeting({
      orderRef: order._id,
      orderNumber,
      createdBy: req.user._id || req.user.id,
    });

    meeting.meetingAt = meetingAt;
    meeting.timezone = toText(req.body?.timezone) || "UTC";
    meeting.location = toText(req.body?.location);
    meeting.virtualLink = toText(req.body?.virtualLink);
    meeting.agenda = toText(req.body?.agenda);
    meeting.channels = channels;
    meeting.reminderOffsets = reminderOffsets;
    meeting.status = "scheduled";
    meeting.completedBy = null;
    meeting.reminderIds = [];
    await meeting.save();

    const message = buildMeetingMessage(meeting, { orderNumber });
    await Promise.all(
      recipientIds.map((recipientId) =>
        createNotification(
          recipientId,
          req.user._id || req.user.id,
          primaryProject?._id || null,
          "REMINDER",
          "Departmental Meeting Scheduled",
          message,
          { inApp: true, email: true, allowSelf: true, source: "meeting" },
        ),
      ),
    );

    const reminderIds = await createMeetingReminders({
      meeting,
      recipientIds,
      projectId: primaryProject?._id || null,
      orderNumber,
      actorId: req.user._id || req.user.id,
    });
    meeting.reminderIds = reminderIds;
    await meeting.save();

    return res.status(201).json(meeting);
  } catch (error) {
    console.error("Error scheduling order meeting:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update an order meeting
// @route   PATCH /api/meetings/:id
// @access  Private (Admin/Front Desk)
const updateOrderMeeting = async (req, res) => {
  try {
    if (!canManageMeetings(req.user)) {
      return res.status(403).json({ message: "Not authorized to manage meetings." });
    }

    const meeting = await OrderMeeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }

    if (meeting.status !== "scheduled") {
      return res.status(400).json({
        message: "Only scheduled meetings can be edited.",
      });
    }

    const meetingAt = normalizeMeetingDate(req.body?.meetingAt);
    if (!meetingAt) {
      return res.status(400).json({ message: "meetingAt is required." });
    }
    if (meetingAt.getTime() <= Date.now()) {
      return res
        .status(400)
        .json({ message: "Meeting time must be in the future." });
    }

    const orderNumber = normalizeOrderNumber(meeting.orderNumber);
    const orderRefId = meeting.orderRef;
    const projects = await resolveOrderGroupProjects({
      orderNumber,
      orderRefId,
    });
    if (!projects.length) {
      return res.status(404).json({ message: "No projects found for this order." });
    }

    const recipientIds = await resolveMeetingRecipientIds(projects);
    const primaryProject = projects
      .slice()
      .sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      )[0];

    await cancelMeetingReminders(meeting.reminderIds || []);

    meeting.meetingAt = meetingAt;
    meeting.timezone = toText(req.body?.timezone) || meeting.timezone || "UTC";
    meeting.location = toText(req.body?.location);
    meeting.virtualLink = toText(req.body?.virtualLink);
    meeting.agenda = toText(req.body?.agenda);
    meeting.channels = {
      inApp: req.body?.channels?.inApp !== false,
      email: req.body?.channels?.email !== false,
    };
    meeting.reminderOffsets = normalizeMeetingReminderOffsets(req.body?.reminderOffsets);
    meeting.reminderIds = [];
    meeting.status = "scheduled";
    meeting.completedBy = null;
    await meeting.save();

    const message = buildMeetingMessage(meeting, { orderNumber });
    await Promise.all(
      recipientIds.map((recipientId) =>
        createNotification(
          recipientId,
          req.user._id || req.user.id,
          primaryProject?._id || null,
          "REMINDER",
          "Departmental Meeting Updated",
          message,
          { inApp: true, email: true, allowSelf: true, source: "meeting" },
        ),
      ),
    );

    const reminderIds = await createMeetingReminders({
      meeting,
      recipientIds,
      projectId: primaryProject?._id || null,
      orderNumber,
      actorId: req.user._id || req.user.id,
    });
    meeting.reminderIds = reminderIds;
    await meeting.save();

    return res.json(meeting);
  } catch (error) {
    console.error("Error updating order meeting:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Cancel an order meeting
// @route   PATCH /api/meetings/:id/cancel
// @access  Private (Admin/Front Desk)
const cancelOrderMeeting = async (req, res) => {
  try {
    if (!canManageMeetings(req.user)) {
      return res.status(403).json({ message: "Not authorized to manage meetings." });
    }

    const meeting = await OrderMeeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }

    if (meeting.status === "completed") {
      return res.status(400).json({ message: "Completed meetings cannot be cancelled." });
    }

    if (meeting.status === "cancelled") {
      return res.json(meeting);
    }

    await cancelMeetingReminders(meeting.reminderIds || []);
    meeting.status = "cancelled";
    meeting.reminderIds = [];
    await meeting.save();

    return res.json(meeting);
  } catch (error) {
    console.error("Error cancelling order meeting:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Mark order meeting complete
// @route   PATCH /api/meetings/:id/complete
// @access  Private (Admin/Front Desk)
const completeOrderMeeting = async (req, res) => {
  try {
    if (!canManageMeetings(req.user)) {
      return res.status(403).json({ message: "Not authorized to manage meetings." });
    }

    const meeting = await OrderMeeting.findById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found." });
    }

    if (meeting.status === "completed") {
      return res.json(meeting);
    }

    await cancelMeetingReminders(meeting.reminderIds || []);

    meeting.status = "completed";
    meeting.completedBy = req.user._id || req.user.id;
    meeting.reminderIds = [];
    await meeting.save();

    const orderNumber = normalizeOrderNumber(meeting.orderNumber);
    const projects = await resolveOrderGroupProjects({
      orderNumber,
      orderRefId: meeting.orderRef,
    });
    await advanceProjectsPastPendingMeeting(projects);

    return res.json(meeting);
  } catch (error) {
    console.error("Error completing order meeting:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Create a production batch for a project
// @route   POST /api/projects/:id/batches
// @access  Private (Production/Admin)
const createProjectBatch = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "status")) return;

    const isAdmin = isAdminUser(req.user);
    if (!isAdmin && !isProductionUser(req.user)) {
      return res.status(403).json({
        message: "Only Production or Admin can create batches.",
      });
    }

    const { label, items, productionSubDepartment } = req.body || {};
    const validation = validateBatchItems(items, project);
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    if (toText(project.status) !== "Pending Production") {
      return res.status(400).json({
        message: "Batches can only be created once the project is Pending Production.",
      });
    }

    const batchCount = Array.isArray(project.batches) ? project.batches.length : 0;
    const fallbackLabel = `Batch ${batchCount + 1}`;
    const batchLabel = toText(label) || fallbackLabel;
    const batchProductionSubDepartment = resolveBatchProductionSubDepartmentToken({
      project,
      user: req.user,
      requestedToken: productionSubDepartment,
      isAdmin,
    });
    if (!batchProductionSubDepartment.ok) {
      return res.status(400).json({ message: batchProductionSubDepartment.message });
    }
    const batchId = new mongoose.Types.ObjectId().toString();
    const now = new Date();

    const newBatch = {
      batchId,
      label: batchLabel,
      items: validation.items,
      status: "planned",
      productionSubDepartment: batchProductionSubDepartment.token,
      createdBy: req.user?._id || req.user?.id,
      createdAt: now,
      updatedAt: now,
      production: {},
      packaging: {},
      delivery: {},
      handoffs: [],
    };

    project.batches = Array.isArray(project.batches) ? project.batches : [];
    project.batches.push(newBatch);
    project.markModified("batches");
    await project.save();

    await logActivity(
      project._id,
      req.user,
      "batch_created",
      `Created ${batchLabel}`,
      { batchId },
    );

    return res.json(project);
  } catch (error) {
    console.error("Error creating project batch:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update batch label/items after creation
// @route   PATCH /api/projects/:id/batches/:batchId
// @access  Private (Production/Admin)
const updateProjectBatch = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "status")) return;

    const isAdmin = isAdminUser(req.user);
    if (!isAdmin && !isProductionUser(req.user)) {
      return res.status(403).json({
        message: "Only Production or Admin can update batches.",
      });
    }

    const batchId = String(req.params.batchId || "");
    const batches = Array.isArray(project.batches) ? project.batches : [];
    const batch = batches.find((entry) => String(entry.batchId) === batchId);
    if (!batch) {
      return res.status(404).json({ message: "Batch not found." });
    }
    if (
      !isAdmin &&
      !canUserAccessBatchByProductionSubDepartment({ user: req.user, batch })
    ) {
      return res.status(403).json({
        message: "You can only manage batches assigned to your production subdepartment.",
      });
    }

    if (batch.status === "cancelled") {
      return res.status(400).json({
        message: "Cancelled batches cannot be edited.",
      });
    }

    const { label, items, productionSubDepartment } = req.body || {};
    if (typeof label === "string" && label.trim()) {
      batch.label = label.trim();
    }

    if (items) {
      const validation = validateBatchItems(items, project, {
        excludeBatchId: batch.batchId,
      });
      if (!validation.ok) {
        return res.status(400).json({ message: validation.message });
      }
      const nextBatchTotalQty = validation.items.reduce(
        (acc, entry) => acc + (Number(entry?.qty) || 0),
        0,
      );
      const existingReceivedQty = Number(batch?.packaging?.receivedQty);
      if (
        Number.isFinite(existingReceivedQty) &&
        existingReceivedQty > nextBatchTotalQty
      ) {
        return res.status(400).json({
          message:
            "Batch quantity cannot be lower than the quantity already confirmed by Packaging.",
        });
      }
      const existingDeliveredQty = Number(batch?.delivery?.deliveredQty);
      if (
        Number.isFinite(existingDeliveredQty) &&
        existingDeliveredQty > nextBatchTotalQty
      ) {
        return res.status(400).json({
          message:
            "Batch quantity cannot be lower than the quantity already confirmed by Front Desk delivery.",
        });
      }
      batch.items = validation.items;
    }
    const batchProductionSubDepartment = resolveBatchProductionSubDepartmentToken({
      project,
      user: req.user,
      requestedToken: productionSubDepartment,
      existingToken: batch?.productionSubDepartment,
      isAdmin,
    });
    if (!batchProductionSubDepartment.ok) {
      return res.status(400).json({ message: batchProductionSubDepartment.message });
    }
    batch.productionSubDepartment = batchProductionSubDepartment.token;

    batch.updatedAt = new Date();
    await reconcileProjectStatusForBatchProduction(project, req.user);
    await reconcileProjectStatusForBatchDelivery(project, req.user);
    project.markModified("batches");
    await project.save();

    await logActivity(
      project._id,
      req.user,
      "batch_updated",
      `Updated ${batch.label || "batch"}`,
      { batchId: batch.batchId },
    );

    return res.json(project);
  } catch (error) {
    console.error("Error updating project batch:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Update batch status or correct stage records
// @route   PATCH /api/projects/:id/batches/:batchId/status
// @access  Private (Stage owners/Admin)
const updateProjectBatchStatus = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!ensureProjectMutationAccess(req, res, project, "status")) return;

    const batchId = String(req.params.batchId || "");
    const batches = Array.isArray(project.batches) ? project.batches : [];
    const batch = batches.find((entry) => String(entry.batchId) === batchId);
    if (!batch) {
      return res.status(404).json({ message: "Batch not found." });
    }
    const batchTotalQty = getBatchTotalQty(batch);

    const nextStatus = normalizeBatchStatus(req.body?.status);
    if (!nextStatus) {
      return res.status(400).json({ message: "Invalid batch status." });
    }
    const currentStatus = normalizeBatchStatus(batch.status);
    const currentStatusIndex = getBatchStatusIndex(currentStatus);
    const requestedStatusIndex = getBatchStatusIndex(nextStatus);
    const isPackagingCorrection =
      nextStatus === "in_packaging" &&
      currentStatusIndex !== -1 &&
      requestedStatusIndex !== -1 &&
      currentStatusIndex >= requestedStatusIndex;
    const isDeliveryCorrection =
      nextStatus === "delivered" &&
      currentStatusIndex !== -1 &&
      requestedStatusIndex !== -1 &&
      currentStatusIndex >= requestedStatusIndex;
    const isStageRecordCorrection =
      isPackagingCorrection || isDeliveryCorrection;

    const receivedQty =
      nextStatus === "in_packaging"
        ? normalizeBatchQty(
            req.body?.receivedQty ?? req.body?.producedQty ?? req.body?.qty,
          )
        : null;
    const deliveredQty =
      nextStatus === "delivered"
        ? normalizeBatchQty(req.body?.deliveredQty ?? req.body?.qty)
        : null;

    if (nextStatus === "in_packaging") {
      if (!receivedQty) {
        return res.status(400).json({
          message: "Packaging must confirm the produced quantity for this batch.",
        });
      }
      if (batchTotalQty > 0 && receivedQty > batchTotalQty) {
        return res.status(400).json({
          message:
            "Produced quantity cannot exceed the total quantity assigned to this batch.",
        });
      }
    }

    if (nextStatus === "delivered") {
      if (!deliveredQty) {
        return res.status(400).json({
          message: "Delivery must include the quantity delivered for this batch.",
        });
      }
      if (batchTotalQty > 0 && deliveredQty > batchTotalQty) {
        return res.status(400).json({
          message:
            "Delivered quantity cannot exceed the total quantity assigned to this batch.",
        });
      }
    }

    const isAdmin = isAdminUser(req.user);
    if (!isAdmin) {
      if (batch.status === "cancelled") {
        return res
          .status(400)
          .json({ message: "Cancelled batches cannot be updated." });
      }
      if (nextStatus === "cancelled") {
        return res.status(403).json({
          message: "Only Admin can cancel a batch.",
        });
      }

      const expectedNext = getNextBatchStatus(batch.status);
      if (!isStageRecordCorrection && nextStatus !== expectedNext) {
        return res.status(400).json({
          message: `Batch status must follow strict order. Next status should be "${expectedNext}".`,
        });
      }

      const owner = isPackagingCorrection
        ? "packaging"
        : isDeliveryCorrection
          ? "frontdesk"
          : BATCH_STAGE_OWNER[nextStatus];
      if (
        owner === "production" &&
        !canUserAccessBatchByProductionSubDepartment({ user: req.user, batch })
      ) {
        return res.status(403).json({
          message:
            "You can only update production batches assigned to your production subdepartment.",
        });
      }
      if (owner === "production" && !isProductionUser(req.user)) {
        return res.status(403).json({
          message: "Only Production can update this batch stage.",
        });
      }
      if (owner === "packaging" && !isPackagingUser(req.user)) {
        return res.status(403).json({
          message: "Only Packaging can update this batch stage.",
        });
      }
      if (owner === "frontdesk" && !isFrontDeskUser(req.user)) {
        return res.status(403).json({
          message: "Only Front Desk can confirm delivery for this batch.",
        });
      }
    }

    const now = new Date();
    batch.status = isStageRecordCorrection ? currentStatus : nextStatus;
    batch.updatedAt = now;
    batch.production = batch.production || {};
    batch.packaging = batch.packaging || {};
    batch.delivery = batch.delivery || {};
    batch.cancellation = batch.cancellation || {};
    batch.handoffs = Array.isArray(batch.handoffs) ? batch.handoffs : [];
    if (isAdmin || BATCH_STAGE_OWNER[nextStatus] === "production") {
      const batchProductionSubDepartment = resolveBatchProductionSubDepartmentToken({
        project,
        user: req.user,
        requestedToken: req.body?.productionSubDepartment,
        existingToken: batch?.productionSubDepartment,
        isAdmin,
      });
      if (!batchProductionSubDepartment.ok) {
        return res.status(400).json({
          message: batchProductionSubDepartment.message,
        });
      }
      batch.productionSubDepartment = batchProductionSubDepartment.token;
    }

    if (nextStatus === "in_production") {
      if (!batch.production.startedAt) batch.production.startedAt = now;
      batch.production.by = req.user?._id || req.user?.id;
    }
    if (nextStatus === "produced") {
      if (!batch.production.startedAt) batch.production.startedAt = now;
      batch.production.completedAt = now;
      batch.production.by = req.user?._id || req.user?.id;
    }
    if (nextStatus === "in_packaging") {
      if (!batch.packaging.receivedAt) batch.packaging.receivedAt = now;
      if (receivedQty) {
        batch.packaging.receivedQty = receivedQty;
      }
      batch.packaging.by = req.user?._id || req.user?.id;
      if (!isStageRecordCorrection) {
        batch.handoffs.push({
          fromDept: "Production",
          toDept: "Packaging",
          at: now,
          by: req.user?._id || req.user?.id,
        });
      }
    }
    if (nextStatus === "packaged") {
      if (!batch.packaging.receivedAt) batch.packaging.receivedAt = now;
      batch.packaging.completedAt = now;
      batch.packaging.by = req.user?._id || req.user?.id;
    }
    if (nextStatus === "delivered") {
      if (!isStageRecordCorrection || !batch.delivery.deliveredAt) {
        batch.delivery.deliveredAt = now;
      }
      if (deliveredQty) {
        batch.delivery.deliveredQty = deliveredQty;
      }
      batch.delivery.deliveredBy = req.user?._id || req.user?.id;
      batch.delivery.recipient = toText(req.body?.recipient);
      batch.delivery.notes = toText(req.body?.notes);
      if (!isStageRecordCorrection) {
        batch.handoffs.push({
          fromDept: "Packaging",
          toDept: "Delivery",
          at: now,
          by: req.user?._id || req.user?.id,
        });
      }
    }
    if (nextStatus === "cancelled") {
      batch.cancellation.cancelledAt = now;
      batch.cancellation.cancelledBy = req.user?._id || req.user?.id;
      batch.cancellation.reason = toText(req.body?.reason);
    }

    const allDelivered = areAllBatchesDelivered(project);

    if (allDelivered) {
      const currentStatus = toText(project.status);
      const postDeliveryStatuses = new Set([
        "Delivered",
        "Pending Feedback",
        "Feedback Completed",
        "Completed",
        "Finished",
      ]);
      if (!postDeliveryStatuses.has(currentStatus)) {
        project.status = getAutoProgressedStatus("Delivered", project);
        await logActivity(
          project._id,
          req.user,
          "batch_delivery_complete",
          "All batches delivered. Project auto-marked as Delivered.",
          { batchId: batch.batchId },
        );
      }
    }

    await reconcileProjectStatusForBatchProduction(project, req.user);
    await reconcileProjectStatusForBatchDelivery(project, req.user);

    project.markModified("batches");
    await project.save();

    if (isStageRecordCorrection) {
      const correctionLabel =
        nextStatus === "in_packaging"
          ? "packaging details"
          : "delivery details";
      await logActivity(
        project._id,
        req.user,
        "batch_record_updated",
        `Batch ${batch.label || batch.batchId} ${correctionLabel} updated`,
        {
          batchId: batch.batchId,
          status: batch.status,
          correctionStage: nextStatus,
        },
      );
    } else {
      await logActivity(
        project._id,
        req.user,
        "batch_status_updated",
        `Batch ${batch.label || batch.batchId} moved to ${nextStatus}`,
        { batchId: batch.batchId, status: nextStatus },
      );
    }

    const actorName = getUserDisplayName(req.user);
    const projectRef = getProjectDisplayRef(project);
    const projectName = getProjectDisplayName(project);
    const batchLabel = toText(batch?.label) || batch?.batchId || "Batch";
    const adminNotificationMessage = isStageRecordCorrection
      ? nextStatus === "in_packaging"
        ? `Admin ${actorName} updated packaging details for ${batchLabel} on project #${projectRef} (${projectName}).`
        : `Admin ${actorName} updated delivery details for ${batchLabel} on project #${projectRef} (${projectName}).`
      : `Admin ${actorName} moved ${batchLabel} to ${formatBatchStatusLabel(
          nextStatus,
        )} for project #${projectRef} (${projectName}).`;
    await notifyLeadFromAdminOrderManagement({
      req,
      project,
      title: "Batch Status Updated",
      message: adminNotificationMessage,
      type: "UPDATE",
    });

    return res.json(project);
  } catch (error) {
    console.error("Error updating batch status:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  createProject,
  getProjects,
  getDashboardCounts,
  getNextActions,
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
  updateMeetingOverride,
  updateProjectEndOfDayVisibility,
  transitionQuoteRequirement,
  updateQuoteCostVerification,
  resetQuoteMockup,
  resetQuotePreviousSamples,
  resetQuoteSampleProduction,
  emailApprovedProjectMockups,
  updateQuoteBidSubmissionDocuments,
  updateQuoteDecision,
  markInvoiceSent,
  verifyPayment,
  undoInvoiceSent,
  undoPaymentVerification,
  updateSampleRequirement,
  updateCorporateEmergency,
  updateProjectType,
  confirmProjectSampleApproval,
  resetProjectSampleApproval,
  createProjectBatch,
  updateProjectBatch,
  updateProjectBatchStatus,
  uploadProjectMockup,
  deleteProjectMockupVersion,
  validateClientProjectMockup,
  undoClientProjectMockupValidation,
  approveProjectMockup,
  rejectProjectMockup,
  resetProjectMockupDecision,
  getPendingSmsPrompts,
  getProjectSmsPrompts,
  createProjectSmsPrompt,
  updateProjectSmsPrompt,
  sendProjectSmsPrompt,
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
  createOrderMeeting,
  updateOrderMeeting,
  cancelOrderMeeting,
  completeOrderMeeting,
  getOrderMeetingByNumber,
};

