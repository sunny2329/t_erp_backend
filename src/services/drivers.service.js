const { query, withTransaction } = require('../config/database');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { insertRow, updateRow } = require('../utils/sqlBuilders');
const { AppError } = require('../utils/AppError');

const DRIVER_COLUMNS = [
  'carrier_id',
  'first_name',
  'middle_name',
  'last_name',
  'terminal_id',
  'driver_company_id',
  'driver_license',
  'driver_license_exp_dt',
  'email',
  'integration_id',
  'route_type_id',
  'state_id',
  'driver_type_id',
  'tax_form_id',
  'payroll_id',
  'ukg_cost_center_code',
  'per_diem',
  'terminated',
  'dba_name',
  'freeze_pay',
  'extra_pay',
  'is_active',
  'mobile_no',
  'remark',
  'user_name',
  'isd_code',
  'fcm_token',
  'device_type',
  'app_version'
  // user_pwd is intentionally excluded: driver-app login is out of scope for this
  // masters API, and the column (varchar(50)) is too short to hold a bcrypt hash
  // safely anyway. stripSecret() below also guarantees it's never read back out.
];

const CHILD_TABLES = {
  contact: {
    table: 'driver_contact',
    columns: [
      'address_line1',
      'address_line2',
      'city_id',
      'cell_phone',
      'phone',
      'emergency_contact',
      'emergency_phone',
      'ssn',
      'driver_ein_number',
      'city_name',
      'state_name',
      'country_name',
      'lat',
      'long',
      'zipcode',
      'home_city_name',
      'home_state_name'
    ],
    hasAduserid: true,
    hasAddtime: true
  },
  rateCard: {
    table: 'driver_rate_card',
    columns: [
      'mileage_rate',
      'empty_mileage_rate',
      'layover_rate',
      'layover_percentage',
      'detention_rate',
      'detention_percentage',
      'other_flat',
      'other_percentage',
      'hourly_rate_1_8',
      'overtime_rate_8_24',
      'overtime_rate_24',
      'weekly_hourly_rate',
      'weekly_ot_rate_40_60',
      'weekly_ot_rate_60',
      'per_stop_pay',
      'after_stop',
      'all_stops',
      'invoice_percentage',
      'fuel_surcharge_percentage',
      'daily_rate',
      'pay_method_id',
      'stops'
    ],
    hasAduserid: true,
    hasAddtime: true
  },
  teamRateCard: {
    table: 'driver_team_rate_card',
    columns: ['team_mileage_rate', 'team_empty_mileage_rate', 'per_stop_pay_team', 'after_stop_team', 'all_stops_team', 'stops'],
    hasAduserid: true,
    hasAddtime: true
  },
  detailsExtended: {
    table: 'driver_details_extended',
    columns: [
      'years_of_experience',
      'date_of_birth',
      'last_drug_test_date',
      'medical_expiration_date',
      'fleet_card_number',
      'avg_daily_mileage',
      'date_of_join',
      'recruited_by',
      'last_duty_status',
      'last_duty_time',
      'registered_for_clearinghouse',
      'physical_expiration',
      'twic_card_expiration',
      'cdl_issuance_date',
      'drug_alcohol_positive_tests',
      'revoked_licenses',
      'driving_convictions',
      'drug_alcohol_convictions',
      'clearing_date',
      'mvr_expiration_date'
    ],
    hasAduserid: true,
    hasAddtime: true
  },
  endorsements: {
    table: 'driver_endorsements',
    columns: ['hazardous_materials', 'tank_vehicles', 'double_triple_trailers', 'passenger', 'school_bus', 'twic_no'],
    hasAduserid: true,
    hasAddtime: true
  },
  payables: {
    table: 'driver_payables',
    columns: ['payable_to', 'name_company', 'ein_number', 'email', 'address', 'city', 'state', 'zip_code', 'is_disable_settlement', 'is_active'],
    hasAduserid: true,
    hasAddtime: true
  }
};

function stripSecret(driver) {
  if (!driver) return driver;
  const { user_pwd, ...safe } = driver;
  return safe;
}

async function replaceChildRows(client, key, driverId, rows, userId) {
  const config = CHILD_TABLES[key];
  await client.query(`DELETE FROM ${config.table} WHERE driver_id = $1`, [driverId]);

  if (!Array.isArray(rows) || rows.length === 0) return [];

  const inserted = [];
  for (const row of rows) {
    const insertedRow = await insertRow(
      client,
      { ...config, columns: ['driver_id', ...config.columns] },
      { ...row, driver_id: driverId },
      userId
    );
    inserted.push(insertedRow);
  }
  return inserted;
}

async function fetchChildRows(key, driverId) {
  const config = CHILD_TABLES[key];
  const result = await query(`SELECT * FROM ${config.table} WHERE driver_id = $1 ORDER BY id`, [driverId]);
  return result.rows;
}

async function list({ page, search, carrierId, isActive }) {
  const pagination = getPagination({ page: page.page, pageSize: page.pageSize });
  const params = [];
  const conditions = [];

  if (isActive === undefined) {
    conditions.push('is_active = true');
  } else if (isActive !== 'all') {
    params.push(isActive === 'true' || isActive === true);
    conditions.push(`is_active = $${params.length}`);
  }

  if (carrierId) {
    params.push(carrierId);
    conditions.push(`carrier_id = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(first_name ILIKE $${params.length} OR last_name ILIKE $${params.length})`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*)::int AS count FROM drivers ${whereClause}`, params);
  const totalCount = countResult.rows[0].count;

  let sql = `SELECT * FROM drivers ${whereClause} ORDER BY first_name, last_name`;
  if (!pagination.all) {
    params.push(pagination.limit, pagination.offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const result = await query(sql, params);
  return { rows: result.rows.map(stripSecret), meta: buildPageMeta(pagination, totalCount) };
}

async function getById(id) {
  const result = await query('SELECT * FROM drivers WHERE id = $1', [id]);
  const driver = result.rows[0];
  if (!driver) {
    throw new AppError('Driver not found', 404);
  }

  const [contact, rateCard, teamRateCard, detailsExtended, endorsements, payables] = await Promise.all([
    fetchChildRows('contact', id),
    fetchChildRows('rateCard', id),
    fetchChildRows('teamRateCard', id),
    fetchChildRows('detailsExtended', id),
    fetchChildRows('endorsements', id),
    fetchChildRows('payables', id)
  ]);

  return { ...stripSecret(driver), contact, rateCard, teamRateCard, detailsExtended, endorsements, payables };
}

function validateCreatePayload(payload) {
  if (!payload.first_name || !payload.last_name) {
    throw new AppError('first_name and last_name are required', 400);
  }
}

async function saveChildSections(client, driverId, payload, userId) {
  for (const key of Object.keys(CHILD_TABLES)) {
    if (payload[key] !== undefined) {
      await replaceChildRows(client, key, driverId, payload[key], userId);
    }
  }
}

async function create(payload, userId) {
  validateCreatePayload(payload);

  const driverId = await withTransaction(async (client) => {
    const driver = await insertRow(client, { table: 'drivers', columns: DRIVER_COLUMNS }, payload, userId);
    await saveChildSections(client, driver.id, payload, userId);
    return driver.id;
  });

  return getById(driverId);
}

async function update(id, payload, userId) {
  await getById(id);

  await withTransaction(async (client) => {
    await updateRow(client, { table: 'drivers', columns: DRIVER_COLUMNS }, id, payload, userId);
    await saveChildSections(client, id, payload, userId);
  });

  return getById(id);
}

async function remove(id) {
  const result = await query('UPDATE drivers SET is_active = false WHERE id = $1 RETURNING id', [id]);
  if (!result.rows[0]) {
    throw new AppError('Driver not found', 404);
  }
  return { id };
}

module.exports = { list, getById, create, update, remove };
