const { query, withTransaction } = require('../config/database');
const { insertRow, updateRow } = require('../utils/sqlBuilders');
const { AppError } = require('../utils/AppError');
const eventsService = require('./events.service');
const driverVehicleMappingService = require('./driverVehicleMapping.service');
const { pickFields } = eventsService;

// Whitelist + display metadata for dispatch/assignment history diffs — see
// LOAD_FIELD_META in loads.service.js for the `ref` convention (tells the
// frontend how to resolve an id into a label using data it already has).
// driver_name/vehicle_no/trailer_no are the free-text fallback fields used
// when a leg isn't tied to a real drivers/vehicles/trailers row (see
// CompanyDispatchModal/BrokerDispatchModal) — tracked too so manual entries
// still show up in history.
const ASSIGNMENT_FIELD_META = {
  dispatch_carrier_id: { label: 'Carrier', ref: 'carrier' },
  tracking_status_type_id: { label: 'Tracking Status', ref: 'type:46' },
  driver_id1: { label: 'Primary Driver', ref: 'driver' },
  driver_id2: { label: 'Secondary Driver', ref: 'driver' },
  vehicle_id: { label: 'Vehicle', ref: 'vehicle' },
  trailer_id: { label: 'Trailer', ref: 'trailer' },
  dispatcher_id: { label: 'Dispatcher', ref: 'user' },
  dispatch_start_dt: { label: 'Dispatch Start', ref: 'datetime' },
  dispatch_end_dt: { label: 'Dispatch End', ref: 'datetime' },
  complete_dt: { label: 'Complete In Time', ref: 'datetime' },
  complete_out_dt: { label: 'Complete Out Time', ref: 'datetime' },
  driver_name: { label: 'Driver Name', ref: 'text' },
  driver_phone: { label: 'Driver Phone', ref: 'text' },
  vehicle_no: { label: 'Vehicle #', ref: 'text' },
  trailer_no: { label: 'Trailer #', ref: 'text' },
  is_external: { label: 'Dispatch Type', ref: 'dispatchType' },
  dispatch_remark: { label: 'Dispatch Notes', ref: 'text' }
};

// load_assignments has no aduserid/addtime columns (unlike every other table
// in this schema) — verified via information_schema before writing this.
const ASSIGNMENT_CONFIG = {
  table: 'load_assignments',
  columns: [
    'load_id',
    'load_stop_id',
    'split_no',
    'dispatch_carrier_id',
    'tracking_status_type_id',
    'driver_id1',
    'driver_id2',
    'vehicle_id',
    'trailer_id',
    'dispatcher_id',
    'dispatch_start_dt',
    'dispatch_end_dt',
    'complete_dt',
    'complete_out_dt',
    'driver_name',
    'driver_phone',
    'secondary_driver_name',
    'secondary_driver_phone',
    'vehicle_no',
    'trailer_no',
    'is_external',
    'stop_points',
    'dispatch_remark'
  ],
  hasAduserid: false,
  hasAddtime: false
};

// type_master type_id=34 ("load_stop_event_type") is reused by the legacy
// system as the loads.trip_status_type_id vocabulary too (5=Open, 6=Scheduled,
// 7=Completed, 8=Complete TO NU, 9=In Pickup Yard, 10=In Transit, 11=Cancelled,
// 13=Dropped — ids 1-4/12/14-17 in that same type_id are event-log labels,
// never valid trip statuses). type_id=46 ("dispatch_tracking_status") is the
// separate per-leg tracking vocabulary (1-13, see loadAssignmentsApi/
// CompanyDispatchModal). Both confirmed live.
const TRIP_STATUS = { OPEN: 5, SCHEDULED: 6, COMPLETED: 7, COMPLETE_TO_NU: 8, IN_PICKUP_YARD: 9, IN_TRANSIT: 10, CANCELLED: 11, DROPPED: 13 };
const TRACKING_STATUS = { IN_TRANSIT: 5, COMPLETED: 13 };

function withStopPointsJson(payload) {
  if (payload.stop_points === undefined) return payload;
  return { ...payload, stop_points: JSON.stringify(payload.stop_points ?? []) };
}

async function listByLoad(loadId) {
  const result = await query(
    'SELECT * FROM load_assignments WHERE load_id = $1 ORDER BY split_no',
    [loadId]
  );
  return result.rows;
}

// load_stops.split_no is the source of truth for which leg a stop belongs to
// (every stop is tagged with exactly one split_no, default 1 — see
// loads.service.js upsertStops). load_assignments.stop_points is just a
// snapshot of that group's stop ids at dispatch time, for display/history —
// it is never used to determine membership.
async function stopIdsForSplit(client, loadId, splitNo) {
  const res = await client.query(
    'SELECT id FROM load_stops WHERE load_id = $1 AND split_no = $2 ORDER BY seq_no NULLS LAST, id',
    [loadId, splitNo]
  );
  return res.rows.map((r) => r.id);
}

async function assertSplitHasStops(client, loadId, splitNo) {
  const ids = await stopIdsForSplit(client, loadId, splitNo);
  if (!ids.length) {
    throw new AppError(`Split ${splitNo} has no stops yet — add a pickup or delivery first`, 400);
  }
  return ids;
}

// Rolls the load's own trip_status_type_id / tracking_status_type_id up from
// its assignment legs and persists it onto the loads row — per the
// load-status/tracking-status business-logic spec (Cases 1/2/4/5, Journeys
// 1 & 2), NOT the legacy reference's schema-specific rollup:
//   1. ANY leg is "actively in transit" -> trip = In Transit(10), always,
//      overriding everything else below. A leg counts as actively in
//      transit for ANY non-null tracking value other than Completed(13) —
//      the tracking vocabulary has many stops between dispatch and
//      Completed (En Route, At Pickup, ..., Delivered, Detention, ...) and
//      the load stays In Transit through all of them, not just while the
//      leg's tracking literally still reads the dispatch value 5.
//   2. else, if the highest split_no whose tracking is Completed(13) is
//      BELOW the load's true last split — driven by load_stops' split_no
//      layout, not by which splits happen to have a dispatch assignment yet
//      (a split can finish while a later split, per the stops layout, has
//      no assignment at all — that's still "mid-split", not "the last
//      split, alone, finished") — this is Case 4, "finish a mid-split":
//      only takes effect if the load's CURRENT trip status is Scheduled(6)
//      or In Transit(10), OR is already Dropped(13) itself — Dropped is not
//      a closed state, it's "waiting for the next split to be arranged", so
//      staging that next split's assignment later must still be able to
//      promote it to Scheduled (Journey 2 step 4). A load that's already
//      manually closed out (Cancelled/Completed/Complete-TO-NU/In Pickup
//      Yard) keeps that status instead of being dragged back by an
//      unrelated leg finishing. When it does take effect: if the split
//      right after the one that just finished already has its own
//      assignment row, the load is already staged for that next leg ->
//      Scheduled(6); otherwise -> Dropped(13).
//   3. else, if the load's true LAST split's tracking is Completed(13) (or
//      no leg has been dispatched at all yet): the LAST split finishing
//      tracking does NOT by itself change the load status (Journey 1 step 5
//      / Journey 2 step 6 — "load status Completed is a separate step") —
//      so hold whatever trip status is already there, falling back to
//      Scheduled(6) only when nothing has actually been dispatched (plain
//      assignment, no leg has any tracking value yet -> Case 1).
//   4. else (no legs at all) -> trip = Open(5).
// loads.tracking_status_type_id mirrors the "active" leg: the first leg (in
// split_no order) that hasn't reached Completed(13) yet, or the last leg if
// every leg is already Completed — a finished split_no=1 ahead of a
// not-yet-started split_no=2 should still surface split_no=2.
async function syncLoadStatus(client, loadId) {
  const loadRes = await client.query('SELECT trip_status_type_id FROM loads WHERE id = $1', [loadId]);
  const currentTripStatus = loadRes.rows[0]?.trip_status_type_id;

  const legsRes = await client.query(
    'SELECT split_no, tracking_status_type_id FROM load_assignments WHERE load_id = $1 ORDER BY split_no',
    [loadId]
  );
  const legs = legsRes.rows;

  const stopsMaxRes = await client.query(
    'SELECT MAX(split_no) AS max_split_no FROM load_stops WHERE load_id = $1',
    [loadId]
  );
  const maxSplitNo = stopsMaxRes.rows[0]?.max_split_no ?? null;

  const activeLeg = legs.find(
    (l) => l.tracking_status_type_id != null && l.tracking_status_type_id !== TRACKING_STATUS.COMPLETED
  );

  let tripStatus;
  if (activeLeg) {
    tripStatus = TRIP_STATUS.IN_TRANSIT;
  } else if (!legs.length) {
    tripStatus = TRIP_STATUS.OPEN;
  } else {
    const completedSplitNos = legs
      .filter((l) => l.tracking_status_type_id === TRACKING_STATUS.COMPLETED)
      .map((l) => l.split_no);
    const highestCompletedSplitNo = completedSplitNos.length ? Math.max(...completedSplitNos) : null;

    const manuallyClosed = [TRIP_STATUS.CANCELLED, TRIP_STATUS.COMPLETED, TRIP_STATUS.COMPLETE_TO_NU, TRIP_STATUS.IN_PICKUP_YARD];
    if (highestCompletedSplitNo != null && highestCompletedSplitNo < maxSplitNo) {
      if (!manuallyClosed.includes(currentTripStatus)) {
        // Safe without re-checking this next leg's own tracking value: since
        // highestCompletedSplitNo is the MAX completed split_no, split_no+1
        // (if it exists) can't itself be Completed — and if it were actively
        // in transit, the `activeLeg` branch above would already have
        // caught it before reaching here.
        const nextSplitStaged = legs.some((l) => l.split_no === highestCompletedSplitNo + 1);
        tripStatus = nextSplitStaged ? TRIP_STATUS.SCHEDULED : TRIP_STATUS.DROPPED;
      } else {
        tripStatus = currentTripStatus;
      }
    } else if (highestCompletedSplitNo != null) {
      tripStatus = currentTripStatus;
    } else {
      tripStatus = TRIP_STATUS.SCHEDULED;
    }
  }

  const displayLeg = legs.find((l) => l.tracking_status_type_id !== TRACKING_STATUS.COMPLETED) || legs[legs.length - 1];
  const trackingStatus = displayLeg ? displayLeg.tracking_status_type_id ?? null : null;

  await client.query(
    'UPDATE loads SET trip_status_type_id = $2, tracking_status_type_id = $3 WHERE id = $1',
    [loadId, tripStatus, trackingStatus]
  );
}

// Dispatch/scheduling conflict check — matches the reference
// Loadx-Youngs-Backend's ss_get_is_dispatch_allowed_v1: is this driver/
// vehicle/trailer already tied up on a DIFFERENT load that's currently
// Scheduled(6) or In Transit(10) — i.e. dispatched but not yet Dropped/
// Completed/Cancelled? This is a status check, not a date-window overlap —
// a truck/driver/trailer sitting on a load that's still open is the
// conflict, regardless of what dates either leg happens to carry. Excludes
// every leg of the load currently being dispatched/edited (multiple splits
// of the same load handing off sequentially is normal, not a conflict).
async function checkConflicts(loadId, { driverId1, driverId2, vehicleId, trailerId }) {
  // Coerced defensively — the frontend's form state holds these as strings
  // (Select values), and this endpoint deliberately takes plain camelCase
  // fields straight off that form state rather than going through
  // assignmentDetailAdapter.toApi.
  const vehicleIdNum = vehicleId ? Number(vehicleId) : null;
  const trailerIdNum = trailerId ? Number(trailerId) : null;
  const driverIds = [driverId1, driverId2].filter(Boolean).map(Number);

  if (!vehicleIdNum && !trailerIdNum && !driverIds.length) return { hasConflicts: false, conflicts: [] };

  const result = await query(
    `SELECT la.load_id, l.load_number, l.trip_status_type_id, la.driver_id1, la.driver_id2, la.vehicle_id, la.trailer_id,
            v.reg_number AS vehicle_reg_number,
            t.name AS trailer_name,
            d1.first_name AS d1_first, d1.last_name AS d1_last,
            d2.first_name AS d2_first, d2.last_name AS d2_last
     FROM load_assignments la
     JOIN loads l ON l.id = la.load_id
     LEFT JOIN vehicles v ON v.id = la.vehicle_id
     LEFT JOIN trailers t ON t.id = la.trailer_id
     LEFT JOIN drivers d1 ON d1.id = la.driver_id1
     LEFT JOIN drivers d2 ON d2.id = la.driver_id2
     WHERE la.load_id != $1
       AND l.trip_status_type_id IN (${TRIP_STATUS.SCHEDULED}, ${TRIP_STATUS.IN_TRANSIT})
       AND (
         (la.vehicle_id IS NOT NULL AND la.vehicle_id = $2)
         OR (la.trailer_id IS NOT NULL AND la.trailer_id = $3)
         OR (la.driver_id1 IS NOT NULL AND la.driver_id1 = ANY($4::int[]))
         OR (la.driver_id2 IS NOT NULL AND la.driver_id2 = ANY($4::int[]))
       )`,
    [loadId, vehicleIdNum, trailerIdNum, driverIds]
  );

  const conflicts = [];
  for (const row of result.rows) {
    const status = row.trip_status_type_id === TRIP_STATUS.IN_TRANSIT ? 'In Transit' : 'Scheduled';
    const info = { loadNumber: row.load_number, status };
    if (vehicleIdNum && row.vehicle_id === vehicleIdNum) {
      conflicts.push({ type: 'vehicle', label: row.vehicle_reg_number || `Vehicle #${row.vehicle_id}`, ...info });
    }
    if (trailerIdNum && row.trailer_id === trailerIdNum) {
      conflicts.push({ type: 'trailer', label: row.trailer_name || `Trailer #${row.trailer_id}`, ...info });
    }
    if (driverIds.includes(row.driver_id1)) {
      conflicts.push({ type: 'driver', label: [row.d1_first, row.d1_last].filter(Boolean).join(' ') || `Driver #${row.driver_id1}`, ...info });
    }
    if (driverIds.includes(row.driver_id2)) {
      conflicts.push({ type: 'driver', label: [row.d2_first, row.d2_last].filter(Boolean).join(' ') || `Driver #${row.driver_id2}`, ...info });
    }
  }

  return { hasConflicts: conflicts.length > 0, conflicts };
}

async function assertLoadExists(client, loadId) {
  const result = await client.query('SELECT id, carrier_id FROM loads WHERE id = $1', [loadId]);
  if (!result.rows.length) throw new AppError('Load not found', 404);
  return result.rows[0];
}

// Dispatches (Company or Broker — is_external on the payload) a split group.
// payload.split_no is required — the frontend always knows which group
// (Split 1, Split 2, ...) it's dispatching. One load_assignments row per
// split_no; re-dispatching a group that already has a leg should go through
// updateLeg instead.
async function createLeg(loadId, payload, userId) {
  return withTransaction(async (client) => {
    const load = await assertLoadExists(client, loadId);

    const splitNo = payload.split_no;
    if (!splitNo) throw new AppError('split_no is required', 400);

    const existing = await client.query(
      'SELECT id FROM load_assignments WHERE load_id = $1 AND split_no = $2',
      [loadId, splitNo]
    );
    if (existing.rows.length) {
      throw new AppError(`Split ${splitNo} is already dispatched — use update instead`, 409);
    }

    const stopIds = await assertSplitHasStops(client, loadId, splitNo);

    const row = await insertRow(
      client,
      ASSIGNMENT_CONFIG,
      withStopPointsJson({
        ...payload,
        load_id: loadId,
        split_no: splitNo,
        load_stop_id: stopIds[0],
        stop_points: stopIds
      }),
      userId
    );
    await syncLoadStatus(client, loadId);
    if (!row.is_external && row.vehicle_id) {
      await driverVehicleMappingService.syncMapping(
        client,
        { carrierId: row.dispatch_carrier_id, vehicleId: row.vehicle_id, trailerId: row.trailer_id, driverIds: [row.driver_id1, row.driver_id2] },
        userId
      );
    }
    await eventsService.logEvent(client, {
      loadId,
      carrierId: load.carrier_id,
      userId,
      eventTypeId: eventsService.EVENT_TYPES.ASSIGNMENT_CREATED,
      remark: `Split ${splitNo} dispatched (${payload.is_external ? 'Broker' : 'Company'})`,
      newValue: { snapshot: pickFields(row, ASSIGNMENT_FIELD_META) }
    });
    return row;
  });
}

// Tracking-status-Completed guard (spec: "Cases that change tracking
// status", sections A & B). Applies only on an actual transition INTO
// Completed(13) (a same-value re-save is a no-op, same convention as
// loads.service.js's manual trip-status gate). Requires the completion
// in/out time on both mid-split and last-split legs. The extra gates
// (load must already be dispatched, must carry a real driver/vehicle or
// carrier assignment) are section-A-only — they exist to stop a leg from
// being marked Completed before it was ever actually dispatched — and
// deliberately do NOT apply to a mid-split leg (section B has no such
// gate; that's exactly the action that's allowed to drop the load, see
// syncLoadStatus).
function assertTrackingCompletionAllowed(before, merged, loadTripStatus, maxSplitNo) {
  if (!merged.complete_dt || !merged.complete_out_dt) {
    throw new AppError('Enter the completion In Time and Out Time before marking this leg Completed.', 400);
  }
  if (before.split_no !== maxSplitNo) return;

  if (loadTripStatus === TRIP_STATUS.SCHEDULED) {
    throw new AppError('Dispatch this load before marking tracking Completed.', 400);
  }
  if (loadTripStatus === TRIP_STATUS.DROPPED) {
    throw new AppError('Re-dispatch this load before marking tracking Completed.', 400);
  }
  const hasAssignment = merged.is_external
    ? Boolean(merged.dispatch_carrier_id)
    : Boolean(merged.driver_id1 || merged.vehicle_id);
  if (!hasAssignment) {
    throw new AppError('Assign a driver/vehicle (or carrier) before marking tracking Completed.', 400);
  }
}

async function updateLeg(id, payload, userId) {
  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT la.*, l.carrier_id, l.trip_status_type_id FROM load_assignments la JOIN loads l ON l.id = la.load_id WHERE la.id = $1`,
      [id]
    );
    if (!existing.rows.length) throw new AppError('Assignment leg not found', 404);
    const before = existing.rows[0];

    const nextTracking = payload.tracking_status_type_id !== undefined
      ? (payload.tracking_status_type_id === null ? null : Number(payload.tracking_status_type_id))
      : before.tracking_status_type_id;
    if (nextTracking === TRACKING_STATUS.COMPLETED && before.tracking_status_type_id !== TRACKING_STATUS.COMPLETED) {
      const maxSplitRes = await client.query(
        'SELECT MAX(split_no) AS max_split_no FROM load_assignments WHERE load_id = $1',
        [before.load_id]
      );
      assertTrackingCompletionAllowed(
        before,
        { ...before, ...payload },
        before.trip_status_type_id,
        maxSplitRes.rows[0].max_split_no
      );
    }

    const row = await updateRow(client, ASSIGNMENT_CONFIG, id, withStopPointsJson(payload), userId);
    await syncLoadStatus(client, before.load_id);

    // Only re-sync the standing driver<->vehicle mapping when one of the
    // fields it actually tracks changed — otherwise every unrelated update
    // (e.g. a tracking-status-only save) would needlessly deactivate and
    // re-insert the same mapping rows.
    const mappingFieldsChanged =
      row.driver_id1 !== before.driver_id1 ||
      row.driver_id2 !== before.driver_id2 ||
      row.vehicle_id !== before.vehicle_id ||
      row.trailer_id !== before.trailer_id;
    if (!row.is_external && row.vehicle_id && mappingFieldsChanged) {
      await driverVehicleMappingService.syncMapping(
        client,
        { carrierId: row.dispatch_carrier_id, vehicleId: row.vehicle_id, trailerId: row.trailer_id, driverIds: [row.driver_id1, row.driver_id2] },
        userId
      );
    }

    const changes = eventsService.diffObjects(before, row, ASSIGNMENT_FIELD_META);
    if (changes.length) {
      await eventsService.logEvent(client, {
        loadId: before.load_id,
        carrierId: before.carrier_id,
        userId,
        eventTypeId: eventsService.EVENT_TYPES.ASSIGNMENT_UPDATED,
        remark: `Split ${before.split_no}: ${changes.map((c) => c.label).join(', ')}`,
        newValue: { changes }
      });
    }
    return row;
  });
}

// Deletes a leg's dispatch assignment. Its stops fold back into the adjacent
// split group (previous preferred, else next) so no stop is left without a
// group, then split_no is re-compacted (on both load_stops and
// load_assignments) so it stays gap-free.
async function deleteLeg(legId, userId) {
  return withTransaction(async (client) => {
    const legRes = await client.query(
      `SELECT la.*, l.carrier_id FROM load_assignments la JOIN loads l ON l.id = la.load_id WHERE la.id = $1`,
      [legId]
    );
    const leg = legRes.rows[0];
    if (!leg) throw new AppError('Assignment leg not found', 404);

    // Case 5 ("Clear assignment"): blocked once this leg's tracking has
    // moved off null — i.e. it's In Transit(5), Completed(13), or any of the
    // intermediate values between them (En Route, At Pickup, ..., Delivered,
    // ...; see syncLoadStatus's "actively in transit" definition). Clearing/
    // deleting a leg at that point would silently erase a leg the load has
    // already started or finished.
    if (leg.tracking_status_type_id != null) {
      throw new AppError('Cannot clear this assignment — its tracking is already In Transit or Completed.', 400);
    }

    const siblingSplitsRes = await client.query(
      'SELECT DISTINCT split_no FROM load_stops WHERE load_id = $1 AND split_no != $2 ORDER BY split_no',
      [leg.load_id, leg.split_no]
    );
    const siblingSplits = siblingSplitsRes.rows.map((r) => r.split_no);
    const prevSplit = siblingSplits.filter((s) => s < leg.split_no).pop();
    const targetSplit = prevSplit ?? siblingSplits.find((s) => s > leg.split_no);

    if (targetSplit != null) {
      await client.query(
        'UPDATE load_stops SET split_no = $3 WHERE load_id = $1 AND split_no = $2',
        [leg.load_id, leg.split_no, targetSplit]
      );
    }

    await client.query('DELETE FROM load_assignments WHERE id = $1', [legId]);

    await client.query(
      'UPDATE load_stops SET split_no = split_no - 1 WHERE load_id = $1 AND split_no > $2',
      [leg.load_id, leg.split_no]
    );
    await client.query(
      'UPDATE load_assignments SET split_no = split_no - 1 WHERE load_id = $1 AND split_no > $2',
      [leg.load_id, leg.split_no]
    );

    await syncLoadStatus(client, leg.load_id);
    await eventsService.logEvent(client, {
      loadId: leg.load_id,
      carrierId: leg.carrier_id,
      userId,
      eventTypeId: eventsService.EVENT_TYPES.ASSIGNMENT_REMOVED,
      remark: `Split ${leg.split_no} dispatch removed`,
      oldValue: { snapshot: pickFields(leg, ASSIGNMENT_FIELD_META) }
    });
  });
}

module.exports = { listByLoad, createLeg, updateLeg, deleteLeg, syncLoadStatus, stopIdsForSplit, checkConflicts, TRIP_STATUS };
