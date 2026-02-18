const resolveCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const envSecure = process.env.COOKIE_SECURE;
  const envSameSite = String(process.env.COOKIE_SAMESITE || "")
    .trim()
    .toLowerCase();

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

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 30 * 60 * 1000, // 30 minutes
  };
};

const resolveClearCookieOptions = () => {
  const base = resolveCookieOptions();
  return {
    httpOnly: base.httpOnly,
    secure: base.secure,
    sameSite: base.sameSite,
    expires: new Date(0),
  };
};

module.exports = { resolveCookieOptions, resolveClearCookieOptions };
