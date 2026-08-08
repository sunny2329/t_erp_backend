const express = require('express');
const driversController = require('../controllers/drivers.controller');

const router = express.Router();

router.get('/', driversController.list);
router.get('/:id', driversController.getById);
router.post('/create', driversController.create);
router.post('/update/:id', driversController.update);
router.post('/update', driversController.update);
router.post('/delete/:id', driversController.remove);

module.exports = router;
