const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const razorpayController = require('../controllers/razorpayController');
const authMiddleware = require('../middlewares/authMiddleware');

// Public webhook endpoint (no auth required)
router.post('/webhook', razorpayController.handleWebhook);

// Protected routes
router.use(authMiddleware);

// Wallet info routes
router.get('/', walletController.getWallet);
router.get('/balance', walletController.getBalance);
router.get('/debt-status', walletController.getDebtStatus);
router.get('/transactions', walletController.getTransactionHistory);

// Razorpay payment routes
router.post('/create-payment-order', razorpayController.createPaymentOrder);
router.post('/verify-payment', razorpayController.verifyPaymentAndAddMoney);

// Debt payment routes
router.post('/create-debt-payment-order', razorpayController.createDebtPaymentOrder);
router.post('/verify-debt-payment', razorpayController.verifyDebtPayment);

// Legacy routes (keep for backward compatibility if needed)
router.post('/add-money', walletController.addMoney);
router.post('/deduct-money', walletController.deductMoney);
router.post('/pay-debt', walletController.payDebt);

// Admin routes
router.post('/lock', walletController.lockWallet);
router.post('/unlock', walletController.unlockWallet);

module.exports = router;