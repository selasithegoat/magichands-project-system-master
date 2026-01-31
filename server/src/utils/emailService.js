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
    // Higher compatibility config for Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from: `"Magichands Co. Ltd." <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html: html || text,
    });

    return true;
  } catch {
    return false;
  }
};

module.exports = { sendEmail };
