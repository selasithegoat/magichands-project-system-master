const Project = require("../models/Project");
const ActivityLog = require("../models/ActivityLog");
const { logActivity } = require("../utils/activityLogger");
const { createNotification } = require("../utils/notificationService");
const User = require("../models/User"); // Need User model for department notifications
const { notifyAdmins } = require("../utils/adminNotificationUtils"); // [NEW]
const {
  notifyBillingOptionChange,
} = require("../utils/billingNotificationService");

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

const getProductionUsers = async () =>
  User.find({ department: { $in: Array.from(PRODUCTION_DEPARTMENTS) } });

const PAYMENT_TYPES = new Set([
  "part_payment",
  "full_payment",
  "po",
  "authorized",
]);
const DEFAULT_RELEASE_STATUS = "In Progress";
const HOLD_STATUS = "On Hold";
const HOLDABLE_STATUSES = new Set(
  (Project.schema.path("status")?.enumValues || []).filter(
    (status) => status !== HOLD_STATUS,
  ),
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

const PROJECT_MUTATION_ACCESS_FIELDS =
  "createdBy projectLeadId assistantLeadId departments";

const toObjectIdString = (value) => {
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
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
  if (!canMutateProject(req.user, project, action)) {
    res.status(403).json({ message: "Not authorized to modify this project." });
    return false;
  }
  return true;
};

const hasPaymentVerification = (project) =>
  Array.isArray(project?.paymentVerifications) &&
  project.paymentVerifications.length > 0;

const getPaymentVerificationTypes = (project) =>
  new Set(
    (Array.isArray(project?.paymentVerifications)
      ? project.paymentVerifications
      : []
    )
      .map((entry) => toText(entry?.type))
      .filter(Boolean),
  );

const AI_RISK_MODEL = process.env.OPENAI_RISK_MODEL || "gpt-4o-mini";
const AI_RISK_TIMEOUT_MS = 12000;
const AI_RISK_TEMPERATURE = 0.9;
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
const normalizeTextToken = (value) =>
  toText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

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

const sanitizeRiskSuggestions = (value, limit = Number.POSITIVE_INFINITY) => {
  const uniqueDescriptions = new Set();
  const cleaned = [];

  toSafeArray(value).forEach((item) => {
    const description = toText(item?.description);
    const preventive = toText(item?.preventive);
    if (!description || !preventive) return;

    const descriptionKey = description.toLowerCase();
    if (uniqueDescriptions.has(descriptionKey)) return;
    uniqueDescriptions.add(descriptionKey);

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

  return {
    projectType: toText(projectData?.projectType) || "Standard",
    priority: toText(projectData?.priority) || "Normal",
    projectName: toText(details?.projectName || projectData?.projectName),
    briefOverview: toText(details?.briefOverview || projectData?.briefOverview),
    client: toText(details?.client || projectData?.client),
    deliveryDate: toText(details?.deliveryDate || projectData?.deliveryDate),
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
  const itemHighlights = buildGlobalItemSubjects(context.items);

  const projectName = context.projectName || "N/A";
  const projectDescription =
    context.briefOverview ||
    (itemHighlights.length ? itemHighlights.join("; ") : "N/A");

  const timelineParts = [];
  if (context.deliveryDate) {
    timelineParts.push(`Delivery date: ${context.deliveryDate}`);
  }
  if (context.priority) {
    timelineParts.push(`Priority: ${context.priority}`);
  }
  const timeline = timelineParts.length
    ? timelineParts.join(" | ")
    : "Not specified";

  const productionDepartments = context.productionDepartmentLabels.length
    ? context.productionDepartmentLabels.join(", ")
    : "N/A";

  const existingRisks = context.existingRiskDescriptions.length
    ? context.existingRiskDescriptions.join("; ")
    : "None";

  return [
    "Use the following to suggest 3-5 realistic production risks.",
    "",
    `Project Name: ${projectName}`,
    `Project Description: ${projectDescription}`,
    `Timeline: ${timeline}`,
    `production department: ${productionDepartments}`,
    "",
    "Rules:",
    "- Make each risk specific to the project details above.",
    "- Cover production execution risks only.",
    `- Do not repeat or paraphrase these existing risks: ${existingRisks}`,
    "- Keep each bullet unique and non-recurring.",
    "- Avoid generic boilerplate risks.",
    "",
    "Respond as a bullet list only.",
  ].join("\n");
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
          !/^(project name|project description|timeline|production department|rules|respond as)/i.test(
            line,
          ),
      );
  }

  return candidates.map((description) => ({
    description,
    preventive: DEFAULT_AI_PREVENTIVE_MEASURE,
  }));
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
                "You are a production-risk assistant for print/fabrication workflows. Follow the user format exactly and return only bullet points.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
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

    const parsed = parseAiRiskBulletSuggestions(contentText);
    return sanitizeRiskSuggestions(parsed, MAX_RISK_SUGGESTIONS);
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

    const parsed = parseAiRiskBulletSuggestions(contentText);
    return sanitizeRiskSuggestions(parsed, MAX_RISK_SUGGESTIONS);
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

// @desc    Create a new project (Step 1)
// @route   POST /api/projects
// @access  Private
const createProject = async (req, res) => {
  try {
    const {
      orderId, // Optional, can be auto-generated
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
      departments, // [NEW] Step 2
      items, // [NEW] Step 3
      uncontrollableFactors,
      productionRisks,
      projectLeadId, // [NEW] For Admin Assignment
      assistantLeadId, // [NEW] Optional assistant lead
      status, // [NEW] Allow explicit status setting (e.g. "Pending Scope Approval")
      description, // [NEW]
      details, // [NEW]
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

    // Auto-generate orderId if not provided (Format: ORD-[Timestamp])
    const finalOrderId = orderId || `ORD-${Date.now().toString().slice(-6)}`;

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

    // Create project
    const project = new Project({
      orderId: finalOrderId,
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
        contactType: getValue(contactType),
        supplySource: getValue(supplySource),
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
      // [NEW] Project Type System
      projectType: req.body.projectType || "Standard",
      priority:
        req.body.priority ||
        (req.body.projectType === "Emergency" ? "Urgent" : "Normal"),
      quoteDetails: finalQuoteDetails,
      updates: req.body.updates || [],
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
    let query = {};

    // If user is not an admin, they only see projects where they are the assigned Lead (or Assistant Lead)
    // Unless they are Front Desk, who need to see everything for End of Day updates
    // Access Control Logic:
    // 1. Admins see everything ONLY IF using Admin Portal (source=admin).
    // 2. Front Desk trying to view "End of Day Updates" (report mode) sees everything.
    // 3. Production users trying to view "Engaged Projects" (engaged mode) sees all projects with production sub-depts.
    // 4. Otherwise (Client Portal), EVERYONE (including Admins) sees only their own projects.

    const isReportMode = req.query.mode === "report";
    const isEngagedMode = req.query.mode === "engaged"; // [NEW] Production Engaged Mode
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

    // Access Control:
    // - Admins (non-Front Desk) can see all projects in Admin Portal
    // - Front Desk users can see all projects ONLY in report mode (End of Day updates)
    // - Engaged Department users can see all projects in engaged mode (Engaged Projects)
    // - Front Desk users in Admin Portal see only their own projects
    const canSeeAll =
      (req.user.role === "admin" && isAdminPortal) ||
      (isReportMode && isFrontDesk) ||
      (isEngagedMode && isEngagedDept); // Engaged Projects Mode

    if (!canSeeAll) {
      // [STRICT] Default View: ONLY projects where user is the Lead or Assistant
      query = {
        $or: [
          { projectLeadId: req.user._id },
          { assistantLeadId: req.user._id },
        ],
      };

      // [Mode: Report / All Orders]
      // Include projects they created OR are assigned to update
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

    const projects = await Project.find(query)
      .populate("createdBy", "firstName lastName")
      .populate("projectLeadId", "firstName lastName")
      .populate("assistantLeadId", "firstName lastName employeeId email")
      .sort({ createdAt: -1 });

    if (isAdminPortal) {
      // Optional: Logic specific to admin portal if needed later
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
      .populate("assistantLeadId", "firstName lastName employeeId email");

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

    // Project Lead can transition from "Completed" to "Finished".
    const isLead =
      project.projectLeadId &&
      project.projectLeadId.toString() === req.user.id.toString();
    const isFinishing =
      project.status === "Completed" && newStatus === "Finished";

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

    if (newStatus === "Mockup Completed" && !project.mockup?.fileUrl) {
      return res.status(400).json({
        message:
          "Please upload the approved mockup before completing this stage.",
      });
    }

    // Status progression map: when a stage is marked complete, auto-advance to next pending
    const statusProgression = {
      // Standard workflow
      "Scope Approval Completed": "Pending Mockup",
      "Mockup Completed": "Pending Production",
      "Production Completed": "Pending Packaging",
      "Packaging Completed": "Pending Delivery/Pickup",
      Delivered: "Pending Feedback",
      // Quote workflow
      "Quote Request Completed": "Pending Send Response",
    };

    // If the selected status has an auto-advancement, use it
    const finalStatus = statusProgression[newStatus] || newStatus;

    const requiresPayment =
      newStatus === "Production Completed" && !isQuoteProject(project);

    if (requiresPayment && !hasPaymentVerification(project)) {
      return res.status(400).json({
        message:
          "Payment verification is required before production can begin.",
      });
    }

    const paymentTypes = getPaymentVerificationTypes(project);
    const isPartPaymentOnly =
      paymentTypes.size === 1 && paymentTypes.has("part_payment");
    const requiresFullPaymentBeforeDelivery =
      newStatus === "Delivered" && !isQuoteProject(project);

    if (requiresFullPaymentBeforeDelivery && isPartPaymentOnly) {
      return res.status(400).json({
        message:
          "Full payment must be verified before confirming delivery. Current verification only confirms part payment.",
      });
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
        `Project #${project.orderId || project._id.slice(-6).toUpperCase()}: Mockup has been completed and is ready for production.`,
      );
    }

    // Notify Production team when production becomes pending
    if (finalStatus === "Pending Production" && oldStatus !== finalStatus) {
      const productionUsers = await getProductionUsers();
      for (const prodUser of productionUsers) {
        await createNotification(
          prodUser._id,
          req.user._id,
          project._id,
          "UPDATE",
          "Production Ready",
          `Project #${project.orderId || project._id.slice(-6).toUpperCase()}: Approved mockup is ready and production can begin.`,
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

    project.mockup = {
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      note: (note || "").trim(),
      uploadedBy: req.user._id,
      uploadedAt: new Date(),
    };

    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "mockup_upload",
      `Approved mockup uploaded`,
      { fileUrl: project.mockup.fileUrl, note: project.mockup.note },
    );

    if (project.projectLeadId) {
      await createNotification(
        project.projectLeadId,
        req.user._id,
        project._id,
        "UPDATE",
        "Mockup Uploaded",
        `Project #${project.orderId || project._id.slice(-6).toUpperCase()}: Approved mockup has been uploaded for review.`,
      );
    }

    res.json(project);
  } catch (error) {
    console.error("Error uploading mockup:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Add feedback to project
// @route   POST /api/projects/:id/feedback
// @access  Private (Front Desk / Admin)
const addFeedbackToProject = async (req, res) => {
  try {
    const { type, notes } = req.body;

    if (!type || !["Positive", "Negative"].includes(type)) {
      return res
        .status(400)
        .json({ message: "Feedback type must be Positive or Negative." });
    }

    const project = await Project.findById(req.params.id);
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
        message: "Not authorized to add feedback to this project.",
      });
    }

    const feedbackEntry = {
      type,
      notes: notes || "",
      createdBy: req.user._id,
      createdByName:
        `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
    };

    project.feedbacks = project.feedbacks || [];
    project.feedbacks.push(feedbackEntry);
    project.sectionUpdates = project.sectionUpdates || {};
    project.sectionUpdates.feedbacks = new Date();

    const oldStatus = project.status;
    if (
      project.status === "Pending Feedback" ||
      project.status === "Delivered"
    ) {
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
      suggestions = shuffleArray(suggestions).slice(0, MAX_RISK_SUGGESTIONS);

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
      suggestions = shuffleArray(suggestions).slice(0, MAX_RISK_SUGGESTIONS);
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
      quoteDetails, // [NEW]
      projectType, // [NEW]
      priority, // [NEW]
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
    if (typeof quoteDetails === "string")
      quoteDetails = JSON.parse(quoteDetails);
    if (typeof lead === "string" && lead.startsWith("{"))
      lead = JSON.parse(lead);
    if (typeof assistantLeadId === "string" && assistantLeadId.startsWith("{"))
      assistantLeadId = JSON.parse(assistantLeadId);

    const project = await Project.findById(id);
    if (!ensureProjectMutationAccess(req, res, project, "manage")) return;

    // Helper
    const getValue = (field) => (field && field.value ? field.value : field);

    // Capture old values for logging
    const oldValues = {
      client: project.details?.client,
      clientEmail: project.details?.clientEmail,
      clientPhone: project.details?.clientPhone,
      orderDate: project.orderDate,
      receivedTime: project.receivedTime,
      deliveryDate: project.details?.deliveryDate,
      deliveryTime: project.details?.deliveryTime,
      deliveryLocation: project.details?.deliveryLocation,
      contactType: project.details?.contactType,
      supplySource: project.details?.supplySource,
      lead: project.projectLeadId,
      assistantLead: project.assistantLeadId,
      status: project.status,
    };

    // Track if details changed for sectionUpdates
    let detailsChanged = false;

    // Update Top Level
    if (orderId) project.orderId = orderId;
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
    if (supplySource) {
      project.details.supplySource = getValue(supplySource);
      detailsChanged = true;
    }

    // Handle Files
    if (req.files) {
      if (req.files.sampleImage && req.files.sampleImage[0]) {
        project.details.sampleImage = `/uploads/${req.files.sampleImage[0].filename}`;
        detailsChanged = true;
      }

      const newAttachments = req.files.attachments
        ? req.files.attachments.map((file) => `/uploads/${file.filename}`)
        : [];

      // Combine existing and new attachments
      // If 'attachments' is sent in body, use it as the base (allows deletion)
      // If not sent, keep existing
      if (attachments && Array.isArray(attachments)) {
        project.details.attachments = [...attachments, ...newAttachments];
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
    } else if (attachments && Array.isArray(attachments)) {
      // Case: No new files, but attachments list updated (e.g. deletion)
      project.details.attachments = attachments;
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
    if (quoteDetails) project.quoteDetails = quoteDetails;

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
    if (oldValues.status !== updatedProject.status)
      changes.push(`Status: ${updatedProject.status}`);

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

    // Notify Lead / Assistant Lead if newly assigned
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

    if (nextLeadId && nextLeadId !== prevLeadId) {
      await createNotification(
        updatedProject.projectLeadId,
        req.user._id,
        updatedProject._id,
        "ASSIGNMENT",
        "New Project Assigned",
        `Project #${updatedProject.orderId || updatedProject._id}: You have been assigned as the lead for project: ${updatedProject.details?.projectName || "Unnamed Project"}`,
      );
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
    }

    // Notify Admins of significant updates (if changes > 0)
    if (changes.length > 0) {
      await notifyAdmins(
        req.user.id,
        updatedProject._id,
        "UPDATE",
        "Project Details Updated",
        `${req.user.firstName} updated details for project #${updatedProject.orderId || updatedProject._id}: ${changes.join(", ")}`,
      );
    }

    // [New] Notify Production Team on Acceptance
    if (updatedProject.status === "Pending Production") {
      const productionUsers = await getProductionUsers();
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
      .populate("assistantLeadId", "firstName lastName employeeId email");

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
  "Pending Mockup",
  "Mockup Completed",
  "Pending Production",
  "Production Completed",
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

    await project.save();

    // Log Activity
    await logActivity(
      project._id,
      req.user._id,
      "engagement_acknowledge",
      `${department} department has acknowledged the project engagement.`,
      { department },
    );

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

    project.acknowledgements.splice(ackIndex, 1);
    await project.save();

    await logActivity(
      project._id,
      req.user._id,
      "engagement_unacknowledge",
      `${department} acknowledgement was removed by ${req.user.firstName} ${req.user.lastName}.`,
      { department },
    );

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
  getUserStats,
  getProjectById,
  addItemToProject,
  deleteItemFromProject,
  setProjectHold,
  updateProjectStatus,
  markInvoiceSent,
  verifyPayment,
  undoInvoiceSent,
  undoPaymentVerification,
  uploadProjectMockup,
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
