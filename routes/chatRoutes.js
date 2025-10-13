// server/routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Optional auth middleware - works with or without authentication
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      // If token exists, try to authenticate
      return authMiddleware(req, res, next);
    } else {
      // No token, continue as guest
      req.user = null;
      next();
    }
  } catch (error) {
    req.user = null;
    next();
  }
};

// ===== USER ROUTES =====

// POST - Create new chat session
router.post('/session', optionalAuth, chatController.createSession);

// GET - Get active chat session
router.get('/session', authMiddleware, chatController.getActiveSession);

// GET - Get all user's chat sessions (history)
router.get('/sessions', authMiddleware, chatController.getUserSessions);

// POST - Send message
router.post('/message', optionalAuth, chatController.sendMessage);

// PATCH - Close chat session
router.patch('/session/:id/close', optionalAuth, chatController.closeSession);

// GET - Get unread messages count
router.get('/unread-count', authMiddleware, chatController.getUnreadCount);

// ===== ADMIN ROUTES =====

// GET - Get all chat sessions (admin)
router.get('/admin/sessions', authMiddleware, adminMiddleware, chatController.getAllSessions);

// GET - Get single chat session (admin)
router.get('/admin/session/:id', authMiddleware, adminMiddleware, chatController.getSessionById);

// POST - Send admin message
router.post('/admin/message', authMiddleware, adminMiddleware, chatController.sendAdminMessage);

// PATCH - Update session status (admin)
router.patch('/admin/session/:id', authMiddleware, adminMiddleware, chatController.updateSessionStatus);

// GET - Get admin stats
router.get('/admin/stats', authMiddleware, adminMiddleware, chatController.getAdminStats);

module.exports = router;