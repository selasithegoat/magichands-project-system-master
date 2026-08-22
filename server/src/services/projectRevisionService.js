const mongoose = require("mongoose");
const Project = require("../models/Project");
const ProjectRevision = require("../models/ProjectRevision");

const SECTION_LABELS = Object.freeze({
  overview: "Overview",
  project_details: "Project Details",
  items: "Order Items",
  files: "Files & References",
  people_departments: "People & Departments",
  risks_challenges: "Risks & Challenges",
});

const SCALAR_FIELDS = [
  ["overview", "orderId", "Order Number"],
  ["overview", "projectType", "Project Type"],
  ["overview", "priority", "Priority"],
  ["overview", "details.projectName", "Project Name"],
  ["overview", "details.client", "Client"],
  ["overview", "details.clientEmail", "Client Email"],
  ["overview", "details.clientPhone", "Client Phone"],
  ["overview", "details.briefOverview", "Brief Overview"],
  ["project_details", "orderDate", "Order Date"],
  ["project_details", "receivedTime", "Received Time"],
  ["project_details", "details.deliveryDate", "Delivery Date"],
  ["project_details", "details.deliveryTime", "Delivery Time"],
  ["project_details", "details.deliveryLocation", "Delivery Location"],
  ["project_details", "details.contactType", "Contact Type"],
  ["project_details", "details.supplySource", "Supply Source"],
  ["project_details", "details.packagingType", "Packaging Type"],
  ["project_details", "workstreamCode", "Workstream Code"],
  ["project_details", "sampleRequirement.isRequired", "Sample Required"],
  ["project_details", "corporateEmergency.isEnabled", "Corporate Emergency"],
  ["files", "details.sampleImage", "Primary Reference Image"],
  ["files", "details.sampleImageNote", "Primary Reference Image Note"],
  ["people_departments", "projectLeadId", "Project Lead"],
  ["people_departments", "assistantLeadId", "Assistant Lead"],
];

const ARRAY_FIELDS = [
  ["files", "details.attachments", "Reference Materials"],
  ["files", "referenceProjects", "Reference Orders"],
  ["files", "mockup.versions", "Mockup Files"],
  ["people_departments", "departments", "Engaged Departments"],
  ["risks_challenges", "uncontrollableFactors", "Uncontrollable Factors"],
  ["risks_challenges", "productionRisks", "Production Risks"],
  ["risks_challenges", "challenges", "Project Challenges"],
];

const ITEM_FIELDS = [
  ["description", "Description"],
  ["breakdown", "Detailed Specs"],
  ["qty", "Quantity"],
  ["productionAssignments", "Production Type & Scope"],
];

const toPlainValue = (value) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entry]) => [key, toPlainValue(entry)]),
    );
  }
  if (Array.isArray(value)) return value.map(toPlainValue);
  if (typeof value?.toObject === "function") {
    return toPlainValue(
      value.toObject({ depopulate: true, getters: false, virtuals: false }),
    );
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "__v")
        .map(([key, entry]) => [key, toPlainValue(entry)]),
    );
  }
  return value;
};

const getPathValue = (object, path) =>
  path.split(".").reduce((current, key) => current?.[key], object);

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
};

const valuesEqual = (left, right) =>
  JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));

const isEmptyRevisionValue = (value) =>
  value === null ||
  value === undefined ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);

const resolveChangeType = (before, after) => {
  if (isEmptyRevisionValue(before) && !isEmptyRevisionValue(after)) return "added";
  if (!isEmptyRevisionValue(before) && isEmptyRevisionValue(after)) return "removed";
  return "updated";
};

const getItemIdentity = (item, index, allowIndexFallback = true) => {
  const id = item?._id || item?.id;
  if (id) return `id:${String(id)}`;
  return allowIndexFallback ? `index:${index}` : "";
};

const getItemLabel = (item, index) => {
  const description = String(item?.description || "").trim();
  return description ? `Item “${description}”` : `Item ${index + 1}`;
};

const diffItems = (beforeItems, afterItems) => {
  const before = Array.isArray(beforeItems) ? beforeItems : [];
  const after = Array.isArray(afterItems) ? afterItems : [];
  const sharedIds = new Set(
    before
      .map((item) => String(item?._id || item?.id || ""))
      .filter(Boolean)
      .filter((id) =>
        after.some((item) => String(item?._id || item?.id || "") === id),
      ),
  );
  const useIds = sharedIds.size > 0;
  const beforeByKey = new Map(
    before.map((item, index) => [getItemIdentity(item, index, !useIds), { item, index }]),
  );
  const afterByKey = new Map(
    after.map((item, index) => [getItemIdentity(item, index, !useIds), { item, index }]),
  );
  const keys = new Set([...beforeByKey.keys(), ...afterByKey.keys()]);
  const changes = [];

  keys.forEach((key) => {
    const previous = beforeByKey.get(key);
    const next = afterByKey.get(key);
    if (!previous && next) {
      changes.push({
        section: "items",
        field: `items.${next.index}`,
        label: getItemLabel(next.item, next.index),
        changeType: "added",
        before: null,
        after: next.item,
      });
      return;
    }
    if (previous && !next) {
      changes.push({
        section: "items",
        field: `items.${previous.index}`,
        label: getItemLabel(previous.item, previous.index),
        changeType: "removed",
        before: previous.item,
        after: null,
      });
      return;
    }

    ITEM_FIELDS.forEach(([field, label]) => {
      const previousValue = previous.item?.[field] ?? null;
      const nextValue = next.item?.[field] ?? null;
      if (valuesEqual(previousValue, nextValue)) return;
      changes.push({
        section: "items",
        field: `items.${next.index}.${field}`,
        label: `${getItemLabel(next.item, next.index)} — ${label}`,
        changeType: resolveChangeType(previousValue, nextValue),
        before: previousValue,
        after: nextValue,
      });
    });
  });

  return changes;
};

const captureProjectRevisionState = (project) => {
  const plain = toPlainValue(project) || {};
  const values = {};
  [...SCALAR_FIELDS, ...ARRAY_FIELDS].forEach(([, path]) => {
    values[path] = toPlainValue(getPathValue(plain, path));
  });
  values.items = toPlainValue(plain.items || []);

  return {
    __projectRevisionState: true,
    projectId: String(plain._id || ""),
    projectVersionNumber: Math.max(Number(plain.versionNumber) || 1, 1),
    legacyRevisionCount: Math.max(Number(plain.orderRevisionCount) || 0, 0),
    values,
  };
};

const ensureRevisionState = (value) =>
  value?.__projectRevisionState ? value : captureProjectRevisionState(value);

const buildProjectRevisionChanges = (beforeProject, afterProject) => {
  const before = ensureRevisionState(beforeProject);
  const after = ensureRevisionState(afterProject);
  const changes = [];

  SCALAR_FIELDS.forEach(([section, field, label]) => {
    const previousValue = before.values[field];
    const nextValue = after.values[field];
    if (valuesEqual(previousValue, nextValue)) return;
    changes.push({
      section,
      field,
      label,
      changeType: resolveChangeType(previousValue, nextValue),
      before: previousValue,
      after: nextValue,
    });
  });

  ARRAY_FIELDS.forEach(([section, field, label]) => {
    const previousValue = before.values[field] || [];
    const nextValue = after.values[field] || [];
    if (valuesEqual(previousValue, nextValue)) return;
    changes.push({
      section,
      field,
      label,
      changeType: resolveChangeType(previousValue, nextValue),
      before: previousValue,
      after: nextValue,
    });
  });

  changes.push(...diffItems(before.values.items, after.values.items));
  return changes;
};

const getActorName = (actor) => {
  const firstName = String(actor?.firstName || "").trim();
  const lastName = String(actor?.lastName || "").trim();
  const fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
  return fullName || String(actor?.name || actor?.employeeId || "Unknown User");
};

const cleanText = (value, maxLength) =>
  String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);

const attachTrackingToDocument = (project, tracking) => {
  if (!project || !tracking) return;
  project.revisionTracking = tracking;
};

const recordProjectRevision = async ({
  projectId,
  before,
  after,
  actor,
  reason = "",
  source = "project_edit",
}) => {
  const beforeState = ensureRevisionState(before);
  const afterState = ensureRevisionState(after);
  const changes = buildProjectRevisionChanges(beforeState, afterState);
  if (changes.length === 0) return null;

  const resolvedProjectId = projectId || afterState.projectId || beforeState.projectId;
  const actorId = actor?._id || actor?.id || actor;
  if (!mongoose.isValidObjectId(resolvedProjectId) || !mongoose.isValidObjectId(actorId)) {
    throw new Error("A valid project and actor are required to record a revision.");
  }

  const actorObjectId = new mongoose.Types.ObjectId(String(actorId));
  const actorName = getActorName(actor);
  const revisedAt = new Date();
  const sections = Array.from(new Set(changes.map((change) => change.section)));
  const firstStageSet = {
    "revisionTracking.currentRevision": {
      $add: [
        { $ifNull: ["$revisionTracking.currentRevision", 0] },
        1,
      ],
    },
  };
  const secondStageSet = {
    "revisionTracking.lastRevisedAt": revisedAt,
    "revisionTracking.lastRevisedBy": actorObjectId,
    "revisionTracking.lastRevisedByName": actorName,
  };
  sections.forEach((section) => {
    secondStageSet[`revisionTracking.sections.${section}`] = {
      revisionNumber: "$revisionTracking.currentRevision",
      updatedAt: revisedAt,
      updatedBy: actorObjectId,
      updatedByName: actorName,
    };
  });

  const trackingProject = await Project.findByIdAndUpdate(
    resolvedProjectId,
    [{ $set: firstStageSet }, { $set: secondStageSet }],
    { new: true },
  ).select("revisionTracking versionNumber");

  if (!trackingProject) throw new Error("Project not found while recording revision.");

  const revisionNumber = Number(trackingProject.revisionTracking?.currentRevision) || 1;
  const revision = await ProjectRevision.create({
    project: resolvedProjectId,
    revisionNumber,
    projectVersionNumber: Math.max(Number(afterState.projectVersionNumber) || 1, 1),
    actor: actorObjectId,
    actorName,
    source: cleanText(source, 80) || "project_edit",
    reason: cleanText(reason, 500),
    sections,
    changes,
    createdAt: revisedAt,
    updatedAt: revisedAt,
  });

  const tracking = toPlainValue(trackingProject.revisionTracking);
  attachTrackingToDocument(after, tracking);
  return revision;
};

const recordProjectRevisionSafely = async (options) => {
  try {
    return await recordProjectRevision(options);
  } catch (error) {
    console.error("Failed to record project revision:", error);
    return null;
  }
};

module.exports = {
  SECTION_LABELS,
  captureProjectRevisionState,
  buildProjectRevisionChanges,
  recordProjectRevision,
  recordProjectRevisionSafely,
};
