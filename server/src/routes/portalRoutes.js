const express = require("express");

const router = express.Router();

const toText = (value) => (typeof value === "string" ? value.trim() : "");

const escapeHtml = (value = "") =>
  toText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeJs = (value = "") =>
  toText(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const extractHost = (value) => {
  const raw = toText(value).replace(/^[a-z]+:\/\//i, "");
  if (!raw) return "";
  const authority = raw.split("/")[0];
  return authority.split(":")[0].toLowerCase();
};

const isPrivateIpv4Host = (host) => {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second] = octets;
  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  return false;
};

const shouldUseHttpByDefault = (value) => {
  const host = extractHost(value);
  if (!host) return false;
  if (host === "localhost") return true;
  if (host.endsWith(".local") || host.endsWith(".lan")) return true;
  return isPrivateIpv4Host(host);
};

const toUrl = (value) => {
  const raw = toText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const scheme = shouldUseHttpByDefault(raw) ? "http" : "https";
  return `${scheme}://${raw}`;
};

const normalizePath = (value, fallback = "/") => {
  const raw = toText(value) || fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
};

const applyDefaultPortalPath = (value) => {
  const normalized = toUrl(value);
  if (!normalized) return "";

  try {
    const parsed = new URL(normalized);
    if (!parsed.pathname || parsed.pathname === "/") {
      parsed.pathname = normalizePath(process.env.NOTIFICATION_CENTER_PATH);
      parsed.search = "";
      parsed.hash = "";
    }
    return parsed.toString();
  } catch {
    return normalized;
  }
};

const resolveCustomPortalUrl = () =>
  applyDefaultPortalPath(
    process.env.CLIENT_PORTAL_URL ||
      process.env.CLIENT_URL ||
      process.env.CLIENT_HOST ||
      "",
  );

const resolveFallbackPortalUrl = () =>
  applyDefaultPortalPath(
    process.env.CLIENT_PORTAL_FALLBACK_URL ||
      process.env.CLIENT_MOBILE_URL ||
      process.env.CLIENT_IP_URL ||
      "",
  );

router.get("/open-notifications", (req, res) => {
  const customPortalUrl = resolveCustomPortalUrl();
  const fallbackPortalUrl = resolveFallbackPortalUrl() || customPortalUrl;
  const safeFallbackUrl = fallbackPortalUrl || customPortalUrl;

  if (!safeFallbackUrl) {
    return res.status(500).type("text/plain").send("Portal URL is not configured.");
  }

  if (!customPortalUrl || customPortalUrl === fallbackPortalUrl) {
    return res.redirect(302, safeFallbackUrl);
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <meta http-equiv="refresh" content="6;url=${escapeHtml(safeFallbackUrl)}" />
    <title>Opening Notification Center...</title>
    <style>
      body {
        margin: 0;
        font-family: Segoe UI, Arial, sans-serif;
        background: #0b1220;
        color: #e5e7eb;
        display: flex;
        min-height: 100vh;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .card {
        width: 100%;
        max-width: 520px;
        border-radius: 14px;
        border: 1px solid #1f2937;
        background: #111827;
        box-shadow: 0 20px 40px rgba(2, 6, 23, 0.4);
        padding: 22px 20px;
      }
      .title {
        margin: 0 0 10px;
        font-size: 20px;
        line-height: 1.35;
        color: #f8fafc;
        font-weight: 700;
      }
      .text {
        margin: 0;
        color: #cbd5e1;
        font-size: 14px;
        line-height: 1.6;
      }
      .link {
        color: #84cc16;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 class="title">Opening Notification Center...</h1>
      <p class="text">We are checking the best portal route for your device.</p>
      <p class="text" style="margin-top:8px;">If this takes too long, use the fallback link: <a class="link" href="${escapeHtml(safeFallbackUrl)}">Open portal</a></p>
    </div>
    <script>
      (function () {
        var primary = "${escapeJs(customPortalUrl)}";
        var fallback = "${escapeJs(safeFallbackUrl)}";
        if (!primary) {
          window.location.replace(fallback);
          return;
        }
        if (!fallback || primary === fallback) {
          window.location.replace(primary);
          return;
        }

        var redirected = false;
        var go = function (url) {
          if (redirected || !url) return;
          redirected = true;
          window.location.replace(url);
        };

        var probeUrl = primary + (primary.indexOf("?") > -1 ? "&" : "?") + "_mh_probe=" + Date.now();
        var fallbackTimer = setTimeout(function () {
          go(fallback);
        }, 2600);

        fetch(probeUrl, { mode: "no-cors", cache: "no-store" })
          .then(function () {
            clearTimeout(fallbackTimer);
            go(primary);
          })
          .catch(function () {
            clearTimeout(fallbackTimer);
            go(fallback);
          });
      })();
    </script>
  </body>
</html>`;

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return res.status(200).type("html").send(html);
});

module.exports = router;
