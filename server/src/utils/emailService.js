const nodemailer = require("nodemailer");

/**
 * Send an email notification
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Plain text content
 * @param {string} html - HTML content (optional)
 */
const sendEmail = async (to, subject, text, html) => {
  try {
    // In a real production environment, you would use environment variables
    // for SMTP credentials. For now, we'll log the attempt.
    console.log(`[Email Service] Attempting to send email to: ${to}`);
    console.log(`[Email Service] Subject: ${subject}`);
    console.log(`[Email Service] Content: ${text}`);

    // Higher compatibility config for Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"MagicHands Admin" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html: html || text,
    });

    console.log("[Email Service] Message sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("[Email Service] Error sending email:", error);
    return false;
  }
};

module.exports = { sendEmail };
