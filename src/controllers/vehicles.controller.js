const vehiclesService = require('../services/vehicles.service');
const driverVehicleMappingService = require('../services/driverVehicleMapping.service');
const { createSimpleCrudController } = require('./simpleCrudControllerFactory');
const { sendSuccess } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

const activeDrivers = asyncHandler(async (req, res) => {
  const rows = await driverVehicleMappingService.getActiveDriversForVehicle(req.params.id);
  return sendSuccess(res, rows, 'Active drivers fetched');
});

module.exports = {
  ...createSimpleCrudController(vehiclesService, 'Vehicles', [
    'carrier_id',
    'terminal_id',
    'vehicle_type_id'
  ]),
  activeDrivers
};
