const { parseProjectDeliveryDeadline } = require("./projectDeadline");

const MINUTE_MS = 60 * 1000;
const CALCULATION_VERSION = 1;

const POST_PRODUCTION_MINUTES = Object.freeze({
  qualityControl: 30,
  photography: 30,
  deliveryPreparation: 30,
});

// Initial operational assumptions. These intentionally live in one place so
// production can calibrate them against actual completion data later.
const PRODUCTION_RATE_TABLE = Object.freeze({
  production: { setupMinutes: 30, unitsPerHour: 20 },
  dtf: { setupMinutes: 30, unitsPerHour: 40 },
  "uv-dtf": { setupMinutes: 30, unitsPerHour: 30 },
  "uv-printing": { setupMinutes: 30, unitsPerHour: 20 },
  engraving: { setupMinutes: 30, unitsPerHour: 15 },
  "large-format": { setupMinutes: 45, unitsPerHour: 10 },
  "digital-press": { setupMinutes: 30, unitsPerHour: 100 },
  "digital-heat-press": { setupMinutes: 30, unitsPerHour: 20 },
  "offset-press": { setupMinutes: 120, unitsPerHour: 500 },
  "screen-printing": { setupMinutes: 60, unitsPerHour: 30 },
  embroidery: { setupMinutes: 45, unitsPerHour: 12 },
  sublimation: { setupMinutes: 30, unitsPerHour: 20 },
  "digital-cutting": { setupMinutes: 30, unitsPerHour: 40 },
  "pvc-id": { setupMinutes: 30, unitsPerHour: 60 },
  "business-cards": { setupMinutes: 30, unitsPerHour: 250 },
  installation: { setupMinutes: 60, unitsPerHour: 5 },
  overseas: { setupMinutes: 60, unitsPerHour: 5 },
  woodme: { setupMinutes: 45, unitsPerHour: 10 },
  fabrication: { setupMinutes: 60, unitsPerHour: 5 },
  signage: { setupMinutes: 60, unitsPerHour: 8 },
  "local-outsourcing": { setupMinutes: 60, unitsPerHour: 10 },
  "outside-production": { setupMinutes: 60, unitsPerHour: 10 },
});

const normalizeToken = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");

const toPositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const roundMinutes = (value) => Math.max(0, Math.ceil(Number(value) || 0));

const getPackagingMinutes = (totalQuantity) => {
  const quantity = toPositiveNumber(totalQuantity);
  if (quantity <= 20) return 30;
  if (quantity <= 100) return 45;
  return 60;
};

const hasPhotographyStage = (project = {}) =>
  (Array.isArray(project?.departments) ? project.departments : []).some(
    (department) => normalizeToken(department) === "photography",
  );

const getPostProductionAllowance = (project = {}, totalQuantity = 0) => {
  // Quote sample production returns to quote submission rather than the
  // delivery workflow, so delivery-stage allowances do not apply.
  if (String(project?.projectType || "").trim().toLowerCase() === "quote") {
    return {
      totalMinutes: 0,
      qualityControlMinutes: 0,
      photographyMinutes: 0,
      packagingMinutes: 0,
      deliveryPreparationMinutes: 0,
    };
  }

  const photographyMinutes = hasPhotographyStage(project)
    ? POST_PRODUCTION_MINUTES.photography
    : 0;
  const packagingMinutes = getPackagingMinutes(totalQuantity);
  const totalMinutes =
    POST_PRODUCTION_MINUTES.qualityControl +
    photographyMinutes +
    packagingMinutes +
    POST_PRODUCTION_MINUTES.deliveryPreparation;

  return {
    totalMinutes,
    qualityControlMinutes: POST_PRODUCTION_MINUTES.qualityControl,
    photographyMinutes,
    packagingMinutes,
    deliveryPreparationMinutes: POST_PRODUCTION_MINUTES.deliveryPreparation,
  };
};

const getProductionRate = (department) =>
  PRODUCTION_RATE_TABLE[normalizeToken(department)] ||
  PRODUCTION_RATE_TABLE.production;

const estimateProductionWork = (project = {}) => {
  const items = Array.isArray(project?.items) ? project.items : [];
  const workstreamMinutes = new Map();
  let totalQuantity = 0;
  let itemLineCount = 0;

  items.forEach((item) => {
    const quantity = toPositiveNumber(item?.qty ?? item?.quantity);
    if (quantity <= 0) return;

    totalQuantity += quantity;
    itemLineCount += 1;

    const assignments = Array.isArray(item?.productionAssignments)
      ? item.productionAssignments
          .map((assignment) => normalizeToken(assignment?.department))
          .filter(Boolean)
      : [];
    const workstreams = assignments.length
      ? Array.from(new Set(assignments))
      : ["production"];

    workstreams.forEach((department) => {
      const rate = getProductionRate(department);
      const itemMinutes =
        rate.setupMinutes + (quantity / rate.unitsPerHour) * 60;
      workstreamMinutes.set(
        department,
        (workstreamMinutes.get(department) || 0) + itemMinutes,
      );
    });
  });

  const workstreams = Array.from(workstreamMinutes, ([department, minutes]) => ({
    department,
    minutes: roundMinutes(minutes),
  })).sort((left, right) => right.minutes - left.minutes);

  return {
    totalQuantity,
    itemLineCount,
    // Independent production units may work in parallel, so the longest
    // workstream determines the project estimate.
    estimatedProductionMinutes:
      workstreams.length > 0 ? Math.max(...workstreams.map((item) => item.minutes)) : 0,
    workstreams,
  };
};

const resolveProductionStartedAt = (project = {}, fallback = new Date()) => {
  const candidates = [
    project?.productionTracking?.startedAt,
    project?.statusChangedAt,
    fallback,
  ];
  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(fallback);
};

const calculateProductionTracking = (
  project = {},
  { now: nowValue = new Date(), predictedStartAt: predictedStartValue } = {},
) => {
  const now = new Date(nowValue);
  const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const startedAt = resolveProductionStartedAt(project, safeNow);
  const work = estimateProductionWork(project);
  const allowance = getPostProductionAllowance(project, work.totalQuantity);
  const deliveryDeadline = parseProjectDeliveryDeadline(project);
  const productionDueAt = deliveryDeadline
    ? new Date(deliveryDeadline.getTime() - allowance.totalMinutes * MINUTE_MS)
    : null;
  const requestedPredictedStart = predictedStartValue
    ? new Date(predictedStartValue)
    : startedAt;
  const predictedStartAt = Number.isNaN(requestedPredictedStart.getTime())
    ? startedAt
    : requestedPredictedStart;
  const estimatedProductionMinutes = work.estimatedProductionMinutes;
  const predictedCompletionAt = new Date(
    predictedStartAt.getTime() + estimatedProductionMinutes * MINUTE_MS,
  );
  const availableProductionMinutes = productionDueAt
    ? Math.max(
        0,
        Math.floor((productionDueAt.getTime() - safeNow.getTime()) / MINUTE_MS),
      )
    : null;
  const queueMinutes = Math.max(
    0,
    Math.ceil(
      (predictedStartAt.getTime() - Math.max(startedAt.getTime(), safeNow.getTime())) /
        MINUTE_MS,
    ),
  );

  const riskReasons = [];
  let riskLevel = "on_track";

  if (!deliveryDeadline) {
    riskLevel = "deadline_required";
    riskReasons.push("A delivery deadline is required before production can be planned.");
  } else if (safeNow.getTime() >= productionDueAt.getTime()) {
    riskLevel = "overdue";
    riskReasons.push("The production deadline has passed.");
  } else if (predictedCompletionAt.getTime() > productionDueAt.getTime()) {
    riskLevel = "at_risk";
    riskReasons.push("Predicted production completion is after the production deadline.");
  } else {
    const slackMinutes = Math.floor(
      (productionDueAt.getTime() - predictedCompletionAt.getTime()) / MINUTE_MS,
    );
    if (slackMinutes <= 60) {
      riskLevel = "attention";
      riskReasons.push("Production has one hour or less of schedule margin.");
    }
  }

  if (!project?.productionOwnerId) {
    riskReasons.push("A primary Production owner has not been assigned.");
    if (riskLevel === "on_track") riskLevel = "attention";
  }
  if (work.itemLineCount === 0) {
    riskReasons.push("No item quantities are available for the production estimate.");
    if (riskLevel === "on_track") riskLevel = "attention";
  }
  if (queueMinutes > 0) {
    riskReasons.push(`${queueMinutes} minute(s) of assigned production work are queued first.`);
  }

  return {
    startedAt,
    productionDueAt,
    predictedStartAt,
    predictedCompletionAt,
    estimatedProductionMinutes,
    availableProductionMinutes,
    queueMinutes,
    postProductionBufferMinutes: allowance.totalMinutes,
    postProductionAllowance: allowance,
    totalQuantity: work.totalQuantity,
    itemLineCount: work.itemLineCount,
    workstreams: work.workstreams,
    riskLevel,
    riskReasons,
    lastCalculatedAt: safeNow,
    calculationVersion: CALCULATION_VERSION,
  };
};

module.exports = {
  CALCULATION_VERSION,
  POST_PRODUCTION_MINUTES,
  PRODUCTION_RATE_TABLE,
  calculateProductionTracking,
  estimateProductionWork,
  getPackagingMinutes,
  getPostProductionAllowance,
};
