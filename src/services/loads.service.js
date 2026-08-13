const { query, withTransaction } = require('../config/database');
const { getPagination, buildPageMeta } = require('../utils/pagination');
const { insertRow, updateRow } = require('../utils/sqlBuilders');
const { AppError } = require('../utils/AppError');
const loadAssignmentsService = require('./loadAssignments.service');
const eventsService = require('./events.service');

// Mirrors the editable field set of the legacy ss_save_loads_v1 function.
// Dispatch/settlement/invoicing columns (driver_id, vehicle_id, trailer_id,
// dispatcher_id, tracking_status_type_id, settlement_*, inv_*, ai_*, ...)
// live on load_assignments / are set by loadAssignments.service.js and are
// out of scope here. trip_status_type_id is the one exception: it's BOTH
// auto-rolled-up on every dispatch change (loadAssignments.service.js
// syncLoadStatus, matching the reference's dispatch-save rollup) AND
// manually settable here via the Load Status dropdown (matching the
// reference's separate `ss_save_changeloadstatus` manual path) — whichever
// wrote it last wins, same as the reference project, EXCEPT that manual
// changes are gated by MANUAL_TRIP_STATUS_RULES below (see `update()`),
// carried over from that same reference function's guard. That reference
// function ALSO does schema-specific cascade cleanup on some transitions
// (clearing driver_id/vehicle_id, deleting dispatch_master/load_vehicle_kms
// rows) tied to legacy-only tables this schema doesn't have — only the
// transition-legality gate itself is ported, not those side effects.

const LOAD_COLUMNS = [
  'carrier_id',
  'load_number',
  'customer_id',
  'primary_fee',
  'fee_type_id',
  'tendered_miles',
  'fuel_surcharge_type_id',
  'fuel_surcharge',
  'target_rate',
  'van_type_id',
  'length',
  'weight',
  'booking_authority_id',
  'commodity',
  'declared_value',
  'is_hazmat',
  'hazmat_type_id',
  'is_tarp_required',
  'sales_agent_id',
  'booking_terminal_id',
  'brokerage_agent_id',
  'customer_load_notes',
  'dispatch_notes',
  'load_dt',
  'trip_status_type_id'
];

// Manual "Load Status" transition legality — ported from the reference
// Loadx-Youngs-Backend's ss_save_changeloadstatus guard. The throughline
// across every rule: reaching Scheduled(6) or In Transit(10) must come from
// an actual dispatch action (loadAssignments.service.js) or the
// syncLoadStatus rollup it triggers, never a bare manual field edit.
// `allowedTargets` (Open only) is an allow-list — anything not in it is
// rejected; `blockedTargets` (everything else) is a deny-list — anything
// not in it is allowed. A same-value save (before === after) always
// short-circuits before this table is even consulted, see `update()`.
const TS = loadAssignmentsService.TRIP_STATUS;
const MANUAL_TRIP_STATUS_RULES = {
  [TS.OPEN]: {
    allowedTargets: [TS.COMPLETED, TS.COMPLETE_TO_NU, TS.CANCELLED],
    message: 'Cannot change status without assigning a driver and vehicle — dispatch a split instead.'
  },
  [TS.SCHEDULED]: {
    blockedTargets: [TS.IN_TRANSIT, TS.IN_PICKUP_YARD],
    message: 'Cannot change status without dispatching the load.'
  },
  [TS.COMPLETED]: { blockedTargets: [TS.SCHEDULED, TS.IN_TRANSIT], message: 'Cannot dispatch from here.' },
  [TS.COMPLETE_TO_NU]: { blockedTargets: [TS.SCHEDULED, TS.IN_TRANSIT], message: 'Cannot dispatch from here.' },
  [TS.IN_PICKUP_YARD]: { blockedTargets: [TS.SCHEDULED, TS.IN_TRANSIT], message: 'Cannot dispatch from here.' },
  [TS.CANCELLED]: { blockedTargets: [TS.SCHEDULED, TS.IN_TRANSIT], message: 'Cannot dispatch from here.' },
  [TS.IN_TRANSIT]: {
    blockedTargets: [TS.CANCELLED, TS.COMPLETE_TO_NU],
    message: 'Cannot cancel or complete-to-NU an In Transit load.'
  },
  [TS.DROPPED]: {
    blockedTargets: [TS.SCHEDULED, TS.IN_TRANSIT],
    message: 'Need to dispatch the load from Dropped — cannot set this status directly.'
  }
};

function assertLegalManualTripStatusChange(currentStatus, nextStatus) {
  const rule = MANUAL_TRIP_STATUS_RULES[currentStatus];
  if (!rule) return;
  const illegal = rule.allowedTargets
    ? !rule.allowedTargets.includes(nextStatus)
    : rule.blockedTargets.includes(nextStatus);
  if (illegal) throw new AppError(rule.message, 400);
}

const STOPS_CONFIG = {
  table: 'load_stops',
  fkColumn: 'load_id',
  columns: [
    'stop_type_id',
    'shipper_id',
    'location_notes',
    'customer_ref',
    'stop_action_id',
    'is_appt_required',
    'is_scheduled',
    'total_qty',
    'qty_type_id',
    'total_weight',
    'commodity',
    'length',
    'width',
    'height',
    'pickup_number',
    'shipment_bol_number',
    'po_number',
    'reefer_mode_id',
    'route_name',
    'instructions',
    'seal_number',
    'container_number',
    'chassis_number',
    'customer_trailer_number',
    'pro_number',
    'is_split_load',
    'yard_location_id',
    'stop_pickup_id',
    'start_dt',
    'end_dt',
    'temp_value',
    'seq_no',
    'split_no'
  ],
  hasAduserid: true,
  hasAddtime: true
};

// Whitelist + display metadata for the Load Edited history diff — deliberately
// excludes carrier_id (tenant-scoping, never user-editable), load_number
// (immutable after create), and trip_status_type_id (driven by dispatch —
// already captured distinctly by the Assignment events, including it here
// too would just duplicate that in every dispatch/edit save). `ref` tells
// the frontend how to resolve a raw id into a label using data it already
// has loaded (see t_erp_frontend LoadHistoryModal.jsx) — no backend joins
// needed for this.
const LOAD_FIELD_META = {
  customer_id: { label: 'Customer', ref: 'customer' },
  trip_status_type_id: { label: 'Load Status', ref: 'type:34' },
  load_dt: { label: 'Load Date', ref: 'date' },
  primary_fee: { label: 'Primary Fee', ref: 'currency' },
  fee_type_id: { label: 'Fee Type', ref: 'type:24' },
  tendered_miles: { label: 'Tendered Miles', ref: 'number' },
  fuel_surcharge_type_id: { label: 'Fuel Surcharge Type', ref: 'type:25' },
  fuel_surcharge: { label: 'Fuel Surcharge', ref: 'currency' },
  target_rate: { label: 'Target Rate', ref: 'currency' },
  declared_value: { label: 'Declared Value', ref: 'currency' },
  van_type_id: { label: 'Van / Equipment Type', ref: 'type:7' },
  length: { label: 'Length (ft)', ref: 'number' },
  weight: { label: 'Weight (lbs)', ref: 'number' },
  commodity: { label: 'Commodity', ref: 'text' },
  is_hazmat: { label: 'Hazmat', ref: 'boolean' },
  hazmat_type_id: { label: 'Hazmat Type', ref: 'type:28' },
  is_tarp_required: { label: 'Tarp Required', ref: 'boolean' },
  booking_authority_id: { label: 'Booking Authority', ref: 'carrier' },
  brokerage_agent_id: { label: 'Brokerage Agent', ref: 'user' },
  sales_agent_id: { label: 'Sales Agent', ref: 'user' },
  booking_terminal_id: { label: 'Booking Terminal', ref: 'terminal' },
  customer_load_notes: { label: 'Customer Load Notes', ref: 'text' },
  dispatch_notes: { label: 'Dispatch Notes', ref: 'text' }
};

const STOP_FIELD_META = {
  stop_type_id: { label: 'Stop Type', ref: 'stopType' },
  shipper_id: { label: 'Location', ref: 'location' },
  start_dt: { label: 'Start', ref: 'datetime' },
  end_dt: { label: 'End', ref: 'datetime' },
  pickup_number: { label: 'Pickup #', ref: 'text' },
  po_number: { label: 'PO #', ref: 'text' },
  shipment_bol_number: { label: 'BOL #', ref: 'text' },
  total_qty: { label: 'Qty', ref: 'number' },
  qty_type_id: { label: 'Qty Type', ref: 'type:20' },
  total_weight: { label: 'Weight', ref: 'number' },
  commodity: { label: 'Commodity', ref: 'text' },
  instructions: { label: 'Instructions', ref: 'text' }
};

const { pickFields } = eventsService;

// Matches stops by id (stable across saves — see upsertStops) and classifies
// each as added/removed/modified, mirroring the reference project's
// diffStops idea (the one part of its history UI flagged as genuinely
// good) but computed once here server-side rather than left to the client.
function diffStops(beforeStops, afterStops) {
  const beforeMap = new Map(beforeStops.map((s) => [s.id, s]));
  const afterMap = new Map(afterStops.map((s) => [s.id, s]));
  const stopChanges = [];

  for (const [id, afterStop] of afterMap) {
    const beforeStop = beforeMap.get(id);
    if (!beforeStop) {
      stopChanges.push({ type: 'added', seqNo: afterStop.seq_no, stopType: afterStop.stop_type_id, snapshot: pickFields(afterStop, STOP_FIELD_META) });
      continue;
    }
    const changes = eventsService.diffObjects(beforeStop, afterStop, STOP_FIELD_META);
    if (changes.length) {
      stopChanges.push({ type: 'modified', seqNo: afterStop.seq_no, stopType: afterStop.stop_type_id, changes });
    }
  }
  for (const [id, beforeStop] of beforeMap) {
    if (!afterMap.has(id)) {
      stopChanges.push({ type: 'removed', seqNo: beforeStop.seq_no, stopType: beforeStop.stop_type_id, snapshot: pickFields(beforeStop, STOP_FIELD_META) });
    }
  }
  return stopChanges;
}

async function nextLoadNumber(client) {
  const result = await client.query(
    `SELECT COALESCE(MAX(load_number::int), 0) + 1 AS next FROM loads WHERE load_number ~ '^[0-9]+$'`
  );
  return String(result.rows[0].next);
}

// Upsert-by-id rather than delete-all-and-reinsert. load_assignments.load_stop_id
// has ON DELETE CASCADE back to this table — deleting and reinserting every row
// on every save would silently wipe out dispatch/split assignments any time the
// load's basic fields get edited. Existing rows (numeric id, already in the DB)
// are updated in place; new rows (no id, or the frontend's temporary "new-..."
// placeholder id) are inserted; rows no longer present in the payload are removed.
async function upsertStops(client, loadId, stops, userId) {
  const config = { ...STOPS_CONFIG, columns: [STOPS_CONFIG.fkColumn, ...STOPS_CONFIG.columns] };
  const incoming = Array.isArray(stops) ? stops : [];

  const existingRes = await client.query(
    `SELECT id FROM ${STOPS_CONFIG.table} WHERE ${STOPS_CONFIG.fkColumn} = $1`,
    [loadId]
  );
  const existingIds = new Set(existingRes.rows.map((r) => r.id));

  const keptIds = new Set();
  const result = [];

  for (const [index, stop] of incoming.entries()) {
    const stopId = Number(stop.id);
    const payload = {
      ...stop,
      [STOPS_CONFIG.fkColumn]: loadId,
      seq_no: stop.seq_no ?? index + 1,
      // split_no groups stops into legs (see loadAssignments.service.js) —
      // every stop belongs to exactly one leg, defaulting to leg 1.
      split_no: stop.split_no ?? 1
    };

    if (Number.isInteger(stopId) && stopId > 0 && existingIds.has(stopId)) {
      const row = await updateRow(client, config, stopId, payload, userId);
      keptIds.add(stopId);
      result.push(row);
    } else {
      const row = await insertRow(client, config, payload, userId);
      keptIds.add(row.id);
      result.push(row);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length) {
    await client.query(`DELETE FROM ${STOPS_CONFIG.table} WHERE id = ANY($1)`, [toDelete]);
  }

  return result;
}

async function fetchStops(loadId) {
  const result = await query(
    `SELECT * FROM ${STOPS_CONFIG.table} WHERE ${STOPS_CONFIG.fkColumn} = $1 ORDER BY seq_no NULLS LAST, id`,
    [loadId]
  );
  return result.rows;
}

async function list({ page, search, carrierId }) {
  const pagination = getPagination({ page: page.page, pageSize: page.pageSize });
  const params = [];
  const conditions = [];

  if (carrierId) {
    params.push(carrierId);
    conditions.push(`carrier_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(load_number ILIKE $${params.length} OR commodity ILIKE $${params.length})`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*)::int AS count FROM loads ${whereClause}`, params);
  const totalCount = countResult.rows[0].count;

  let sql = `SELECT * FROM loads ${whereClause} ORDER BY id DESC`;
  if (!pagination.all) {
    params.push(pagination.limit, pagination.offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const result = await query(sql, params);
  const rows = result.rows;

  // The list view (Dashboard/Loads/Dispatch pages) needs pickup/delivery
  // stop info and dispatch assignments per row, not just the parent load —
  // batch-fetch both for the whole page instead of a per-row round trip.
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const [stopsResult, assignmentsResult] = await Promise.all([
      query(
        `SELECT * FROM ${STOPS_CONFIG.table} WHERE ${STOPS_CONFIG.fkColumn} = ANY($1) ORDER BY seq_no NULLS LAST, id`,
        [ids]
      ),
      query('SELECT * FROM load_assignments WHERE load_id = ANY($1) ORDER BY split_no', [ids])
    ]);
    const stopsByLoadId = new Map();
    for (const stop of stopsResult.rows) {
      const list = stopsByLoadId.get(stop.load_id) || [];
      list.push(stop);
      stopsByLoadId.set(stop.load_id, list);
    }
    const assignmentsByLoadId = new Map();
    for (const a of assignmentsResult.rows) {
      const list = assignmentsByLoadId.get(a.load_id) || [];
      list.push(a);
      assignmentsByLoadId.set(a.load_id, list);
    }
    for (const row of rows) {
      row.stops = stopsByLoadId.get(row.id) || [];
      row.assignments = assignmentsByLoadId.get(row.id) || [];
    }
  }

  return { rows, meta: buildPageMeta(pagination, totalCount) };
}

async function getById(id) {
  const result = await query('SELECT * FROM loads WHERE id = $1', [id]);
  const load = result.rows[0];
  if (!load) {
    throw new AppError('Load not found', 404);
  }
  const [stops, assignments] = await Promise.all([
    fetchStops(id),
    loadAssignmentsService.listByLoad(id)
  ]);
  return { ...load, stops, assignments };
}

function validateCreatePayload(payload) {
  if (!payload.customer_id) {
    throw new AppError('customer_id is required', 400);
  }
}

async function create(payload, userId) {
  validateCreatePayload(payload);

  const loadId = await withTransaction(async (client) => {
    const loadNumber = payload.load_number || (await nextLoadNumber(client));
    const load = await insertRow(
      client,
      { table: 'loads', columns: LOAD_COLUMNS },
      { ...payload, load_number: loadNumber, trip_status_type_id: 5 },
      userId
    );
    await upsertStops(client, load.id, payload.stops, userId);
    await eventsService.logEvent(client, {
      loadId: load.id,
      carrierId: payload.carrier_id,
      userId,
      eventTypeId: eventsService.EVENT_TYPES.LOAD_CREATED,
      remark: `Load #${loadNumber} created`,
      newValue: { snapshot: pickFields(load, LOAD_FIELD_META) }
    });
    return load.id;
  });

  return getById(loadId);
}

async function update(id, payload, userId) {
  const before = await getById(id);

  if (payload.trip_status_type_id !== undefined) {
    const nextTripStatus = Number(payload.trip_status_type_id);
    if (before.trip_status_type_id !== nextTripStatus) {
      assertLegalManualTripStatusChange(before.trip_status_type_id, nextTripStatus);
    }
  }

  await withTransaction(async (client) => {
    await updateRow(client, { table: 'loads', columns: LOAD_COLUMNS }, id, payload, userId);
    if (payload.stops !== undefined) {
      await upsertStops(client, id, payload.stops, userId);
    }
  });

  const after = await getById(id);

  const changes = eventsService.diffObjects(before, after, LOAD_FIELD_META);
  const stopChanges = payload.stops !== undefined ? diffStops(before.stops, after.stops) : [];
  if (changes.length || stopChanges.length) {
    const parts = [];
    if (changes.length) parts.push(changes.map((c) => c.label).join(', '));
    if (stopChanges.length) parts.push(`${stopChanges.length} stop(s) changed`);
    await eventsService.logEvent(null, {
      loadId: id,
      carrierId: after.carrier_id,
      userId,
      eventTypeId: eventsService.EVENT_TYPES.LOAD_EDITED,
      remark: parts.join(' · '),
      newValue: { changes, stopChanges }
    });
  }

  return after;
}

module.exports = { list, getById, create, update };
