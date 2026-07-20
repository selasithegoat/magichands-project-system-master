const fs = require("fs");
const mongoose = require("mongoose");
const ProjectCreationDraft = require("../models/ProjectCreationDraft");
const upload = require("../middleware/upload");
const {
  DRAFT_FILE_GROUPS,
  parseMaybeJson,
  canManageProjectCreationDrafts,
  normalizeDraftType,
  recoverStaleProjectCreationDraftFinalizations,
} = require("../services/projectCreationDraftService");

const MAX_DRAFT_PAYLOAD_BYTES = (() => {
  const configured = Number.parseInt(process.env.PROJECT_DRAFT_MAX_PAYLOAD_BYTES, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 2_000_000;
})();

const GROUP_ALIASES = {
  attachments: ["attachments", "referenceFiles", "files"],
  sampleImage: ["sampleImage", "sampleImages"],
  clientMockup: ["clientMockup", "clientMockups"],
  approvedMockup: ["approvedMockup", "approvedMockups"],
};

const NOTE_FIELD_BY_GROUP = {
  attachments: "attachmentNotes",
  sampleImage: "sampleImageNote",
  clientMockup: "clientMockupNotes",
  approvedMockup: "approvedMockupNotes",
};

const toText = (value) => String(value ?? "").trim();

const sendControllerError = (res, error, fallbackMessage) => {
  const statusCode = Number(error?.statusCode) || 500;
  if (statusCode >= 500) {
    console.error(fallbackMessage, error);
  }
  return res.status(statusCode).json({
    message: statusCode >= 500 ? fallbackMessage : error.message,
  });
};

const assertDraftManager = (req) => {
  if (!canManageProjectCreationDrafts(req.user)) {
    const error = new Error(
      "Only Front Desk and Admin users can manage project creation drafts.",
    );
    error.statusCode = 403;
    throw error;
  }
};

const getOwnerId = (req) => req.user?._id || req.user?.id;

const parseJsonField = (value, fieldName, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    const error = new Error(`${fieldName} must contain valid JSON.`);
    error.statusCode = 400;
    throw error;
  }
};

const readPayload = (body, { required = false } = {}) => {
  const hasPayload = Object.prototype.hasOwnProperty.call(body || {}, "payload");
  const hasFormData = Object.prototype.hasOwnProperty.call(body || {}, "formData");
  if (!hasPayload && !hasFormData) {
    if (required) return {};
    return undefined;
  }

  const payload = parseJsonField(
    hasPayload ? body.payload : body.formData,
    hasPayload ? "payload" : "formData",
    {},
  );
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    const error = new Error("Draft payload must be a JSON object.");
    error.statusCode = 400;
    throw error;
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > MAX_DRAFT_PAYLOAD_BYTES) {
    const error = new Error(
      `Draft form data is too large. Maximum metadata size is ${MAX_DRAFT_PAYLOAD_BYTES} bytes.`,
    );
    error.statusCode = 413;
    throw error;
  }
  return payload;
};

const parseStringList = (value) => {
  const parsed = parseMaybeJson(value, value);
  const source = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  return source.map((entry) => toText(entry)).filter(Boolean);
};

const getAliasedValue = (value, group) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { present: false, value: undefined };
  }
  for (const alias of GROUP_ALIASES[group]) {
    if (Object.prototype.hasOwnProperty.call(value, alias)) {
      return { present: true, value: value[alias] };
    }
  }
  return { present: false, value: undefined };
};

const normalizeRetainedFileIds = (body) => {
  const parsed = parseJsonField(body?.retainedFileIds, "retainedFileIds", {});
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    const error = new Error("retainedFileIds must be a JSON object.");
    error.statusCode = 400;
    throw error;
  }

  return DRAFT_FILE_GROUPS.reduce((result, group) => {
    const aliased = getAliasedValue(parsed, group);
    if (aliased.present) {
      result[group] = {
        present: true,
        ids: new Set(parseStringList(aliased.value)),
      };
    } else {
      result[group] = { present: false, ids: new Set() };
    }
    return result;
  }, {});
};

const normalizeFileMetadata = (body) => {
  const parsed = parseJsonField(body?.fileMetadata, "fileMetadata", []);
  const flattened = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? DRAFT_FILE_GROUPS.flatMap((group) => {
          const aliased = getAliasedValue(parsed, group);
          return Array.isArray(aliased.value)
            ? aliased.value.map((entry) => ({ ...entry, fieldName: group }))
            : [];
        })
      : [];

  const metadata = new Map();
  flattened.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const id = toText(entry._id || entry.id || entry.fileId);
    if (!id) return;
    metadata.set(id, {
      note: entry.note === undefined ? undefined : String(entry.note || ""),
      order:
        entry.order === undefined || !Number.isFinite(Number(entry.order))
          ? undefined
          : Math.max(0, Number(entry.order)),
    });
  });
  return metadata;
};

const getRequestFilesByGroup = (req, group) => {
  if (!req.files || Array.isArray(req.files)) return [];
  return Array.isArray(req.files[group]) ? req.files[group] : [];
};

const getNotesForGroup = (body, group) => {
  const fieldName = NOTE_FIELD_BY_GROUP[group];
  const value = body?.[fieldName];
  if (group === "sampleImage") return [String(value || "")];
  const parsed = parseMaybeJson(value, value);
  if (Array.isArray(parsed)) return parsed.map((entry) => String(entry || ""));
  return value === undefined || value === null ? [] : [String(value || "")];
};

const getDraftUploadPrefix = (draft) =>
  `/uploads/project-drafts/user-${String(draft.owner)}/draft-${String(draft._id)}/`;

const isFileOwnedByDraft = (draft, fileUrl) =>
  toText(fileUrl).replace(/\\/g, "/").startsWith(getDraftUploadPrefix(draft));

const removeStoredFiles = async (draft, files) => {
  const failures = [];
  await Promise.all(
    (Array.isArray(files) ? files : []).map(async (entry) => {
      if (!isFileOwnedByDraft(draft, entry?.fileUrl)) {
        failures.push(entry?.fileUrl || "unknown file");
        return;
      }
      const filePath = upload.resolveUploadPathFromUrl(entry.fileUrl);
      if (!filePath) {
        failures.push(entry.fileUrl);
        return;
      }
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.error("Failed to remove project draft file:", error);
          failures.push(entry.fileUrl);
        }
      }
    }),
  );
  return failures;
};

const cleanupNewRequestFiles = async (req) => {
  try {
    await upload.cleanupRequestFiles(req);
  } catch (error) {
    console.error("Failed to clean up project draft request files:", error);
  }
};

const buildNewFileRecords = (req, group, startOrder) => {
  const notes = getNotesForGroup(req.body, group);
  return getRequestFilesByGroup(req, group).map((file, index) => ({
    _id: new mongoose.Types.ObjectId(),
    fieldName: group,
    fileUrl: `/uploads/${file.filename}`,
    fileName: file.originalname || file.filename || "",
    fileType: file.mimetype || "",
    size: Number(file.size) || 0,
    note: notes[index] || "",
    order: startOrder + index,
    uploadedAt: new Date(),
  }));
};

const sortFiles = (files) =>
  [...files].sort((left, right) => {
    const orderDifference = (Number(left.order) || 0) - (Number(right.order) || 0);
    if (orderDifference !== 0) return orderDifference;
    return new Date(left.uploadedAt || 0) - new Date(right.uploadedAt || 0);
  });

const applyFileChanges = (draft, req, retainedByGroup, metadataById) => {
  const removedFiles = [];
  if (!draft.files) draft.files = {};

  DRAFT_FILE_GROUPS.forEach((group) => {
    const original = Array.isArray(draft.files[group])
      ? Array.from(draft.files[group])
      : [];
    const retention = retainedByGroup[group];
    let retained = retention.present
      ? original.filter((entry) => retention.ids.has(String(entry._id)))
      : original;
    const incomingFiles = getRequestFilesByGroup(req, group);

    if (group === "sampleImage" && incomingFiles.length > 0) {
      retained = [];
    }

    const retainedIds = new Set(retained.map((entry) => String(entry._id)));
    original.forEach((entry) => {
      if (!retainedIds.has(String(entry._id))) removedFiles.push(entry);
    });

    retained.forEach((entry) => {
      const metadata = metadataById.get(String(entry._id));
      if (!metadata) return;
      if (metadata.note !== undefined) entry.note = metadata.note;
      if (metadata.order !== undefined) entry.order = metadata.order;
    });

    const nextOrder = retained.reduce(
      (maximum, entry) => Math.max(maximum, Number(entry.order) || 0),
      -1,
    ) + 1;
    const newRecords = buildNewFileRecords(req, group, nextOrder);
    draft.files[group] = sortFiles([...retained, ...newRecords]);
  });

  draft.markModified("files");
  return removedFiles;
};

const inferDraftType = (payload, currentType = "project") =>
  normalizeDraftType(
    payload?.draftType || payload?.type || currentType,
    payload,
  );

const persistDraftRequest = async (req, draft, { isNew = false } = {}) => {
  const payload = readPayload(req.body, { required: isNew });
  const retainedByGroup = normalizeRetainedFileIds(req.body);
  const metadataById = normalizeFileMetadata(req.body);
  const expectedRevision = Number.parseInt(req.body?.revision, 10);
  if (
    !isNew &&
    Number.isFinite(expectedRevision) &&
    expectedRevision > 0 &&
    expectedRevision !== draft.revision
  ) {
    const error = new Error(
      "This draft changed after it was loaded. Reload it before saving again.",
    );
    error.statusCode = 409;
    throw error;
  }

  if (payload !== undefined) {
    draft.formData = payload;
    draft.draftType = inferDraftType(payload, draft.draftType);
    draft.markModified("formData");
  }
  const removedFiles = applyFileChanges(
    draft,
    req,
    retainedByGroup,
    metadataById,
  );
  draft.status = "active";
  draft.lastSavedAt = new Date();
  draft.revision = isNew ? 1 : (Number(draft.revision) || 0) + 1;
  try {
    await draft.save();
  } catch (error) {
    if (
      !isNew &&
      ["VersionError", "DocumentNotFoundError"].includes(error?.name)
    ) {
      const conflictError = new Error(
        "This draft changed after it was loaded. Reload it before saving again.",
      );
      conflictError.statusCode = 409;
      throw conflictError;
    }
    throw error;
  }

  const cleanupFailures = await removeStoredFiles(draft, removedFiles);
  return { draft, cleanupFailures };
};

const getNestedFormData = (formData) => {
  if (!formData || typeof formData !== "object") return {};
  return formData.formData && typeof formData.formData === "object"
    ? formData.formData
    : formData;
};

const serializeDraft = (draft) => {
  const value = draft?.toObject ? draft.toObject() : { ...(draft || {}) };
  const nested = getNestedFormData(value.formData);
  const fileCount = DRAFT_FILE_GROUPS.reduce(
    (total, group) => total + (Array.isArray(value.files?.[group]) ? value.files[group].length : 0),
    0,
  );
  const projectName = toText(nested.projectName || nested.name);
  const orderId = toText(
    nested.orderId || nested.orderNumber || nested.quoteNumber,
  );
  const client = toText(nested.client || nested.clientName);

  return {
    ...value,
    projectName,
    orderId,
    client,
    fileCount,
    resumePath:
      value.draftType === "quote" ? "/create/quote" : "/new-orders/form",
    summary: {
      projectName,
      orderId,
      client,
      fileCount,
    },
  };
};

const prepareNewDraftUpload = (req, res, next) => {
  try {
    assertDraftManager(req);
    req.projectCreationDraftUploadId = new mongoose.Types.ObjectId();
    return next();
  } catch (error) {
    return sendControllerError(res, error, "Unable to prepare project draft upload.");
  }
};

const prepareExistingDraftUpload = async (req, res, next) => {
  try {
    assertDraftManager(req);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid project creation draft ID." });
    }
    await recoverStaleProjectCreationDraftFinalizations(getOwnerId(req));
    const draft = await ProjectCreationDraft.findOne({
      _id: req.params.id,
      owner: getOwnerId(req),
    });
    if (!draft) {
      return res.status(404).json({ message: "Project creation draft not found." });
    }
    if (draft.status !== "active") {
      return res.status(409).json({
        message:
          draft.status === "finalizing"
            ? "This project creation draft is currently being finalized."
            : "This project creation draft is already finalized.",
      });
    }
    req.projectCreationDraftForUpload = draft;
    req.projectCreationDraftUploadId = draft._id;
    return next();
  } catch (error) {
    return sendControllerError(res, error, "Unable to prepare project draft upload.");
  }
};

const createProjectCreationDraft = async (req, res) => {
  try {
    assertDraftManager(req);
    const draft = new ProjectCreationDraft({
      _id: req.projectCreationDraftUploadId || new mongoose.Types.ObjectId(),
      owner: getOwnerId(req),
      formData: {},
      files: {},
    });
    const result = await persistDraftRequest(req, draft, { isNew: true });
    return res.status(201).json({
      draft: serializeDraft(result.draft),
      ...(result.cleanupFailures.length > 0
        ? { cleanupWarning: "Some replaced files could not be removed." }
        : {}),
    });
  } catch (error) {
    await cleanupNewRequestFiles(req);
    return sendControllerError(res, error, "Unable to save project creation draft.");
  }
};

const listProjectCreationDrafts = async (req, res) => {
  try {
    assertDraftManager(req);
    await recoverStaleProjectCreationDraftFinalizations(getOwnerId(req));
    const drafts = await ProjectCreationDraft.find({
      owner: getOwnerId(req),
      status: "active",
    }).sort({ updatedAt: -1 });
    return res.json({ drafts: drafts.map(serializeDraft) });
  } catch (error) {
    return sendControllerError(res, error, "Unable to load project creation drafts.");
  }
};

const getProjectCreationDraft = async (req, res) => {
  try {
    assertDraftManager(req);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid project creation draft ID." });
    }
    await recoverStaleProjectCreationDraftFinalizations(getOwnerId(req));
    const draft = await ProjectCreationDraft.findOne({
      _id: req.params.id,
      owner: getOwnerId(req),
      status: "active",
    });
    if (!draft) {
      return res.status(404).json({ message: "Project creation draft not found." });
    }
    return res.json({ draft: serializeDraft(draft) });
  } catch (error) {
    return sendControllerError(res, error, "Unable to load project creation draft.");
  }
};

const updateProjectCreationDraft = async (req, res) => {
  try {
    assertDraftManager(req);
    const draft = req.projectCreationDraftForUpload;
    if (!draft) {
      const error = new Error("Project creation draft not found.");
      error.statusCode = 404;
      throw error;
    }
    const result = await persistDraftRequest(req, draft);
    return res.json({
      draft: serializeDraft(result.draft),
      ...(result.cleanupFailures.length > 0
        ? { cleanupWarning: "Some replaced files could not be removed." }
        : {}),
    });
  } catch (error) {
    await cleanupNewRequestFiles(req);
    return sendControllerError(res, error, "Unable to update project creation draft.");
  }
};

const deleteProjectCreationDraft = async (req, res) => {
  try {
    assertDraftManager(req);
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid project creation draft ID." });
    }
    await recoverStaleProjectCreationDraftFinalizations(getOwnerId(req));
    const draft = await ProjectCreationDraft.findOneAndDelete({
      _id: req.params.id,
      owner: getOwnerId(req),
      status: "active",
    });
    if (!draft) {
      const existingDraft = await ProjectCreationDraft.findOne({
        _id: req.params.id,
        owner: getOwnerId(req),
      })
        .select("status")
        .lean();
      if (existingDraft) {
        return res.status(409).json({
          message:
            existingDraft.status === "finalizing"
              ? "This draft is currently being finalized and cannot be discarded."
              : "This project creation draft has already been finalized.",
        });
      }
      return res
        .status(404)
        .json({ message: "Project creation draft not found." });
    }

    const files = DRAFT_FILE_GROUPS.flatMap((group) =>
      Array.isArray(draft.files?.[group]) ? Array.from(draft.files[group]) : [],
    );
    const cleanupFailures = await removeStoredFiles(draft, files);
    return res.json({
      message: "Project creation draft discarded.",
      id: String(draft._id),
      ...(cleanupFailures.length > 0
        ? {
            cleanupWarning:
              "The draft was discarded, but some orphaned files could not be removed.",
          }
        : {}),
    });
  } catch (error) {
    return sendControllerError(res, error, "Unable to discard project creation draft.");
  }
};

const submitProjectCreationDraft = async (req, res) => {
  try {
    assertDraftManager(req);
    const draft = req.projectCreationDraftForUpload;
    if (!draft) {
      const error = new Error("Project creation draft not found.");
      error.statusCode = 404;
      throw error;
    }

    const submittedBody = { ...(req.body || {}) };
    await persistDraftRequest(req, draft);

    req.files = {};
    req.body = {
      ...submittedBody,
      draftId: String(draft._id),
      draftRevision: Number(draft.revision) || 1,
    };
    delete req.body.payload;
    delete req.body.formData;
    delete req.body.retainedFileIds;
    delete req.body.fileMetadata;
    delete req.body.revision;

    const { createProject } = require("./projectController");
    return createProject(req, res);
  } catch (error) {
    await cleanupNewRequestFiles(req);
    return sendControllerError(res, error, "Unable to finalize project creation draft.");
  }
};

module.exports = {
  prepareNewDraftUpload,
  prepareExistingDraftUpload,
  createProjectCreationDraft,
  listProjectCreationDrafts,
  getProjectCreationDraft,
  updateProjectCreationDraft,
  deleteProjectCreationDraft,
  submitProjectCreationDraft,
};
