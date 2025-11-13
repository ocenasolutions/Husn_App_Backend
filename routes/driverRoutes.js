const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');
const authMiddleware = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Driver status
router.get('/status', driverController.getDriverStatus);
router.patch('/status', driverController.updateDriverStatus);

// Driver profile
router.get('/profile', driverController.getDriverProfile);
router.patch('/profile', driverController.updateDriverProfile);

// Driver earnings
router.get('/earnings', driverController.getDriverEarnings);

// Driver ride history
router.get('/rides', driverController.getDriverRideHistory);

// Driver statistics
router.get('/statistics', driverController.getDriverStatistics);

// Driver location update
router.patch('/location', driverController.updateDriverLocation);

// NEW: Get available rides for drivers to accept
router.get('/available-rides', driverController.getAvailableRidesForDriver);

module.exports = router;