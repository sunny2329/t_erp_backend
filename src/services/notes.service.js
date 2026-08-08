const { query, pool } = require('../config/database');
const { insertRow, updateRow } = require('../utils/sqlBuilders');
const { AppError } = require('../utils/AppError');
const { LOAD_REF_TYPE_ID } = require('./documents.service');

const NOTES_CONFIG = {
  table: 'notes',
  columns: ['carrier_id', 'ref_type_id', 'ref_id', 'notes']
};

async function assertLoadExists(loadId) {
  const result = await query('SELECT id FROM loads WHERE id = $1', [loadId]);
  if (!result.rows.length) throw new AppError('Load not found', 404);
}

async function listForLoad(loadId, carrierId) {
  const result = await query(
    `SELECT n.*, u.full_name AS added_by
     FROM notes n
     LEFT JOIN carrier_users u ON u.id = n.aduserid
     WHERE n.ref_type_id = $1 AND n.ref_id = $2 AND n.carrier_id = $3
     ORDER BY n.addtime ASC NULLS LAST, n.id ASC`,
    [LOAD_REF_TYPE_ID, loadId, carrierId]
  );
  return result.rows;
}

async function createForLoad(loadId, payload, userId, carrierId) {
  await assertLoadExists(loadId);
  if (!payload.notes || !payload.notes.trim()) throw new AppError('notes is required', 400);

  return insertRow(
    pool,
    NOTES_CONFIG,
    { notes: payload.notes.trim(), carrier_id: carrierId, ref_type_id: LOAD_REF_TYPE_ID, ref_id: loadId },
    userId
  );
}

async function updateForLoad(id, loadId, payload, userId, carrierId) {
  const existing = await query(
    `SELECT id, notes FROM notes WHERE id = $1 AND ref_type_id = $2 AND ref_id = $3 AND carrier_id = $4`,
    [id, LOAD_REF_TYPE_ID, loadId, carrierId]
  );
  if (!existing.rows.length) throw new AppError('Note not found', 404);
  if (!payload.notes || !payload.notes.trim()) throw new AppError('notes is required', 400);

  const row = await updateRow(pool, NOTES_CONFIG, id, { notes: payload.notes.trim() }, userId);
  return { ...row, previousNotes: existing.rows[0].notes };
}

async function removeForLoad(id, loadId, carrierId) {
  const result = await query(
    `DELETE FROM notes WHERE id = $1 AND ref_type_id = $2 AND ref_id = $3 AND carrier_id = $4 RETURNING id, notes`,
    [id, LOAD_REF_TYPE_ID, loadId, carrierId]
  );
  if (!result.rows.length) throw new AppError('Note not found', 404);
  return result.rows[0];
}

module.exports = { listForLoad, createForLoad, updateForLoad, removeForLoad };
