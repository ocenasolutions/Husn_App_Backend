// server/routes/bannerRoutes.js
const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { uploadToS3 } = require('../config/s3Config');

// Public routes
router.get('/', bannerController.getAllBanners);

// Admin routes
router.get('/admin', authMiddleware, adminMiddleware, bannerController.getAllBannersForAdmin);
router.post('/', authMiddleware, adminMiddleware, uploadToS3.single('image'), bannerController.createBanner);
router.put('/:id', authMiddleware, adminMiddleware, uploadToS3.single('image'), bannerController.updateBanner);
router.delete('/:id', authMiddleware, adminMiddleware, bannerController.deleteBanner);
router.patch('/:id/toggle-status', authMiddleware, adminMiddleware, bannerController.toggleBannerStatus);

module.exports = router;