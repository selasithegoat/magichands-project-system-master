const express = require("express");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;

const resolveEnvPath = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(__dirname, "..", raw);
};

// Load env vars (support DOTENV_FILE for staging/alternate configs)
const dotenvPath = resolveEnvPath(process.env.DOTENV_FILE);
const dotenvResult = dotenvPath
  ? dotenv.config({ path: dotenvPath })
  : dotenv.config();
if (dotenvPath && dotenvResult?.error) {
  dotenv.config();
}

const connectDB = require("./config/db");
const createCsrfProtection = require("./middleware/csrfProtection");
const { protect } = require("./middleware/authMiddleware");
const enforceUploadAccess = require("./middleware/uploadAccessMiddleware");

const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const updateRoutes = require("./routes/updateRoutes");
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reminderRoutes = require("./routes/reminderRoutes");
const meetingRoutes = require("./routes/meetingRoutes");
const realtimeRoutes = require("./routes/realtimeRoutes");
const chatRoutes = require("./routes/chatRoutes");
const digestRoutes = require("./routes/digestRoutes");
const opsWallboardRoutes = require("./routes/opsWallboardRoutes");
const portalRoutes = require("./routes/portalRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const helpRoutes = require("./routes/helpRoutes");
const { broadcastDataChange } = require("./utils/realtimeHub");
const { startChatArchiveScheduler } = require("./utils/chatArchiveScheduler");
const { startWeeklyDigestScheduler } = require("./utils/weeklyDigestService");
const { startReminderScheduler } = require("./utils/reminderScheduler");

// Connect to database
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_HOST = (process.env.ADMIN_HOST || "").toLowerCase();
const CLIENT_HOST = (process.env.CLIENT_HOST || "").toLowerCase();
const OPS_HOST = (process.env.OPS_HOST || "").toLowerCase();
const INVENTORY_HOST = (process.env.INVENTORY_HOST || "").toLowerCase();
const CORS_ALLOW_ALL =
  String(process.env.CORS_ALLOW_ALL || "").toLowerCase() === "true";
const CORS_ALLOWED_ORIGINS_RAW = String(
  process.env.CORS_ALLOWED_ORIGINS || "",
);
const CORS_HAS_WILDCARD = CORS_ALLOWED_ORIGINS_RAW
  .split(",")
  .map((entry) => entry.trim())
  .some((entry) => entry === "*");
const ALLOW_ANY_ORIGIN = CORS_ALLOW_ALL || CORS_HAS_WILDCARD;

const normalizeOrigin = (value) => {
  if (!value || typeof value !== "string") return "";

  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
};

const parseOriginAllowlist = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => normalizeOrigin(entry.trim()))
    .filter(Boolean);

const buildHostBasedOrigins = (hostValue) => {
  const value = String(hostValue || "").trim();
  if (!value) return [];

  const normalizedAsOrigin = normalizeOrigin(value);
  if (normalizedAsOrigin) return [normalizedAsOrigin];

  return [`http://${value}`, `https://${value}`]
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);
};

const ALLOWED_CORS_ORIGINS = new Set([
  ...parseOriginAllowlist(process.env.CORS_ALLOWED_ORIGINS),
  ...buildHostBasedOrigins(CLIENT_HOST),
  ...buildHostBasedOrigins(ADMIN_HOST),
  ...buildHostBasedOrigins(OPS_HOST),
  ...buildHostBasedOrigins(INVENTORY_HOST),
]);

const getRequestOrigin = (req) => {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const protocol = forwardedProto || req.protocol || "http";
  const rawHost = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();

  if (!rawHost) return "";
  return normalizeOrigin(`${protocol}://${rawHost}`);
};

const isTrustedOrigin = (origin, req) => {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  if (ALLOW_ANY_ORIGIN) return true;
  if (ALLOWED_CORS_ORIGINS.has(normalized)) return true;
  return normalized === getRequestOrigin(req);
};

const allowNoOriginUnsafeMethods =
  process.env.CSRF_ALLOW_NO_ORIGIN === "true" ||
  (process.env.CSRF_ALLOW_NO_ORIGIN !== "false" &&
    process.env.NODE_ENV !== "production");

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const API_RATE_LIMIT_WINDOW_MS = toPositiveInt(
  process.env.RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
);
const API_RATE_LIMIT_MAX_REQUESTS = toPositiveInt(
  process.env.RATE_LIMIT_MAX_REQUESTS,
  300,
);
const AUTH_RATE_LIMIT_WINDOW_MS = toPositiveInt(
  process.env.AUTH_RATE_LIMIT_WINDOW_MS,
  API_RATE_LIMIT_WINDOW_MS,
);
const AUTH_RATE_LIMIT_MAX_REQUESTS = toPositiveInt(
  process.env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  20,
);
const BODY_LIMIT_MB = toPositiveInt(process.env.UPLOAD_MAX_MB, 200);

const normalizeAuthIdentifier = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const readAuthIdentifierFromBody = (req) => {
  const body = req?.body;
  if (!body || typeof body !== "object") return "";

  return normalizeAuthIdentifier(
    body.employeeId || body.email || body.username || "",
  );
};

const getAuthRateLimitKey = (req) => {
  const ipKey = `ip:${ipKeyGenerator(req.ip || "")}`;
  const authPath = String(req.path || "").toLowerCase();

  if (req.method !== "POST") return ipKey;
  if (authPath !== "/login" && authPath !== "/register") return ipKey;

  const identifier = readAuthIdentifierFromBody(req);
  if (!identifier) return ipKey;

  return `${ipKey}|id:${identifier}`;
};

const apiLimiter = rateLimit({
  windowMs: API_RATE_LIMIT_WINDOW_MS,
  max: API_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many requests from this IP. Please try again shortly.",
  },
});

const authLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
  max: AUTH_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: getAuthRateLimitKey,
  skipSuccessfulRequests: true,
  message: {
    message: "Too many authentication attempts. Please try again later.",
  },
});

const isNotificationPollRequest = (req) =>
  req.method === "GET" &&
  req.originalUrl &&
  req.originalUrl.startsWith("/api/notifications");

const SAFE_API_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const shouldApplyApiLimiter = (req) => {
  if (SAFE_API_METHODS.has(req.method)) return false;
  if (isNotificationPollRequest(req)) return false;
  return true;
};

const isAuthBruteforceTarget = (req) => {
  if (req.method !== "POST") return false;
  const authPath = String(req.path || "").toLowerCase();
  return authPath === "/login" || authPath === "/register";
};

const getRequestHost = (req) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return host.split(":")[0].toLowerCase();
};

const isAdminHost = (req) => {
  if (!ADMIN_HOST) return false;
  return getRequestHost(req) === ADMIN_HOST;
};

const isOpsHost = (req) => {
  if (!OPS_HOST) return false;
  return getRequestHost(req) === OPS_HOST;
};

const isInventoryHost = (req) => {
  if (!INVENTORY_HOST) return false;
  return getRequestHost(req) === INVENTORY_HOST;
};

const isClientHost = (req) =>
  !isAdminHost(req) && !isOpsHost(req) && !isInventoryHost(req);

const FORCE_DOWNLOAD_UPLOAD_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".svg",
  ".xml",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".xhtml",
  ".bat",
  ".cmd",
  ".ps1",
  ".sh",
  ".php",
  ".aspx",
  ".jsp",
  ".exe",
  ".dll",
  ".msi",
]);

const SAFE_INLINE_UPLOAD_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".wav",
  ".m4a",
  ".ogg",
]);

const setUploadSecurityHeaders = (res, filePath) => {
  const extension = path.extname(filePath || "").toLowerCase();
  const basename = path.basename(filePath || "download");
  const safeName = basename.replace(/["\r\n]/g, "");
  const shouldForceDownload =
    FORCE_DOWNLOAD_UPLOAD_EXTENSIONS.has(extension) ||
    !SAFE_INLINE_UPLOAD_EXTENSIONS.has(extension);

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  if (shouldForceDownload) {
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  }
};

const setPortalBuildHeaders = (res, filePath) => {
  const extension = path.extname(filePath || "").toLowerCase();
  const basename = path.basename(filePath || "").toLowerCase();

  if (extension === ".html" || basename === "sw.js") {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
};

const sendPortalIndex = (res, distPath) =>
  res.sendFile(path.join(distPath, "index.html"), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });

const isStaticAssetRequest = (req) => {
  const requestPath = String(req.path || req.originalUrl || "").split("?")[0];
  return Boolean(path.extname(requestPath));
};

// Trust proxy for ngrok/production (required for secure cookies behind proxy)
app.set("trust proxy", 1);

// Middleware
app.use(
  cors((req, callback) => {
    const requestOrigin = req.headers.origin;
    const trusted = !requestOrigin || isTrustedOrigin(requestOrigin, req);

    return callback(null, {
      origin: trusted ? true : false,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    });
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: `${BODY_LIMIT_MB}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${BODY_LIMIT_MB}mb` }));
app.use("/api", (req, res, next) => {
  const requestOrigin = req.headers.origin;
  if (!requestOrigin) return next();
  if (isTrustedOrigin(requestOrigin, req)) return next();

  return res.status(403).json({
    message: "Origin is not allowed by CORS policy.",
  });
});
app.use(
  "/api",
  createCsrfProtection({
    allowedOrigins: Array.from(ALLOWED_CORS_ORIGINS),
    allowNoOriginUnsafeMethods,
    isTrustedOrigin,
  }),
);
app.use("/api", (req, res, next) => {
  if (!shouldApplyApiLimiter(req)) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// Realtime change notifications for mutating API calls
const realtimePaths = [
  "/api/projects",
  "/api/updates",
  "/api/notifications",
  "/api/reminders",
  "/api/admin",
  "/api/inventory",
];
app.use((req, res, next) => {
  if (!req.originalUrl.startsWith("/api")) return next();
  if (req.method === "GET") return next();
  const shouldBroadcast = realtimePaths.some((p) =>
    req.originalUrl.startsWith(p),
  );
  if (!shouldBroadcast) return next();

  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      broadcastDataChange({
        path: req.originalUrl,
        method: req.method,
      });
    }
  });

  next();
});

// External uploads folder (outside source)
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(__dirname, "../../../magichands-uploads");
app.use(
  "/uploads",
  protect,
  enforceUploadAccess,
  express.static(UPLOAD_DIR, {
    dotfiles: "deny",
    index: false,
    redirect: false,
    fallthrough: false,
    setHeaders: setUploadSecurityHeaders,
  }),
);

// Routes
app.use(
  "/api/auth",
  (req, res, next) =>
    isAuthBruteforceTarget(req) ? authLimiter(req, res, next) : next(),
  authRoutes,
);
app.use("/api/projects", projectRoutes);
app.use("/api/updates", updateRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/digests", digestRoutes);
app.use("/api/ops/wallboard", opsWallboardRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/help", helpRoutes);

const resolveDistPath = (value, fallbackPath) => {
  const raw = String(value || "").trim();
  if (!raw) return fallbackPath;
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(__dirname, "../..", raw);
};

// Serve built frontends (Vite builds -> dist)
const clientDistPath = resolveDistPath(
  process.env.CLIENT_DIST_DIR,
  path.resolve(__dirname, "../../client/dist"),
);
const adminDistPath = resolveDistPath(
  process.env.ADMIN_DIST_DIR,
  path.resolve(__dirname, "../../admin/dist"),
);
const opsDistPath = resolveDistPath(
  process.env.OPS_DIST_DIR,
  path.resolve(__dirname, "../../opsportal/dist"),
);
const inventoryDistPath = resolveDistPath(
  process.env.INVENTORY_DIST_DIR,
  path.resolve(__dirname, "../../inventoryportal/dist"),
);
const hasClientBuild = fs.existsSync(clientDistPath);
const hasAdminBuild = fs.existsSync(adminDistPath);
const hasOpsBuild = fs.existsSync(opsDistPath);
const hasInventoryBuild = fs.existsSync(inventoryDistPath);

if (hasAdminBuild) {
  const adminStatic = express.static(adminDistPath, {
    setHeaders: setPortalBuildHeaders,
  });
  app.use((req, res, next) => {
    if (isAdminHost(req)) {
      return adminStatic(req, res, next);
    }
    return next();
  });
}

if (hasOpsBuild) {
  const opsStatic = express.static(opsDistPath, {
    setHeaders: setPortalBuildHeaders,
  });
  app.use((req, res, next) => {
    if (isOpsHost(req)) {
      return opsStatic(req, res, next);
    }
    return next();
  });
}

if (hasInventoryBuild) {
  const inventoryStatic = express.static(inventoryDistPath, {
    setHeaders: setPortalBuildHeaders,
  });
  app.use((req, res, next) => {
    if (isInventoryHost(req)) {
      return inventoryStatic(req, res, next);
    }
    return next();
  });
}

// Mobile/IP fallback: allow /admin on non-admin hosts to serve admin app
if (hasAdminBuild) {
  app.use(
    "/admin",
    express.static(adminDistPath, {
      setHeaders: setPortalBuildHeaders,
    }),
  );
}

// Fallback path for ops wallboard
if (hasOpsBuild) {
  app.use(
    "/ops",
    express.static(opsDistPath, {
      setHeaders: setPortalBuildHeaders,
    }),
  );
}

if (hasInventoryBuild) {
  app.use(
    "/inventory",
    express.static(inventoryDistPath, {
      setHeaders: setPortalBuildHeaders,
    }),
  );
}

if (hasClientBuild) {
  const clientStatic = express.static(clientDistPath, {
    setHeaders: setPortalBuildHeaders,
  });
  app.use((req, res, next) => {
    if (isClientHost(req)) {
      return clientStatic(req, res, next);
    }
    return next();
  });
}

// SPA fallbacks
if (hasAdminBuild || hasClientBuild || hasOpsBuild || hasInventoryBuild) {
  app.get(/^\/admin(\/.*)?$/, (req, res, next) => {
    if (isStaticAssetRequest(req)) return next();
    if (!isAdminHost(req) && hasAdminBuild) {
      return sendPortalIndex(res, adminDistPath);
    }
    return next();
  });

  app.get(/^\/ops(\/.*)?$/, (req, res, next) => {
    if (isStaticAssetRequest(req)) return next();
    if (hasOpsBuild) {
      return sendPortalIndex(res, opsDistPath);
    }
    return next();
  });

  app.get(/^\/inventory(\/.*)?$/, (req, res, next) => {
    if (isStaticAssetRequest(req)) return next();
    if (hasInventoryBuild) {
      return sendPortalIndex(res, inventoryDistPath);
    }
    return next();
  });

  app.get(/^\/(?!api|uploads).*/, (req, res, next) => {
    if (isStaticAssetRequest(req)) return next();
    if (isAdminHost(req) && hasAdminBuild) {
      return sendPortalIndex(res, adminDistPath);
    }
    if (isOpsHost(req) && hasOpsBuild) {
      return sendPortalIndex(res, opsDistPath);
    }
    if (isInventoryHost(req) && hasInventoryBuild) {
      return sendPortalIndex(res, inventoryDistPath);
    }
    if (isClientHost(req) && hasClientBuild) {
      return sendPortalIndex(res, clientDistPath);
    }
    return next();
  });
} else {
  app.get("/", (req, res) => {
    res.send("MagicHands Server is Running");
  });
}

// Start Server
app.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST}:${PORT}`);
  startChatArchiveScheduler();
  startWeeklyDigestScheduler();
  startReminderScheduler();
});
// Trigger restart to rebuild indexes
