const mongoose = require("mongoose");
const Project = require("../models/Project");

const MAX_PROJECT_REFERENCE_COUNT = 4;
const MAX_PROJECT_CONTEXT_COUNT = 3;
const MAX_LOOKUP_PROJECT_COUNT = 12;
const MAX_PROJECT_SEARCH_POOL = 80;

const PROJECT_CONTEXT_SELECT_FIELDS = [
  "orderId",
  "orderRef",
  "projectType",
  "priority",
  "status",
  "details",
  "departments",
  "items",
  "batches",
  "challenges",
  "hold",
  "cancellation",
  "createdBy",
  "projectLeadId",
  "assistantLeadId",
  "quoteDetails",
  "invoice",
  "paymentVerifications",
  "sampleRequirement",
  "sampleApproval",
  "mockup.fileName",
  "mockup.version",
  "mockup.clientApproval",
  "endOfDayUpdate",
  "endOfDayUpdateDate",
  "updatedAt",
].join(" ");

const PRODUCTION_DEPARTMENT_TOKENS = new Set([
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

const QUOTE_REQUIREMENT_LABELS = {
  cost: "Cost verification",
  mockup: "Mockup",
  previousSamples: "Previous samples",
  sampleProduction: "Sample production",
  bidSubmission: "Bid submission",
};

const QUOTE_COMPLETED_REQUIREMENT_STATUSES = new Set([
  "client_approved",
  "sent_to_client",
]);

const toText = (value) => String(value || "").trim();

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
};

const unique = (items = []) => Array.from(new Set(items.filter(Boolean)));

const truncateText = (value, maxLength = 220) => {
  const text = toText(value).replace(/\s+/g, " ");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
};

const normalizeObjectId = (value) => {
  if (!value) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (typeof value === "object") {
    const rawId = value._id || value.id;
    if (rawId) return String(rawId);
    if (typeof value.toString === "function") return String(value.toString());
  }
  return "";
};

const normalizeDepartmentToken = (value) => {
  if (value && typeof value === "object") {
    return String(value.value || value.label || "").trim().toLowerCase();
  }
  return String(value || "").trim().toLowerCase();
};

const canonicalizeDepartmentToken = (value) => {
  const token = normalizeDepartmentToken(value);
  if (!token) return "";
  if (PRODUCTION_DEPARTMENT_TOKENS.has(token)) return "production";
  if (GRAPHICS_DEPARTMENT_TOKENS.has(token)) return "graphics";
  if (STORES_DEPARTMENT_TOKENS.has(token)) return "stores";
  if (PHOTOGRAPHY_DEPARTMENT_TOKENS.has(token)) return "photography";
  return token;
};

const hasDepartment = (user, department) =>
  toArray(user?.department)
    .map(normalizeDepartmentToken)
    .includes(normalizeDepartmentToken(department));

const hasAdministrationAccess = (user) =>
  user?.role === "admin" || hasDepartment(user, "Administration");

const isFrontDeskUser = (user) => hasDepartment(user, "Front Desk");

const hasDepartmentOverlap = (userDepartments, projectDepartments) => {
  const userTokens = new Set(
    toArray(userDepartments).map(canonicalizeDepartmentToken).filter(Boolean),
  );
  if (userTokens.size === 0) return false;

  return toArray(projectDepartments)
    .map(canonicalizeDepartmentToken)
    .filter(Boolean)
    .some((token) => userTokens.has(token));
};

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanReferenceToken = (value) =>
  toText(value)
    .replace(/[.,;:!?)}\]]+$/g, "")
    .replace(/^#+/, "")
    .trim();

const normalizeReferenceToken = (value) =>
  cleanReferenceToken(value).toLowerCase();

const parseProjectReferences = (question) => {
  const text = toText(question);
  if (!text) return [];

  const refs = [];
  const seen = new Set();

  const addReference = ({ raw, lookup, type }) => {
    const cleanedLookup = cleanReferenceToken(lookup);
    if (!cleanedLookup || cleanedLookup.length < 2) return;

    const key = `${type}:${cleanedLookup.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    refs.push({
      type,
      raw: toText(raw),
      lookup: cleanedLookup,
      display: type === "quote" ? cleanedLookup : `#${cleanedLookup}`,
    });
  };

  const orderPattern = /(^|[\s([{:])#([A-Za-z0-9][A-Za-z0-9._/-]{1,48})/g;
  let orderMatch = orderPattern.exec(text);
  while (orderMatch) {
    addReference({
      raw: `#${orderMatch[2]}`,
      lookup: orderMatch[2],
      type: "order",
    });
    orderMatch = orderPattern.exec(text);
  }

  const quotePattern = /(^|[\s([{:])(Q[-_]?\d[A-Za-z0-9._/-]{0,48})\b/gi;
  let quoteMatch = quotePattern.exec(text);
  while (quoteMatch) {
    addReference({
      raw: quoteMatch[2],
      lookup: quoteMatch[2],
      type: "quote",
    });
    quoteMatch = quotePattern.exec(text);
  }

  return refs.slice(0, MAX_PROJECT_REFERENCE_COUNT);
};

const buildReferenceLookupConditions = (refs) => {
  const conditions = [];
  refs.forEach((ref) => {
    const exact = new RegExp(`^${escapeRegExp(ref.lookup)}$`, "i");
    const hashExact = new RegExp(`^#${escapeRegExp(ref.lookup)}$`, "i");
    conditions.push({ orderId: exact });
    conditions.push({ orderId: hashExact });

    if (ref.type === "quote") {
      conditions.push({ "quoteDetails.quoteNumber": exact });
    }
  });
  return conditions;
};

const buildLooseSearchConditions = (query) => {
  const rawQuery = toText(query).slice(0, 90);
  const cleanedQuery = cleanReferenceToken(rawQuery);
  const searchValue = cleanedQuery || rawQuery;
  if (searchValue.length < 2) return [];

  const searchRegex = new RegExp(escapeRegExp(searchValue), "i");
  const conditions = [
    { orderId: searchRegex },
    { "quoteDetails.quoteNumber": searchRegex },
    { "details.projectName": searchRegex },
    { "details.projectNameRaw": searchRegex },
    { "details.projectIndicator": searchRegex },
    { "details.client": searchRegex },
  ];

  if (mongoose.Types.ObjectId.isValid(searchValue)) {
    conditions.push({ _id: searchValue });
  }

  if (cleanedQuery && cleanedQuery !== rawQuery) {
    const rawRegex = new RegExp(escapeRegExp(rawQuery), "i");
    conditions.push({ orderId: rawRegex });
  }

  return conditions;
};

const findProjectContextRecords = (criteria, limit = MAX_LOOKUP_PROJECT_COUNT) =>
  Project.find(criteria)
    .select(PROJECT_CONTEXT_SELECT_FIELDS)
    .populate("projectLeadId", "firstName lastName name employeeId department")
    .populate("assistantLeadId", "firstName lastName name employeeId department")
    .populate("orderRef", "orderNumber")
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

const projectMatchesReference = (project, ref) => {
  const lookup = normalizeReferenceToken(ref.lookup);
  if (!lookup) return false;

  const candidates = [
    project?.orderId,
    project?.quoteDetails?.quoteNumber,
    project?.orderRef?.orderNumber,
  ]
    .map(normalizeReferenceToken)
    .filter(Boolean);

  return candidates.includes(lookup);
};

const getPersonName = (person) => {
  if (!person) return "";
  const directName = toText(person.name);
  if (directName) return directName;
  return [person.firstName, person.lastName].map(toText).filter(Boolean).join(" ");
};

const getDisplayRef = (project) => {
  const orderId = toText(project?.orderId);
  if (orderId) return orderId.startsWith("#") ? orderId : `#${orderId}`;

  const quoteNumber = toText(project?.quoteDetails?.quoteNumber);
  if (quoteNumber) return quoteNumber;

  const id = normalizeObjectId(project?._id);
  return id ? `#${id.slice(-6).toUpperCase()}` : "Project";
};

const getQuoteRequirementSummaries = (project) => {
  const checklist = project?.quoteDetails?.checklist || {};
  const requirementItems = project?.quoteDetails?.requirementItems || {};

  return Object.entries(QUOTE_REQUIREMENT_LABELS)
    .filter(([key]) => Boolean(checklist?.[key]))
    .map(([key, label]) => {
      const item = requirementItems?.[key] || {};
      const status = toText(item.status) || "assigned";
      const completed =
        Boolean(item.completionConfirmedAt) ||
        QUOTE_COMPLETED_REQUIREMENT_STATUSES.has(status);
      return {
        key,
        label,
        status,
        completed,
        note: truncateText(item.note, 120),
      };
    });
};

const summarizeBatches = (project) => {
  const counts = new Map();
  toArray(project?.batches).forEach((batch) => {
    const status = toText(batch?.status) || "planned";
    counts.set(status, (counts.get(status) || 0) + 1);
  });

  return Array.from(counts.entries()).map(([status, count]) => ({
    status,
    count,
  }));
};

const summarizeItems = (project) =>
  toArray(project?.items)
    .slice(0, 5)
    .map((item) => {
      const description = truncateText(item?.description || item?.breakdown, 80);
      const quantity = Number(item?.qty);
      return [description, Number.isFinite(quantity) ? `Qty ${quantity}` : ""]
        .filter(Boolean)
        .join(" - ");
    })
    .filter(Boolean);

const getOpenChallenges = (project) =>
  toArray(project?.challenges).filter((challenge) => {
    const status = toText(challenge?.status).toLowerCase();
    return !status || status === "open" || status === "escalated";
  });

const getProjectBlockers = (project) => {
  const blockers = [];
  const status = toText(project?.status);
  const quoteRequirements = getQuoteRequirementSummaries(project);
  const pendingQuoteRequirements = quoteRequirements.filter(
    (requirement) => !requirement.completed,
  );
  const openChallenges = getOpenChallenges(project);

  if (project?.cancellation?.isCancelled) {
    blockers.push({
      label: "Project is cancelled",
      detail: truncateText(project?.cancellation?.reason, 140),
    });
  }

  if (project?.hold?.isOnHold || status === "On Hold") {
    blockers.push({
      label: "Project is on hold",
      detail: truncateText(project?.hold?.reason, 140),
    });
  }

  if (status === "Pending Production" && !project?.invoice?.sent) {
    blockers.push({
      label: "Invoice has not been marked as sent",
      detail: "Front Desk should confirm billing before production continues.",
    });
  }

  if (
    status === "Pending Production" &&
    !toArray(project?.paymentVerifications).length
  ) {
    blockers.push({
      label: "Payment or authorization is not verified",
      detail: "Confirm part payment, full payment, PO, or authorization.",
    });
  }

  if (
    project?.sampleRequirement?.isRequired &&
    project?.sampleApproval?.status !== "approved"
  ) {
    blockers.push({
      label: "Sample approval is pending",
      detail: "A required sample must be approved before the next step.",
    });
  }

  const mockupApproval = project?.mockup?.clientApproval || {};
  if (
    ["Pending Mockup", "Mockup Completed", "Pending Master Approval"].includes(
      status,
    ) &&
    mockupApproval.status !== "approved" &&
    !mockupApproval.isApproved
  ) {
    blockers.push({
      label: "Client mockup approval is pending",
      detail:
        mockupApproval.status === "rejected"
          ? truncateText(mockupApproval.rejectionReason, 140)
          : "Confirm the current mockup version before moving forward.",
    });
  }

  if (pendingQuoteRequirements.length > 0) {
    blockers.push({
      label: "Quote requirements are still pending",
      detail: pendingQuoteRequirements
        .map((requirement) => `${requirement.label}: ${requirement.status}`)
        .join(", "),
    });
  }

  if (openChallenges.length > 0) {
    blockers.push({
      label: `${openChallenges.length} open challenge${
        openChallenges.length === 1 ? "" : "s"
      }`,
      detail: openChallenges
        .slice(0, 3)
        .map((challenge) => truncateText(challenge?.title, 70))
        .filter(Boolean)
        .join(", "),
    });
  }

  return blockers.slice(0, 8);
};

const getNextChecks = (project, blockers) => {
  const status = toText(project?.status);
  const checks = [];

  if (blockers.length > 0) {
    checks.push("Resolve the listed blockers before moving to the next workflow step.");
  }

  if (status.includes("Quote")) {
    checks.push("Review the quote checklist, requirement statuses, and client decision.");
  }

  if (status.includes("Mockup")) {
    checks.push("Check the latest mockup, graphics review, and client approval status.");
  }

  if (status.includes("Production")) {
    checks.push("Check invoice, payment/authorization, batches, and production updates.");
  }

  if (status.includes("Delivery") || status === "Delivered") {
    checks.push("Check packaging completion, delivery handoff, and feedback status.");
  }

  if (!checks.length) {
    checks.push("Open the project and review the activity/update timeline for the latest handoff.");
  }

  return unique(checks).slice(0, 4);
};

const getProjectRouteForUser = (user, project) => {
  const projectId = normalizeObjectId(project?._id);
  if (!projectId) return "";
  const accessReason = getProjectAccessReason(user, project);
  if (accessReason === "admin" || accessReason === "front-desk") {
    return `/new-orders/actions/${projectId}`;
  }
  if (accessReason === "department") {
    return `/engaged-projects/actions/${projectId}`;
  }
  return `/detail/${projectId}`;
};

const getProjectAccessReason = (user, project) => {
  if (!user || !project) return "";
  if (hasAdministrationAccess(user)) return "admin";
  if (isFrontDeskUser(user)) return "front-desk";

  const userId = normalizeObjectId(user._id || user.id);
  if (!userId) return "";

  if (userId === normalizeObjectId(project.projectLeadId)) return "lead";
  if (userId === normalizeObjectId(project.assistantLeadId)) return "assistant";
  if (userId === normalizeObjectId(project.createdBy)) return "creator";
  if (hasDepartmentOverlap(user.department, project.departments)) return "department";

  return "";
};

const canUserAccessProjectContext = (user, project) =>
  Boolean(getProjectAccessReason(user, project));

const buildProjectContext = (project, user, requestedReference) => {
  const blockers = getProjectBlockers(project);
  const quoteRequirements = getQuoteRequirementSummaries(project);

  return {
    projectId: normalizeObjectId(project?._id),
    requestedReference: requestedReference?.display || requestedReference?.raw || "",
    accessReason: getProjectAccessReason(user, project),
    route: getProjectRouteForUser(user, project),
    displayRef: getDisplayRef(project),
    orderId: toText(project?.orderId),
    quoteNumber: toText(project?.quoteDetails?.quoteNumber),
    projectType: toText(project?.projectType) || "Standard",
    status: toText(project?.status) || "Unknown",
    priority: toText(project?.priority),
    projectName: truncateText(project?.details?.projectName, 120),
    clientName: truncateText(project?.details?.client, 120),
    deliveryDate: project?.details?.deliveryDate || null,
    deliveryTime: toText(project?.details?.deliveryTime),
    deliveryLocation: truncateText(project?.details?.deliveryLocation, 140),
    departments: toArray(project?.departments).map(toText).filter(Boolean),
    leadName: getPersonName(project?.projectLeadId),
    assistantLeadName: getPersonName(project?.assistantLeadId),
    itemCount: toArray(project?.items).length,
    itemSummaries: summarizeItems(project),
    batchSummary: summarizeBatches(project),
    quoteDecisionStatus: toText(project?.quoteDetails?.decision?.status),
    quoteRequirements,
    invoiceSent: Boolean(project?.invoice?.sent),
    paymentVerificationTypes: toArray(project?.paymentVerifications)
      .map((entry) => toText(entry?.type))
      .filter(Boolean),
    sampleRequired: Boolean(project?.sampleRequirement?.isRequired),
    sampleApprovalStatus: toText(project?.sampleApproval?.status),
    mockupFileName: toText(project?.mockup?.fileName),
    mockupClientApprovalStatus: toText(project?.mockup?.clientApproval?.status),
    mockupVersion: Number(project?.mockup?.version) || null,
    blockers,
    nextChecks: getNextChecks(project, blockers),
    latestUpdate: truncateText(project?.endOfDayUpdate, 240),
    latestUpdateDate: project?.endOfDayUpdateDate || null,
    updatedAt: project?.updatedAt || null,
  };
};

const toPublicProjectContext = (context = {}) => ({
  projectId: context.projectId,
  displayRef: context.displayRef,
  requestedReference: context.requestedReference,
  route: context.route,
  orderId: context.orderId,
  quoteNumber: context.quoteNumber,
  projectType: context.projectType,
  priority: context.priority,
  status: context.status,
  projectName: context.projectName,
  clientName: context.clientName,
  departments: context.departments || [],
  leadName: context.leadName,
  assistantLeadName: context.assistantLeadName,
  blockers: toArray(context.blockers).map((blocker) => ({
    label: blocker.label,
    detail: blocker.detail,
  })),
  nextChecks: context.nextChecks || [],
  latestUpdateDate: context.latestUpdateDate,
  updatedAt: context.updatedAt,
});

const getProjectContextSearchText = (contexts = []) =>
  contexts
    .flatMap((context) => [
      context.displayRef,
      context.projectType,
      context.status,
      context.projectName,
      context.quoteDecisionStatus,
      ...(context.departments || []),
      ...(context.blockers || []).map((blocker) => blocker.label),
      ...(context.nextChecks || []),
      ...(context.quoteRequirements || []).map(
        (requirement) => `${requirement.label} ${requirement.status}`,
      ),
    ])
    .filter(Boolean)
    .join(" ");

const getProjectPromptContext = (contexts = [], lookupNotes = []) => {
  const blocks = contexts.map((context, index) => {
    const blockers = toArray(context.blockers)
      .map((blocker) =>
        [blocker.label, blocker.detail].filter(Boolean).join(": "),
      )
      .join("; ");
    const quoteRequirements = toArray(context.quoteRequirements)
      .map((requirement) =>
        [
          requirement.label,
          requirement.status,
          requirement.completed ? "completed" : "pending",
        ]
          .filter(Boolean)
          .join(" - "),
      )
      .join("; ");
    const batchSummary = toArray(context.batchSummary)
      .map((entry) => `${entry.status}: ${entry.count}`)
      .join(", ");

    return [
      `Project ${index + 1}: ${context.displayRef}`,
      `Requested reference: ${context.requestedReference || "none"}`,
      `Name: ${context.projectName || "Untitled"}`,
      `Client: ${context.clientName || "not provided"}`,
      `Type: ${context.projectType}`,
      `Status: ${context.status}`,
      `Departments: ${(context.departments || []).join(", ") || "none"}`,
      `Lead: ${context.leadName || "unassigned"}`,
      `Assistant Lead: ${context.assistantLeadName || "unassigned"}`,
      `Delivery: ${[context.deliveryDate, context.deliveryTime, context.deliveryLocation]
        .filter(Boolean)
        .join(" | ") || "not provided"}`,
      `Items: ${context.itemCount || 0}${
        context.itemSummaries?.length
          ? ` (${context.itemSummaries.join("; ")})`
          : ""
      }`,
      batchSummary ? `Batches: ${batchSummary}` : "",
      context.projectType === "Quote"
        ? `Quote decision: ${context.quoteDecisionStatus || "pending"}`
        : "",
      quoteRequirements ? `Quote requirements: ${quoteRequirements}` : "",
      `Invoice sent: ${context.invoiceSent ? "yes" : "no"}`,
      `Payment/authorization: ${
        context.paymentVerificationTypes?.length
          ? context.paymentVerificationTypes.join(", ")
          : "not verified"
      }`,
      context.sampleRequired
        ? `Sample approval: ${context.sampleApprovalStatus || "pending"}`
        : "",
      context.mockupFileName || context.mockupClientApprovalStatus
        ? `Mockup: ${[
            context.mockupFileName,
            context.mockupVersion ? `version ${context.mockupVersion}` : "",
            context.mockupClientApprovalStatus
              ? `client ${context.mockupClientApprovalStatus}`
              : "",
          ]
            .filter(Boolean)
            .join(", ")}`
        : "",
      blockers ? `Likely blockers: ${blockers}` : "Likely blockers: none found",
      context.latestUpdate ? `Latest lead update: ${context.latestUpdate}` : "",
      `Suggested checks: ${(context.nextChecks || []).join("; ")}`,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const lookupText = toArray(lookupNotes)
    .map((note) => `- ${note.message}`)
    .join("\n");

  return [
    blocks.length ? "Authorized project context:" : "",
    blocks.join("\n\n---\n\n"),
    lookupText ? `Project lookup notes:\n${lookupText}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
};

const resolveProjectContextsForQuestion = async ({
  question,
  user,
  projectIds = [],
}) => {
  const references = parseProjectReferences(question);
  const requestedProjectIds = unique(
    toArray(projectIds)
      .map(normalizeObjectId)
      .filter((id) => mongoose.Types.ObjectId.isValid(id)),
  ).slice(0, MAX_PROJECT_CONTEXT_COUNT);

  if (!references.length && !requestedProjectIds.length) {
    return {
      references,
      projectContexts: [],
      projectLookupNotes: [],
    };
  }

  const lookupConditions = [
    ...buildReferenceLookupConditions(references),
    ...(requestedProjectIds.length
      ? [{ _id: { $in: requestedProjectIds } }]
      : []),
  ];
  const projects = await findProjectContextRecords(
    { $or: lookupConditions },
    MAX_LOOKUP_PROJECT_COUNT,
  );

  const projectContexts = [];
  const projectLookupNotes = [];
  const usedProjectIds = new Set();

  const addProjectContext = (project, requestedReference = {}) => {
    if (projectContexts.length >= MAX_PROJECT_CONTEXT_COUNT) return false;
    const projectId = normalizeObjectId(project?._id);
    if (!projectId || usedProjectIds.has(projectId)) return false;
    if (!canUserAccessProjectContext(user, project)) return false;

    usedProjectIds.add(projectId);
    projectContexts.push(buildProjectContext(project, user, requestedReference));
    return true;
  };

  references.forEach((reference) => {
    const matchingProjects = projects.filter((project) =>
      projectMatchesReference(project, reference),
    );

    if (!matchingProjects.length) {
      projectLookupNotes.push({
        reference: reference.display,
        code: "not_found_or_no_access",
        message: `I could not find an accessible project for ${reference.display}.`,
      });
      return;
    }

    const accessibleProjects = matchingProjects.filter((project) =>
      canUserAccessProjectContext(user, project),
    );

    if (!accessibleProjects.length) {
      projectLookupNotes.push({
        reference: reference.display,
        code: "not_found_or_no_access",
        message: `I could not find an accessible project for ${reference.display}.`,
      });
      return;
    }

    accessibleProjects.forEach((project) => {
      addProjectContext(project, reference);
    });
  });

  requestedProjectIds.forEach((requestedProjectId) => {
    const project = projects.find(
      (entry) => normalizeObjectId(entry?._id) === requestedProjectId,
    );

    if (!project || !canUserAccessProjectContext(user, project)) {
      projectLookupNotes.push({
        reference: requestedProjectId,
        code: "not_found_or_no_access",
        message: "I could not find an accessible selected project.",
      });
      return;
    }

    addProjectContext(project, {
      raw: getDisplayRef(project),
      display: getDisplayRef(project),
      lookup: toText(project?.orderId) || requestedProjectId,
      type: project?.projectType === "Quote" ? "quote" : "order",
    });
  });

  return {
    references,
    projectContexts,
    projectLookupNotes,
  };
};

const searchAccessibleProjectSummaries = async ({ query, user, limit = 8 }) => {
  const numericLimit = Number.isFinite(Number(limit))
    ? Math.min(12, Math.max(1, Number(limit)))
    : 8;
  const conditions = buildLooseSearchConditions(query);
  const criteria = conditions.length ? { $or: conditions } : {};
  const projects = await findProjectContextRecords(criteria, MAX_PROJECT_SEARCH_POOL);

  return projects
    .filter((project) => canUserAccessProjectContext(user, project))
    .slice(0, numericLimit)
    .map((project) =>
      toPublicProjectContext(
        buildProjectContext(project, user, {
          raw: getDisplayRef(project),
          display: getDisplayRef(project),
          lookup: toText(project?.orderId) || normalizeObjectId(project?._id),
          type: project?.projectType === "Quote" ? "quote" : "order",
        }),
      ),
    );
};

module.exports = {
  parseProjectReferences,
  resolveProjectContextsForQuestion,
  searchAccessibleProjectSummaries,
  getProjectContextSearchText,
  getProjectPromptContext,
  toPublicProjectContext,
};
