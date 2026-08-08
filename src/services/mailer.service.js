const nodemailer = require('nodemailer');

let transporter = null;
let loggedMissingConfig = false;

// Lazily built so a missing/incomplete SMTP config doesn't crash the app at
// boot — it just makes sendMail() reject when actually called, which the
// erate/notification callers already handle as a soft failure.
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    if (!loggedMissingConfig) {
      console.warn('[mailer] SMTP_HOST/SMTP_USER/SMTP_PASS not fully configured — emails will fail until .env is filled in.');
      loggedMissingConfig = true;
    }
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

// attachments: [{ filename, content: Buffer, contentType }]
async function sendMail({ to, cc, subject, html, attachments }) {
  const t = getTransporter();
  if (!t) {
    throw new Error('SMTP is not configured — set SMTP_HOST/SMTP_USER/SMTP_PASS in .env');
  }
  return t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    cc: cc || undefined,
    subject,
    html,
    attachments: attachments || []
  });
}

module.exports = { sendMail };
