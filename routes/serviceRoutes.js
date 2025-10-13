// server/routes/serviceRoutes.js
const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { uploadToS3 } = require('../config/s3Config');

// Middleware to conditionally handle file uploads
const conditionalUpload = (req, res, next) => {
  // Use multer to handle the multipart form data first
  uploadToS3.single('image')(req, res, (err) => {
    if (err) {
      return next(err);
    }
    
    // After multer processes the request, req.body is available
    // If no file was uploaded but imageUrl is provided, that's fine
    // The controller will handle using either req.file or req.body.imageUrl
    next();
  });
};

// Public routes
router.get('/', serviceController.getAllServices);
router.get('/categories', serviceController.getCategories);
router.get('/offers', serviceController.getOfferedServices);
router.get('/:id', serviceController.getServiceById);

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