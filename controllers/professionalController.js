// server/controllers/professionalController.js
const Professional = require('../models/Professional');

// Get all professionals (with optional category filter)
exports.getAllProfessionals = async (req, res) => {
  try {
    const { category, active = 'true' } = req.query;
    
    const query = {};
    
    if (active === 'true') {
      query.isActive = true;
    }
    
    if (category) {
      query.specializations = category;
    }

    const professionals = await Professional.find(query)
      .sort({ rating: -1, totalBookings: -1 });

    res.json({
      success: true,
      data: professionals
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
    
    // Get all services to find their categories
    const serviceIdArray = serviceIds.split(',');
    const services = await Service.find({ 
      _id: { $in: serviceIdArray } 
    }).select('category');

    // Extract unique categories
    const categories = [...new Set(services.map(s => s.category))];

    // Find professionals matching these categories
    const professionals = await Professional.find({
      specializations: { $in: categories },
      isActive: true
    }).sort({ rating: -1, totalBookings: -1 });

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

// Create professional (Admin only)
exports.createProfessional = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      role,
      specializations,
      experience,
      bio
    } = req.body;

    if (!name || !email || !phone || !specializations) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone, and specializations are required'
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
        : specializations.split(',').map(s => s.trim()),
      experience: experience || 0,
      bio: bio || ''
    });

    await professional.save();

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
      isActive
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

    await professional.save();

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