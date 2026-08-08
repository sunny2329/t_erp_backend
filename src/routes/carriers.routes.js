const express = require('express');
const carriersController = require('../controllers/carriers.controller');

const router = express.Router();

router.get('/', carriersController.list);
router.get('/:id', carriersController.getById);
router.post('/create', carriersController.create);
router.post('/update/:id', carriersController.update);
router.post('/update', carriersController.update);
router.post('/delete/:id', carriersController.remove);

module.exports = router;
