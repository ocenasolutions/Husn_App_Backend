const express = require('express');
const router = express.Router();
const payoutController = require('../controllers/payoutController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// ============================================
// WEBHOOK ROUTE (NO AUTHENTICATION)
// ============================================

// Razorpay webhook for payout status updates
router.post(
  '/webhook/razorpay',
  express.raw({ type: 'application/json' }),
  payoutController.handlePayoutWebhook
);

// ============================================
// AUTHENTICATED ROUTES
// ============================================

// All routes below require authentication
router.use(authMiddleware);

// ============================================
// ADMIN ROUTES
// ============================================

// Get weekly payout summary for a professional
router.get(
  '/weekly/:professionalEmail',
  adminMiddleware,
  payoutController.getWeeklyPayoutSummary
);

// Generate payout for current week
router.post(
  '/generate/:professionalEmail',
  adminMiddleware,
  payoutController.generateWeeklyPayout
);

// Process automated payout
router.post(
  '/process/:payoutId',
  adminMiddleware,
  payoutController.processPayout
);

// Check payout status (manual refresh)
router.get(
  '/status/:payoutId',
  adminMiddleware,
  payoutController.checkPayoutStatus
);

// Get payout history for a professional
router.get(
  '/history/:professionalEmail',
  adminMiddleware,
  payoutController.getPayoutHistory
);

// Get all pending payouts
router.get(
  '/admin/pending',
  adminMiddleware,
  payoutController.getAllPendingPayouts
);

// Get single payout details (must be last to avoid conflicts)
router.get(
  '/:payoutId',
  adminMiddleware,
  payoutController.getPayoutById
);

module.exports = router;