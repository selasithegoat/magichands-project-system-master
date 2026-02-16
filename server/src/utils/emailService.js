const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const toText = (value) => (typeof value === "string" ? value.trim() : "");
const EMAIL_LOGO_CID = "magichands-logo@mail";
const DEFAULT_EMAIL_LOGO_PATHS = [
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

const resolveEmailLogoPath = () => {
  const envPath = toText(process.env.EMAIL_LOGO_PATH);
  const candidates = [];

  if (envPath) {
    const normalized = path.isAbsolute(envPath)
      ? envPath
      : path.resolve(__dirname, "../../../", envPath);
    candidates.push(normalized);
  }

  candidates.push(...DEFAULT_EMAIL_LOGO_PATHS);

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
};

const buildDefaultEmailHtml = (subject, text, options = {}) => {
  const safeSubject = escapeHtml(subject || "Notification");
  const message = escapeHtml(text || "").replace(/\r?\n/g, "<br />");
  const year = new Date().getFullYear();
  const { includeLogo = false } = options;

  const logoBlock = includeLogo
    ? `
                <div style="margin-bottom:12px;">
                  <img
                    src="cid:${EMAIL_LOGO_CID}"
                    alt="Magichands Logo"
                    style="display:block;width:132px;height:auto;border:0;outline:none;text-decoration:none;"
                  />
                </div>
      `.trim()
    : "";

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f6fb;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#0f172a,#1d4ed8);padding:22px 24px;color:#ffffff;">
                ${logoBlock}
                <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">Magichands Co. Ltd.</div>
                <div style="margin-top:8px;font-size:22px;line-height:1.25;font-weight:700;">${safeSubject}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <div style="font-size:15px;line-height:1.7;color:#1f2937;">${message || "You have a new update."}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 22px;">
                <div style="height:1px;background:#e2e8f0;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px;font-size:12px;line-height:1.6;color:#64748b;">
                This is an automated message from Magichands Project System.<br />
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
