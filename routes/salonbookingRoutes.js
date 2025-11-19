const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/salonbookingController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// User routes (requires authentication)
router.post('/', authMiddleware, bookingController.createBooking);
router.get('/my-bookings', authMiddleware, bookingController.getMyBookings);
router.get('/:id', authMiddleware, bookingController.getBookingById);
router.patch('/:id/cancel', authMiddleware, bookingController.cancelBooking);
router.patch('/:id/reschedule', authMiddleware, bookingController.rescheduleBooking);

// Admin routes
router.get('/admin/all', authMiddleware, adminMiddleware, bookingController.getAllBookings);
router.get('/admin/statistics', authMiddleware, adminMiddleware, bookingController.getBookingStatistics);
router.get('/salon/:salonId', authMiddleware, adminMiddleware, bookingController.getSalonBookings);
router.patch('/:id/status', authMiddleware, adminMiddleware, bookingController.updateBookingStatus);
router.get('/debug', authMiddleware, adminMiddleware, bookingController.debugBookings);

module.exports = router;