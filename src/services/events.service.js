const { pool, query } = require('../config/database');

// events.ref_type_id follows the same generic entity-type convention as
// documents/notes (see documents.service.js) — 6 = Loads.
const REF_TYPE_LOAD = 6;

// This is a from-scratch, Node-native event vocabulary — NOT a port of the
// reference Loadx-Youngs-Backend's type_master(type_id=34) values. That
// reference system's audit trail is generated almost entirely inside opaque
// Postgres stored functions (ss_save_loads_v1, ss_save_changeloadstatus,
// ss_save_document, ...) that aren't visible in its own source tree, has at
// least two genuinely dead event types (Note Edited/Deleted — declared,
// never written, no UI), and reuses the SAME event_type_id (13, "Dropped")
// both as history AND as live operational storage read by settlement/fuel
// calculations elsewhere. This backend has no stored-function layer at all
// (see t_erp_backend/README.md), so every mutation already funnels through
// one canonical service function — logging happens there, in the open, and
// nothing here is ever used for anything but display.
const EVENT_TYPES = {
  LOAD_CREATED: 1,
  LOAD_EDITED: 2,
  ASSIGNMENT_CREATED: 16,
  ASSIGNMENT_UPDATED: 17,
  ASSIGNMENT_REMOVED: 18,
  DOCUMENT_UPLOADED: 19,
  DOCUMENT_DELETED: 20,
  NOTE_ADDED: 21,
  NOTE_UPDATED: 22,
  NOTE_DELETED: 23,
  PDF_GENERATED: 24,
  RATE_CON_SENT: 25,
  RATE_CON_ACCEPTED: 26,
  RATE_CON_REJECTED: 27
};

const EVENT_LABELS = {
  [EVENT_TYPES.LOAD_CREATED]: 'Load Created',
  [EVENT_TYPES.LOAD_EDITED]: 'Load Edited',
  [EVENT_TYPES.ASSIGNMENT_CREATED]: 'Dispatched',
  [EVENT_TYPES.ASSIGNMENT_UPDATED]: 'Dispatch Updated',
  [EVENT_TYPES.ASSIGNMENT_REMOVED]: 'Dispatch Removed',
  [EVENT_TYPES.DOCUMENT_UPLOADED]: 'Document Uploaded',
  [EVENT_TYPES.DOCUMENT_DELETED]: 'Document Deleted',
  [EVENT_TYPES.NOTE_ADDED]: 'Note Added',
  [EVENT_TYPES.NOTE_UPDATED]: 'Note Updated',
  [EVENT_TYPES.NOTE_DELETED]: 'Note Deleted',
  [EVENT_TYPES.PDF_GENERATED]: 'Document Generated',
  [EVENT_TYPES.RATE_CON_SENT]: 'Rate Confirmation Sent',
  [EVENT_TYPES.RATE_CON_ACCEPTED]: 'Rate Confirmation Accepted',
  [EVENT_TYPES.RATE_CON_REJECTED]: 'Rate Confirmation Rejected'
};

function humanize(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Normalizes a value for equality comparison only (not for storage/display)
// — "" / null / undefined are all "empty", numbers and their string forms
// compare equal ("12" === 12), so re-saving a form with unchanged numeric
// fields doesn't produce phantom diff rows.
function normalize(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(v);
}

// Generic before/after object diff — every event type in this file uses
// this SAME function. The reference project only had one genuinely generic,
// reusable diff utility (buildSettlementDiff, used solely for settlement
// audit events) while every other event type either had its diffing logic
// hidden in a stored function or wasn't diffed at all. Applying one
// consistent utility everywhere is the core "do it better" decision here.
//
// `fields` is a { key: { label, ref } } map — `ref` is a hint for the
// frontend on how to resolve a raw id/code into a human label (it already
// has every relevant master list loaded via DataContext, so resolution
// happens client-side rather than via extra backend joins per event type —
// see LoadHistoryModal.jsx). Only keys present in `fields` are considered;
// this is how each call site whitelists exactly which columns are
// audit-worthy (skips internal/audit columns like id/aduserid/addtime).
function diffObjects(before, after, fields) {
  const changes = [];
  for (const [key, meta] of Object.entries(fields)) {
    const oldVal = before ? before[key] : undefined;
    const newVal = after ? after[key] : undefined;
    if (normalize(oldVal) === normalize(newVal)) continue;
    changes.push({
      field: key,
      label: meta.label || humanize(key),
      ref: meta.ref || null,
      oldValue: oldVal ?? null,
      newValue: newVal ?? null
    });
  }
  return changes;
}

// Whitelists a row down to just the fields a given *_FIELD_META map cares
// about — used to build create/delete-event snapshots (see loads.service.js,
// loadAssignments.service.js, documents.service.js, notes.service.js).
function pickFields(row, fields) {
  const snapshot = {};
  for (const key of Object.keys(fields)) snapshot[key] = row[key] ?? null;
  return snapshot;
}

async function logEvent(executor, { loadId, carrierId, userId, eventTypeId, remark, oldValue, newValue }) {
  const exec = executor || pool;
  await exec.query(
    `INSERT INTO events (carrier_id, ref_type_id, ref_id, event_type_id, event_time, addtime, aduserid, remark, old_value, new_value)
     VALUES ($1, $2, $3, $4, now(), now(), $5, $6, $7, $8)`,
    [
      carrierId,
      REF_TYPE_LOAD,
      loadId,
      eventTypeId,
      userId || null,
      remark || null,
      oldValue !== undefined ? JSON.stringify(oldValue) : null,
      newValue !== undefined ? JSON.stringify(newValue) : null
    ]
  );
}

function safeParse(v) {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch (_) {
    return null;
  }
}

async function getLoadHistory(loadId, carrierId) {
  const result = await query(
    `SELECT e.id, e.event_type_id, e.remark, e.old_value, e.new_value, e.addtime, u.full_name AS added_by
     FROM events e
     LEFT JOIN carrier_users u ON u.id = e.aduserid
     WHERE e.ref_type_id = $1 AND e.ref_id = $2 AND e.carrier_id = $3
     ORDER BY e.addtime DESC, e.id DESC`,
    [REF_TYPE_LOAD, loadId, carrierId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    eventTypeId: row.event_type_id,
    label: EVENT_LABELS[row.event_type_id] || 'Update',
    remark: row.remark,
    addedBy: row.added_by || 'System',
    addtime: row.addtime,
    oldValue: safeParse(row.old_value),
    newValue: safeParse(row.new_value)
  }));
}

module.exports = { EVENT_TYPES, EVENT_LABELS, REF_TYPE_LOAD, diffObjects, pickFields, logEvent, getLoadHistory, humanize };
