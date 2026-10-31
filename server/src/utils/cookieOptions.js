const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// The browser UI owns the optional five-minute inactivity policy. The server
// session must outlive that timer because some operational roles explicitly
// disable inactivity logout and rely on a sliding heartbeat while forms are open.
const DEFAULT_AUTH_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const getDefaultAuthCookieMaxAgeMs = () =>
  toPositiveInt(
    process.env.AUTH_COOKIE_MAX_AGE_MS,
    DEFAULT_AUTH_COOKIE_MAX_AGE_MS,
  );

const getAuthCookieMaxAgeMs = () =>
  getDefaultAuthCookieMaxAgeMs();

const resolveCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const envSecure = process.env.COOKIE_SECURE;
  const envSameSite = String(process.env.COOKIE_SAMESITE || "")
    .trim()
    .toLowerCase();
  const cookieDomain = String(process.env.COOKIE_DOMAIN || "").trim();
  const cookieMaxAgeMs = getAuthCookieMaxAgeMs();

  // Allow explicit override via env while keeping safe defaults.
  const secure =
    envSecure === "true" ? true : envSecure === "false" ? false : isProduction;

  // Default to Lax to reduce CSRF risk when cookies are credentialed.
  let sameSite = ["lax", "strict", "none"].includes(envSameSite)
    ? envSameSite
    : "lax";

  // Browsers reject SameSite=None without Secure.
  if (sameSite === "none" && !secure) {
    sameSite = "lax";
  }

  const options = {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: cookieMaxAgeMs,
  };
  if (cookieDomain) {
    options.domain = cookieDomain;
  }

  return options;
};

const resolveClearCookieOptions = () => {
  const base = resolveCookieOptions();
  return {
    httpOnly: base.httpOnly,
    secure: base.secure,
    sameSite: base.sameSite,
    path: base.path,
    ...(base.domain ? { domain: base.domain } : {}),
    expires: new Date(0),
  };
};

module.exports = {
  resolveCookieOptions,
  resolveClearCookieOptions,
  getAuthCookieMaxAgeMs,
};
