const trailersService = require('../services/trailers.service');
const { createSimpleCrudController } = require('./simpleCrudControllerFactory');

module.exports = createSimpleCrudController(trailersService, 'Trailers', [
  'carrier_id',
  'terminal_id',
  'trailer_type_id'
]);
