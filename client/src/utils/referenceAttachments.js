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

const CARD_IMAGE_EXTENSIONS = /\.(apng|avif|bmp|gif|jpe?g|png|svg|webp)$/i;
const THUMBNAIL_IMAGE_EXTENSIONS = /\.(avif|gif|jpe?g|png|webp)$/i;

const appendCardThumbnailQuery = (fileUrl) => {
  const rawUrl = String(fileUrl || "").trim();
  if (!rawUrl) return "";

  const hashIndex = rawUrl.indexOf("#");
  const hash = hashIndex >= 0 ? rawUrl.slice(hashIndex) : "";
  const urlWithoutHash = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
  const pathOnly = urlWithoutHash.split("?")[0];
  const isManagedUpload =
    /^\/?uploads\//i.test(pathOnly) ||
    /^https?:\/\/[^/]+\/uploads\//i.test(pathOnly);

  if (!isManagedUpload || !THUMBNAIL_IMAGE_EXTENSIONS.test(pathOnly)) {
    return rawUrl;
  }

  const separator = urlWithoutHash.includes("?") ? "&" : "?";
  return `${urlWithoutHash}${separator}thumbnail=card-v1${hash}`;
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

export const getProjectCardImageUrl = (project) => {
  const sampleImage = getReferenceFileUrl(
    project?.sampleImage || project?.details?.sampleImage,
  );
  if (sampleImage) return appendCardThumbnailQuery(sampleImage);

  const attachments = [
    ...(Array.isArray(project?.attachments) ? project.attachments : []),
    ...(Array.isArray(project?.details?.attachments)
      ? project.details.attachments
      : []),
  ];
  const firstImage = attachments
    .map((attachment) => getReferenceFileUrl(attachment))
    .find((fileUrl) => CARD_IMAGE_EXTENSIONS.test(fileUrl.split("?")[0]));

  return appendCardThumbnailQuery(firstImage || "");
};
