// server/middlewares/authMiddleware.js - FIXED: Allow professionals to toggle status
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Professional = require('../models/Professional');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    console.log('🔍 Auth middleware - decoded token:', {
      userId: decoded.userId,
      isProfessional: decoded.isProfessional
    });

    // Check if session exists in Redis
    if (req.app.locals.redis) {
      const sessionExists = await req.app.locals.redis.get(`session:${token}`);
      if (!sessionExists) {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please login again.'
        });
      }
    }

    // Get isProfessional flag from token
    const isProfessional = decoded.isProfessional === true;

    let user;
    if (isProfessional) {
      // Look in Professional collection
      user = await Professional.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Professional not found.'
        });
      }
      
      // ⭐ FIXED: Only check if account is permanently suspended/deleted
      // Don't block access when on-leave (profileStatus) - they need to toggle it back!
      if (user.status === 'suspended' || user.status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: 'Your professional account has been suspended. Please contact support.'
        });
      }

      console.log('✅ Professional authenticated:', {
        id: user._id,
        email: user.email,
        profileStatus: user.profileStatus,
        status: user.status
      });
      
    } else {
      // Look in User collection
      user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found.'
        });
      }

      console.log('✅ User authenticated:', {
        id: user._id,
        email: user.email,
        role: user.role
      });
    }

    // ⭐ CRITICAL: Set req.user with consistent structure
    req.user = {
      id: user._id.toString(),          // String ID for consistency
      _id: user._id,                     // MongoDB ObjectId
      email: user.email,
      name: user.name,
      role: isProfessional ? 'professional' : (user.role || 'user'),
      // Include all professional fields if needed
      profileStatus: user.profileStatus,
      isActive: user.isActive,
      status: user.status
    };
    
    req.isProfessional = isProfessional;
    req.token = token;
    
    console.log('✅ Auth successful - req.user set:', {
      id: req.user.id,
      email: req.user.email,
      isProfessional: req.isProfessional,
      profileStatus: req.user.profileStatus
    });

    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please refresh your token.'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }

    console.error('❌ Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = authMiddleware;