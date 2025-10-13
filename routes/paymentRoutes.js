// server/routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
  createRazorpayOrder,
  verifyPayment,
  handlePaymentFailure,
  getPaymentById,
  getPaymentHistory
} = require('../controllers/paymentController');

// Create Razorpay order
router.post('/create-order', authMiddleware, createRazorpayOrder);

// Verify payment
router.post('/verify', authMiddleware, verifyPayment);

// Handle payment failure
router.post('/failure', authMiddleware, handlePaymentFailure);

// Get payment by ID
router.get('/:id', authMiddleware, getPaymentById);

// Get payment history
router.get('/history/all', authMiddleware, getPaymentHistory);

module.exports = router;