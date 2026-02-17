const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const toText = (value) => (typeof value === "string" ? value.trim() : "");
const EMAIL_LOGO_CID = "magichands-logo@mail";
const DEFAULT_EMAIL_LOGO_PATHS = [
  path.resolve(__dirname, "../../../client/public/icon.png"),
  path.resolve(__dirname, "../../../admin/public/icon.png"),
  path.resolve(__dirname, "../../../client/public/mhlogo.png"),
  path.resolve(__dirname, "../../../admin/public/mhlogo.png"),
];

const escapeHtml = (value = "") =>
  toText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const stripTrailingSlashes = (value) => toText(value).replace(/\/+$/, "");

const resolveEmailLogoPath = () => {
  const envPath = toText(process.env.EMAIL_LOGO_PATH);
  const candidates = [...DEFAULT_EMAIL_LOGO_PATHS];

  if (envPath) {
    const normalized = path.isAbsolute(envPath)
      ? envPath
      : path.resolve(__dirname, "../../../", envPath);
    candidates.push(normalized);
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
};

const toUrl = (value) => {
  const raw = toText(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const scheme = shouldUseHttpByDefault(raw) ? "http" : "https";
  return `${scheme}://${raw}`;
};

const resolvePortalUrl = () =>
  toUrl(
    process.env.CLIENT_PORTAL_URL ||
      process.env.CLIENT_URL ||
      process.env.CLIENT_HOST ||
      "",
  );

const resolvePortalFallbackUrl = () =>
  toUrl(
    process.env.CLIENT_PORTAL_FALLBACK_URL ||
      process.env.CLIENT_MOBILE_URL ||
      process.env.CLIENT_IP_URL ||
      "",
  );

const resolveServerBaseUrl = () =>
  toUrl(
    process.env.EMAIL_LINK_BASE_URL ||
      process.env.SERVER_PUBLIC_URL ||
      process.env.API_BASE_URL ||
      process.env.API_URL ||
      "",
  );

const resolveNotificationCenterUrl = () => {
  const explicit = toUrl(
    process.env.EMAIL_NOTIFICATION_CENTER_URL || process.env.EMAIL_CTA_URL || "",
  );
  if (explicit) return explicit;

  const serverBaseUrl = resolveServerBaseUrl();
  if (serverBaseUrl) {
    return `${stripTrailingSlashes(serverBaseUrl)}/api/portal/open-notifications`;
  }

  return resolvePortalFallbackUrl() || resolvePortalUrl();
};

const buildMessageHtml = (text) => {
  const normalized = toText(text).replace(/\r\n/g, "\n");
  if (!normalized) {
    return `<p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">You have a new notification from MagicHands.</p>`;
  }

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return `<p style="margin:0;font-size:16px;line-height:1.65;color:#111827;">${escapeHtml(normalized)}</p>`;
  }

  return blocks
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const isBulletList =
        lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line));

      if (isBulletList) {
        const items = lines
          .map((line) => line.replace(/^[-*]\s+/, ""))
          .map(
            (line) =>
              `<li style="margin:0 0 8px;color:#111827;">${escapeHtml(line)}</li>`,
          )
          .join("");

        return `<ul style="margin:0 0 16px 20px;padding:0;font-size:16px;line-height:1.65;color:#111827;">${items}</ul>`;
      }

      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#111827;">${escapeHtml(lines.join(" "))}</p>`;
    })
    .join("");
};

const buildDefaultEmailHtml = (subject, text, options = {}) => {
  const safeSubject = escapeHtml(subject || "Notification");
  const message = buildMessageHtml(text || "");
  const year = new Date().getFullYear();
  const previewText = escapeHtml(toText(text) || "You have a new notification.");
  const { includeLogo = false } = options;
  const portalUrl = resolvePortalUrl();
  const portalFallbackUrl = resolvePortalFallbackUrl();
  const notificationCenterUrl = resolveNotificationCenterUrl();

  const logoBlock = includeLogo
    ? `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="56" height="56" style="width:56px;height:56px;border-radius:14px;background:#0f172a;overflow:hidden;box-shadow:0 6px 16px rgba(15,23,42,0.25);">
                  <tr>
                    <td align="center" valign="middle" style="line-height:0;">
                      <img src="cid:${EMAIL_LOGO_CID}" alt="MagicHands Icon" width="36" height="36" style="display:block;width:36px;height:36px;border:0;outline:none;text-decoration:none;" />
                    </td>
                  </tr>
                </table>
      `.trim()
    : "";

  const ctaBlock = notificationCenterUrl
    ? `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">
                  <tr>
                    <td align="center" style="border-radius:10px;background:#84cc16;">
                      <a
                        href="${escapeHtml(notificationCenterUrl)}"
                        style="
                          display:inline-block;
                          padding:12px 22px;
                          font-size:14px;
                          font-weight:700;
                          line-height:1;
                          color:#0f172a;
                          text-decoration:none;
                          border-radius:10px;
                        "
                      >
                        Open Notification Center
                      </a>
                    </td>
                  </tr>
                </table>
      `.trim()
    : "";

  const footerNote = portalUrl
    ? `Manage your notifications in your portal profile: <a href="${escapeHtml(portalUrl)}" style="color:#93c5fd;text-decoration:underline;">${escapeHtml(portalUrl)}</a>`
    : "Manage your notifications in your MagicHands profile settings.";

  const mobileFallbackNote =
    portalFallbackUrl && portalFallbackUrl !== portalUrl
      ? `<br />Mobile fallback link: <a href="${escapeHtml(portalFallbackUrl)}" style="color:#93c5fd;text-decoration:underline;">${escapeHtml(portalFallbackUrl)}</a>`
      : "";

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b1220;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${previewText}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1220;padding:26px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#111827;border-radius:18px;overflow:hidden;box-shadow:0 18px 35px rgba(2,6,23,0.45);">
            <tr>
              <td style="background:linear-gradient(135deg,#a3d900 0%,#84cc16 55%,#65a30d 100%);padding:24px 28px;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td width="72" valign="middle" style="padding-right:8px;">
                      ${logoBlock}
                    </td>
                    <td valign="middle">
                      <div style="font-size:32px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:#f8fafc;">New Notification</div>
                      <div style="margin-top:6px;font-size:18px;line-height:1.3;color:#e2f7b7;font-weight:500;">${safeSubject}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#ffffff;border:1px solid #dbe3ef;border-radius:12px;">
                  <tr>
                    <td style="padding:28px 24px 24px;">
                      <div style="font-size:30px;line-height:1.2;font-weight:800;color:#84a200;margin:0 0 18px;">
                        Action Required
                      </div>
                      <div style="font-size:16px;line-height:1.65;color:#111827;margin:0 0 20px;">
                        ${message}
                      </div>
                      ${ctaBlock}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 14px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="height:1px;background:#273449;"></td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;font-size:12px;line-height:1.65;color:#a7b4c8;">
                ${footerNote}${mobileFallbackNote}<br />
                This is an automated message from MagicHands Project System.<br />
                &copy; ${year} Magichands Co. Ltd. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
};

/**
 * Send an email notification
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Plain text content
 * @param {string} html - HTML content (optional)
 */
const sendEmail = async (to, subject, text, html) => {
  try {
    // Higher compatibility config for Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const hasCustomHtml = Boolean(toText(html));
    const logoPath = resolveEmailLogoPath();
    const includeLogo = !hasCustomHtml && Boolean(logoPath);

    const info = await transporter.sendMail({
      from: `"Magichands Co. Ltd." <${process.env.SMTP_USER}>`,
      to,
      subject,
      text: toText(text) || toText(subject),
      html:
        html || buildDefaultEmailHtml(subject, text, { includeLogo }),
      attachments: includeLogo
        ? [
            {
              filename: path.basename(logoPath),
              path: logoPath,
              cid: EMAIL_LOGO_CID,
            },
          ]
        : undefined,
    });

    return true;
  } catch {
    return false;
  }
};

module.exports = { sendEmail };
