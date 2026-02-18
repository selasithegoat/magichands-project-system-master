const express = require("express");
const fs = require("fs");
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const createCsrfProtection = require("./middleware/csrfProtection");

const authRoutes = require("./routes/authRoutes");
const projectRoutes = require("./routes/projectRoutes");
const updateRoutes = require("./routes/updateRoutes");
const adminRoutes = require("./routes/adminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const realtimeRoutes = require("./routes/realtimeRoutes");
const digestRoutes = require("./routes/digestRoutes");
const opsWallboardRoutes = require("./routes/opsWallboardRoutes");
const portalRoutes = require("./routes/portalRoutes");
const inventoryRoutes = require("./routes/inventoryRoutes");
const { broadcastDataChange } = require("./utils/realtimeHub");
const { startWeeklyDigestScheduler } = require("./utils/weeklyDigestService");

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_HOST = (process.env.ADMIN_HOST || "").toLowerCase();
const CLIENT_HOST = (process.env.CLIENT_HOST || "").toLowerCase();
const OPS_HOST = (process.env.OPS_HOST || "").toLowerCase();

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
  message: {
    message: "Too many authentication attempts. Please try again later.",
  },
});

const isNotificationPollRequest = (req) =>
  req.method === "GET" &&
  req.originalUrl &&
  req.originalUrl.startsWith("/api/notifications");

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

const isClientHost = (req) => !isAdminHost(req) && !isOpsHost(req);

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
app.use(express.json());
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
  if (isNotificationPollRequest(req)) {
    return next();
  }
  return apiLimiter(req, res, next);
});

// Realtime change notifications for mutating API calls
const realtimePaths = [
  "/api/projects",
  "/api/updates",
  "/api/notifications",
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
app.use("/uploads", express.static(UPLOAD_DIR));

// Routes
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/updates", updateRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/realtime", realtimeRoutes);
app.use("/api/digests", digestRoutes);
app.use("/api/ops/wallboard", opsWallboardRoutes);
app.use("/api/portal", portalRoutes);
app.use("/api/inventory", inventoryRoutes);

// Serve built frontends (Vite builds -> dist)
const clientDistPath = path.resolve(__dirname, "../../client/dist");
const adminDistPath = path.resolve(__dirname, "../../admin/dist");
const opsDistPath = path.resolve(__dirname, "../../opsportal/dist");
const hasClientBuild = fs.existsSync(clientDistPath);
const hasAdminBuild = fs.existsSync(adminDistPath);
const hasOpsBuild = fs.existsSync(opsDistPath);

if (hasAdminBuild) {
  const adminStatic = express.static(adminDistPath);
  app.use((req, res, next) => {
    if (isAdminHost(req)) {
      return adminStatic(req, res, next);
    }
    return next();
  });
}

if (hasOpsBuild) {
  const opsStatic = express.static(opsDistPath);
  app.use((req, res, next) => {
    if (isOpsHost(req)) {
      return opsStatic(req, res, next);
    }
    return next();
  });
}

// Mobile/IP fallback: allow /admin on non-admin hosts to serve admin app
if (hasAdminBuild) {
  app.use("/admin", express.static(adminDistPath));
}

// Fallback path for ops wallboard
if (hasOpsBuild) {
  app.use("/ops", express.static(opsDistPath));
}

if (hasClientBuild) {
  const clientStatic = express.static(clientDistPath);
  app.use((req, res, next) => {
    if (isClientHost(req)) {
      return clientStatic(req, res, next);
    }
    return next();
  });
}

// SPA fallbacks
if (hasAdminBuild || hasClientBuild || hasOpsBuild) {
  app.get(/^\/admin(\/.*)?$/, (req, res, next) => {
    if (!isAdminHost(req) && hasAdminBuild) {
      return res.sendFile(path.join(adminDistPath, "index.html"));
    }
    return next();
  });

  app.get(/^\/ops(\/.*)?$/, (req, res, next) => {
    if (hasOpsBuild) {
      return res.sendFile(path.join(opsDistPath, "index.html"));
    }
    return next();
  });

  app.get(/^\/(?!api|uploads).*/, (req, res, next) => {
    if (isAdminHost(req) && hasAdminBuild) {
      return res.sendFile(path.join(adminDistPath, "index.html"));
    }
    if (isOpsHost(req) && hasOpsBuild) {
      return res.sendFile(path.join(opsDistPath, "index.html"));
    }
    if (isClientHost(req) && hasClientBuild) {
      return res.sendFile(path.join(clientDistPath, "index.html"));
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
  startWeeklyDigestScheduler();
});
// Trigger restart to rebuild indexes
