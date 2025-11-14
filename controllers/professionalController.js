// server/controllers/professionalController.js - WITH STATUS TOGGLE
const Professional = require('../models/Professional');
const jwt = require('jsonwebtoken');

// Get all professionals (with optional filters)

const verificationService = require('../services/verificationService');

exports.getAllProfessionals = async (req, res) => {
  try {
    const { category, active = 'true' } = req.query;
    
    const query = {};
    
    if (active === 'true') {
      query.isActive = true;
      query.status = 'active';
    }
    
    if (category) {
      query.specializations = category;
    }

    const professionals = await Professional.find(query)
      .populate('services')
      .sort({ rating: -1, totalBookings: -1 });

    console.log(`📋 Found ${professionals.length} professionals (active=${active})`);

    res.json({
      success: true,
      data: professionals,
      count: professionals.length
    });

  } catch (error) {
    console.error('Get professionals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch professionals'
    });
  }
};

// Get professionals by service categories
exports.getProfessionalsByServices = async (req, res) => {
  try {
    const { serviceIds } = req.query;
    
    if (!serviceIds) {
      return res.status(400).json({
        success: false,
        message: 'Service IDs are required'
      });
    }

    const Service = require('../models/Service');
    
    const serviceIdArray = serviceIds.split(',');
    const services = await Service.find({ 
      _id: { $in: serviceIdArray } 
    }).select('category');

    const categories = [...new Set(services.map(s => s.category))];

    const professionals = await Professional.find({
      specializations: { $in: categories },
      isActive: true,
      status: 'active'
    })
    .populate('services')
    .sort({ rating: -1, totalBookings: -1 });

    res.json({
      success: true,
      data: professionals,
      categories
    });

  } catch (error) {
    console.error('Get professionals by services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch professionals'
    });
  }
};

// Get current professional profile
exports.getCurrentProfessional = async (req, res) => {
  try {
    const professionalId = req.user.id;
    
    const professional = await Professional.findById(professionalId)
      .populate('services')
      .select('-password -refreshToken');

    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    res.json({
      success: true,
      data: professional
    });

  } catch (error) {
    console.error('Get current professional error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

// ⭐ TOGGLE STATUS - SIMPLIFIED VERSION
exports.toggleActiveStatus = async (req, res) => {
  try {
    console.log('🔄 Toggle status endpoint hit');
    console.log('📝 Request details:', {
      userId: req.user?.id,
      userEmail: req.user?.email,
      isProfessional: req.isProfessional,
      body: req.body,
      headers: {
        authorization: req.header('Authorization') ? 'Present' : 'Missing'
      }
    });

    const professionalId = req.user.id;
    const { profileStatus } = req.body;

    // Validate profileStatus
    if (!profileStatus || !['active', 'on-leave'].includes(profileStatus)) {
      console.log('❌ Invalid status value:', profileStatus);
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active" or "on-leave"'
      });
    }

    console.log('🔍 Finding professional with ID:', professionalId);

    const professional = await Professional.findById(professionalId);
    
    if (!professional) {
      console.log('❌ Professional not found for ID:', professionalId);
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    console.log('✅ Professional found:', {
      id: professional._id,
      email: professional.email,
      name: professional.name,
      currentProfileStatus: professional.profileStatus,
      currentIsActive: professional.isActive
    });

    // Update profileStatus
    professional.profileStatus = profileStatus;
    
    // Also update isActive based on profileStatus
    professional.isActive = profileStatus === 'active';

    await professional.save();

    console.log('✅ Status updated successfully:', {
      email: professional.email,
      newProfileStatus: professional.profileStatus,
      newIsActive: professional.isActive
    });

    res.json({
      success: true,
      message: 'Status updated successfully',
      data: {
        profileStatus: professional.profileStatus,
        isActive: professional.isActive
      }
    });

  } catch (error) {
    console.error('❌ Error updating status:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
};

// Update profile
exports.updateProfile = async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { 
      name, 
      phone, 
      skills, 
      specialization, 
      experience, 
      bio, 
      availableDays 
    } = req.body;

    const professional = await Professional.findById(professionalId);
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    // Name validation
    if (name && name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters'
      });
    }

    // Phone validation
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format'
      });
    }

    // Skills validation
    if (skills && Array.isArray(skills)) {
      for (const skill of skills) {
        if (!skill.category || !Array.isArray(skill.subcategories)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid skills format'
          });
        }
      }
    }

    // ONE-TIME FIELDS PROTECTION
    if (professional.oneTimeFieldsLocked) {
      if (specialization && specialization !== professional.specialization) {
        return res.status(400).json({
          success: false,
          message: 'Specialization cannot be changed once set'
        });
      }
      if (experience && experience !== professional.experience) {
        return res.status(400).json({
          success: false,
          message: 'Experience cannot be changed once set'
        });
      }
      if (bio && bio !== professional.bio) {
        return res.status(400).json({
          success: false,
          message: 'Bio cannot be changed once set'
        });
      }
      if (availableDays && JSON.stringify(availableDays.sort()) !== JSON.stringify(professional.availableDays.sort())) {
        return res.status(400).json({
          success: false,
          message: 'Available days cannot be changed once set'
        });
      }
    }

    // Update editable fields
    if (name) professional.name = name.trim();
    if (phone !== undefined) professional.phone = phone;
    
    if (skills) {
      professional.skills = skills;
      professional.specializations = skills.map(s => s.category);
    }

    // Update one-time fields (only if not locked)
    if (!professional.oneTimeFieldsLocked) {
      if (specialization) professional.specialization = specialization.trim();
      if (experience !== undefined) professional.experience = experience;
      if (bio) professional.bio = bio.trim();
      if (availableDays && Array.isArray(availableDays)) {
        professional.availableDays = availableDays;
      }

      // Lock fields if all one-time fields are now set
      if (
        professional.specialization && 
        professional.experience !== null && 
        professional.bio && 
        professional.availableDays && 
        professional.availableDays.length > 0
      ) {
        professional.oneTimeFieldsLocked = true;
      }
    }

    await professional.save();

    console.log('✅ Profile updated:', professional.email);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: professional
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};


// ✅ NEW: Helper function to get or create Professional record
async function getOrCreateProfessionalRecord(userId, userEmail) {
  let professional = await Professional.findOne({ email: userEmail });
  
  if (!professional) {
    console.log('📝 Creating new Professional record for verification...');
    professional = new Professional({
      email: userEmail,
      name: '', // Will be updated later
      isActive: false, // Not active until approved
      status: 'inactive', // Inactive until admin approval
      profileStatus: 'inactive',
      rating: 5.0,
      // These will be filled during admin approval:
      skills: [],
      specializations: [],
      specialization: null,
      experience: null,
      bio: null,
      availableDays: []
    });
    await professional.save();
    console.log('✅ Professional record created for PAN/Bank verification');
  }
  
  return professional;
}

// Update PAN details
exports.updatePANDetails = async (req, res) => {
  try {
    const { panCard } = req.body;

    if (!panCard) {
      return res.status(400).json({
        success: false,
        message: 'PAN card number is required'
      });
    }

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(panCard.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PAN card format. Format: ABCDE1234F'
      });
    }

    // ✅ Get or create Professional record
    const professional = await getOrCreateProfessionalRecord(req.user.id, req.user.email);

    if (professional.panVerified) {
      return res.status(400).json({
        success: false,
        message: 'PAN card is already verified and cannot be changed'
      });
    }

    // Save only PAN number, name will be fetched during verification
    professional.panCard = panCard.toUpperCase();
    professional.panName = null; // Reset name
    professional.panVerified = false;

    await professional.save();

    console.log('✅ PAN number saved:', professional.email);

    res.json({
      success: true,
      message: 'PAN number saved. Click "Verify PAN" to fetch details.',
      data: {
        panCard: professional.panCard,
        panVerified: professional.panVerified
      }
    });

  } catch (error) {
    console.error('Update PAN error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save PAN number'
    });
  }
};

// Verify PAN
exports.verifyPAN = async (req, res) => {
  try {
    console.log('🔍 Starting PAN verification...');

    // ✅ Get or create Professional record
    const professional = await getOrCreateProfessionalRecord(req.user.id, req.user.email);

    console.log('✅ Professional found:', professional.email);
    console.log('📄 PAN Card:', professional.panCard);

    if (!professional.panCard) {
      console.log('❌ PAN number missing');
      return res.status(400).json({
        success: false,
        message: 'PAN number not found. Please save PAN number first.'
      });
    }

    if (professional.panVerified) {
      console.log('⚠️ PAN already verified');
      return res.status(400).json({
        success: false,
        message: 'PAN card is already verified'
      });
    }

    console.log('📞 Calling verification service...');

    // Call API with PAN number only - API will return the registered name
    const verificationResult = await verificationService.verifyPAN(
      professional.panCard,
      ''
    );

    console.log('📋 Verification API Response:', JSON.stringify(verificationResult, null, 2));

    if (!verificationResult.success) {
      console.log('❌ Verification API returned failure');
      return res.status(400).json({
        success: false,
        message: verificationResult.message || 'PAN verification failed',
        details: verificationResult.error,
        apiResponse: verificationResult
      });
    }

    if (!verificationResult.verified) {
      console.log('❌ PAN not verified by API');
      return res.status(400).json({
        success: false,
        message: verificationResult.message || 'PAN could not be verified. Please check your PAN number.',
        apiResponse: verificationResult
      });
    }

    // Check if name was returned from API
    if (!verificationResult.data?.fullName && !verificationResult.data?.registeredName) {
      console.log('⚠️ PAN valid but no name returned from API');
      return res.status(400).json({
        success: false,
        message: 'PAN is valid but name could not be retrieved from the registry. Please try again later.',
        apiResponse: verificationResult
      });
    }

    // ✅ Verification successful - save both PAN and fetched name
    professional.panVerified = true;
    
    // Store the name returned from the API
    const fetchedName = verificationResult.data.fullName || 
                       verificationResult.data.registeredName || 
                       verificationResult.data.name;
    
    professional.panName = fetchedName;
    
    await professional.save();

    console.log('✅ PAN verified successfully:', professional.email);
    console.log('✅ Name fetched:', fetchedName);

    res.json({
      success: true,
      message: 'PAN card verified successfully',
      data: {
        panVerified: true,
        panCard: professional.panCard,
        panName: professional.panName,
        verificationDetails: verificationResult.data
      }
    });

  } catch (error) {
    console.error('❌ Verify PAN error:', error);
    console.error('Error details:', {
      message: error.message,
      response: error.response?.data,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to verify PAN card',
      error: error.message,
      details: error.response?.data || error.toString()
    });
  }
};

// Update bank details
exports.updateBankDetails = async (req, res) => {
  try {
    const {
      accountNumber,
      ifscCode,
      accountHolderName,
      bankName,
      branchName
    } = req.body;

    if (!accountNumber || !ifscCode || !accountHolderName) {
      return res.status(400).json({
        success: false,
        message: 'Account number, IFSC code, and account holder name are required'
      });
    }

    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifscCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid IFSC code format. Format: ABCD0123456'
      });
    }

    if (!/^\d{9,18}$/.test(accountNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Account number must be 9-18 digits'
      });
    }

    if (accountHolderName.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Account holder name must be at least 3 characters'
      });
    }

    // ✅ Get or create Professional record
    const professional = await getOrCreateProfessionalRecord(req.user.id, req.user.email);

    if (professional.bankVerified) {
      return res.status(400).json({
        success: false,
        message: 'Bank details are already verified and cannot be changed'
      });
    }

    professional.bankDetails = {
      accountNumber: accountNumber.trim(),
      ifscCode: ifscCode.toUpperCase(),
      accountHolderName: accountHolderName.trim(),
      bankName: bankName ? bankName.trim() : null,
      branchName: branchName ? branchName.trim() : null
    };
    professional.bankVerified = false;

    await professional.save();

    console.log('✅ Bank details updated:', professional.email);

    res.json({
      success: true,
      message: 'Bank details updated successfully',
      data: {
        bankDetails: professional.bankDetails,
        bankVerified: professional.bankVerified
      }
    });

  } catch (error) {
    console.error('Update bank details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update bank details'
    });
  }
};

// Verify bank details
exports.verifyBankDetails = async (req, res) => {
  try {
    // ✅ Get or create Professional record
    const professional = await getOrCreateProfessionalRecord(req.user.id, req.user.email);

    if (!professional.bankDetails || !professional.bankDetails.accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Bank details not found. Please update bank details first'
      });
    }

    if (professional.bankVerified) {
      return res.status(400).json({
        success: false,
        message: 'Bank details are already verified'
      });
    }

    console.log('🏦 Starting bank verification for:', professional.email);
    console.log('Account:', professional.bankDetails.accountNumber);
    console.log('IFSC:', professional.bankDetails.ifscCode);

    // ✅ REAL VERIFICATION API CALL
    const verificationResult = await verificationService.verifyBankAccount(
      professional.bankDetails.accountNumber,
      professional.bankDetails.ifscCode,
      professional.bankDetails.accountHolderName
    );

    console.log('📋 Verification result:', verificationResult);

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message || 'Bank verification failed',
        details: verificationResult.error
      });
    }

    if (!verificationResult.verified) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message || 'Bank account could not be verified. Please check your details.',
        nameMatch: verificationResult.data?.nameMatch,
        providedName: professional.bankDetails.accountHolderName,
        verifiedName: verificationResult.data?.accountHolderName
      });
    }

    // ✅ Verification successful - update database with verified details
    professional.bankVerified = true;
    
    // Update with verified information from API
    if (verificationResult.data) {
      if (verificationResult.data.accountHolderName) {
        professional.bankDetails.accountHolderName = verificationResult.data.accountHolderName;
      }
      if (verificationResult.data.bankName) {
        professional.bankDetails.bankName = verificationResult.data.bankName;
      }
      if (verificationResult.data.branchName) {
        professional.bankDetails.branchName = verificationResult.data.branchName;
      }
    }
    
    await professional.save();

    console.log('✅ Bank details verified successfully:', professional.email);

    res.json({
      success: true,
      message: 'Bank details verified successfully. Now submit your profile for admin approval.',
      data: {
        bankVerified: true,
        bankDetails: professional.bankDetails,
        verificationDetails: verificationResult.data
      }
    });

  } catch (error) {
    console.error('❌ Verify bank details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify bank details',
      error: error.message
    });
  }
};

// Get current professional profile
exports.getCurrentProfessional = async (req, res) => {
  try {
    const professional = await Professional.findOne({ email: req.user.email })
      .populate('services')
      .select('-password -refreshToken');

    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional profile not found'
      });
    }

    res.json({
      success: true,
      data: professional
    });

  } catch (error) {
    console.error('Get current professional error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

// Complete profile
exports.completeProfile = async (req, res) => {
  try {
    const professionalId = req.user.id;

    const professional = await Professional.findById(professionalId);
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    if (!professional.panVerified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your PAN card first'
      });
    }

    if (!professional.bankVerified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your bank details first'
      });
    }

    console.log('✅ Profile completed:', professional.email);

    res.json({
      success: true,
      message: 'Profile completed successfully! You can now receive payments.',
      data: {
        profileCompletionPercentage: professional.profileCompletionPercentage,
        panVerified: professional.panVerified,
        bankVerified: professional.bankVerified
      }
    });

  } catch (error) {
    console.error('Complete profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete profile'
    });
  }
};

exports.createProfessional = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      role,
      specializations,
      experience,
      bio,
      services
    } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone are required'
      });
    }

    const existingProfessional = await Professional.findOne({ email });
    if (existingProfessional) {
      return res.status(400).json({
        success: false,
        message: 'Professional with this email already exists'
      });
    }

    const professional = new Professional({
      name,
      email,
      phone,
      role: role || 'Professional',
      specializations: Array.isArray(specializations) 
        ? specializations 
        : specializations ? specializations.split(',').map(s => s.trim()) : [],
      experience: experience || 0,
      bio: bio || '',
      services: services || [],
      rating: 5.0,
      isActive: true,
      status: 'active'
    });

    await professional.save();

    console.log('✅ Professional created:', professional.name);

    res.status(201).json({
      success: true,
      message: 'Professional created successfully',
      data: professional
    });

  } catch (error) {
    console.error('Create professional error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create professional'
    });
  }
};

// Update professional (Admin only)
exports.updateProfessional = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      role,
      specializations,
      experience,
      bio,
      isActive,
      status,
      services
    } = req.body;

    const professional = await Professional.findById(id);
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    if (name) professional.name = name;
    if (email) professional.email = email;
    if (phone) professional.phone = phone;
    if (role) professional.role = role;
    if (specializations) {
      professional.specializations = Array.isArray(specializations)
        ? specializations
        : specializations.split(',').map(s => s.trim());
    }
    if (experience !== undefined) professional.experience = experience;
    if (bio !== undefined) professional.bio = bio;
    if (isActive !== undefined) professional.isActive = isActive;
    if (status !== undefined) professional.status = status;
    if (services !== undefined) professional.services = services;

    await professional.save();

    console.log('✅ Professional updated:', professional.name);

    res.json({
      success: true,
      message: 'Professional updated successfully',
      data: professional
    });

  } catch (error) {
    console.error('Update professional error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update professional'
    });
  }
};

// Delete professional (Admin only)
exports.deleteProfessional = async (req, res) => {
  try {
    const { id } = req.params;

    const professional = await Professional.findByIdAndDelete(id);
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    console.log('✅ Professional deleted:', professional.name);

    res.json({
      success: true,
      message: 'Professional deleted successfully'
    });

  } catch (error) {
    console.error('Delete professional error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete professional'
    });
  }
};