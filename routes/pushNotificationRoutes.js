// server/routes/pushNotificationRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const pushNotificationController = require('../controllers/pushNotificationController');

// User routes (authenticated users can register their devices)
router.post('/register-token', 
  authMiddleware, 
  pushNotificationController.registerToken
);

router.post('/unregister-token', 
  authMiddleware, 
  pushNotificationController.unregisterToken
);

// Admin routes
router.post('/create', 
  authMiddleware, 
  adminMiddleware, 
  pushNotificationController.createNotification
);

router.post('/send-immediate', 
  authMiddleware, 
  adminMiddleware, 
  pushNotificationController.sendImmediateNotification
);

router.post('/send/:notificationId', 
  authMiddleware, 
  adminMiddleware, 
  pushNotificationController.sendNotification
);

router.get('/all', 
  authMiddleware, 
  adminMiddleware, 
  pushNotificationController.getAllNotifications
);

router.get('/stats', 
  authMiddleware, 
  adminMiddleware, 
  pushNotificationController.getNotificationStats
);

router.get('/:notificationId', 
  authMiddleware, 
  adminMiddleware, 
  pushNotificationController.getNotificationById
);

router.delete('/:notificationId', 
  authMiddleware, 
  adminMiddleware, 
  pushNotificationController.deleteNotification
);

router.post('/test', 
  authMiddleware, 
  adminMiddleware, 
  pushNotificationController.sendTestNotification
);

module.exports = router;