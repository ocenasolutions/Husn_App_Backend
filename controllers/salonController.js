const Salon = require('../models/Salon');
const Service = require('../models/Service');

// Get all salons (Public)
exports.getAllSalons = async (req, res) => {
  try {
    const { 
      city, 
      featured, 
      search, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      limit = 20,
      page = 1
    } = req.query;

    const query = { isActive: true };

    // Filters
    if (city) {
      query['address.city'] = new RegExp(city, 'i');
    }
    
    if (featured === 'true') {
      query.featured = true;
    }

    if (search) {
      query.$text = { $search: search };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const salons = await Salon.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .skip(skip)
      .populate('services.serviceId', 'name category')
      .lean();

    const total = await Salon.countDocuments(query);

    res.json({
      success: true,
      data: salons,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get salons error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salons'
    });
  }
};

// Get salon by ID (Public)
exports.getSalonById = async (req, res) => {
  try {
    const { id } = req.params;

    const salon = await Salon.findById(id)
      .populate('services.serviceId')
      .populate('createdBy', 'name email');

    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    res.json({
      success: true,
      data: salon
    });
  } catch (error) {
    console.error('Get salon by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salon'
    });
  }
};

// Get salons near location (Public)
exports.getSalonsNearby = async (req, res) => {
  try {
    const { longitude, latitude, maxDistance = 5000 } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude and latitude are required'
      });
    }

    const salons = await Salon.find({
      isActive: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      }
    }).limit(20);

    res.json({
      success: true,
      data: salons
    });
  } catch (error) {
    console.error('Get nearby salons error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch nearby salons'
    });
  }
};

// Create salon (Admin only)
exports.createSalon = async (req, res) => {
  try {
    const {
      name,
      description,
      address,
      location,
      coverPhoto,
      photos,
      contactNumber,
      email,
      openingHours,
      services,
      amenities,
      offers
    } = req.body;

    // Validate required fields
    if (!name || !description || !address || !location || !coverPhoto || !contactNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Validate location coordinates
    if (!location.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Valid location coordinates [longitude, latitude] are required'
      });
    }

    const salon = new Salon({
      name,
      description,
      address,
      location,
      coverPhoto,
      photos: photos || [],
      contactNumber,
      email,
      openingHours,
      services: services || [],
      amenities: amenities || [],
      offers: offers || [],
      createdBy: req.user._id
    });

    await salon.save();

    res.status(201).json({
      success: true,
      message: 'Salon created successfully',
      data: salon
    });
  } catch (error) {
    console.error('Create salon error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create salon'
    });
  }
};

// Update salon (Admin only)
exports.updateSalon = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const salon = await Salon.findById(id);

    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      salon[key] = updateData[key];
    });

    await salon.save();

    res.json({
      success: true,
      message: 'Salon updated successfully',
      data: salon
    });
  } catch (error) {
    console.error('Update salon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update salon'
    });
  }
};

// Delete salon (Admin only)
exports.deleteSalon = async (req, res) => {
  try {
    const { id } = req.params;

    const salon = await Salon.findByIdAndDelete(id);

    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    res.json({
      success: true,
      message: 'Salon deleted successfully'
    });
  } catch (error) {
    console.error('Delete salon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete salon'
    });
  }
};

// Add service to salon (Admin only)
exports.addServiceToSalon = async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceId, price, duration, available } = req.body;

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Check if service already exists
    const existingService = salon.services.find(
      s => s.serviceId.toString() === serviceId
    );

    if (existingService) {
      return res.status(400).json({
        success: false,
        message: 'Service already added to this salon'
      });
    }

    salon.services.push({
      serviceId,
      serviceName: service.name,
      price: price || service.price,
      duration: duration || service.duration,
      available: available !== undefined ? available : true
    });

    await salon.save();

    res.json({
      success: true,
      message: 'Service added to salon successfully',
      data: salon
    });
  } catch (error) {
    console.error('Add service to salon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add service to salon'
    });
  }
};

// Remove service from salon (Admin only)
exports.removeServiceFromSalon = async (req, res) => {
  try {
    const { id, serviceId } = req.params;

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    salon.services = salon.services.filter(
      s => s.serviceId.toString() !== serviceId
    );

    await salon.save();

    res.json({
      success: true,
      message: 'Service removed from salon successfully',
      data: salon
    });
  } catch (error) {
    console.error('Remove service from salon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove service from salon'
    });
  }
};

// Toggle salon featured status (Admin only)
exports.toggleFeatured = async (req, res) => {
  try {
    const { id } = req.params;

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    salon.featured = !salon.featured;
    await salon.save();

    res.json({
      success: true,
      message: `Salon ${salon.featured ? 'featured' : 'unfeatured'} successfully`,
      data: salon
    });
  } catch (error) {
    console.error('Toggle featured error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update salon'
    });
  }
};

exports.addSlotOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, startTime, endTime, discount, title, description } = req.body;

    if (!date || !startTime || !endTime || !discount) {
      return res.status(400).json({
        success: false,
        message: 'Date, start time, end time, and discount are required'
      });
    }

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    // Validate discount
    if (discount < 0 || discount > 100) {
      return res.status(400).json({
        success: false,
        message: 'Discount must be between 0 and 100'
      });
    }

    salon.slotOffers.push({
      date: new Date(date),
      startTime,
      endTime,
      discount,
      title: title || `${discount}% OFF`,
      description: description || '',
      active: true
    });

    await salon.save();

    res.json({
      success: true,
      message: 'Slot offer added successfully',
      data: salon
    });
  } catch (error) {
    console.error('Add slot offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add slot offer'
    });
  }
};

// Toggle slot offer status (Admin only)
exports.toggleSlotOffer = async (req, res) => {
  try {
    const { id, offerId } = req.params;

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    const offer = salon.slotOffers.id(offerId);
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: 'Slot offer not found'
      });
    }

    offer.active = !offer.active;
    await salon.save();

    res.json({
      success: true,
      message: `Slot offer ${offer.active ? 'activated' : 'deactivated'} successfully`,
      data: salon
    });
  } catch (error) {
    console.error('Toggle slot offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle slot offer'
    });
  }
};

// Delete slot offer (Admin only)
exports.deleteSlotOffer = async (req, res) => {
  try {
    const { id, offerId } = req.params;

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    salon.slotOffers.pull(offerId);
    await salon.save();

    res.json({
      success: true,
      message: 'Slot offer deleted successfully',
      data: salon
    });
  } catch (error) {
    console.error('Delete slot offer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete slot offer'
    });
  }
};

// Disable time slot (Admin only)
exports.disableSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, startTime, endTime, reason } = req.body;

    if (!date || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: 'Date, start time, and end time are required'
      });
    }

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    salon.disabledSlots.push({
      date: new Date(date),
      startTime,
      endTime,
      reason: reason || 'Not available'
    });

    await salon.save();

    res.json({
      success: true,
      message: 'Time slot disabled successfully',
      data: salon
    });
  } catch (error) {
    console.error('Disable slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disable slot'
    });
  }
};

// Enable time slot (Admin only) - removes disabled slot
exports.enableSlot = async (req, res) => {
  try {
    const { id, slotId } = req.params;

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    salon.disabledSlots.pull(slotId);
    await salon.save();

    res.json({
      success: true,
      message: 'Time slot enabled successfully',
      data: salon
    });
  } catch (error) {
    console.error('Enable slot error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enable slot'
    });
  }
};

// Get available slots for a date
exports.getAvailableSlots = async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    const queryDate = new Date(date);
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][queryDate.getDay()];

    // Get opening hours for the day
    const dayHours = salon.openingHours[dayName];
    if (!dayHours || dayHours.closed) {
      return res.json({
        success: true,
        data: { slots: [], message: 'Salon is closed on this day' }
      });
    }

    // Generate time slots
    const slots = generateTimeSlots(
      dayHours.open,
      dayHours.close,
      salon.bookingSettings.slotDuration,
      salon.bookingSettings.bufferTime
    );

    // Filter out disabled slots
    const disabledSlots = salon.disabledSlots.filter(ds => {
      const dsDate = new Date(ds.date);
      return dsDate.toDateString() === queryDate.toDateString();
    });

    const availableSlots = slots.filter(slot => {
      return !disabledSlots.some(ds => 
        isTimeInRange(slot.time, ds.startTime, ds.endTime)
      );
    });

    // Add slot offers information
    const slotOffers = salon.slotOffers.filter(so => {
      const soDate = new Date(so.date);
      return so.active && soDate.toDateString() === queryDate.toDateString();
    });

    const slotsWithOffers = availableSlots.map(slot => {
      const offer = slotOffers.find(so => 
        isTimeInRange(slot.time, so.startTime, so.endTime)
      );
      
      return {
        ...slot,
        hasOffer: !!offer,
        offer: offer ? {
          discount: offer.discount,
          title: offer.title,
          description: offer.description
        } : null
      };
    });

    res.json({
      success: true,
      data: {
        date: queryDate,
        dayName,
        slots: slotsWithOffers,
        openingHours: dayHours
      }
    });
  } catch (error) {
    console.error('Get available slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available slots'
    });
  }
};

// Add service menu photos (Admin only)
exports.addServiceMenuPhotos = async (req, res) => {
  try {
    const { id } = req.params;
    const { photos } = req.body; // Array of { url, description }

    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Photos array is required'
      });
    }

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    salon.serviceMenuPhotos.push(...photos);
    await salon.save();

    res.json({
      success: true,
      message: 'Service menu photos added successfully',
      data: salon
    });
  } catch (error) {
    console.error('Add service menu photos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add service menu photos'
    });
  }
};

// Remove service menu photo (Admin only)
exports.removeServiceMenuPhoto = async (req, res) => {
  try {
    const { id, photoId } = req.params;

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    salon.serviceMenuPhotos.pull(photoId);
    await salon.save();

    res.json({
      success: true,
      message: 'Service menu photo removed successfully',
      data: salon
    });
  } catch (error) {
    console.error('Remove service menu photo error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove service menu photo'
    });
  }
};

// Helper functions
function generateTimeSlots(openTime, closeTime, slotDuration, bufferTime) {
  const slots = [];
  const [openHour, openMin] = openTime.split(':').map(Number);
  const [closeHour, closeMin] = closeTime.split(':').map(Number);
  
  let currentMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;
  
  while (currentMinutes + slotDuration <= closeMinutes) {
    const hour = Math.floor(currentMinutes / 60);
    const minute = currentMinutes % 60;
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    
    slots.push({
      time: timeStr,
      available: true
    });
    
    currentMinutes += slotDuration + bufferTime;
  }
  
  return slots;
}

function isTimeInRange(time, startTime, endTime) {
  const [tHour, tMin] = time.split(':').map(Number);
  const [sHour, sMin] = startTime.split(':').map(Number);
  const [eHour, eMin] = endTime.split(':').map(Number);
  
  const timeMinutes = tHour * 60 + tMin;
  const startMinutes = sHour * 60 + sMin;
  const endMinutes = eHour * 60 + eMin;
  
  return timeMinutes >= startMinutes && timeMinutes < endMinutes;
}

module.exports = exports;