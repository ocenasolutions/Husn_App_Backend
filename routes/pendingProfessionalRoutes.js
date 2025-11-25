// server/routes/pendingProfessionalRoutes.js
const express = require('express');
const router = express.Router();
const pendingProfessionalController = require('../controllers/pendingProfessionalController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// ============================================
// USER ROUTES (Authenticated users)
// ============================================

// Submit profile for admin verification
router.post(
  '/submit',
  authMiddleware,
  pendingProfessionalController.submitForVerification
);

// Get own verification status
router.get(
  '/status',
  authMiddleware,
  pendingProfessionalController.getVerificationStatus
);

// ============================================
// ADMIN ROUTES (Admin only)
// ============================================

// Get all pending verifications
router.get(
  '/admin/all',
  authMiddleware,
  adminMiddleware,
  pendingProfessionalController.getAllPendingVerifications
);

// Get verification statistics
router.get(
  '/admin/stats',
  authMiddleware,
  adminMiddleware,
  pendingProfessionalController.getVerificationStats
);

// Approve professional
router.put(
  '/admin/:id/approve',
  authMiddleware,
  adminMiddleware,
  pendingProfessionalController.approveProfessional
);

// Reject professional
router.put(
  '/admin/:id/reject',
  authMiddleware,
  adminMiddleware,
  pendingProfessionalController.rejectProfessional
);



module.exports = router;