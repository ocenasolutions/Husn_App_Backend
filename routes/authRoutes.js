const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const Professional = require('../models/Professional');

// Authentication routes
router.post('/signup/send-otp', authController.signupSendOTP);
router.post('/signup/verify-otp', authController.signupVerifyOTP);
router.post('/login', authController.login);
router.post('/google', authController.googleAuth);
router.post('/forgot-password/send-otp', authController.forgotPasswordSendOTP);
router.post('/forgot-password/verify-otp', authController.forgotPasswordVerifyOTP);

// Legacy OTP routes (for backward compatibility)
router.post('/send-otp', authController.sendOTP);
router.post('/verify-otp', authController.verifyOTP);

// Token refresh
router.post('/refresh', authController.refreshToken);

// Get profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user.toJSON ? req.user.toJSON() : req.user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

// Update profile (with skills) - Works for both User and Professional
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, skills } = req.body;
    const user = req.user;
    const isProfessional = req.isProfessional;

    // Validate skills format
    if (skills && !Array.isArray(skills)) {
      return res.status(400).json({
        success: false,
        message: 'Skills must be an array'
      });
    }

    // Validate each skill has category and subcategories
    if (skills && skills.length > 0) {
      for (const skill of skills) {
        if (!skill.category || !Array.isArray(skill.subcategories)) {
          return res.status(400).json({
            success: false,
            message: 'Each skill must have a category and subcategories array'
          });
        }
        if (skill.subcategories.length === 0) {
          return res.status(400).json({
            success: false,
            message: `Skill "${skill.category}" must have at least one subcategory`
          });
        }
      }
    }

    // Update fields
    if (name !== undefined) user.name = name.trim();
    if (phone !== undefined) user.phone = phone;
    if (skills !== undefined) user.skills = skills;

    // Mark nested paths as modified for Mongoose
    if (skills !== undefined) {
      user.markModified('skills');
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toJSON ? user.toJSON() : user
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update profile'
    });
  }
});

// Complete profile (PAN and Bank details) - Works for both User and Professional
router.put('/complete-profile', authMiddleware, async (req, res) => {
  try {
    const {
      panCard,
      panName,
      panVerified,
      accountNumber,
      ifscCode,
      accountHolderName,
      bankName,
      branchName,
      bankVerified
    } = req.body;

    const user = req.user;
    const isProfessional = req.isProfessional;

    // Update PAN details
    if (panCard) user.panCard = panCard.toUpperCase();
    if (panName) user.panName = panName;
    if (panVerified !== undefined) user.panVerified = panVerified;

    // Update bank details
    if (accountNumber || ifscCode || accountHolderName || bankName || branchName) {
      if (!user.bankDetails) {
        user.bankDetails = {};
      }
      if (accountNumber) user.bankDetails.accountNumber = accountNumber;
      if (ifscCode) user.bankDetails.ifscCode = ifscCode.toUpperCase();
      if (accountHolderName) user.bankDetails.accountHolderName = accountHolderName;
      if (bankName) user.bankDetails.bankName = bankName;
      if (branchName) user.bankDetails.branchName = branchName;
    }

    if (bankVerified !== undefined) user.bankVerified = bankVerified;

    await user.save();

    res.json({
      success: true,
      message: 'Profile completed successfully',
      user: user.toJSON ? user.toJSON() : user
    });
  } catch (error) {
    console.error('Complete profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete profile'
    });
  }
});

// Verify PAN (simulated) - Works for both User and Professional
router.post('/verify-pan', authMiddleware, async (req, res) => {
  try {
    const { panCard, panName } = req.body;

    if (!panCard || !panName) {
      return res.status(400).json({
        success: false,
        message: 'PAN card and name are required'
      });
    }

    // Validate PAN format
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(panCard)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PAN format'
      });
    }

    const user = req.user;
    user.panCard = panCard.toUpperCase();
    user.panName = panName;
    user.panVerified = true;
    await user.save();

    res.json({
      success: true,
      message: 'PAN verified successfully',
      user: user.toJSON ? user.toJSON() : user
    });
  } catch (error) {
    console.error('PAN verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify PAN'
    });
  }
});

// Verify Bank (simulated) - Works for both User and Professional
router.post('/verify-bank', authMiddleware, async (req, res) => {
  try {
    const { accountNumber, ifscCode, accountHolderName } = req.body;

    if (!accountNumber || !ifscCode || !accountHolderName) {
      return res.status(400).json({
        success: false,
        message: 'All bank details are required'
      });
    }

    // Validate IFSC format
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifscCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IFSC format'
      });
    }

    const user = req.user;
    if (!user.bankDetails) {
      user.bankDetails = {};
    }
    user.bankDetails.accountNumber = accountNumber;
    user.bankDetails.ifscCode = ifscCode.toUpperCase();
    user.bankDetails.accountHolderName = accountHolderName;
    user.bankVerified = true;
    await user.save();

    res.json({
      success: true,
      message: 'Bank details verified successfully',
      user: user.toJSON ? user.toJSON() : user
    });
  } catch (error) {
    console.error('Bank verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify bank details'
    });
  }
});

// Logout route - Works for both User and Professional
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    const isProfessional = req.isProfessional;
    
    if (token && req.app.locals.redis) {
      await req.app.locals.redis.del(`session:${token}`);
    }
    
    const user = req.user;
    
    if (isProfessional) {
      await Professional.findByIdAndUpdate(user._id, { refreshToken: null });
    } else {
      user.refreshToken = null;
      await user.save();
    }

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

// Delete account route - Works for both User and Professional
router.delete('/delete-account', authMiddleware, authController.deleteAccount);

module.exports = router;  