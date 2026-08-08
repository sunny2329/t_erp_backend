const express = require('express');
const controller = require('../controllers/pdf.controller');

// Mounted at /loads/:loadId/pdf — always scoped to a load. Separate
// with/without-:assignmentId routes rather than an optional param (Express
// 5's path-to-regexp doesn't support the old `:id?` syntax).
const router = express.Router({ mergeParams: true });

router.get('/customer-confirmation', controller.customerConfirmation);
router.get('/load-confirmation', controller.loadConfirmation);
router.get('/load-confirmation/:assignmentId', controller.loadConfirmation);
router.get('/bol', controller.bol);
router.get('/bol/:assignmentId', controller.bol);

module.exports = router;
