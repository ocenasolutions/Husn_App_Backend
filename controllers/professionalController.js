// server/controllers/professionalController.js
const Professional = require('../models/Professional');
const Service = require('../models/Service');
const { deleteFromS3 } = require('../config/s3Config');

// Get all professionals (Public)
exports.getAllProfessionals = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      serviceId,
      specialization,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isAvailable
    } = req.query;

    const query = { isActive: true };

    // Filter by service
    if (serviceId) {
      query.services = serviceId;
    }

    // Filter by specialization
    if (specialization) {
      query.specialization = { $in: [specialization] };
    }

    // Filter by availability
    if (isAvailable !== undefined) {
      query.isAvailable = isAvailable === 'true';
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { specialization: { $in: [new RegExp(search, 'i')] } },
        { role: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    const professionals = await Professional.find(query)
      .populate('services', 'name category')
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Professional.countDocuments(query);

    res.json({
      success: true,
      data: professionals,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProfessionals: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get professionals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch professionals'
    });
  }
};

// Get professionals by service (Public)
exports.getProfessionalsByService = async (req, res) => {
  try {
    const { serviceId } = req.params;

    const professionals = await Professional.find({
      isActive: true,
      isAvailable: true,
      services: serviceId
    })
      .populate('services', 'name category')
      .sort({ rating: -1, totalBookings: -1 });

    res.json({
      success: true,
      data: professionals
    });

  } catch (error) {
    console.error('Get professionals by service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch professionals'
    });
  }
};

// Get single professional (Public)
exports.getProfessionalById = async (req, res) => {
  try {
    const { id } = req.params;

    const professional = await Professional.findOne({ _id: id, isActive: true })
      .populate('services', 'name category price duration')
      .populate('createdBy', 'name email');

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
    console.error('Get professional error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch professional'
    });
  }
};

// Create new professional (Admin only)
exports.createProfessional = async (req, res) => {
  try {
    const {
      name,
      email,
      phoneNumber,
      role,
      specialization,
      services,
      experience,
      bio,
      availableSlots,
      certifications,
      profileImageUrl
    } = req.body;

    // Validation
    if (!name || !email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and phone number are required'
      });
    }

    // Check for duplicate email
    const existingProfessional = await Professional.findOne({ email });
    if (existingProfessional) {
      return res.status(400).json({
        success: false,
        message: 'Professional with this email already exists'
      });
    }

    const professionalData = {
      name,
      email,
      phoneNumber,
      createdBy: req.user._id
    };

    // Optional fields
    if (role) professionalData.role = role;
    if (specialization) {
      professionalData.specialization = Array.isArray(specialization) 
        ? specialization 
        : specialization.split(',').map(s => s.trim());
    }
    if (services) {
      professionalData.services = Array.isArray(services) 
        ? services 
        : JSON.parse(services);
    }
    if (experience) professionalData.experience = parseInt(experience);
    if (bio) professionalData.bio = bio;
    if (availableSlots) professionalData.availableSlots = JSON.parse(availableSlots);
    if (certifications) professionalData.certifications = JSON.parse(certifications);

    // Handle image upload or URL
    if (req.file) {
      professionalData.profileImage = req.file.location;
      professionalData.imageKey = req.file.key;
    } else if (profileImageUrl && profileImageUrl.trim()) {
      professionalData.profileImage = profileImageUrl.trim();
      professionalData.imageKey = null;
    }

    const professional = new Professional(professionalData);
    await professional.save();

    // Populate the professional data before sending response
    await professional.populate('services', 'name category');

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
      phoneNumber,
      role,
      specialization,
      services,
      experience,
      bio,
      isActive,
      isAvailable,
      availableSlots,
      certifications,
      profileImageUrl
    } = req.body;

    const professional = await Professional.findById(id);
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    // Check for duplicate email if email is being changed
    if (email && email !== professional.email) {
      const existingProfessional = await Professional.findOne({ email });
      if (existingProfessional) {
        return res.status(400).json({
          success: false,
          message: 'Professional with this email already exists'
        });
      }
    }

    // Update fields
    if (name) professional.name = name;
    if (email) professional.email = email;
    if (phoneNumber) professional.phoneNumber = phoneNumber;
    if (role) professional.role = role;
    if (specialization) {
      professional.specialization = Array.isArray(specialization) 
        ? specialization 
        : specialization.split(',').map(s => s.trim());
    }
    if (services) {
      professional.services = Array.isArray(services) 
        ? services 
        : JSON.parse(services);
    }
    if (experience !== undefined) professional.experience = parseInt(experience);
    if (bio !== undefined) professional.bio = bio;
    if (isActive !== undefined) professional.isActive = isActive === 'true' || isActive === true;
    if (isAvailable !== undefined) professional.isAvailable = isAvailable === 'true' || isAvailable === true;
    if (availableSlots) professional.availableSlots = JSON.parse(availableSlots);
    if (certifications) professional.certifications = JSON.parse(certifications);

    professional.updatedBy = req.user._id;

    // Handle image upload or URL
    if (req.file) {
      // Delete old image if it was stored in S3
      if (professional.imageKey) {
        try {
          await deleteFromS3(professional.imageKey);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      professional.profileImage = req.file.location;
      professional.imageKey = req.file.key;
    } else if (profileImageUrl !== undefined) {
      // Delete old image if it was stored in S3
      if (professional.imageKey) {
        try {
          await deleteFromS3(professional.imageKey);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      professional.profileImage = profileImageUrl ? profileImageUrl.trim() : null;
      professional.imageKey = null;
    }

    await professional.save();
    await professional.populate('services', 'name category');

    res.json({
      success: true,
      message: 'Professional updated successfully',
      data: professional
    });

  } catch (error) {
    console.error('Update professional error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update professional'
    });
  }
};

// Delete professional (Admin only)
exports.deleteProfessional = async (req, res) => {
  try {
    const { id } = req.params;

    const professional = await Professional.findById(id);
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    // Delete image from S3 if exists
    if (professional.imageKey) {
      try {
        await deleteFromS3(professional.imageKey);
      } catch (error) {
        console.error('Error deleting image from S3:', error);
      }
    }

    await Professional.findByIdAndDelete(id);

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

// Toggle professional status (Admin only)
exports.toggleProfessionalStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const professional = await Professional.findById(id);
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    professional.isActive = !professional.isActive;
    professional.updatedBy = req.user._id;
    await professional.save();

    res.json({
      success: true,
      message: `Professional ${professional.isActive ? 'activated' : 'deactivated'} successfully`,
      data: professional
    });

  } catch (error) {
    console.error('Toggle professional status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle professional status'
    });
  }
};

// Toggle professional availability (Admin only)
exports.toggleProfessionalAvailability = async (req, res) => {
  try {
    const { id } = req.params;

    const professional = await Professional.findById(id);
    if (!professional) {
      return res.status(404).json({
        success: false,
        message: 'Professional not found'
      });
    }

    professional.isAvailable = !professional.isAvailable;
    professional.updatedBy = req.user._id;
    await professional.save();

    res.json({
      success: true,
      message: `Professional marked as ${professional.isAvailable ? 'available' : 'unavailable'}`,
      data: professional
    });

  } catch (error) {
    console.error('Toggle professional availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle professional availability'
    });
  }
};

// Get specializations (Public)
exports.getSpecializations = async (req, res) => {
  try {
    const specializations = await Professional.distinct('specialization', { isActive: true });
    
    res.json({
      success: true,
      data: specializations.filter(s => s) // Remove null/empty values
    });

  } catch (error) {
    console.error('Get specializations error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch specializations'
    });
  }
};