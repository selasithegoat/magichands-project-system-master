const { createHash } = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const CARD_THUMBNAIL_VERSION = "card-v1";
const CARD_THUMBNAIL_SIZE = 192;
const CARD_THUMBNAIL_QUALITY = 72;
const MAX_INPUT_PIXELS = 500_000_000;
const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);
const inFlightThumbnails = new Map();

// Thumbnails are cached on disk. Retaining decoded originals would needlessly
// increase the long-running server's memory footprint.
sharp.cache(false);
sharp.concurrency(1);

const isPathInside = (rootPath, candidatePath) => {
  const relativePath = path.relative(rootPath, candidatePath);
  return Boolean(
    relativePath &&
      !relativePath.startsWith("..") &&
      !path.isAbsolute(relativePath),
  );
};

const resolveSourcePath = (uploadDir, requestPath) => {
  let decodedPath = "";
  try {
    decodedPath = decodeURIComponent(String(requestPath || ""));
  } catch {
    return null;
  }

  const relativePath = decodedPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!relativePath || relativePath.split("/").includes("..")) return null;

  const sourcePath = path.resolve(uploadDir, relativePath);
  if (!isPathInside(uploadDir, sourcePath)) return null;

  return { relativePath, sourcePath };
};

const ensureThumbnail = async ({ sourcePath, thumbnailPath }) => {
  const [sourceStat, thumbnailStat] = await Promise.all([
    fs.promises.stat(sourcePath),
    fs.promises.stat(thumbnailPath).catch(() => null),
  ]);

  if (
    thumbnailStat?.isFile() &&
    thumbnailStat.mtimeMs >= sourceStat.mtimeMs &&
    thumbnailStat.size > 0
  ) {
    return thumbnailPath;
  }

  await fs.promises.mkdir(path.dirname(thumbnailPath), { recursive: true });
  const temporaryPath = `${thumbnailPath}.tmp-${process.pid}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;

  try {
    await sharp(sourcePath, {
      sequentialRead: true,
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
    })
      .rotate()
      .resize({
        width: CARD_THUMBNAIL_SIZE,
        height: CARD_THUMBNAIL_SIZE,
        fit: "cover",
        position: "centre",
        withoutEnlargement: true,
      })
      .webp({ quality: CARD_THUMBNAIL_QUALITY, effort: 3 })
      .timeout({ seconds: 30 })
      .toFile(temporaryPath);

    await fs.promises.rm(thumbnailPath, { force: true });
    await fs.promises.rename(temporaryPath, thumbnailPath);
    return thumbnailPath;
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
};

const createUploadThumbnailMiddleware = (uploadDir) => {
  const resolvedUploadDir = path.resolve(uploadDir);
  const thumbnailRoot = path.join(
    resolvedUploadDir,
    ".thumbnails",
    CARD_THUMBNAIL_VERSION,
  );

  return async (req, res, next) => {
    if (req.query?.thumbnail !== CARD_THUMBNAIL_VERSION) return next();
    if (!["GET", "HEAD"].includes(req.method)) return next();

    const resolvedSource = resolveSourcePath(resolvedUploadDir, req.path);
    if (!resolvedSource) {
      return res.status(400).json({ message: "Invalid thumbnail path." });
    }

    const extension = path.extname(resolvedSource.sourcePath).toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension)) {
      return res.status(415).json({ message: "Thumbnail format is not supported." });
    }

    // A digest keeps cache paths short enough for Windows even when an upload
    // has a deeply nested project folder and a long original filename.
    const thumbnailKey = createHash("sha256")
      .update(resolvedSource.relativePath)
      .digest("hex");
    const thumbnailPath = path.resolve(
      thumbnailRoot,
      thumbnailKey.slice(0, 2),
      `${thumbnailKey}.webp`,
    );
    if (!isPathInside(thumbnailRoot, thumbnailPath)) {
      return res.status(400).json({ message: "Invalid thumbnail path." });
    }

    let thumbnailPromise = inFlightThumbnails.get(thumbnailPath);
    if (!thumbnailPromise) {
      thumbnailPromise = ensureThumbnail({
        sourcePath: resolvedSource.sourcePath,
        thumbnailPath,
      }).finally(() => inFlightThumbnails.delete(thumbnailPath));
      inFlightThumbnails.set(thumbnailPath, thumbnailPromise);
    }

    try {
      await thumbnailPromise;
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      return res.sendFile(thumbnailPath, { dotfiles: "allow" });
    } catch (error) {
      if (error?.code === "ENOENT") return next();
      console.error(
        `Failed to generate card thumbnail for ${resolvedSource.relativePath}:`,
        error?.message || error,
      );
      return res.status(422).json({ message: "Unable to create image thumbnail." });
    }
  };
};

module.exports = createUploadThumbnailMiddleware;

