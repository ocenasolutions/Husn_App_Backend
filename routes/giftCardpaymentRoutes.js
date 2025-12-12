// routes/giftCardpaymentRoutes.js
const express = require('express');
const router = express.Router();
const giftCardController = require('../controllers/giftCardController');
const giftCardPaymentController = require('../controllers/giftCardpaymentController');
const authMiddleware = require('../middlewares/authMiddleware');

// ==================== PAYMENT ROUTES ====================

// Initiate payment for gift card (UPI/Card/Wallet)
router.post('/initiate', authMiddleware, giftCardPaymentController.initiatePayment);

// Verify payment after completion
router.post('/verify', authMiddleware, giftCardPaymentController.verifyPayment);

// Get payment status
router.get('/status/:transactionId', authMiddleware, giftCardPaymentController.getPaymentStatus);

// Razorpay specific routes
router.post('/razorpay/create-order', authMiddleware, giftCardPaymentController.createRazorpayOrder);
router.post('/razorpay/verify', authMiddleware, giftCardPaymentController.verifyRazorpayPayment);

// Webhook for payment gateway callbacks
router.post('/webhook', giftCardPaymentController.handleWebhook);

// Refund routes
router.post('/refund', authMiddleware, giftCardPaymentController.initiateRefund);
router.post('/:paymentId/refund', authMiddleware, giftCardPaymentController.refundPayment);

// Get payment details
router.get('/:paymentId', authMiddleware, giftCardPaymentController.getPaymentDetails);

// ==================== GIFT CARD MANAGEMENT ROUTES ====================

// Purchase a gift card (after successful payment)
router.post('/purchase', authMiddleware, giftCardController.purchaseGiftCard);

// Claim/Redeem a gift card
router.post('/claim', authMiddleware, giftCardController.claimGiftCard);

// Verify gift card before claiming
router.post('/verify-card', authMiddleware, giftCardController.verifyGiftCard);

// Get my purchased gift cards
router.get('/my-purchased', authMiddleware, giftCardController.getMyPurchasedGiftCards);

// Get my redeemed gift cards
router.get('/my-redeemed', authMiddleware, giftCardController.getMyRedeemedGiftCards);

// Get gift card details
router.get('/card/:cardId', authMiddleware, giftCardController.getGiftCardDetails);

// Record share
router.post('/card/:cardNumber/share', authMiddleware, giftCardController.recordShare);

// Cancel gift card (refund)
router.post('/card/:cardId/cancel', authMiddleware, giftCardController.cancelGiftCard);

module.exports = router;