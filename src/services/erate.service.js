const axios = require('axios');
const { query } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { sendMail } = require('./mailer.service');
const eventsService = require('./events.service');

// erate_status_id on load_assignments: null = pending, 2 = accepted, -1 =
// rejected — same vocabulary as the reference Loadx-Youngs project's
// erate_type_id (added here as a plain nullable column since this backend
// has no stored-function layer to hide it behind).
const ERATE_STATUS = { ACCEPTED: 2, REJECTED: -1 };

async function fetchLoadByToken(token) {
  const result = await query('SELECT * FROM loads WHERE token = $1', [token]);
  if (!result.rows.length) throw new AppError('Invalid or expired link', 404);
  return result.rows[0];
}

// Finds the most recently generated Load Confirmation PDF for one specific
// dispatched leg — matched via the `_AID_<assignmentId>` suffix embedded in
// doc_name by pdf.service.js (documents has no dedicated FK column for this,
// same trick the reference project uses with `_DID_<dispatch_master_id>`).
async function findAssignmentPdfUrl(loadId, assignmentId) {
  const result = await query(
    `SELECT doc_url FROM documents
     WHERE ref_type_id = 6 AND ref_id = $1 AND doc_type_id = 4 AND doc_name LIKE $2
     ORDER BY id DESC LIMIT 1`,
    [loadId, `%_AID_${assignmentId}`]
  );
  return result.rows[0]?.doc_url || null;
}

async function getPublicErate(token) {
  const load = await fetchLoadByToken(token);

  const assignmentsResult = await query(
    `SELECT a.*, c.carrier_name AS dispatch_carrier_name
     FROM load_assignments a
     LEFT JOIN carriers c ON c.id = a.dispatch_carrier_id
     WHERE a.load_id = $1 AND a.is_external = true
     ORDER BY a.split_no`,
    [load.id]
  );

  const assignments = await Promise.all(
    assignmentsResult.rows.map(async (a) => ({
      id: a.id,
      splitNo: a.split_no,
      carrierName: a.dispatch_carrier_name,
      driverName: a.driver_name,
      driverPhone: a.driver_phone,
      vehicleNo: a.vehicle_no,
      trailerNo: a.trailer_no,
      erateStatusId: a.erate_status_id,
      pdfUrl: await findAssignmentPdfUrl(load.id, a.id)
    }))
  );

  return {
    loadId: load.id,
    loadNumber: load.load_number,
    assignments
  };
}

async function resolveDispatcherEmail(assignment) {
  if (!assignment.dispatcher_id) return null;
  const result = await query('SELECT user_email, user_name FROM carrier_users WHERE id = $1', [assignment.dispatcher_id]);
  const row = result.rows[0];
  return row?.user_email || null;
}

async function fetchAsAttachment(url, filename) {
  try {
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
    return { filename, content: Buffer.from(res.data), contentType: 'application/pdf' };
  } catch (_) {
    return null;
  }
}

// Public accept/reject — the driver-supplied fields reuse the same
// load_assignments columns the dispatch modals already write (driver_name/
// driver_phone/vehicle_no/trailer_no), so acceptance just fills in whatever
// wasn't set at dispatch time.
async function updateErate(token, assignmentId, payload) {
  const load = await fetchLoadByToken(token);

  const assignmentResult = await query(
    'SELECT * FROM load_assignments WHERE id = $1 AND load_id = $2 AND is_external = true',
    [assignmentId, load.id]
  );
  const assignment = assignmentResult.rows[0];
  if (!assignment) throw new AppError('Dispatch leg not found for this link', 404);

  const statusId = payload.status === 'accept' ? ERATE_STATUS.ACCEPTED : ERATE_STATUS.REJECTED;

  const updated = await query(
    `UPDATE load_assignments
     SET driver_name = COALESCE($1, driver_name),
         driver_phone = COALESCE($2, driver_phone),
         vehicle_no = COALESCE($3, vehicle_no),
         trailer_no = COALESCE($4, trailer_no),
         erate_status_id = $5
     WHERE id = $6
     RETURNING *`,
    [payload.driverName || null, payload.driverPhone || null, payload.vehicleNo || null, payload.trailerNo || null, statusId, assignmentId]
  );

  // This is the public, unauthenticated accept/reject action — there's no
  // logged-in user, so the event's userId is null ("System"/the carrier
  // themselves via the public link, not an internal user).
  await eventsService.logEvent(null, {
    loadId: load.id,
    carrierId: load.carrier_id,
    userId: null,
    eventTypeId: statusId === ERATE_STATUS.ACCEPTED ? eventsService.EVENT_TYPES.RATE_CON_ACCEPTED : eventsService.EVENT_TYPES.RATE_CON_REJECTED,
    remark: `Split ${assignment.split_no} ${statusId === ERATE_STATUS.ACCEPTED ? 'accepted' : 'rejected'} by ${payload.driverName || 'carrier'}`,
    newValue: {
      snapshot: {
        splitNo: assignment.split_no,
        driverName: payload.driverName || null,
        driverPhone: payload.driverPhone || null,
        vehicleNo: payload.vehicleNo || null,
        trailerNo: payload.trailerNo || null
      }
    }
  });

  // Confirmatory email back to the dispatcher — WITH the PDF attached this
  // time (the initial send was link-only). Best-effort: a missing
  // dispatcher email or SMTP config never fails the accept/reject action
  // itself, since the carrier-facing response matters more than the notify.
  if (statusId === ERATE_STATUS.ACCEPTED) {
    try {
      const dispatcherEmail = await resolveDispatcherEmail(assignment);
      const pdfUrl = await findAssignmentPdfUrl(load.id, assignmentId);
      if (dispatcherEmail && pdfUrl) {
        const attachment = await fetchAsAttachment(pdfUrl, `Load_Confirmation_${load.load_number}.pdf`);
        await sendMail({
          to: dispatcherEmail,
          subject: `Rate Confirmation Accepted — Load #${load.load_number}`,
          html: `<p>${payload.driverName || 'The carrier'} accepted the rate confirmation for Load #${load.load_number}.</p>
                 <p>Driver: ${payload.driverName || '—'} · Phone: ${payload.driverPhone || '—'}</p>
                 <p>Vehicle #: ${payload.vehicleNo || '—'} · Trailer #: ${payload.trailerNo || '—'}</p>`,
          attachments: attachment ? [attachment] : []
        });
      }
    } catch (err) {
      console.error('[erate] confirmation email failed:', err.message);
    }
  }

  return updated.rows[0];
}

module.exports = { getPublicErate, updateErate, ERATE_STATUS };
