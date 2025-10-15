// server/routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Public webhook endpoint (no auth)
router.post('/webhook', paymentController.handleWebhook);

// Protected routes
router.use(authMiddleware);

// Create Razorpay order
router.post('/create-order', paymentController.createRazorpayOrder);

// Verify payment
router.post('/verify', paymentController.verifyRazorpayPayment);

// Get payment details
router.get('/:paymentId', paymentController.getPaymentDetails);

// Admin routes
router.post('/:paymentId/refund', adminMiddleware, paymentController.refundPayment);

module.exports = router;