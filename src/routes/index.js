const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');

const authRoutes = require('./auth.routes');
const dropdownRoutes = require('./dropdown.routes');
const carriersRoutes = require('./carriers.routes');
const customersRoutes = require('./customers.routes');
const driversRoutes = require('./drivers.routes');
const vehiclesRoutes = require('./vehicles.routes');
const trailersRoutes = require('./trailers.routes');
const locationsRoutes = require('./locations.routes');
const terminalRoutes = require('./terminal.routes');
const usersRoutes = require('./users.routes');
const pagesRoutes = require('./pages.routes');
const loadsRoutes = require('./loads.routes');
const erateRoutes = require('./erate.routes');

const router = express.Router();

// Public
router.use('/auth', authRoutes);
// Public rate-con accept/reject link — token in the URL is the credential.
// Mounted before the authenticated /loads router below (same prefix) so it
// gets matched first and never runs through requireAuth.
router.use('/loads/erate', erateRoutes);

// Everything below requires a valid JWT
router.use('/dropdown', requireAuth, dropdownRoutes);
router.use('/carriers', requireAuth, carriersRoutes);
router.use('/customers', requireAuth, customersRoutes);
router.use('/drivers', requireAuth, driversRoutes);
router.use('/vehicles', requireAuth, vehiclesRoutes);
router.use('/trailers', requireAuth, trailersRoutes);
router.use('/locations', requireAuth, locationsRoutes);
router.use('/terminal', requireAuth, terminalRoutes);
router.use('/users', requireAuth, usersRoutes);
router.use('/pages', requireAuth, pagesRoutes);
router.use('/loads', requireAuth, loadsRoutes);

module.exports = router;
