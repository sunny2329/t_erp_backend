const express = require('express');
const controller = require('../controllers/history.controller');

// Mounted at /loads/:loadId/history — always scoped to a load.
const router = express.Router({ mergeParams: true });

router.get('/', controller.getHistory);

module.exports = router;
