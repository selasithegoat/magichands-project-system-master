const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const Project = require("../models/Project");

const execFileAsync = promisify(execFile);
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

// Configurable upload directory - default to a folder outside the project root
const uploadDir =
  process.env.UPLOAD_DIR ||
  path.join(__dirname, "../../../../magichands-uploads");

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

console.log(`Uploads will be stored in: ${uploadDir}`);

const parsedMaxMb = Number(process.env.UPLOAD_MAX_MB);
const maxFileSizeMb =
  Number.isFinite(parsedMaxMb) && parsedMaxMb > 0 ? parsedMaxMb : 50;

console.log(`Upload max file size: ${maxFileSizeMb}MB`);

const scanCommand = String(process.env.UPLOAD_SCAN_COMMAND || "").trim();
const scanArgs = String(process.env.UPLOAD_SCAN_ARGS || "")
  .split(/\s+/)
  .filter(Boolean);
const parsedScanTimeoutMs = Number.parseInt(
  process.env.UPLOAD_SCAN_TIMEOUT_MS,
  10,
);
const uploadScanTimeoutMs =
  Number.isFinite(parsedScanTimeoutMs) && parsedScanTimeoutMs > 0
    ? parsedScanTimeoutMs
    : 30_000;

if (scanCommand) {
  console.log(
    `Upload malware scanning enabled via "${scanCommand}" with timeout ${uploadScanTimeoutMs}ms`,
  );
} else {
  console.log("Upload malware scanning is disabled (UPLOAD_SCAN_COMMAND not set).");
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const CORELDRAW_EXTENSIONS = new Set([".cdr"]);
const CORELDRAW_MIME_TYPES = new Set([
  "application/cdr",
  "application/coreldraw",
  "application/vnd.corel-draw",
  "application/x-cdr",
  "application/x-coreldraw",
  "image/x-cdr",
]);
const GENERIC_BINARY_MIME_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);
const DOCUMENT_EXTENSIONS = new Set([
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
  ...CORELDRAW_EXTENSIONS,
]);
const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  ...CORELDRAW_MIME_TYPES,
]);
const MEDIA_EXTENSIONS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".wav",
  ".m4a",
]);
const MEDIA_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);
const FEEDBACK_MEDIA_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...MEDIA_EXTENSIONS,
]);
const FEEDBACK_MEDIA_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, ...MEDIA_MIME_TYPES]);

const GENERAL_SAFE_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...MEDIA_EXTENSIONS,
]);
const GENERAL_SAFE_MIME_TYPES = new Set([
  ...IMAGE_MIME_TYPES,
  ...DOCUMENT_MIME_TYPES,
  ...MEDIA_MIME_TYPES,
]);

const FILE_POLICY_BY_FIELD = {
  avatar: {
    extensions: IMAGE_EXTENSIONS,
    mimeTypes: IMAGE_MIME_TYPES,
  },
  sampleImage: {
    extensions: IMAGE_EXTENSIONS,
    mimeTypes: IMAGE_MIME_TYPES,
  },
  mockup: {
    extensions: new Set([...IMAGE_EXTENSIONS, ".pdf", ...CORELDRAW_EXTENSIONS]),
    mimeTypes: new Set([
      ...IMAGE_MIME_TYPES,
      "application/pdf",
      ...CORELDRAW_MIME_TYPES,
    ]),
  },
  attachments: {
    extensions: GENERAL_SAFE_EXTENSIONS,
    mimeTypes: GENERAL_SAFE_MIME_TYPES,
  },
  attachment: {
    extensions: GENERAL_SAFE_EXTENSIONS,
    mimeTypes: GENERAL_SAFE_MIME_TYPES,
  },
  feedbackAttachments: {
    extensions: FEEDBACK_MEDIA_EXTENSIONS,
    mimeTypes: FEEDBACK_MEDIA_MIME_TYPES,
  },
  default: {
    extensions: GENERAL_SAFE_EXTENSIONS,
    mimeTypes: GENERAL_SAFE_MIME_TYPES,
  },
};

const getFilePolicy = (fieldname) =>
  FILE_POLICY_BY_FIELD[fieldname] || FILE_POLICY_BY_FIELD.default;

const getNormalizedExtension = (filename) =>
  path.extname(String(filename || "")).toLowerCase();

const getUploadedFiles = (req) => {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) {
    files.push(...req.files);
    return files;
  }

  if (req.files && typeof req.files === "object") {
    Object.values(req.files).forEach((entry) => {
      if (Array.isArray(entry)) {
        files.push(...entry);
      }
    });
  }

  return files;
};

const getUploadedFilePath = (file) => {
  if (!file) return "";
  if (file.path) return file.path;
  if (file.filename) return path.join(uploadDir, file.filename);
  return "";
};

const scanUploadedFile = async (filePath) => {
  if (!scanCommand || !filePath) return;

  await execFileAsync(scanCommand, [...scanArgs, filePath], {
    timeout: uploadScanTimeoutMs,
    windowsHide: true,
  });
};

const scanRequestFiles = async (req) => {
  const files = getUploadedFiles(req);

  for (const file of files) {
    const filePath = getUploadedFilePath(file);
    try {
      await scanUploadedFile(filePath);
    } catch (error) {
      throw new Error(
        "Uploaded file failed the security scan. Please contact support if this is unexpected.",
      );
    }
  }
};

const cleanupRequestFiles = async (req) => {
  const files = getUploadedFiles(req);

  await Promise.all(
    files.map(async (file) => {
      const filePath = getUploadedFilePath(file);
      if (!filePath) return;

      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error && error.code !== "ENOENT") {
          console.error("Failed to remove uploaded file:", error);
        }
      }
    }),
  );
};

const getProjectLookupId = (req) => {
  const candidates = [
    req.params?.projectId,
    req.params?.id,
    req.body?.projectId,
    req.body?.id,
    req.body?._id,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (OBJECT_ID_REGEX.test(value)) {
      return value;
    }
  }

  return "";
};

const hydrateProjectMetadata = async (req) => {
  if (req._uploadMetadataHydrated) return;
  if (req._uploadMetadataPromise) {
    await req._uploadMetadataPromise;
    return;
  }

  req._uploadMetadataPromise = (async () => {
    const projectId = getProjectLookupId(req);
    if (!projectId) {
      req._uploadMetadataHydrated = true;
      return;
    }

    try {
      const project = await Project.findById(projectId)
        .select("orderId details.projectName")
        .lean();

      if (project?.orderId && !req._resolvedOrderId) {
        req._resolvedOrderId = project.orderId;
      }

      const resolvedProjectName = project?.details?.projectName;
      if (resolvedProjectName && !req._resolvedProjectName) {
        req._resolvedProjectName = resolvedProjectName;
      }
    } catch (error) {
      console.error("Failed to resolve project metadata for upload path:", error);
    } finally {
      req._uploadMetadataHydrated = true;
    }
  })();

  try {
    await req._uploadMetadataPromise;
  } finally {
    req._uploadMetadataPromise = null;
  }
};

const sanitizeSegment = (value, fallback) => {
  if (!value || typeof value !== "string") return fallback;
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
};

const getProjectName = (req) => {
  if (req._resolvedProjectName) return req._resolvedProjectName;
  if (req.body?.projectName) {
    req._resolvedProjectName = req.body.projectName;
    return req.body.projectName;
  }
  if (req.body?.details) {
    try {
      const parsed =
        typeof req.body.details === "string"
          ? JSON.parse(req.body.details)
          : req.body.details;
      if (parsed?.projectName) {
        req._resolvedProjectName = parsed.projectName;
        return parsed.projectName;
      }
    } catch (err) {
      return null;
    }
  }
  return null;
};

const getOrderId = (req) => {
  if (req._resolvedOrderId) return req._resolvedOrderId;
  let orderId = req.body?.orderId;
  const isCreate =
    req.method === "POST" && !req.params?.id && !req.params?.projectId;
  if (!orderId && isCreate) {
    orderId = `ORD-${Date.now().toString().slice(-6)}`;
    if (!req.body) req.body = {};
    req.body.orderId = orderId;
  }
  if (!orderId) {
    orderId = req.params?.id || req.params?.projectId || "project";
  }
  req._resolvedOrderId = orderId;
  return orderId;
};

const getCategory = (file) => {
  if (file.fieldname === "mockup") return "mockups";
  if (file.fieldname === "sampleImage" || file.fieldname === "attachments")
    return "scope-reference-materials";
  if (file.fieldname === "attachment") return "project-updates";
  if (file.fieldname === "feedbackAttachments") return "client-feedback";
  return "misc";
};

const getRelativeDir = async (req, file) => {
  await hydrateProjectMetadata(req);

  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateFolder = `${month}-${day}`;

  const orderId = getOrderId(req);
  let projectName = getProjectName(req);
  if (!projectName) {
    projectName = "unnamed-project";
    req._resolvedProjectName = projectName;
  }
  const projectFolder = `${sanitizeSegment(orderId, "project")}_${sanitizeSegment(
    projectName,
    "unnamed-project",
  )}`;

  const category = getCategory(file);
  const relativeDirFs = path.join(category, year, dateFolder, projectFolder);
  const relativeDirUrl = path.posix.join(
    category,
    year,
    dateFolder,
    projectFolder,
  );

  return { relativeDirFs, relativeDirUrl };
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    getRelativeDir(req, file)
      .then(({ relativeDirFs }) => {
        const fullDir = path.join(uploadDir, relativeDirFs);
        if (!fs.existsSync(fullDir)) {
          fs.mkdirSync(fullDir, { recursive: true });
        }
        cb(null, uploadDir);
      })
      .catch((error) => cb(error));
  },
  filename: (req, file, cb) => {
    getRelativeDir(req, file)
      .then(({ relativeDirUrl }) => {
        // Unique filename: fieldname-timestamp-random.ext
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        // Sanitize original name to remove special chars but keep extension
        const cleanName = file.originalname
          .split(".")[0]
          .replace(/[^a-z0-9]/gi, "_")
          .toLowerCase();
        const baseName = `${cleanName}-${uniqueSuffix}${path.extname(file.originalname)}`;
        const finalName = path.posix.join(relativeDirUrl, baseName);
        cb(null, finalName);
      })
      .catch((error) => cb(error));
  },
});

const fileFilter = (req, file, cb) => {
  const policy = getFilePolicy(file.fieldname);
  const extension = getNormalizedExtension(file.originalname);
  const mimeType = String(file.mimetype || "").toLowerCase();
  const isCorelDraw = CORELDRAW_EXTENSIONS.has(extension);
  const extensionAllowed = policy.extensions.has(extension);
  const mimeAllowed =
    policy.mimeTypes.has(mimeType) ||
    (isCorelDraw &&
      (GENERIC_BINARY_MIME_TYPES.has(mimeType) || mimeType.length === 0));

  if (extensionAllowed && mimeAllowed) {
    return cb(null, true);
  }

  return cb(
    new Error(
      `Unsupported file type for ${file.fieldname || "upload"}. Please upload an approved format.`,
    ),
    false,
  );
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
});

upload.maxFileSizeMb = maxFileSizeMb;
upload.scanRequestFiles = scanRequestFiles;
upload.cleanupRequestFiles = cleanupRequestFiles;
upload.getUploadedFiles = getUploadedFiles;

module.exports = upload;
