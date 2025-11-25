// server/routes/professionalRoutes.js - FIXED VERSION
const express = require('express');
const router = express.Router();
const professionalController = require('../controllers/professionalController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// Get all professionals with filters
router.get('/', professionalController.getAllProfessionals);

// Get professionals by service categories
router.get('/by-services', professionalController.getProfessionalsByServices);

// ============================================
// PROFESSIONAL ROUTES (Authentication required)
// ============================================

// Get current professional profile
router.get('/profile', authMiddleware, professionalController.getCurrentProfessional);

// Update basic profile (name, phone, skills)
router.put('/profile', authMiddleware, professionalController.updateProfile);

// ⭐ TOGGLE STATUS ROUTE - THIS WAS MISSING!
router.put('/toggle-status', authMiddleware, professionalController.toggleActiveStatus);

// PAN Card Management
router.put('/pan-details', authMiddleware, professionalController.updatePANDetails);
router.post('/verify-pan', authMiddleware, professionalController.verifyPAN);

// Bank Details Management
router.put('/bank-details', authMiddleware, professionalController.updateBankDetails);
router.post('/verify-bank', authMiddleware, professionalController.verifyBankDetails);

// Complete Profile (final step)
router.post('/complete-profile', authMiddleware, professionalController.completeProfile);

router.get(  '/by-email/:email',  authMiddleware,  adminMiddleware,  professionalController.getProfessionalByEmail);


// ============================================
// ADMIN ROUTES (Admin authentication required)
// ============================================

// Create new professional (Admin only)
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  professionalController.createProfessional
);

// Update professional by ID (Admin only)
router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  professionalController.updateProfessional
);

// Delete professional by ID (Admin only)
router.delete(
  '/:id',
  authMiddleware,
  adminMiddleware,
  professionalController.deleteProfessional
);

// ============================================
// TEST ENDPOINTS (for debugging)
// ============================================

router.get('/test', (req, res) => {
  console.log('🧪 Test endpoint hit');
  res.json({
    success: true,
    message: 'Professional routes are working!',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;