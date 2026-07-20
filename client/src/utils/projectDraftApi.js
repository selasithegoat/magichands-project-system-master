const PROJECT_DRAFTS_ENDPOINT = "/api/project-drafts";

export const canManageProjectCreationDrafts = (user) => {
  if (!user || typeof user !== "object") return false;
  if (String(user.role || "").trim().toLowerCase() === "admin") return true;

  const departments = Array.isArray(user.department)
    ? user.department
    : user.department
      ? [user.department]
      : [];
  return departments.some((department) => {
    const value =
      department && typeof department === "object"
        ? department.value || department.label
        : department;
    return String(value || "").trim().toLowerCase() === "front desk";
  });
};

const parseResponseBody = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json().catch(() => null);
};

const throwResponseError = (response, body, fallbackMessage) => {
  const message =
    body?.message || body?.error || `${fallbackMessage} (${response.status})`;
  const error = new Error(message);
  error.status = response.status;
  error.body = body;
  throw error;
};

const requestJson = async (url, options = {}, fallbackMessage) => {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
  });
  const body = await parseResponseBody(response);
  if (!response.ok) {
    throwResponseError(response, body, fallbackMessage);
  }
  return body;
};

export const unwrapProjectDraftResponse = (value) => {
  if (!value || typeof value !== "object") return value || null;
  return value.draft && typeof value.draft === "object" ? value.draft : value;
};

export const listProjectDrafts = async () => {
  const body = await requestJson(
    PROJECT_DRAFTS_ENDPOINT,
    { cache: "no-store" },
    "Unable to load saved drafts",
  );
  const drafts = Array.isArray(body)
    ? body
    : Array.isArray(body?.drafts)
      ? body.drafts
      : [];
  return drafts.map(unwrapProjectDraftResponse).filter(Boolean);
};

export const getProjectDraft = async (id) => {
  const draftId = String(id || "").trim();
  if (!draftId) throw new Error("A draft ID is required.");
  const body = await requestJson(
    `${PROJECT_DRAFTS_ENDPOINT}/${encodeURIComponent(draftId)}`,
    { cache: "no-store" },
    "Unable to load the saved draft",
  );
  return unwrapProjectDraftResponse(body);
};

const appendFiles = (formData, fieldName, files) => {
  (Array.isArray(files) ? files : []).forEach((file) => {
    if (typeof Blob !== "undefined" && file instanceof Blob) {
      formData.append(fieldName, file);
    }
  });
};

export const saveProjectDraft = async ({
  id = "",
  revision = null,
  payload = {},
  retainedFileIds = {},
  fileMetadata = [],
  sampleImage = null,
  sampleImageNote = "",
  attachments = [],
  attachmentNotes = [],
  clientMockups = [],
  clientMockupNotes = [],
  approvedMockups = [],
  approvedMockupNotes = [],
} = {}) => {
  const draftId = String(id || "").trim();
  const body = new FormData();
  if (Number.isFinite(Number(revision)) && Number(revision) > 0) {
    body.append("revision", String(revision));
  }
  body.append("payload", JSON.stringify(payload || {}));
  body.append(
    "retainedFileIds",
    JSON.stringify(
      retainedFileIds && typeof retainedFileIds === "object"
        ? retainedFileIds
        : {},
    ),
  );
  body.append(
    "fileMetadata",
    JSON.stringify(Array.isArray(fileMetadata) ? fileMetadata : []),
  );

  appendFiles(body, "attachments", attachments);
  if (typeof Blob !== "undefined" && sampleImage instanceof Blob) {
    body.append("sampleImage", sampleImage);
  }
  appendFiles(body, "clientMockup", clientMockups);
  appendFiles(body, "approvedMockup", approvedMockups);
  body.append(
    "attachmentNotes",
    JSON.stringify(Array.isArray(attachmentNotes) ? attachmentNotes : []),
  );
  body.append("sampleImageNote", String(sampleImageNote || ""));
  body.append(
    "clientMockupNotes",
    JSON.stringify(Array.isArray(clientMockupNotes) ? clientMockupNotes : []),
  );
  body.append(
    "approvedMockupNotes",
    JSON.stringify(Array.isArray(approvedMockupNotes) ? approvedMockupNotes : []),
  );

  const responseBody = await requestJson(
    draftId
      ? `${PROJECT_DRAFTS_ENDPOINT}/${encodeURIComponent(draftId)}`
      : PROJECT_DRAFTS_ENDPOINT,
    {
      method: draftId ? "PUT" : "POST",
      body,
    },
    "Unable to save the draft",
  );
  return unwrapProjectDraftResponse(responseBody);
};

export const deleteProjectDraft = async (id) => {
  const draftId = String(id || "").trim();
  if (!draftId) throw new Error("A draft ID is required.");
  return requestJson(
    `${PROJECT_DRAFTS_ENDPOINT}/${encodeURIComponent(draftId)}`,
    { method: "DELETE" },
    "Unable to discard the draft",
  );
};

export const getProjectDraftResumePath = (draft) => {
  const draftId = String(draft?._id || draft?.id || "").trim();
  const explicitPath = String(draft?.resumePath || "").trim();
  if (explicitPath) {
    if (!draftId || explicitPath.includes("draft=")) return explicitPath;
    const joiner = explicitPath.includes("?") ? "&" : "?";
    return `${explicitPath}${joiner}draft=${encodeURIComponent(draftId)}`;
  }

  const type = String(
    draft?.draftType || draft?.type || draft?.kind || draft?.formData?.draftType || "",
  ).toLowerCase();
  const basePath = type.includes("quote")
    ? "/create/quote"
    : "/new-orders/form";
  return draftId
    ? `${basePath}?draft=${encodeURIComponent(draftId)}`
    : basePath;
};
