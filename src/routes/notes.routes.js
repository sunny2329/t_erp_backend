const express = require('express');
const controller = require('../controllers/notes.controller');

// Mounted at /loads/:loadId/notes — always scoped to a load.
const router = express.Router({ mergeParams: true });

router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id', controller.update);
router.post('/:id/delete', controller.remove);

module.exports = router;
