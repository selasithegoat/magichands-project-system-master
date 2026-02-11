const multer = require("multer");
const path = require("path");
const fs = require("fs");

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
  return "misc";
};

const getRelativeDir = (req, file) => {
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
    const { relativeDirFs } = getRelativeDir(req, file);
    const fullDir = path.join(uploadDir, relativeDirFs);
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Unique filename: fieldname-timestamp-random.ext
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // Sanitize original name to remove special chars but keep extension
    const cleanName = file.originalname
      .split(".")[0]
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const { relativeDirUrl } = getRelativeDir(req, file);
    const baseName = `${cleanName}-${uniqueSuffix}${path.extname(file.originalname)}`;
    const finalName = path.posix.join(relativeDirUrl, baseName);
    cb(null, finalName);
  },
});

const fileFilter = (req, file, cb) => {
  // Allow all file types (images, documents, audio, video, etc.)
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
});

upload.maxFileSizeMb = maxFileSizeMb;

module.exports = upload;
