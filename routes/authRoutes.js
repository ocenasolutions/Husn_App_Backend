const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

// Authentication routes
// Two-step signup process
router.post('/signup/send-otp', authController.signupSendOTP);
router.post('/signup/verify-otp', authController.signupVerifyOTP);

// Login route
router.post('/login', authController.login);

// Google authentication
router.post('/google', authController.googleAuth);

// Forgot password routes (OTP-based)
router.post('/forgot-password/send-otp', authController.forgotPasswordSendOTP);
router.post('/forgot-password/verify-otp', authController.forgotPasswordVerifyOTP);

// Legacy OTP routes (for backward compatibility)
router.post('/send-otp', authController.sendOTP);
router.post('/verify-otp', authController.verifyOTP);

// Token refresh
router.post('/refresh', authController.refreshToken);

// Protected route example
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Logout route
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    // Remove session from Redis
    if (token && req.app.locals.redis) {
      await req.app.locals.redis.del(`session:${token}`);
    }
    
    // Clear refresh token from user
    const user = req.user;
    user.refreshToken = null;
    await user.save();

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Delete account route
router.delete('/delete-account', authMiddleware, authController.deleteAccount);

module.exports = router;