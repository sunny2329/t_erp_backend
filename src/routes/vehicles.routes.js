const express = require('express');
const vehiclesController = require('../controllers/vehicles.controller');

const router = express.Router();

router.get('/', vehiclesController.list);
router.get('/:id/active-drivers', vehiclesController.activeDrivers);
router.get('/:id', vehiclesController.getById);
router.post('/create', vehiclesController.create);
router.post('/update/:id', vehiclesController.update);
router.post('/update', vehiclesController.update);
router.post('/delete/:id', vehiclesController.remove);

module.exports = router;
