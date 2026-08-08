const express = require('express');
const trailersController = require('../controllers/trailers.controller');

const router = express.Router();

router.get('/', trailersController.list);
router.get('/:id', trailersController.getById);
router.post('/create', trailersController.create);
router.post('/update/:id', trailersController.update);
router.post('/update', trailersController.update);
router.post('/delete/:id', trailersController.remove);

module.exports = router;
