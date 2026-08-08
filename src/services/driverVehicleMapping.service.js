const { query } = require('../config/database');

// "Who currently drives this truck" — a standing fact independent of any one
// load's lifecycle (mirrors the reference Loadx-Youngs-Backend's equivalent
// concept). Written only from a COMPANY dispatch create/update (see
// loadAssignments.service.js createLeg/updateLeg) — broker/external legs
// have no real driver_id/vehicle_id FKs to map, only free-text fallback
// fields.
//
// Toggling rule (matches the reference Loadx-Youngs-Backend's
// ss_save_dispatchload_v3/ss_save_drivervehiclemapping_v1 exactly):
// deactivates any existing active row that shares the same driver, vehicle,
// OR trailer — not just the same vehicle — since a driver/trailer can't
// really be "currently on" two different trucks at once either. Then one
// new active row is inserted per assigned driver (one for a solo driver, two
// for a team), all sharing the same vehicle_id/trailer_id. Two active rows
// for the same vehicle at once is expected and correct for a driver team.
async function syncMapping(client, { carrierId, vehicleId, trailerId, driverIds }, userId) {
  if (!vehicleId) return;
  const drivers = [...new Set((driverIds || []).filter(Boolean))];

  await client.query(
    `UPDATE driver_vehicle_mapping
     SET is_active = false, deactive_dt = now()
     WHERE is_active = true
       AND (vehicle_id = $1 OR driver_id = ANY($2::int[]) OR ($3::int IS NOT NULL AND trailer_id = $3))`,
    [vehicleId, drivers, trailerId || null]
  );

  for (const driverId of drivers) {
    await client.query(
      `INSERT INTO driver_vehicle_mapping (carrier_id, driver_id, vehicle_id, trailer_id, is_active, aduserid)
       VALUES ($1, $2, $3, $4, true, $5)`,
      [carrierId, driverId, vehicleId, trailerId || null, userId]
    );
  }
}

// Currently-active driver(s) mapped to a vehicle — used by the Company
// Dispatch form to auto-fill Driver 1/2 as soon as a vehicle is selected.
// Ordered by id so a driver team's earliest-mapped driver becomes Driver 1.
async function getActiveDriversForVehicle(vehicleId) {
  const result = await query(
    `SELECT driver_id, trailer_id FROM driver_vehicle_mapping
     WHERE vehicle_id = $1 AND is_active = true
     ORDER BY id`,
    [vehicleId]
  );
  return result.rows;
}

module.exports = { syncMapping, getActiveDriversForVehicle };
