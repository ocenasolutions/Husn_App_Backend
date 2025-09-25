// server/routes/bookingRoutes.js - Fixed routes
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// All booking routes require authentication
router.use(authMiddleware);

// User routes
router.post('/', bookingController.createBooking);
router.get('/my-bookings', bookingController.getUserBookings);
router.patch('/:id/cancel', bookingController.cancelBooking);

// Public routes (user can access their own bookings)
router.get('/:id', bookingController.getBookingById);

// Admin routes - Fixed paths
router.get('/admin/all', adminMiddleware, bookingController.getAllBookings);
router.patch('/admin/:id/status', adminMiddleware, bookingController.updateBookingStatus);
router.get('/admin/stats', adminMiddleware, bookingController.getBookingStats);

module.exports = router;