// server/middlewares/professionalMiddleware.js - FIXED: Allow status toggle
const Professional = require('../models/Professional');
const User = require('../models/User');

const professionalMiddleware = async (req, res, next) => {
  try {
    console.log('🔍 Professional middleware check...');
    console.log('📧 Authenticated user:', {
      id: req.user?._id,
      email: req.user?.email,
      role: req.user?.role
    });

    if (!req.user || !req.user.email) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userEmail = req.user.email.toLowerCase();

    // ✅ STRATEGY 1: Try to find Professional document by email
    let professional = await Professional.findOne({ 
      email: userEmail 
    });

    if (professional) {
      console.log('✅ Professional document found:', {
        name: professional.name,
        email: professional.email,
        _id: professional._id,
        profileStatus: professional.profileStatus
      });

      // ⭐ FIXED: Only check if account is permanently suspended
      // Don't block when on-leave - they need access to toggle status!
      if (professional.status === 'suspended' || professional.status === 'inactive') {
        return res.status(403).json({
          success: false,
          message: 'Your professional account has been suspended. Please contact support.'
        });
      }

      // Attach professional to request
      req.professional = professional;
      return next();
    }

    // ✅ STRATEGY 2: Check if user has 'professional' role
    console.log('⚠️ No Professional document found, checking user role...');
    
    if (req.user.role === 'professional') {
      console.log('✅ User has professional role, creating temporary professional object');
      
      // Create a temporary professional object from user data
      req.professional = {
        _id: req.user._id,
        email: userEmail,
        name: req.user.name,
        phone: req.user.phone,
        isActive: true,
        status: 'active'
      };
      
      return next();
    }

    // ✅ STRATEGY 3: Admin can act as professional
    if (req.user.role === 'admin') {
      console.log('✅ Admin user - granting professional access');
      
      req.professional = {
        _id: req.user._id,
        email: userEmail,
        name: req.user.name,
        phone: req.user.phone,
        isActive: true,
        status: 'active',
        isAdmin: true
      };
      
      return next();
    }

    // No professional access
    console.error('❌ Access denied - not a professional');
    return res.status(403).json({
      success: false,
      message: 'Professional access required. Please contact admin to activate your professional account.',
      debug: {
        userRole: req.user.role,
        userEmail: userEmail,
        professionalDocumentExists: false
      }
    });

  } catch (error) {
    console.error('❌ Professional middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify professional access',
      error: error.message
    });
  }
};

module.exports = professionalMiddleware;