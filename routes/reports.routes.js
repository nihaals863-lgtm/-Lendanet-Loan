const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports.controller');
const { protect, admin } = require('../middleware/auth.middleware');

router.get('/generate', protect, admin, reportsController.generateReport);
router.get('/stats', protect, admin, reportsController.getStats);

module.exports = router;
