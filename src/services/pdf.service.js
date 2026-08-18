const { query } = require('../config/database');
const { AppError } = require('../utils/AppError');
const { saveGeneratedFile } = require('./uploads.service');
const documentsService = require('./documents.service');
const eventsService = require('./events.service');
const { generateCustomerConfirmationPDF } = require('../utils/pdf/customerConfirmationPdf');
const { generateLoadConfirmationPDF } = require('../utils/pdf/loadConfirmationPdf');
const { generateBOLPDF } = require('../utils/pdf/bolPdf');

// type_master(type_id=23) document-type ids — confirmed live against this DB
// (id=1 "BOL", id=4 "Confirmation") and match the reference Loadx-Youngs
// project's doc_type_id numbering exactly (both were seeded from the same
// source data), so both Customer Confirmation and Load/Rate Confirmation use
// doc_type_id=4 there too — distinguished by doc_name, not doc_type_id.
const DOC_TYPE = { BOL: 1, CONFIRMATION: 4 };

async function fetchLoad(loadId, carrierId) {
  const result = await query('SELECT * FROM loads WHERE id = $1 AND carrier_id = $2', [loadId, carrierId]);
  if (!result.rows.length) throw new AppError('Load not found', 404);
  return result.rows[0];
}

async function fetchCarrier(carrierId) {
  if (!carrierId) return null;
  const result = await query('SELECT * FROM carriers WHERE id = $1', [carrierId]);
  return result.rows[0] || null;
}

async function fetchStops(loadId, splitNo) {
  const params = [loadId];
  let where = 'ls.load_id = $1';
  if (splitNo != null) {
    params.push(splitNo);
    where += ' AND ls.split_no = $2';
  }
  const result = await query(
    `SELECT ls.*,
            loc.location_name, loc.address_line1, loc.address_line2, loc.city_name, loc.state_name,
            loc.phone, loc.fax
     FROM load_stops ls
     LEFT JOIN locations loc ON loc.id = ls.shipper_id
     WHERE ${where}
     ORDER BY ls.seq_no NULLS LAST, ls.id`,
    params
  );
  return result.rows.map((row) => ({
    ...row,
    location: {
      location_name: row.location_name,
      address_line1: row.address_line1,
      address_line2: row.address_line2,
      city_name: row.city_name,
      state_name: row.state_name,
      phone: row.phone,
      fax: row.fax,
    },
  }));
}

async function fetchAssignment(assignmentId, loadId) {
  if (!assignmentId) return null;
  const result = await query('SELECT * FROM load_assignments WHERE id = $1 AND load_id = $2', [assignmentId, loadId]);
  if (!result.rows.length) throw new AppError('Dispatch assignment not found for this load', 404);
  return result.rows[0];
}

// The load's own booking-authority carrier acts as "our company" letterhead
// on every generated document. Falls back to the logged-in user's own
// carrier when the load has none set, rather than failing generation.
async function resolveLetterheadCarrier(load, carrierId) {
  return (await fetchCarrier(load.booking_authority_id)) || (await fetchCarrier(carrierId));
}

async function buildCustomerConfirmation(loadId, carrierId) {
  const load = await fetchLoad(loadId, carrierId);
  const carrier = await resolveLetterheadCarrier(load, carrierId);
  const customerResult = await query('SELECT * FROM customers WHERE id = $1', [load.customer_id]);
  const customer = customerResult.rows[0] || {};
  const stops = await fetchStops(loadId, null);

  const buffer = await generateCustomerConfirmationPDF({ carrier, customer, load, stops });
  return { buffer, load, carrier };
}

async function buildLoadConfirmation(loadId, carrierId, assignmentId) {
  const load = await fetchLoad(loadId, carrierId);
  const carrier = await resolveLetterheadCarrier(load, carrierId);

  let assignment = await fetchAssignment(assignmentId, loadId);
  if (!assignment) {
    const first = await query('SELECT * FROM load_assignments WHERE load_id = $1 ORDER BY split_no LIMIT 1', [loadId]);
    assignment = first.rows[0] || null;
  }
  const dispatchCarrier = assignment ? await fetchCarrier(assignment.dispatch_carrier_id) : null;
  const stops = await fetchStops(loadId, assignment ? assignment.split_no : null);

  const buffer = await generateLoadConfirmationPDF({
    carrier,
    dispatchCarrier,
    assignment: assignment || {},
    load,
    stops
  });
  return { buffer, load, carrier, assignment };
}

async function buildBOL(loadId, carrierId, assignmentId) {
  const load = await fetchLoad(loadId, carrierId);
  const carrier = await resolveLetterheadCarrier(load, carrierId);

  const assignment = await fetchAssignment(assignmentId, loadId);
  const stops = await fetchStops(loadId, assignment ? assignment.split_no : null);

  let salesAgentName = null;
  if (load.sales_agent_id) {
    const agentResult = await query('SELECT full_name FROM carrier_users WHERE id = $1', [load.sales_agent_id]);
    salesAgentName = agentResult.rows[0]?.full_name || null;
  }

  const buffer = await generateBOLPDF({ carrier, load, stops, salesAgentName });
  return { buffer, load, carrier, assignment };
}

// Saves the generated PDF to local disk + a `documents` row, exactly like
// the manual-upload Documents feature — so every generated PDF shows up in
// the load's Documents list too. assignmentId (when given) is embedded in
// doc_name as `_AID_<id>` so the public e-rate link can later find "the
// latest Load Confirmation PDF for this specific dispatched leg" without
// needing a dedicated FK column (mirrors the reference project's `_DID_`
// trick for the same problem).
async function persistDocument({ loadId, carrierId, userId, buffer, docType, docNamePrefix, loadNumber, assignmentId }) {
  const suffix = assignmentId ? `_AID_${assignmentId}` : '';
  const filename = `${Date.now()}-${docNamePrefix}.pdf`;
  const url = await saveGeneratedFile(loadId, filename, buffer);
  const docName = `${docNamePrefix}_${loadNumber || loadId}${suffix}`;

  const row = await documentsService.createForLoad(
    loadId,
    { doc_name: docName, doc_type_id: docType, doc_url: url },
    userId,
    carrierId
  );

  // Distinct from Document Uploaded (see documents.controller.js) —
  // generating a Customer Confirmation/Load Confirmation/BOL is its own
  // action worth its own label in history, not a generic file upload.
  await eventsService.logEvent(null, {
    loadId,
    carrierId,
    userId,
    eventTypeId: eventsService.EVENT_TYPES.PDF_GENERATED,
    remark: `${docNamePrefix.replace(/_/g, ' ')} generated`,
    newValue: { snapshot: { doc_name: row.doc_name, doc_type_id: row.doc_type_id, doc_url: row.doc_url } }
  });

  return row;
}

module.exports = {
  DOC_TYPE,
  buildCustomerConfirmation,
  buildLoadConfirmation,
  buildBOL,
  persistDocument,
  fetchStops,
  fetchAssignment,
  fetchCarrier,
  fetchLoad,
};
