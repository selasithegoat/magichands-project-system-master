export const buildFileKey = (file) => {
  if (!file) return "";
  const name = String(file.name || "");
  const size = Number.isFinite(file.size) ? file.size : "";
  const lastModified = Number.isFinite(file.lastModified)
    ? file.lastModified
    : "";
  return `${name}-${size}-${lastModified}`;
};

const resolveUrl = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    if (typeof value.fileUrl === "string") return value.fileUrl.trim();
    if (typeof value.url === "string") return value.url.trim();
    if (typeof value.path === "string") return value.path.trim();
  }
  return "";
};

const resolveName = (value, fallbackUrl = "") => {
  if (value && typeof value === "object") {
    if (typeof value.fileName === "string" && value.fileName.trim()) {
      return value.fileName.trim();
    }
    if (typeof value.name === "string" && value.name.trim()) {
      return value.name.trim();
    }
  }
  const url = fallbackUrl || resolveUrl(value);
  if (!url) return "";
  const rawName = url.split("?")[0].split("/").pop() || url;
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
};

const resolveType = (value) => {
  if (value && typeof value === "object") {
    if (typeof value.fileType === "string") return value.fileType.trim();
    if (typeof value.type === "string") return value.type.trim();
  }
  return "";
};

const resolveNote = (value) => {
  if (value && typeof value === "object") {
    if (typeof value.note === "string") return value.note;
    if (typeof value.notes === "string") return value.notes;
  }
  return "";
};

export const normalizeReferenceAttachment = (value) => {
  const fileUrl = resolveUrl(value);
  return {
    fileUrl,
    fileName: resolveName(value, fileUrl),
    fileType: resolveType(value),
    note: resolveNote(value),
  };
};

export const normalizeReferenceAttachments = (attachments) => {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .map((item) => normalizeReferenceAttachment(item))
    .filter((item) => item.fileUrl);
};

export const getReferenceFileUrl = (value) =>
  normalizeReferenceAttachment(value).fileUrl;

export const getReferenceFileName = (value) =>
  normalizeReferenceAttachment(value).fileName;

export const getReferenceFileType = (value) =>
  normalizeReferenceAttachment(value).fileType;

export const getReferenceFileNote = (value) =>
  normalizeReferenceAttachment(value).note;
