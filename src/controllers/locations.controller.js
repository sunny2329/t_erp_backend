const locationsService = require('../services/locations.service');
const { createSimpleCrudController } = require('./simpleCrudControllerFactory');

// carrier_id is tenant-scoping here (same reasoning as customers) — the
// legacy ss_save_locations function requires it, but neither the legacy
// function's callers nor the reference frontend expose a picker for it.
module.exports = createSimpleCrudController(
  locationsService,
  'Locations',
  ['carrier_id', 'city_id'],
  (req) => ({ carrier_id: req.user.carrierId })
);
