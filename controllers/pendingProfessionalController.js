// server/controllers/pendingProfessionalController.js - FIXED: Verify PAN/Bank before submission
const PendingProfessional = require('../models/PendingProfessional');
const Professional = require('../models/Professional');
const User = require('../models/User');

// Submit professional profile for admin verification
exports.submitForVerification = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      phone,
      skills,
      specialization,
      experience,
      bio,
      availableDays
    } = req.body;

    // Validation
    if (!name || !skills || skills.length === 0 || !specialization || 
        experience === undefined || !bio || !availableDays || availableDays.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters'
      });
    }

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    if (experience < 0) {
      return res.status(400).json({
        success: false,
        message: 'Experience cannot be negative'
      });
    }

    if (bio.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Bio cannot exceed 500 characters'
      });
    }

    // ✅ NEW: Check if user has verified PAN and Bank details
    // We need to check if the user has a Professional record with verified details
    const existingProfessional = await Professional.findOne({ email: req.user.email });
    
    if (!existingProfessional) {
      return res.status(400).json({
        success: false,
        message: 'Please complete PAN and Bank verification first'
      });
    }

    if (!existingProfessional.panVerified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your PAN card before submitting'
      });
    }

    if (!existingProfessional.bankVerified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your bank details before submitting'
      });
    }

    // ✅ Check if already a verified professional
    const approvedApplication = await PendingProfessional.findOne({ 
      userId,
      verificationStatus: 'approved'
    });

    if (approvedApplication) {
      console.log('❌ User is already a verified professional:', req.user.email);
      return res.status(400).json({
        success: false,
        message: 'You are already registered as a professional',
        alreadyApproved: true
      });
    }

    // ✅ Check for existing pending application
    const existingPending = await PendingProfessional.findOne({
      userId,
      verificationStatus: 'pending'
    });

    if (existingPending) {
      console.log('⏳ Pending application already exists for:', req.user.email);
      return res.status(400).json({
        success: false,
        message: 'Your profile is already under review. Please wait for admin verification.'
      });
    }

    // ✅ If previously rejected, allow resubmission by updating the existing record
    const rejectedApplication = await PendingProfessional.findOne({
      userId,
      verificationStatus: 'rejected'
    });

    if (rejectedApplication) {
      console.log('🔄 Resubmitting rejected application for:', req.user.email);
      
      // Update the rejected application with new data
      rejectedApplication.name = name.trim();
      rejectedApplication.phone = phone || null;
      rejectedApplication.skills = skills;
      rejectedApplication.specialization = specialization.trim();
      rejectedApplication.experience = parseInt(experience);
      rejectedApplication.bio = bio.trim();
      rejectedApplication.availableDays = availableDays;
      rejectedApplication.verificationStatus = 'pending';
      rejectedApplication.adminNotes = null;
      rejectedApplication.reviewedBy = null;
      rejectedApplication.reviewedAt = null;
      rejectedApplication.submittedAt = new Date();

      await rejectedApplication.save();

      console.log('✅ Professional profile resubmitted after rejection:', req.user.email);

      return res.status(201).json({
        success: true,
        message: 'Your profile has been resubmitted for admin verification. You will be notified once approved.',
        data: rejectedApplication
      });
    }

    // Create new pending professional record
    console.log('✅ Creating new application for:', req.user.email);
    
    const pendingProfessional = new PendingProfessional({
      userId,
      email: req.user.email,
      name: name.trim(),
      phone: phone || null,
      skills,
      specialization: specialization.trim(),
      experience: parseInt(experience),
      bio: bio.trim(),
      availableDays,
      verificationStatus: 'pending',
      submittedAt: new Date()
    });

    await pendingProfessional.save();

    console.log('✅ Professional profile submitted for verification:', req.user.email);

    res.status(201).json({
      success: true,
      message: 'Your profile has been submitted for admin verification. You will be notified once approved.',
      data: pendingProfessional
    });

  } catch (error) {
    console.error('❌ Submit for verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit profile for verification',
      error: error.message
    });
  }
};

// Get user's pending verification status
exports.getVerificationStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find the most recent application for this user
    const pendingProfessional = await PendingProfessional.findOne({
      userId
    }).sort({ submittedAt: -1 });

    // If no application found at all
    if (!pendingProfessional) {
      console.log('✅ No pending application found for user:', req.user.email);
      return res.json({
        success: true,
        data: {
          status: 'not_submitted',
          message: 'No verification request found'
        }
      });
    }

    console.log(`📋 Found application for ${req.user.email}:`, {
      status: pendingProfessional.verificationStatus,
      submittedAt: pendingProfessional.submittedAt,
      reviewedAt: pendingProfessional.reviewedAt
    });

    // Return the status as-is
    res.json({
      success: true,
      data: {
        status: pendingProfessional.verificationStatus,
        submittedAt: pendingProfessional.submittedAt,
        reviewedAt: pendingProfessional.reviewedAt,
        adminNotes: pendingProfessional.adminNotes,
        profileData: {
          name: pendingProfessional.name,
          phone: pendingProfessional.phone,
          skills: pendingProfessional.skills,
          specialization: pendingProfessional.specialization,
          experience: pendingProfessional.experience,
          bio: pendingProfessional.bio,
          availableDays: pendingProfessional.availableDays
        }
      }
    });

  } catch (error) {
    console.error('❌ Get verification status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification status'
    });
  }
};

// ADMIN: Get all pending verifications
exports.getAllPendingVerifications = async (req, res) => {
  try {
    const { status = 'pending' } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.verificationStatus = status;
    }

    const pendingProfessionals = await PendingProfessional.find(query)
      .populate('userId', 'name email phone')
      .sort({ submittedAt: -1 });

    res.json({
      success: true,
      data: pendingProfessionals,
      count: pendingProfessionals.length
    });

  } catch (error) {
    console.error('❌ Get pending verifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending verifications'
    });
  }
};

// ADMIN: Approve professional
// ✅ UPDATED: Now also updates the existing Professional record instead of creating new one
exports.approveProfessional = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    console.log('🔍 Attempting to approve professional with ID:', id);

    const pendingProfessional = await PendingProfessional.findById(id);

    if (!pendingProfessional) {
      console.log('❌ Pending professional not found');
      return res.status(404).json({
        success: false,
        message: 'Pending professional not found'
      });
    }

    console.log('📋 Found pending professional:', {
      email: pendingProfessional.email,
      status: pendingProfessional.verificationStatus
    });

    // ✅ Check if already approved
    if (pendingProfessional.verificationStatus === 'approved') {
      const existingProfessional = await Professional.findOne({
        email: pendingProfessional.email
      });

      if (existingProfessional && existingProfessional.oneTimeFieldsLocked) {
        console.log('✅ Professional already exists and is approved:', existingProfessional.email);
        return res.status(400).json({
          success: false,
          message: 'This application has already been approved and the professional account is active',
          alreadyExists: true
        });
      }
    }

    if (pendingProfessional.verificationStatus === 'rejected') {
      console.log('❌ Application was rejected');
      return res.status(400).json({
        success: false,
        message: 'This application has been rejected. User needs to resubmit.'
      });
    }

    // ✅ CRITICAL: Find the existing Professional record (created during PAN/Bank verification)
    let professional = await Professional.findOne({
      email: pendingProfessional.email
    });

    if (!professional) {
      console.log('❌ Professional record not found. User must complete PAN/Bank verification first.');
      return res.status(400).json({
        success: false,
        message: 'Professional record not found. User must complete PAN and Bank verification before admin approval.'
      });
    }

    console.log('✅ Found existing Professional record, updating with profile data...');

    // ✅ Update the Professional record with profile data from pending application
    professional.name = pendingProfessional.name;
    professional.phone = pendingProfessional.phone;
    professional.skills = pendingProfessional.skills;
    professional.specializations = pendingProfessional.skills.map(s => s.category);
    professional.specialization = pendingProfessional.specialization;
    professional.experience = pendingProfessional.experience;
    professional.bio = pendingProfessional.bio;
    professional.availableDays = pendingProfessional.availableDays;
    professional.oneTimeFieldsLocked = true;
    professional.isActive = true;
    professional.status = 'active';
    professional.profileStatus = 'active';

    await professional.save();
    console.log('✅ Professional record updated with profile data');

    // Update User role to professional
    await User.findByIdAndUpdate(pendingProfessional.userId, {
      role: 'professional'
    });
    console.log('✅ User role updated to professional');

    // Update pending record
    pendingProfessional.verificationStatus = 'approved';
    pendingProfessional.adminNotes = adminNotes || 'Approved by admin';
    pendingProfessional.reviewedBy = req.user._id;
    pendingProfessional.reviewedAt = new Date();
    await pendingProfessional.save();
    console.log('✅ Pending record updated to approved');

    console.log('🎉 Professional approved successfully:', professional.email);

    res.json({
      success: true,
      message: 'Professional approved and profile completed successfully',
      data: {
        professional,
        pendingRecord: pendingProfessional
      }
    });

  } catch (error) {
    console.error('❌ Approve professional error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to approve professional',
      error: error.message
    });
  }
};

// ADMIN: Reject professional
exports.rejectProfessional = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;

    if (!adminNotes || adminNotes.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Admin notes are required for rejection'
      });
    }

    const pendingProfessional = await PendingProfessional.findById(id);

    if (!pendingProfessional) {
      return res.status(404).json({
        success: false,
        message: 'Pending professional not found'
      });
    }

    if (pendingProfessional.verificationStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'This application has already been reviewed'
      });
    }

    // Update pending record
    pendingProfessional.verificationStatus = 'rejected';
    pendingProfessional.adminNotes = adminNotes.trim();
    pendingProfessional.reviewedBy = req.user._id;
    pendingProfessional.reviewedAt = new Date();
    await pendingProfessional.save();

    console.log('❌ Professional rejected:', pendingProfessional.email);

    res.json({
      success: true,
      message: 'Professional application rejected',
      data: pendingProfessional
    });

  } catch (error) {
    console.error('❌ Reject professional error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject professional',
      error: error.message
    });
  }
};

// ADMIN: Get verification statistics
exports.getVerificationStats = async (req, res) => {
  try {
    const [pending, approved, rejected, total] = await Promise.all([
      PendingProfessional.countDocuments({ verificationStatus: 'pending' }),
      PendingProfessional.countDocuments({ verificationStatus: 'approved' }),
      PendingProfessional.countDocuments({ verificationStatus: 'rejected' }),
      PendingProfessional.countDocuments()
    ]);

    res.json({
      success: true,
      data: {
        pending,
        approved,
        rejected,
        total
      }
    });

  } catch (error) {
    console.error('❌ Get verification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification statistics'
    });
  }
};