const terminalService = require('../services/terminal.service');
const { createSimpleCrudController } = require('./simpleCrudControllerFactory');

// carrier_id is tenant-scoping here too — confirmed against the reference
// Loadx-Youngs-Backend terminal.controller.js, which reads it from
// req.user.user.carrierId (the JWT) on every create/update, never from
// req.body, and the reference frontend never exposes a picker for it.
module.exports = createSimpleCrudController(
  terminalService,
  'Terminals',
  ['carrier_id', 'city_id'],
  (req) => ({ carrier_id: req.user.carrierId })
);
