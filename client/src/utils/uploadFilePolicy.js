export const IMAGE_FILE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
];

export const MOCKUP_FILE_EXTENSIONS = [
  ...IMAGE_FILE_EXTENSIONS,
  ".pdf",
  ".cdr",
];

export const DOCUMENT_FILE_EXTENSIONS = [
  ...IMAGE_FILE_EXTENSIONS,
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".zip",
  ".rar",
  ".7z",
  ".cdr",
];

export const MEDIA_FILE_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
];

export const GENERAL_UPLOAD_FILE_EXTENSIONS = [
  ...DOCUMENT_FILE_EXTENSIONS,
  ...MEDIA_FILE_EXTENSIONS,
];

export const FEEDBACK_MEDIA_FILE_EXTENSIONS = [
  ...IMAGE_FILE_EXTENSIONS,
  ...MEDIA_FILE_EXTENSIONS,
];

export const MOCKUP_FILE_ACCEPT = MOCKUP_FILE_EXTENSIONS.join(",");
export const DOCUMENT_FILE_ACCEPT = DOCUMENT_FILE_EXTENSIONS.join(",");
export const GENERAL_UPLOAD_FILE_ACCEPT =
  GENERAL_UPLOAD_FILE_EXTENSIONS.join(",");
export const FEEDBACK_MEDIA_FILE_ACCEPT =
  FEEDBACK_MEDIA_FILE_EXTENSIONS.join(",");

const getFileExtension = (file) => {
  const fileName = String(file?.name || "").trim().toLowerCase();
  const extensionStart = fileName.lastIndexOf(".");
  return extensionStart >= 0 ? fileName.slice(extensionStart) : "";
};

export const partitionFilesByExtension = (fileList, allowedExtensions) => {
  const files = Array.from(fileList || []);
  const allowed = new Set(allowedExtensions);
  const acceptedFiles = [];
  const rejectedFiles = [];

  files.forEach((file) => {
    if (allowed.has(getFileExtension(file))) {
      acceptedFiles.push(file);
    } else {
      rejectedFiles.push(file);
    }
  });

  return { acceptedFiles, rejectedFiles };
};
