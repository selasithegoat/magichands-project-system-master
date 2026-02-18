const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const normalizeOrigin = (value) => {
  if (!value || typeof value !== "string") return "";

  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return "";
  }
};

const getRefererOrigin = (referer) => {
  if (!referer || typeof referer !== "string") return "";

  try {
    return new URL(referer).origin.toLowerCase();
  } catch {
    return "";
  }
};

const createCsrfProtection = ({
  allowedOrigins = [],
  allowNoOriginUnsafeMethods = false,
  isTrustedOrigin = null,
} = {}) => {
  const normalizedAllowedOrigins = new Set(
    (Array.isArray(allowedOrigins) ? allowedOrigins : [])
      .map(normalizeOrigin)
      .filter(Boolean),
  );

  const isAllowed = (origin, req) => {
    if (!origin) return false;

    if (typeof isTrustedOrigin === "function") {
      return Boolean(isTrustedOrigin(origin, req));
    }

    return normalizedAllowedOrigins.has(origin);
  };

  return (req, res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) {
      return next();
    }

    const fetchSite = String(req.headers["sec-fetch-site"] || "")
      .trim()
      .toLowerCase();
    if (fetchSite === "cross-site") {
      return res.status(403).json({
        message: "CSRF protection blocked this request.",
      });
    }

    const origin = normalizeOrigin(req.headers.origin);
    if (origin) {
      if (!isAllowed(origin, req)) {
        return res.status(403).json({
          message: "Origin is not allowed.",
        });
      }
      return next();
    }

    const refererOrigin = getRefererOrigin(req.headers.referer);
    if (refererOrigin) {
      if (!isAllowed(refererOrigin, req)) {
        return res.status(403).json({
          message: "Referer is not allowed.",
        });
      }
      return next();
    }

    if (allowNoOriginUnsafeMethods) {
      return next();
    }

    return res.status(403).json({
      message: "Missing Origin/Referer for unsafe request.",
    });
  };
};

module.exports = createCsrfProtection;
