// server/routes/mediaRoutes.js
const express = require('express');
const router = express.Router();
const mediaController = require('../controllers/mediaController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { uploadToS3 } = require('../config/s3Config');

// Public routes (no authentication required)
router.get('/images', mediaController.getAllImages);
router.get('/videos', mediaController.getAllVideos);
router.get('/featured', mediaController.getFeaturedContent);
router.get('/categories', mediaController.getMediaCategories);
router.get('/:id', mediaController.getMediaById);

// Optional multer middleware - only use if file is being uploaded
const optionalUpload = (req, res, next) => {
  // Check if it's a multipart/form-data request
  if (req.is('multipart/form-data')) {
    // Use multer if it's multipart data
    uploadToS3.single('media')(req, res, next);
  } else {
    // Skip multer for JSON requests
    next();
  }
};

// FIXED: Allow all authenticated users to upload (removed adminMiddleware)
router.post(
  '/upload', 
  authMiddleware,        // Only require authentication, not admin
  optionalUpload,
  mediaController.uploadMedia
);

// Admin only routes for management operations
router.put(
  '/:id', 
  authMiddleware, 
  adminMiddleware,       // Keep admin requirement for editing
  mediaController.updateMedia
);

router.delete(
  '/:id', 
  authMiddleware, 
  adminMiddleware,       // Keep admin requirement for deleting
  mediaController.deleteMedia
);

router.patch(
  '/:id/toggle-status', 
  authMiddleware, 
  adminMiddleware,       // Keep admin requirement for status changes
  mediaController.toggleMediaStatus
);

module.exports = router;