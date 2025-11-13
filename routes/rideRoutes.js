const express = require('express');
const router = express.Router();
const rideController = require('../controllers/rideController');
const authMiddleware = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Create new ride request
router.post('/create', rideController.createRide);

// Get available rides for drivers
router.get('/available', rideController.getAvailableRides);

// Accept ride (driver)
router.patch('/:rideId/accept', rideController.acceptRide);

// Update ride status
router.patch('/:rideId/status', rideController.updateRideStatus);

// Update driver location during ride
router.patch('/:rideId/location', rideController.updateDriverLocation);

// Get ride details
router.get('/:rideId', rideController.getRideDetails);

// Get user's active ride
router.get('/user/active', rideController.getActiveRide);

// Get user's ride history
router.get('/user/history', rideController.getUserRideHistory);

// Rate ride
router.post('/:rideId/rate', rideController.rateRide);

// Cancel ride
router.patch('/:rideId/cancel', rideController.cancelRide);

module.exports = router;