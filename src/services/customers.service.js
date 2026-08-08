const { query, withTransaction } = require('../config/database');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { insertRow, updateRow } = require('../utils/sqlBuilders');
const { AppError } = require('../utils/AppError');

const CUSTOMER_COLUMNS = [
  'carrier_id',
  'name',
  'customer_id',
  'dba_name',
  'trans_carrier_id',
  'sales_agent_id',
  'customer_type_id',
  'mc',
  'dot',
  'fed_tax_id',
  'contact_person',
  'isd_code',
  'phone_no',
  'email',
  'fax_no',
  'address',
  'address2',
  'city_id',
  'website',
  'dispatch_contact',
  'factoring_id',
  'tafs_debtor_name',
  'apex_company_name',
  'is_appointment_req',
  'is_trailer_pool',
  'customer_load_notes',
  'customer_notes',
  'customer_since',
  'status_id',
  'city_name',
  'state_name',
  'country_name',
  'lat',
  'long'
];

// customer_contacts uses a FK column literally named `customer` (not customer_id).
const CHILD_TABLES = {
  contacts: {
    table: 'customer_contacts',
    fkColumn: 'customer',
    columns: ['type_id', 'name', 'isd_code', 'phone_no', 'ext', 'email', 'status_id', 'is_preferred', 'is_send_truck_capacity'],
    hasAduserid: true,
    hasAddtime: true
  },
  billing: {
    table: 'customer_billing',
    fkColumn: 'customer_id',
    columns: [
      'email',
      'name',
      'isd_code',
      'phone_no',
      'ext',
      'invoicing_method_id',
      'payment_setup_id',
      'dwell_tim_mins',
      'is_confirm_req',
      'is_exclude_factoring_fees',
      'is_show_factoring_fees',
      'tabbank_customer_id'
    ],
    hasAduserid: true,
    hasAddtime: true
  }
};

async function replaceChildRows(client, key, customerId, rows, userId) {
  const config = CHILD_TABLES[key];
  await client.query(`DELETE FROM ${config.table} WHERE ${config.fkColumn} = $1`, [customerId]);

  if (!Array.isArray(rows) || rows.length === 0) return [];

  const inserted = [];
  for (const row of rows) {
    const insertedRow = await insertRow(
      client,
      { ...config, columns: [config.fkColumn, ...config.columns] },
      { ...row, [config.fkColumn]: customerId },
      userId
    );
    inserted.push(insertedRow);
  }
  return inserted;
}

async function fetchChildRows(key, customerId) {
  const config = CHILD_TABLES[key];
  const result = await query(`SELECT * FROM ${config.table} WHERE ${config.fkColumn} = $1 ORDER BY id`, [
    customerId
  ]);
  return result.rows;
}

async function list({ page, search, carrierId, customerTypeId, statusId }) {
  const pagination = getPagination({ page: page.page, pageSize: page.pageSize });
  const params = [];
  const conditions = [];

  if (carrierId) {
    params.push(carrierId);
    conditions.push(`carrier_id = $${params.length}`);
  }
  if (customerTypeId) {
    params.push(customerTypeId);
    conditions.push(`customer_type_id = $${params.length}`);
  }
  if (statusId) {
    params.push(statusId);
    conditions.push(`status_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*)::int AS count FROM customers ${whereClause}`, params);
  const totalCount = countResult.rows[0].count;

  let sql = `SELECT * FROM customers ${whereClause} ORDER BY name`;
  if (!pagination.all) {
    params.push(pagination.limit, pagination.offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const result = await query(sql, params);
  return { rows: result.rows, meta: buildPageMeta(pagination, totalCount) };
}

async function getById(id) {
  const result = await query('SELECT * FROM customers WHERE id = $1', [id]);
  const customer = result.rows[0];
  if (!customer) {
    throw new AppError('Customer not found', 404);
  }

  const [contacts, billing] = await Promise.all([
    fetchChildRows('contacts', id),
    fetchChildRows('billing', id)
  ]);

  return { ...customer, contacts, billing };
}

function validateCreatePayload(payload) {
  if (!payload.name) {
    throw new AppError('name is required', 400);
  }
}

async function saveChildSections(client, customerId, payload, userId) {
  for (const key of Object.keys(CHILD_TABLES)) {
    if (payload[key] !== undefined) {
      await replaceChildRows(client, key, customerId, payload[key], userId);
    }
  }
}

async function create(payload, userId) {
  validateCreatePayload(payload);

  const customerId = await withTransaction(async (client) => {
    const customer = await insertRow(client, { table: 'customers', columns: CUSTOMER_COLUMNS }, payload, userId);
    await saveChildSections(client, customer.id, payload, userId);
    return customer.id;
  });

  return getById(customerId);
}

async function update(id, payload, userId) {
  await getById(id);

  await withTransaction(async (client) => {
    await updateRow(client, { table: 'customers', columns: CUSTOMER_COLUMNS }, id, payload, userId);
    await saveChildSections(client, id, payload, userId);
  });

  return getById(id);
}

async function remove(id) {
  // customers has no boolean is_active column; status_id is a lookup (see type_master)
  // rather than a simple active flag, so we require an explicit status_id to "deactivate".
  throw new AppError(
    'customers has no is_active column — set status_id via POST /customers/update/:id to change status instead',
    400
  );
}

module.exports = { list, getById, create, update, remove };
