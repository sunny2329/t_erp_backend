const express = require('express');
const controller = require('../controllers/loadAssignments.controller');

// Mounted at /loads/:loadId/assignments — always scoped to a load.
const router = express.Router({ mergeParams: true });

router.get('/', controller.list);
router.post('/check-conflicts', controller.checkConflicts);
router.post('/', controller.create);
router.post('/:id', controller.update);
router.post('/:id/delete', controller.remove);

module.exports = router;
