// server/routes/bookingRoutes.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// All booking routes require authentication
router.use(authMiddleware);

// Debug middleware to track requests
router.use((req, res, next) => {
  console.log('📋 Booking Route:', req.method, req.path);
  console.log('👤 User:', req.user?._id, 'Role:', req.user?.role);
  next();
});

// ⚠️ IMPORTANT: Specific routes MUST come BEFORE parameterized routes (/:id)

// Admin routes - MUST be first
router.get('/admin/stats', adminMiddleware, bookingController.getBookingStats);
router.get('/admin/all', adminMiddleware, bookingController.getAllBookings);
router.patch('/admin/:id/status', adminMiddleware, bookingController.updateBookingStatus);
router.patch('/admin/:id/set-time', adminMiddleware, bookingController.setServiceTime);
router.post('/admin/:id/start-service', adminMiddleware, bookingController.startService);

// User-specific routes - MUST come before /:id
router.get('/my-bookings', bookingController.getUserBookings);
router.post('/', bookingController.createBooking);
router.patch('/:id/cancel', bookingController.cancelBooking);
router.post('/:id/review', bookingController.submitReview);

// Parameterized route - MUST be LAST
router.get('/:id', bookingController.getBookingById);

module.exports = router;