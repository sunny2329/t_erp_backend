const express = require('express');
const dropdownController = require('../controllers/dropdown.controller');

const router = express.Router();

router.get('/types', dropdownController.getTypes);
router.get('/cities', dropdownController.getCities);
router.get('/states', dropdownController.getStates);

module.exports = router;
