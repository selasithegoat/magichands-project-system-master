const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const envSecure = process.env.COOKIE_SECURE;
  const envSameSite = String(process.env.COOKIE_SAMESITE || "")
    .trim()
    .toLowerCase();
  const cookieDomain = String(process.env.COOKIE_DOMAIN || "").trim();
  const cookieMaxAgeMs = toPositiveInt(
    process.env.AUTH_COOKIE_MAX_AGE_MS,
    5 * 60 * 1000,
  );

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

module.exports = { resolveCookieOptions, resolveClearCookieOptions };
