// server/routes/stockNotificationRoutes.js
const express = require('express');
const router = express.Router();
const stockNotificationController = require('../controllers/stockNotificationController');
const authMiddleware = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Request notification when product is back in stock
router.post('/request', stockNotificationController.requestNotification);

// Cancel notification request
router.delete('/:productId', stockNotificationController.cancelNotification);

// Check if user has requested notification for a product
router.get('/check/:productId', stockNotificationController.checkNotificationStatus);

// Get all notification requests for the user
router.get('/my-requests', stockNotificationController.getUserNotificationRequests);

module.exports = router;