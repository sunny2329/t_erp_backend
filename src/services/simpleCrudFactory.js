const { query, pool } = require('../config/database');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { insertRow, updateRow } = require('../utils/sqlBuilders');
const { AppError } = require('../utils/AppError');

/**
 * Builds a standard master-table CRUD service for tables that don't have
 * related child tables (vehicles, trailers, locations, terminal, ...).
 *
 * options:
 *   table:           db table name
 *   entityName:      human-readable name for error messages
 *   searchColumns:   columns to ILIKE-match against ?search
 *   filterColumns:   column names usable as exact-match query filters, e.g. ['carrier_id']
 *   columns:         writable columns (used for insert/update)
 *   requiredFields:  columns that must be present on create
 *   isActiveColumn:  name of the boolean "active" column on this table, or null if none exists
 *   hasAduserid/hasAddtime: whether the table has these audit columns (default true)
 *   orderBy:         ORDER BY clause (default: first search column, else 'id')
 */
function createSimpleCrudService(options) {
  const {
    table,
    entityName = table,
    searchColumns = [],
    filterColumns = [],
    columns,
    requiredFields = [],
    isActiveColumn = 'is_active',
    hasAduserid = true,
    hasAddtime = true,
    orderBy
  } = options;

  const defaultOrderBy = orderBy || searchColumns[0] || 'id';
  const rowConfig = { table, columns, hasAduserid, hasAddtime };

  async function list({ page, search, filters = {}, isActive }) {
    const pagination = getPagination({ page: page.page, pageSize: page.pageSize });
    const params = [];
    const conditions = [];

    if (isActiveColumn) {
      if (isActive === undefined) {
        conditions.push(`${isActiveColumn} = true`);
      } else if (isActive !== 'all') {
        params.push(isActive === 'true' || isActive === true);
        conditions.push(`${isActiveColumn} = $${params.length}`);
      }
    }

    for (const filterCol of filterColumns) {
      const value = filters[filterCol];
      if (value !== undefined && value !== null && value !== '') {
        params.push(value);
        conditions.push(`${filterCol} = $${params.length}`);
      }
    }

    if (search && searchColumns.length) {
      params.push(`%${search}%`);
      const clause = searchColumns.map((col) => `${col} ILIKE $${params.length}`).join(' OR ');
      conditions.push(`(${clause})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*)::int AS count FROM ${table} ${whereClause}`, params);
    const totalCount = countResult.rows[0].count;

    let sql = `SELECT * FROM ${table} ${whereClause} ORDER BY ${defaultOrderBy}`;
    if (!pagination.all) {
      params.push(pagination.limit, pagination.offset);
      sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }

    const result = await query(sql, params);
    return { rows: result.rows, meta: buildPageMeta(pagination, totalCount) };
  }

  async function getById(id) {
    const result = await query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) {
      throw new AppError(`${entityName} not found`, 404);
    }
    return row;
  }

  async function create(payload, userId) {
    for (const field of requiredFields) {
      if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
        throw new AppError(`${field} is required`, 400);
      }
    }
    if (isActiveColumn && payload[isActiveColumn] === undefined && columns.includes(isActiveColumn)) {
      payload = { ...payload, [isActiveColumn]: true };
    }
    return insertRow(pool, rowConfig, payload, userId);
  }

  async function update(id, payload, userId) {
    await getById(id);
    const updated = await updateRow(pool, rowConfig, id, payload, userId);
    return updated || getById(id);
  }

  async function remove(id) {
    if (!isActiveColumn) {
      throw new AppError(`${entityName} does not support soft delete (no active flag on this table)`, 400);
    }
    const result = await query(
      `UPDATE ${table} SET ${isActiveColumn} = false WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows[0]) {
      throw new AppError(`${entityName} not found`, 404);
    }
    return { id };
  }

  return { list, getById, create, update, remove };
}

module.exports = { createSimpleCrudService };
