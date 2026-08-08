const express = require('express');
const customersController = require('../controllers/customers.controller');

const router = express.Router();

router.get('/', customersController.list);
router.get('/:id', customersController.getById);
router.post('/create', customersController.create);
router.post('/update/:id', customersController.update);
router.post('/update', customersController.update);
router.post('/delete/:id', customersController.remove);

module.exports = router;
