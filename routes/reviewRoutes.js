// server/routes/reviewRoutes.js
const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// All review routes require authentication
router.use(authMiddleware);

// User routes
router.post('/', reviewController.createReview);
router.get('/my-reviews', reviewController.getUserReviews);
router.get('/:referenceType/:referenceId', reviewController.getReviewsForItem);
router.put('/:id', reviewController.updateReview);
router.delete('/:id', reviewController.deleteReview);

// Admin routes
router.get('/admin/all', adminMiddleware, reviewController.getAllReviews);
router.post('/admin/:id/respond', adminMiddleware, reviewController.respondToReview);
router.patch('/admin/:id/status', adminMiddleware, reviewController.updateReviewStatus);

module.exports = router;