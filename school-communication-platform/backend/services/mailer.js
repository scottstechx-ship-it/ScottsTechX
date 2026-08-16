/**
 * Email service (lazy nodemailer — only loads if SMTP is configured).
 *
 * SMTP is optional. When configured (SMTP_HOST in .env), important emails are
 * sent (password reset links, confirmations, important announcements).
 * When NOT configured, sendEmail returns { sent:false, dev:true } and callers
 * may surface the content in the development response instead.
 */
const env = require('../config/env');

let transporter = null;
let nodemailerLoaded = false;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  if (nodemailerLoaded) return transporter;
  try {
    // Lazy require so the app never breaks when nodemailer is absent/unused.
    const nodemailer = require('nodemailer');
    nodemailerLoaded = true;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: ['465', 'true'].includes(String(process.env.SMTP_PORT || '')),
      auth: process.env.SMTP_USER ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS || '',
      } : undefined,
    });
  } catch (e) {
    nodemailerLoaded = true;
    transporter = null;
  }
  return transporter;
}

/**
 * Best-effort email send. Never throws — callers must not depend on it.
 * @returns {Promise<{sent:boolean, dev:boolean, error?:string}>}
 */
async function sendEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) return { sent: false, dev: true };
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'School Platform <no-reply@school.local>',
      to,
      subject,
      html,
    });
    return { sent: true, dev: false };
  } catch (e) {
    console.error('Mail error:', e.message);
    return { sent: false, dev: false, error: e.message };
  }
}

module.exports = { sendEmail };
