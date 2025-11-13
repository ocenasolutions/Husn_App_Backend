// Add this to a new file: server/routes/debugRoutes.js
// OR add to your existing routes temporarily

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Professional = require('../models/Professional');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// 🔍 DEBUG ENDPOINT - Check what's in your token
router.post('/debug/decode-token', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.json({
        success: false,
        message: 'No token provided',
        hint: 'Make sure you are sending: Authorization: Bearer YOUR_TOKEN'
      });
    }

    // Decode without verification first to see the content
    const decodedWithoutVerify = jwt.decode(token);
    console.log('📋 Token content (unverified):', decodedWithoutVerify);

    // Try to verify
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (verifyError) {
      return res.json({
        success: false,
        error: 'Token verification failed',
        reason: verifyError.message,
        tokenContent: decodedWithoutVerify
      });
    }

    // Check Redis session
    let redisSession = null;
    if (req.app.locals.redis) {
      try {
        const sessionData = await req.app.locals.redis.get(`session:${token}`);
        redisSession = sessionData ? JSON.parse(sessionData) : null;
      } catch (redisError) {
        console.error('Redis error:', redisError);
      }
    }

    // Try to find user in Professional collection
    const professional = await Professional.findById(decoded.userId);
    
    // Try to find user in User collection
    const user = await User.findById(decoded.userId);

    // Return comprehensive debug info
    res.json({
      success: true,
      debug: {
        tokenDecoded: decoded,
        isProfessionalFlag: decoded.isProfessional,
        redisSession: redisSession,
        professionalFound: professional ? {
          id: professional._id,
          email: professional.email,
          name: professional.name,
          isActive: professional.isActive,
          status: professional.status
        } : null,
        userFound: user ? {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        } : null,
        analysis: {
          tokenIsValid: !!decoded,
          redisSessionExists: !!redisSession,
          professionalDocumentExists: !!professional,
          userDocumentExists: !!user,
          whatShouldHappen: decoded.isProfessional 
            ? 'Should look in Professional collection'
            : 'Should look in User collection'
        }
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// 🔍 DEBUG ENDPOINT - Check login flow
router.post('/debug/test-login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password required'
      });
    }

    const emailLower = email.toLowerCase();

    // Check Professional collection
    const professional = await Professional.findOne({ email: emailLower });
    
    // Check User collection
    const user = await User.findOne({ email: emailLower });

    const result = {
      email: emailLower,
      professionalExists: !!professional,
      userExists: !!user
    };

    if (professional) {
      result.professional = {
        id: professional._id,
        email: professional.email,
        name: professional.name,
        hasPassword: !!professional.password,
        isActive: professional.isActive,
        status: professional.status
      };

      if (professional.password) {
        const isValid = await professional.comparePassword(password);
        result.professional.passwordValid = isValid;
      }
    }

    if (user) {
      result.user = {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        hasPassword: !!user.password
      };

      if (user.password) {
        const isValid = await user.comparePassword(password);
        result.user.passwordValid = isValid;
      }
    }

    res.json({
      success: true,
      debug: result,
      recommendation: professional && professional.password
        ? 'Login should work with professional credentials'
        : user && user.password
        ? 'Login should work with user credentials'
        : 'No valid account found or password not set'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔍 DEBUG ENDPOINT - Check what professional middleware sees
router.get('/debug/check-professional-access', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const emailFromToken = decoded.email || decoded.userEmail;

    // Check both collections
    const professional = await Professional.findById(decoded.userId);
    const user = await User.findById(decoded.userId);

    res.json({
      success: true,
      debug: {
        tokenData: {
          userId: decoded.userId,
          isProfessional: decoded.isProfessional,
          email: emailFromToken
        },
        professional: professional ? {
          id: professional._id,
          email: professional.email,
          name: professional.name,
          isActive: professional.isActive,
          status: professional.status
        } : null,
        user: user ? {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role
        } : null
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;


// ============================================
// ADD TO YOUR server.js or app.js:
// ============================================
