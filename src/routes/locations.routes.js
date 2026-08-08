const express = require('express');
const locationsController = require('../controllers/locations.controller');

const router = express.Router();

router.get('/', locationsController.list);
router.get('/:id', locationsController.getById);
router.post('/create', locationsController.create);
router.post('/update/:id', locationsController.update);
router.post('/update', locationsController.update);
router.post('/delete/:id', locationsController.remove);

module.exports = router;
