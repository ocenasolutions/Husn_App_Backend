// server/routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Get all admin notifications (with filters)
router.get('/admin', adminMiddleware, notificationController.getAdminNotifications);

// Get unread count
router.get('/unread-count', adminMiddleware, notificationController.getUnreadCount);

// Get notification statistics
router.get('/stats', adminMiddleware, notificationController.getNotificationStats);

// Mark single notification as read
router.put('/:id/read', adminMiddleware, notificationController.markAsRead);

// Mark all as read
router.put('/mark-all-read', adminMiddleware, notificationController.markAllAsRead);

// Delete single notification
router.delete('/:id', adminMiddleware, notificationController.deleteNotification);

// Delete all read notifications
router.delete('/read/all', adminMiddleware, notificationController.deleteAllRead);

// Create manual notification
router.post('/', adminMiddleware, notificationController.createNotification);

module.exports = router;