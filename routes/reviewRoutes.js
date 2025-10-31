// server/routes/reviewRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const reviewController = require('../controllers/reviewController');
const authMiddleware = require('../middlewares/authMiddleware');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, 
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'), false);
    }
  }
});

// Get reviews for a product
router.get('/product/:productId', reviewController.getProductReviews);

// Get reviews for a service
router.get('/service/:serviceId', reviewController.getServiceReviews);

// Get reviews for a professional
router.get('/professional/:professionalId', reviewController.getProfessionalReviews);

// Create a review
router.post('/', authMiddleware, upload.array('media', 5), reviewController.createReview);

// Get user's own reviews
router.get('/my-reviews', authMiddleware, reviewController.getUserReviews);

// Get reviewable items from an order
router.get('/order/:orderId/items', authMiddleware, reviewController.getReviewableItems);

// Update review
router.put('/:reviewId', authMiddleware, reviewController.updateReview);

// Delete review
router.delete('/:reviewId', authMiddleware, reviewController.deleteReview);

// Vote on review (helpful/not helpful)
router.post('/:reviewId/vote', authMiddleware, reviewController.voteReview);

// Public route - get all approved reviews
router.get('/all', reviewController.getAllPublicReviews);


module.exports = router;