/**
 * Shared dynamic INSERT/UPDATE builders for wide master tables.
 *
 * The real schema uses a single audit pair per table: `aduserid` (set on both
 * insert AND update, per spec) and `addtime` (set only on insert — there is no
 * edit-timestamp column anywhere in this schema).
 */

async function insertRow(executor, config, payload, userId) {
  const { table, columns, hasAduserid = true, hasAddtime = true } = config;

  // Only send columns actually present in the payload — omitted columns fall
  // through to the table's own DEFAULT instead of being forced to NULL.
  const cols = [];
  const values = [];
  for (const field of columns) {
    if (payload[field] !== undefined) {
      cols.push(field);
      values.push(payload[field]);
    }
  }

  if (hasAduserid) {
    cols.push('aduserid');
    values.push(userId);
  }
  if (hasAddtime) {
    cols.push('addtime');
    values.push(new Date());
  }

  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  const result = await executor.query(sql, values);
  return result.rows[0];
}

async function updateRow(executor, config, id, payload, userId) {
  const { table, columns, hasAduserid = true } = config;

  const setClauses = [];
  const values = [];
  for (const field of columns) {
    if (payload[field] !== undefined) {
      values.push(payload[field]);
      setClauses.push(`${field} = $${values.length}`);
    }
  }

  if (!setClauses.length) return null;

  if (hasAduserid) {
    values.push(userId);
    setClauses.push(`aduserid = $${values.length}`);
  }

  values.push(id);
  const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`;
  const result = await executor.query(sql, values);
  return result.rows[0];
}

module.exports = { insertRow, updateRow };
