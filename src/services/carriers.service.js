const { query, withTransaction } = require('../config/database');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { insertRow, updateRow } = require('../utils/sqlBuilders');
const { AppError } = require('../utils/AppError');

const CARRIER_COLUMNS = [
  'service_type_id',
  'authority_type',
  'tenancy_name',
  'carrier_name',
  'contact_person',
  'mc_number',
  'dot_number',
  'fed_tax_id',
  'scac_code',
  'custom_carrier_id',
  'mcpid',
  'rmscd',
  'high_way_id',
  'partner',
  'registration',
  'dba_name',
  'ltl_connect_account_id',
  'project44_account_number',
  'track_1099',
  'fleet_size',
  'total_power_units',
  'num_vehicles',
  'reefer_equipment',
  'van_equipment',
  'flatbed_stepdeck_equipment',
  'is_active',
  'bill_to_email',
  'remit_name',
  'remit_address',
  'remit_state',
  'remit_city',
  'remit_country',
  'remit_zip_code',
  'remit_phone',
  'remit_fax',
  'remit_email',
  'bank_info_routing_number',
  'bank_info_account_number',
  'bank_info_account_name',
  'bank_info_bank_name',
  'bank_info_bank_address',
  'bank_info_phone',
  'bank_info_fax',
  'bank_info_account_type',
  'bill_to_address',
  'bill_to_instructions',
  'netsuite_subsidiary_name',
  'netsuite_account_1099',
  'netsuite_po_expense_account',
  'logo_url'
];

// Every child table keys off carrier_id and is treated as a 1:many "replace on
// save" list — the DB has no unique/1:1 constraint on carrier_id in any of them.
const CHILD_TABLES = {
  contacts: {
    table: 'carrier_contacts',
    columns: [
      'type_id',
      'contact_person',
      'address_line1',
      'address_line2',
      'city_id',
      'isd_code',
      'phone_no',
      'fax_no',
      'email',
      'website',
      'notes',
      'city_name',
      'state_name',
      'country_name',
      'lat',
      'long',
      'zipcode'
    ],
    hasAduserid: true,
    hasAddtime: true
  },
  dispatch: {
    table: 'carrier_dispatch',
    columns: ['contact_name', 'email', 'phone', 'phone2', 'phone3'],
    hasAduserid: true,
    hasAddtime: true
  },
  details: {
    table: 'carrier_details',
    columns: [
      'is_manage_settlements',
      'is_carrier_settlements',
      'is_manage_compliance',
      'is_manage_maintenance',
      'is_manage_invoicing',
      'is_manage_sourcing',
      'is_manage_expense',
      'is_use_factoring',
      'is_mode_ltl',
      'is_mode_partial',
      'is_mode_truckload',
      'is_mode_rail',
      'is_mode_intermodal',
      'is_mode_air',
      'is_mode_ocean',
      'is_mode_expedite',
      'is_cls_conestoga',
      'is_cls_containers',
      'is_cls_decks_spec',
      'is_cls_decks_standard',
      'is_cls_dry_bulk',
      'is_cls_flatbeds',
      'is_cls_hazardous_materials',
      'is_cls_reefers',
      'is_cls_tankers',
      'is_cls_vans_standard',
      'is_cls_vans_spec',
      'class_remark',
      'agmt_sign_date',
      'agmt_sign_person',
      'agmt_sign_person_title',
      'agmt_sign_person_username',
      'agmt_sign_person_phone',
      'is_quick_pay',
      'is_auto_quick_pay_deduction',
      'quick_pay_type_id',
      'amount',
      'dtl_dtl_is_freeze_pay',
      'dtl_freeze_pay_date',
      'dtl_freeze_pay_reason',
      'dtl_carrier_name',
      'dtl_contact_person',
      'dtl_mc_number',
      'dtl_dot_number',
      'dtl_fed_tax_id',
      'dtl_scac_code',
      'dtl_custom_carrier_id',
      'dtl_mcpid',
      'dtl_rmsid',
      'dtl_highway_id',
      'dtl_partner_id',
      'dtl_registration_no',
      'dtl_dba_name',
      'dtl_is_active',
      'dtl_track_1099',
      'dtl_is_noa_required',
      'dtl_enable_triumphpay_sync',
      'dtl_ltl_connect_account_id',
      'dtl_project44_account_number',
      'dtl_nternal_carrier_rep_id',
      'dtl_terminal_id',
      'dtl_is_quick_pay',
      'dtl_is_auto_quick_pay_deduction',
      'dtl_pay_type_id',
      'dtl_pay_percentage'
    ],
    hasAduserid: true,
    hasAddtime: true
  },
  liability: {
    table: 'carrier_liability',
    columns: [
      'type_id',
      'company_id',
      'isd_code',
      'phone_no',
      'agent_name',
      'agent_isd_code',
      'agent_phone_no',
      'agent_email',
      'policy_number',
      'expiration',
      'amt_limit',
      'city_id',
      'fax_number',
      'deductable',
      'contact_remark',
      'city_name',
      'state_name',
      'country_name',
      'lat',
      'long',
      'company_name',
      'zipcode'
    ],
    hasAduserid: true,
    hasAddtime: true
  },
  cargoInsurance: {
    table: 'carrier_cargo_insurance',
    columns: [
      'company',
      'phone',
      'agent',
      'agent_phone',
      'email',
      'policy_number',
      'expiration',
      'coverage_limit',
      'city',
      'state',
      'zip_code',
      'fax',
      'deductible',
      'notes'
    ],
    // this table has no audit columns at all
    hasAduserid: false,
    hasAddtime: false
  },
  certification: {
    table: 'carrier_certification',
    columns: [
      'hazmat_number',
      'ctpat_number',
      'tanker_endorsed_number',
      'is_hazmat',
      'is_smart_way',
      'is_carb',
      'is_twic',
      'is_ctpat_certified',
      'is_tanker_endorsed'
    ],
    hasAduserid: true,
    hasAddtime: true
  },
  settlement: {
    table: 'carrier_settlement',
    columns: [
      'payment_net_term_type_id',
      'carrier_pay_per_mile',
      'carrier_pay_empty_mile',
      'detention_rate',
      'detention_percentage',
      'layover_rate',
      'layover_percentage',
      'other_flat',
      'other_percentage',
      'hourly_rate',
      'overtime_rate',
      'per_stop_pay',
      'after_stop',
      'invoice_percentage',
      'fuel_surcharge_percentage',
      'sales_tax',
      'pay_method_type_id',
      'is_active'
    ],
    hasAduserid: true,
    hasAddtime: true
  },
  // Both the factoring company and the "invoice payable to" contact live in
  // this same table (legacy convention: factoring_type_id set vs null) — the
  // frontend sends up to two entries in this one array, distinguished by
  // whether factoring_type_id is present. No aduserid/addtime on this table.
  factoring: {
    table: 'carrier_factoring',
    columns: [
      'factoring_type_id',
      'name',
      'address',
      'city',
      'state',
      'country',
      'zip_code',
      'phone',
      'fax',
      'email',
      'website',
      'contact_person'
    ],
    hasAduserid: false,
    hasAddtime: false
  }
};

async function replaceChildRows(client, key, carrierId, rows, userId) {
  const config = CHILD_TABLES[key];
  await client.query(`DELETE FROM ${config.table} WHERE carrier_id = $1`, [carrierId]);

  if (!Array.isArray(rows) || rows.length === 0) return [];

  const inserted = [];
  for (const row of rows) {
    const inserted_row = await insertRow(
      client,
      { ...config, columns: ['carrier_id', ...config.columns] },
      { ...row, carrier_id: carrierId },
      userId
    );
    inserted.push(inserted_row);
  }
  return inserted;
}

async function fetchChildRows(key, carrierId) {
  const config = CHILD_TABLES[key];
  const result = await query(`SELECT * FROM ${config.table} WHERE carrier_id = $1 ORDER BY id`, [
    carrierId
  ]);
  return result.rows;
}

async function list({ page, search, authorityType, isActive }) {
  const pagination = getPagination({ page: page.page, pageSize: page.pageSize });
  const params = [];
  const conditions = [];

  if (isActive === undefined) {
    conditions.push('is_active = true');
  } else if (isActive !== 'all') {
    params.push(isActive === 'true' || isActive === true);
    conditions.push(`is_active = $${params.length}`);
  }

  if (authorityType) {
    params.push(authorityType);
    conditions.push(`authority_type = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`carrier_name ILIKE $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*)::int AS count FROM carriers ${whereClause}`, params);
  const totalCount = countResult.rows[0].count;

  let sql = `SELECT * FROM carriers ${whereClause} ORDER BY carrier_name`;
  if (!pagination.all) {
    params.push(pagination.limit, pagination.offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const result = await query(sql, params);
  return { rows: result.rows, meta: buildPageMeta(pagination, totalCount) };
}

async function getById(id) {
  const result = await query('SELECT * FROM carriers WHERE id = $1', [id]);
  const carrier = result.rows[0];
  if (!carrier) {
    throw new AppError('Carrier not found', 404);
  }

  const [contacts, dispatch, details, liability, cargoInsurance, certification, settlement, factoring] =
    await Promise.all([
      fetchChildRows('contacts', id),
      fetchChildRows('dispatch', id),
      fetchChildRows('details', id),
      fetchChildRows('liability', id),
      fetchChildRows('cargoInsurance', id),
      fetchChildRows('certification', id),
      fetchChildRows('settlement', id),
      fetchChildRows('factoring', id)
    ]);

  return {
    ...carrier,
    contacts,
    dispatch,
    details,
    insurance: { liability, cargoInsurance },
    certification,
    settlement,
    factoring
  };
}

function validateCreatePayload(payload) {
  if (!payload.carrier_name) {
    throw new AppError('carrier_name is required', 400);
  }
}

// carrier_liability.company_id and carrier_settlement.pay_method_type_id are
// NOT NULL with no DB default — the legacy save function covered this with
// coalesce(company_id, carrier_id) / a required pay method. Mirrored here so
// the frontend doesn't have to know about this schema quirk.
function withLiabilityDefaults(rows, carrierId) {
  return (rows || []).map((row) => ({ ...row, company_id: row.company_id ?? carrierId }));
}
function withSettlementDefaults(rows) {
  return (rows || []).map((row) => ({ ...row, pay_method_type_id: row.pay_method_type_id ?? 1 }));
}

async function saveChildSections(client, carrierId, payload, userId) {
  for (const key of Object.keys(CHILD_TABLES)) {
    if (payload[key] !== undefined) {
      const rows = key === 'settlement' ? withSettlementDefaults(payload[key]) : payload[key];
      await replaceChildRows(client, key, carrierId, rows, userId);
    }
  }
  if (payload.insurance) {
    if (payload.insurance.liability !== undefined) {
      await replaceChildRows(
        client,
        'liability',
        carrierId,
        withLiabilityDefaults(payload.insurance.liability, carrierId),
        userId
      );
    }
    if (payload.insurance.cargoInsurance !== undefined) {
      await replaceChildRows(client, 'cargoInsurance', carrierId, payload.insurance.cargoInsurance, userId);
    }
  }
}

async function create(payload, userId) {
  validateCreatePayload(payload);

  const carrierId = await withTransaction(async (client) => {
    const carrier = await insertRow(client, { table: 'carriers', columns: CARRIER_COLUMNS }, payload, userId);
    await saveChildSections(client, carrier.id, payload, userId);
    return carrier.id;
  });

  return getById(carrierId);
}

async function update(id, payload, userId) {
  await getById(id);

  await withTransaction(async (client) => {
    await updateRow(client, { table: 'carriers', columns: CARRIER_COLUMNS }, id, payload, userId);
    await saveChildSections(client, id, payload, userId);
  });

  return getById(id);
}

async function remove(id) {
  const result = await query('UPDATE carriers SET is_active = false WHERE id = $1 RETURNING id', [id]);
  if (!result.rows[0]) {
    throw new AppError('Carrier not found', 404);
  }
  return { id };
}

module.exports = { list, getById, create, update, remove };
