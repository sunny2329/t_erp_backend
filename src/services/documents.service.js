const { query, pool } = require('../config/database');
const { insertRow } = require('../utils/sqlBuilders');
const { AppError } = require('../utils/AppError');
const { deleteFromSupabase } = require('./uploads.service');

// documents.ref_type_id is a generic entity-type discriminator (not itself a
// type_master row) — verified against the live data: type_master(type_id=13)
// is the "entity type" directory and id=6 there is literally "Loads". Every
// document this API writes is Load-scoped, so this is the one constant value
// used everywhere below.
const LOAD_REF_TYPE_ID = 6;
// type_master(type_id=23) is the Load document-type vocabulary (BOL, POD,
// Invoice, ...) — confirmed live (35 rows, includes load-specific entries
// like "Load Cancellation Tender", "Email Thread Pertaining to Load").
const DOC_TYPE_TYPE_ID = 23;

const DOCUMENTS_CONFIG = {
  table: 'documents',
  columns: ['carrier_id', 'ref_type_id', 'ref_id', 'load_id', 'doc_name', 'doc_type_id', 'doc_url', 'exp_date']
};

async function assertLoadExists(loadId) {
  const result = await query('SELECT id FROM loads WHERE id = $1', [loadId]);
  if (!result.rows.length) throw new AppError('Load not found', 404);
}

async function listForLoad(loadId, carrierId) {
  const result = await query(
    `SELECT d.*, tm.description AS doc_type_label
     FROM documents d
     LEFT JOIN type_master tm ON tm.type_id = $1 AND tm.id = d.doc_type_id
     WHERE d.ref_type_id = $2 AND d.ref_id = $3 AND d.carrier_id = $4
     ORDER BY d.addtime DESC, d.id DESC`,
    [DOC_TYPE_TYPE_ID, LOAD_REF_TYPE_ID, loadId, carrierId]
  );
  return result.rows;
}

async function createForLoad(loadId, payload, userId, carrierId) {
  await assertLoadExists(loadId);
  if (!payload.doc_url) throw new AppError('doc_url is required', 400);

  return insertRow(
    pool,
    DOCUMENTS_CONFIG,
    { ...payload, carrier_id: carrierId, ref_type_id: LOAD_REF_TYPE_ID, ref_id: loadId, load_id: loadId },
    userId
  );
}

async function removeForLoad(id, loadId, carrierId) {
  const result = await query(
    `DELETE FROM documents WHERE id = $1 AND ref_type_id = $2 AND ref_id = $3 AND carrier_id = $4 RETURNING doc_name, doc_type_id, doc_url`,
    [id, LOAD_REF_TYPE_ID, loadId, carrierId]
  );
  if (!result.rows.length) throw new AppError('Document not found', 404);
  // Best-effort — never fail the delete request over a storage cleanup issue.
  try {
    await deleteFromSupabase(result.rows[0].doc_url);
  } catch (_) {}
  return result.rows[0];
}

module.exports = { listForLoad, createForLoad, removeForLoad, LOAD_REF_TYPE_ID, DOC_TYPE_TYPE_ID };
