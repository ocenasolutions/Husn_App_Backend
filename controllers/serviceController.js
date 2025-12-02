// server/controllers/serviceController.js
const Service = require('../models/Service');
const { deleteFromS3 } = require('../config/s3Config');

// Get all services (Public - no auth required)
exports.getAllServices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      featured,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      hasOffer // New filter for services with offers
    } = req.query;

    const query = { isActive: true };

    // Add filters
    if (category) {
      query.category = category;
    }
    
    if (featured !== undefined) {
      query.featured = featured === 'true';
    }

    // Filter for services with offers
    if (hasOffer !== undefined) {
      if (hasOffer === 'true') {
        query.$and = [
          { offerActive: true },
          { offerEndDate: { $gt: new Date() } }
        ];
      }
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    const services = await Service.find(query)
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Service.countDocuments(query);

    res.json({
      success: true,
      data: services,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalServices: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services'
    });
  }
};
exports.getOfferedServices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      search,
      sortBy = 'offerDiscount',
      sortOrder = 'desc'
    } = req.query;

    const query = {
      isActive: true,
      offerActive: true,
      offerEndDate: { $gt: new Date() }
    };

    // Add filters
    if (category) {
      query.category = category;
    }

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    const services = await Service.find(query)
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Service.countDocuments(query);

    res.json({
      success: true,
      data: services,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalServices: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get offered services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch offered services'
    });
  }
};

// Get single service (Public)
exports.getServiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findOne({ _id: id, isActive: true })
      .populate('createdBy', 'name email');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    res.json({
      success: true,
      data: service
    });

  } catch (error) {
    console.error('Get service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service'
    });
  }
};

// Create new service (Admin only)
exports.createService = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      originalPrice,
      discount,
      category,
      duration,
      tags,
      featured,
      availableSlots,
      imageUrl,
      targetGender  // ✅ ADD THIS to destructure from req.body
    } = req.body;

    // Validation
    if (!name || !description || !price || !category || !duration) {
      return res.status(400).json({
        success: false,
        message: 'Name, description, price, category, and duration are required'
      });
    }

    const serviceData = {
      name,
      description,
      price: parseFloat(price),
      category,
      duration: parseInt(duration),
      createdBy: req.user._id,
      targetGender: targetGender || 'all'  // ✅ FIXED - now uses the destructured value
    };

    // Optional fields
    if (originalPrice) serviceData.originalPrice = parseFloat(originalPrice);
    if (discount) serviceData.discount = parseFloat(discount);
    if (tags) serviceData.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
    if (featured !== undefined) serviceData.featured = featured === 'true' || featured === true;
    if (availableSlots) serviceData.availableSlots = JSON.parse(availableSlots);

    // Handle image upload or URL
    if (req.file) {
      // Image uploaded via S3
      serviceData.image_url = req.file.location;
      serviceData.imageKey = req.file.key;
    } else if (imageUrl && imageUrl.trim()) {
      // Image URL provided
      serviceData.image_url = imageUrl.trim();
      serviceData.imageKey = null; // No S3 key for URL
    }

    const service = new Service(serviceData);
    await service.save();

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: service
    });

  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create service'
    });
  }
};

// 2. updateService function - ADD targetGender handling


// Apply offer to service (Admin only)
exports.applyOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      offerTitle,
      offerDescription,
      offerDiscount,
      offerStartDate,
      offerEndDate
    } = req.body;

    // Validation
    if (!offerTitle || !offerDiscount || !offerEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Offer title, discount, and end date are required'
      });
    }

    if (offerDiscount < 1 || offerDiscount > 90) {
      return res.status(400).json({
        success: false,
        message: 'Offer discount must be between 1% and 90%'
      });
    }

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    const startDate = offerStartDate ? new Date(offerStartDate) : new Date();
    const endDate = new Date(offerEndDate);

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    // Calculate offer price
    const offerPrice = Math.round(service.price * (1 - offerDiscount / 100));

    // Update service with offer details
    service.offerActive = true;
    service.offerTitle = offerTitle;
    service.offerDescription = offerDescription || '';
    service.offerDiscount = offerDiscount;
    service.offerPrice = offerPrice;
    service.offerStartDate = startDate;
    service.offerEndDate = endDate;
    service.updatedBy = req.user._id;

    await service.save();

    res.json({
      success: true,
      message: 'Offer applied successfully',
      data: service
    });

  } catch (error) {
    console.error('Apply offer error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to apply offer'
    });
  }
};

// Remove offer from service (Admin only)
exports.removeOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Remove offer details
    service.offerActive = false;
    service.offerTitle = null;
    service.offerDescription = null;
    service.offerDiscount = 0;
    service.offerPrice = null;
    service.offerStartDate = null;
    service.offerEndDate = null;
    service.updatedBy = req.user._id;

    await service.save();

    res.json({
      success: true,
      message: 'Offer removed successfully',
      data: service
    });

  } catch (error) {
    console.error('Remove offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove offer'
    });
  }
};

// Update service (Admin only)
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      originalPrice,
      discount,
      category,
      duration,
      tags,
      featured,
      availableSlots,
      isActive,
      imageUrl,
      targetGender  // ✅ ADD THIS
    } = req.body;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Update fields
    if (name) service.name = name;
    if (description) service.description = description;
    if (price) {
      service.price = parseFloat(price);
      // Recalculate offer price if offer is active
      if (service.offerActive && service.offerDiscount > 0) {
        service.offerPrice = Math.round(service.price * (1 - service.offerDiscount / 100));
      }
    }
    if (originalPrice !== undefined) service.originalPrice = originalPrice ? parseFloat(originalPrice) : null;
    if (discount !== undefined) service.discount = parseFloat(discount || 0);
    if (category) service.category = category;
    if (duration) service.duration = parseInt(duration);
    if (tags) service.tags = Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim());
    if (featured !== undefined) service.featured = featured === 'true' || featured === true;
    if (isActive !== undefined) service.isActive = isActive === 'true' || isActive === true;
    if (availableSlots) service.availableSlots = JSON.parse(availableSlots);
    if (targetGender) service.targetGender = targetGender;  // ✅ ADD THIS LINE

    service.updatedBy = req.user._id;

    // Handle image upload or URL
    if (req.file) {
      // New image uploaded via S3
      // Delete old image if it was stored in S3
      if (service.imageKey) {
        try {
          await deleteFromS3(service.imageKey);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      service.image_url = req.file.location;
      service.imageKey = req.file.key;
    } else if (imageUrl !== undefined) {
      // Image URL provided or cleared
      // Delete old image if it was stored in S3
      if (service.imageKey) {
        try {
          await deleteFromS3(service.imageKey);
        } catch (error) {
          console.error('Error deleting old image:', error);
        }
      }
      
      service.image_url = imageUrl ? imageUrl.trim() : null;
      service.imageKey = null; // No S3 key for URL
    }

    await service.save();

    res.json({
      success: true,
      message: 'Service updated successfully',
      data: service
    });

  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update service'
    });
  }
};

// Delete service (Admin only)
exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Delete image from S3 if exists (only if it's stored in S3)
    if (service.imageKey) {
      try {
        await deleteFromS3(service.imageKey);
      } catch (error) {
        console.error('Error deleting image from S3:', error);
      }
    }

    await Service.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Service deleted successfully'
    });

  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service'
    });
  }
};

// Get service categories (Public)
exports.getCategories = async (req, res) => {
  try {
    const categories = await Service.distinct('category', { isActive: true });
    
    res.json({
      success: true,
      data: categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};

// Toggle service status (Admin only)
exports.toggleServiceStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    service.isActive = !service.isActive;
    service.updatedBy = req.user._id;
    await service.save();

    res.json({
      success: true,
      message: `Service ${service.isActive ? 'activated' : 'deactivated'} successfully`,
      data: service
    });

  } catch (error) {
    console.error('Toggle service status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle service status'
    });
  }
};

// Add this NEW endpoint in serviceController.js
exports.getAllServicesForAdmin = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 1000,
      category,
      featured,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {}; // NO isActive filter for admin

    if (category) {
      query.category = category;
    }
    
    if (featured !== undefined) {
      query.featured = featured === 'true';
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (page - 1) * limit;

    const services = await Service.find(query)
      .populate('createdBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Service.countDocuments(query);

    res.json({
      success: true,
      data: services,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalServices: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get admin services error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services'
    });
  }
};