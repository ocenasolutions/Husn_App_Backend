// server/routes/professionalLocationRoutes.js
const express = require('express');
const router = express.Router();
const locationController = require('../controllers/professionalLocationController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Professional routes - Update location while traveling
router.post('/update', locationController.updateLocation);
router.post('/start', locationController.startTracking);
router.put('/stop/:orderId', locationController.stopTracking);

// Customer/Admin routes - View tracking
router.get('/order/:orderId', locationController.getLocationForOrder);

// Admin only - View all active trackings
router.get('/admin/active', adminMiddleware, locationController.getAllActiveTrackings);

module.exports = router;