const mongoose = require("mongoose");
const Project = require("../models/Project");
const ProjectCreationDraft = require("../models/ProjectCreationDraft");

const DRAFT_FILE_GROUPS = [
  "attachments",
  "sampleImage",
  "clientMockup",
  "approvedMockup",
];

const FINALIZATION_LEASE_MS = (() => {
  const configured = Number.parseInt(
    process.env.PROJECT_DRAFT_FINALIZATION_LEASE_MS,
    10,
  );
  return Number.isFinite(configured) && configured >= 60_000
    ? configured
    : 15 * 60_000;
})();

const toText = (value) => String(value ?? "").trim();

const parseMaybeJson = (value, fallback = value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
};

const toDepartmentList = (user) =>
  (Array.isArray(user?.department) ? user.department : [user?.department])
    .map((entry) => toText(entry).toLowerCase())
    .filter(Boolean);

const canManageProjectCreationDrafts = (user) =>
  Boolean(
    user &&
      (user.role === "admin" || toDepartmentList(user).includes("front desk")),
  );

const normalizeDraftType = (value, formData = {}) => {
  const raw = toText(value).toLowerCase();
  if (raw === "quote" || raw.includes("quote")) return "quote";

  const nested =
    formData && typeof formData === "object" && formData.formData
      ? formData.formData
      : formData;
  const projectType = toText(nested?.projectType).toLowerCase();
  return projectType === "quote" ? "quote" : "project";
};

const getDraftIdFromRequest = (req) =>
  toText(
    req.body?.draftId ||
      req.body?.projectCreationDraftId ||
      req.query?.draftId ||
      req.headers?.["x-project-draft-id"],
  );

const getDraftRevisionFromRequest = (req) => {
  const parsed = Number.parseInt(
    req.body?.draftRevision ||
      req.query?.draftRevision ||
      req.headers?.["x-project-draft-revision"],
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getReferenceProjectIds = (value) => {
  const parsed = parseMaybeJson(value, value);
  const source = Array.isArray(parsed) ? parsed : [];
  const seen = new Set();
  return source
    .map((entry) => {
      if (entry && typeof entry === "object") {
        return toText(entry._id || entry.id || entry.value || entry.project);
      }
      return toText(entry);
    })
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
};

const buildProjectPayloadFromDraft = (draft) => {
  const envelope =
    draft?.formData && typeof draft.formData === "object"
      ? draft.formData
      : {};
  const nested =
    envelope.formData && typeof envelope.formData === "object"
      ? envelope.formData
      : envelope;
  const payload = { ...nested };

  const setAlias = (target, ...candidates) => {
    if (payload[target] !== undefined && payload[target] !== null) return;
    const match = candidates.find(
      (value) => value !== undefined && value !== null && value !== "",
    );
    if (match !== undefined) payload[target] = match;
  };

  setAlias("orderId", nested.orderNumber, nested.quoteNumber);
  setAlias("client", nested.clientName);
  setAlias("projectName", nested.name);
  setAlias("briefOverview", nested.description);

  const draftType = normalizeDraftType(
    envelope.draftType || draft?.draftType,
    envelope,
  );
  if (!payload.projectType) {
    payload.projectType = draftType === "quote" ? "Quote" : "Standard";
  }
  if (!payload.status) {
    payload.status = draftType === "quote" ? "Quote Created" : "Order Created";
  }

  if (draftType === "quote" && !payload.quoteDetails) {
    payload.quoteDetails = {
      quoteNumber: toText(payload.orderId || nested.quoteNumber),
      checklist:
        nested.checklist && typeof nested.checklist === "object"
          ? nested.checklist
          : {},
    };
  }

  const referenceSource =
    envelope.selectedReferenceProjects ??
    nested.selectedReferenceProjects ??
    nested.referenceProjectIds ??
    nested.referenceProjects;
  const referenceProjectIds = getReferenceProjectIds(referenceSource);
  if (referenceProjectIds.length > 0) {
    payload.referenceProjectIds = referenceProjectIds;
  }

  return payload;
};

const getDraftFileName = (fileUrl) => {
  const normalized = toText(fileUrl)
    .split("?")[0]
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalized.toLowerCase().startsWith("uploads/")) return "";
  return normalized.slice("uploads/".length);
};

const toMulterLikeDraftFile = (file) => {
  const filename = getDraftFileName(file?.fileUrl);
  if (!filename) return null;
  return {
    fieldname: file.fieldName,
    originalname: file.fileName || filename.split("/").pop() || "",
    encoding: "7bit",
    mimetype: file.fileType || "application/octet-stream",
    size: Number(file.size) || 0,
    filename,
    path: "",
    isPersistedProjectCreationDraftFile: true,
    projectCreationDraftFileId: String(file._id || ""),
  };
};

const parseNoteList = (value) => {
  const parsed = parseMaybeJson(value, value);
  if (Array.isArray(parsed)) return parsed.map((entry) => toText(entry));
  const single = toText(parsed);
  return single ? [single] : [];
};

const getRequestFileGroups = (req) => {
  if (!req.files || Array.isArray(req.files)) return {};
  return req.files;
};

const mergeDraftFilesIntoRequest = (req, draft) => {
  const requestGroups = getRequestFileGroups(req);
  const nextGroups = { ...requestGroups };
  const draftFileUrls = new Set();

  for (const group of DRAFT_FILE_GROUPS) {
    const storedFiles = Array.isArray(draft?.files?.[group])
      ? draft.files[group]
      : [];
    storedFiles.forEach((entry) => draftFileUrls.add(toText(entry.fileUrl)));

    const synthesized = storedFiles
      .map(toMulterLikeDraftFile)
      .filter(Boolean);
    const incoming = Array.isArray(requestGroups[group])
      ? requestGroups[group]
      : [];

    if (group === "sampleImage") {
      nextGroups[group] = incoming.length > 0 ? incoming.slice(-1) : synthesized.slice(-1);
    } else {
      const seen = new Set();
      nextGroups[group] = [...synthesized, ...incoming].filter((file) => {
        const key = toText(file.filename || file.path || file.originalname);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    const notesField =
      group === "attachments"
        ? "attachmentNotes"
        : group === "sampleImage"
          ? "sampleImageNote"
          : `${group}Notes`;
    const draftNotes = storedFiles.map((entry) => toText(entry.note));
    const requestNotes = parseNoteList(req.body?.[notesField]);
    if (group === "sampleImage") {
      if (incoming.length === 0 && storedFiles.length > 0) {
        req.body[notesField] = draftNotes[draftNotes.length - 1] || "";
      }
    } else if (synthesized.length > 0) {
      req.body[notesField] = JSON.stringify([...draftNotes, ...requestNotes]);
    }
  }

  req.files = nextGroups;

  if (draftFileUrls.size > 0) {
    const existingAttachments = parseMaybeJson(
      req.body.existingAttachments,
      req.body.existingAttachments,
    );
    if (Array.isArray(existingAttachments)) {
      req.body.existingAttachments = JSON.stringify(
        existingAttachments.filter((entry) => {
          const url = toText(
            typeof entry === "string"
              ? entry
              : entry?.fileUrl || entry?.url || entry?.path,
          );
          return !draftFileUrls.has(url);
        }),
      );
    }

    if (draftFileUrls.has(toText(req.body.existingSampleImage))) {
      req.body.existingSampleImage = "";
    }
  }
};

const findExistingFinalizedProject = async (draft) => {
  if (draft?.finalizedProject) {
    const byReference = await Project.findById(draft.finalizedProject);
    if (byReference) return byReference;
  }
  return Project.findOne({ creationDraftId: draft?._id });
};

const prepareProjectCreationFromDraft = async (req) => {
  const draftId = getDraftIdFromRequest(req);
  if (!draftId) return null;
  const expectedRevision = getDraftRevisionFromRequest(req);

  if (!mongoose.isValidObjectId(draftId)) {
    const error = new Error("Invalid project creation draft ID.");
    error.statusCode = 400;
    throw error;
  }
  if (!canManageProjectCreationDrafts(req.user)) {
    const error = new Error(
      "Only Front Desk and Admin users can finalize project creation drafts.",
    );
    error.statusCode = 403;
    throw error;
  }

  let draft = await ProjectCreationDraft.findOne({
    _id: draftId,
    owner: req.user?._id || req.user?.id,
  });
  if (!draft) {
    const error = new Error("Project creation draft not found.");
    error.statusCode = 404;
    throw error;
  }

  const existingProject = await findExistingFinalizedProject(draft);
  if (existingProject) {
    return { draft, existingProject };
  }
  if (draft.status === "finalized") {
    const error = new Error(
      "This draft was finalized, but its project could not be found.",
    );
    error.statusCode = 409;
    throw error;
  }

  const now = new Date();
  const staleBefore = new Date(now.getTime() - FINALIZATION_LEASE_MS);
  const finalizationToken = String(new mongoose.Types.ObjectId());
  const claimedDraft = await ProjectCreationDraft.findOneAndUpdate(
    {
      _id: draft._id,
      owner: draft.owner,
      ...(expectedRevision ? { revision: expectedRevision } : {}),
      $or: [
        { status: "active" },
        {
          status: "finalizing",
          finalizationStartedAt: { $lte: staleBefore },
        },
        { status: "finalizing", finalizationStartedAt: null },
      ],
    },
    {
      $set: {
        status: "finalizing",
        finalizationStartedAt: now,
        finalizationToken,
      },
      $inc: { __v: 1 },
    },
    { new: true },
  ).select("+finalizationToken");

  if (!claimedDraft) {
    draft = await ProjectCreationDraft.findOne({
      _id: draftId,
      owner: req.user?._id || req.user?.id,
    });
    if (!draft) {
      const error = new Error("Project creation draft not found.");
      error.statusCode = 404;
      throw error;
    }

    const projectCreatedByAnotherRequest = await findExistingFinalizedProject(
      draft,
    );
    if (projectCreatedByAnotherRequest) {
      return { draft, existingProject: projectCreatedByAnotherRequest };
    }

    const error = new Error(
      expectedRevision && Number(draft.revision) !== expectedRevision
        ? "This draft changed after it was saved for creation. Reload it and try again."
        : draft.status === "finalizing"
        ? "This draft is currently being finalized. Please try again shortly."
        : "This draft changed before it could be finalized. Reload it and try again.",
    );
    error.statusCode = 409;
    throw error;
  }

  draft = claimedDraft;

  const submittedBody = { ...(req.body || {}) };
  delete submittedBody.payload;
  delete submittedBody.formData;
  delete submittedBody.retainedFileIds;
  delete submittedBody.fileMetadata;

  req.body = {
    ...buildProjectPayloadFromDraft(draft),
    ...submittedBody,
    draftId: String(draft._id),
  };
  mergeDraftFilesIntoRequest(req, draft);
  req.projectCreationDraft = draft;
  return { draft, existingProject: null };
};

const markProjectCreationDraftFinalized = async ({ draft, project }) => {
  if (!draft?._id || !project?._id) return;
  await ProjectCreationDraft.updateOne(
    { _id: draft._id, owner: draft.owner },
    {
      $set: {
        status: "finalized",
        finalizationStartedAt: null,
        finalizationToken: "",
        finalizedProject: project._id,
        finalizedAt: new Date(),
      },
      $inc: { __v: 1 },
    },
  );
};

const releaseProjectCreationDraftFinalization = async (draft) => {
  if (!draft?._id) return;
  await ProjectCreationDraft.updateOne(
    {
      _id: draft._id,
      owner: draft.owner,
      status: "finalizing",
      finalizedProject: null,
      finalizationToken: draft.finalizationToken,
    },
    {
      $set: {
        status: "active",
        finalizationStartedAt: null,
        finalizationToken: "",
      },
      $inc: { __v: 1 },
    },
  );
};

const recoverStaleProjectCreationDraftFinalizations = async (owner) => {
  if (!owner) return;
  const staleBefore = new Date(Date.now() - FINALIZATION_LEASE_MS);
  const staleQuery = {
    owner,
    status: "finalizing",
    $or: [
      { finalizationStartedAt: { $lte: staleBefore } },
      { finalizationStartedAt: null },
    ],
  };
  const staleDrafts = await ProjectCreationDraft.find(staleQuery)
    .select("_id owner")
    .lean();
  if (staleDrafts.length === 0) return;

  const staleIds = staleDrafts.map((draft) => draft._id);
  const createdProjects = await Project.find({
    creationDraftId: { $in: staleIds },
  })
    .select("_id creationDraftId")
    .lean();
  const finalizedIds = new Set(
    createdProjects.map((project) => String(project.creationDraftId)),
  );

  await Promise.all(
    createdProjects.map((project) =>
      ProjectCreationDraft.updateOne(
        { _id: project.creationDraftId, owner },
        {
          $set: {
            status: "finalized",
            finalizationStartedAt: null,
            finalizationToken: "",
            finalizedProject: project._id,
            finalizedAt: new Date(),
          },
          $inc: { __v: 1 },
        },
      ),
    ),
  );

  const abandonedIds = staleIds.filter(
    (draftId) => !finalizedIds.has(String(draftId)),
  );
  if (abandonedIds.length === 0) return;
  await ProjectCreationDraft.updateMany(
    { ...staleQuery, _id: { $in: abandonedIds } },
    {
      $set: {
        status: "active",
        finalizationStartedAt: null,
        finalizationToken: "",
      },
      $inc: { __v: 1 },
    },
  );
};

const attachDraftFinalizationMetadata = (projectValue, draftId, idempotent) => {
  const value = projectValue?.toObject
    ? projectValue.toObject()
    : { ...(projectValue || {}) };
  value.draftFinalization = {
    draftId: String(draftId || ""),
    idempotent: Boolean(idempotent),
  };
  return value;
};

module.exports = {
  DRAFT_FILE_GROUPS,
  parseMaybeJson,
  canManageProjectCreationDrafts,
  normalizeDraftType,
  buildProjectPayloadFromDraft,
  prepareProjectCreationFromDraft,
  markProjectCreationDraftFinalized,
  releaseProjectCreationDraftFinalization,
  recoverStaleProjectCreationDraftFinalizations,
  attachDraftFinalizationMetadata,
};
