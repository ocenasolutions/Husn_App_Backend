
// server/routes/bookingRoutes.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/bookingController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// User routes (require authentication)
router.use(authMiddleware);

router.post('/', bookingController.createBooking);
router.get('/my-bookings', bookingController.getUserBookings);
router.get('/:id', bookingController.getBooking);
router.patch('/:id/cancel', bookingController.cancelBooking);

// Admin routes (require admin privileges)
router.get('/admin/all', adminMiddleware, bookingController.getAllBookings);
router.patch('/admin/:id/status', adminMiddleware, bookingController.updateBookingStatus);

module.exports = router;