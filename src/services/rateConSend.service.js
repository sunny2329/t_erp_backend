const { AppError } = require('../utils/AppError');
const { sendMail } = require('./mailer.service');

// "Send e-rate Con" — the caller (controller) has already regenerated+saved
// a fresh Load Confirmation PDF for this leg via pdf.service.js (needs
// `req` to build the file URL, so that step lives in the controller). This
// just builds the public link and sends a link-only email — no PDF
// attachment, matching the reference project's SendErateModal (the PDF is
// only reachable via the public token URL, not emailed directly).
function buildPublicLink(load, assignmentId) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base.replace(/\/$/, '')}/rate-confirm/${load.token}/${assignmentId}`;
}

function defaultBody({ loadNumber, carrierName, publicUrl, message }) {
  return `
    ${message ? `<p>${message}</p>` : ''}
    <p>Please review and confirm the rate confirmation for Load #${loadNumber}${carrierName ? ` (${carrierName})` : ''}:</p>
    <p><a href="${publicUrl}">${publicUrl}</a></p>
  `;
}

async function sendRateCon(load, { assignmentId, to, cc, subject, message, dispatchCarrierName }) {
  if (!assignmentId) throw new AppError('assignmentId is required', 400);
  if (!to) throw new AppError('Recipient email (to) is required', 400);

  const publicUrl = buildPublicLink(load, assignmentId);
  const emailSubject = subject || `Rate Confirmation – Load #${load.load_number}`;
  const html = defaultBody({ loadNumber: load.load_number, carrierName: dispatchCarrierName, publicUrl, message });

  await sendMail({ to, cc, subject: emailSubject, html, attachments: [] });
  return { publicUrl };
}

module.exports = { sendRateCon, buildPublicLink };
