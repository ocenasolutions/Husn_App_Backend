// server/routes/serviceRoutes.js
const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { uploadToS3 } = require('../config/s3Config');

const conditionalUpload = (req, res, next) => {
  uploadToS3.single('image')(req, res, (err) => {
    if (err) {
      return next(err);
    }
    next();
  });
};

// Public routes
router.get('/', serviceController.getAllServices);
router.get('/categories', serviceController.getCategories);
router.get('/offers', serviceController.getOfferedServices);
router.get('/:id', serviceController.getServiceById);

// Add this to serviceRoutes.js (in admin routes section)
router.get(
  '/admin/all',
  authMiddleware,
  adminMiddleware,
  serviceController.getAllServicesForAdmin
);

// Admin routes
router.post(
  '/', 
  authMiddleware, 
  adminMiddleware, 
  conditionalUpload,
  serviceController.createService
);

router.put(
  '/:id', 
  authMiddleware, 
  adminMiddleware, 
  conditionalUpload,
  serviceController.updateService
);

router.delete(
  '/:id', 
  authMiddleware, 
  adminMiddleware, 
  serviceController.deleteService
);

router.patch(
  '/:id/toggle-status', 
  authMiddleware, 
  adminMiddleware, 
  serviceController.toggleServiceStatus
);

// New offer-related routes
router.post(
  '/:id/apply-offer',
  authMiddleware,
  adminMiddleware,
  serviceController.applyOffer
);

router.delete(
  '/:id/remove-offer',
  authMiddleware,
  adminMiddleware,
  serviceController.removeOffer
);

module.exports = router;