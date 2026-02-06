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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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
    cb(null, `${cleanName}-${uniqueSuffix}${path.extname(file.originalname)}`);
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
