const Salon = require('../models/Salon');
const Service = require('../models/Service');
const emailService = require('../services/emailService');
const messagingService = require('../services/messagingService');
const { uploadToS3 } = require('../config/s3');
const multer = require('multer');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const uploadMiddleware = {
  coverPhoto: upload.single('coverPhoto'),
  galleryPhotos: upload.array('galleryPhotos', 10),
  serviceMenuPhotos: upload.array('serviceMenuPhotos', 10),
  mixed: upload.fields([
    { name: 'coverPhoto', maxCount: 1 },
    { name: 'galleryPhotos', maxCount: 10 },
    { name: 'serviceMenuPhotos', maxCount: 10 }
  ])
};

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

// Upload images to S3
const uploadImagesToS3 = async (files, folder) => {
  if (!files || files.length === 0) return [];
  
  const uploadPromises = files.map(file => 
    uploadToS3(file.buffer, file.originalname, file.mimetype, folder)
  );
  
  const results = await Promise.all(uploadPromises);
  return results.map(result => result.url);
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
      offers,
      serviceMenuPhotos,
      ownerName
    } = req.body;

    // Validate required fields
    if (!name || !description || !address || !location || !contactNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Validate email if provided
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Email is required for sending contract information'
      });
    }

    // Validate location coordinates
    if (!location.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Valid location coordinates [longitude, latitude] are required'
      });
    }

    // Handle cover photo (URL or uploaded file)
    let finalCoverPhoto = coverPhoto;
    if (req.files && req.files.coverPhoto && req.files.coverPhoto[0]) {
      const uploadResult = await uploadToS3(
        req.files.coverPhoto[0].buffer,
        req.files.coverPhoto[0].originalname,
        req.files.coverPhoto[0].mimetype,
        'salons/cover'
      );
      finalCoverPhoto = uploadResult.url;
    }

    if (!finalCoverPhoto) {
      return res.status(400).json({
        success: false,
        message: 'Cover photo is required (URL or file upload)'
      });
    }

    // Handle gallery photos (URLs or uploaded files)
    let finalPhotos = [];
    if (photos && Array.isArray(photos)) {
      finalPhotos = [...photos];
    }
    if (req.files && req.files.galleryPhotos) {
      const uploadedGalleryUrls = await uploadImagesToS3(
        req.files.galleryPhotos,
        'salons/gallery'
      );
      finalPhotos = [...finalPhotos, ...uploadedGalleryUrls];
    }

    // Handle service menu photos (URLs or uploaded files)
    let finalServiceMenuPhotos = [];
    if (serviceMenuPhotos && Array.isArray(serviceMenuPhotos)) {
      finalServiceMenuPhotos = serviceMenuPhotos.map(item => 
        typeof item === 'string' ? item : item
      );
    }
    if (req.files && req.files.serviceMenuPhotos) {
      const uploadedMenuUrls = await uploadImagesToS3(
        req.files.serviceMenuPhotos,
        'salons/menu'
      );
      finalServiceMenuPhotos = [...finalServiceMenuPhotos, ...uploadedMenuUrls];
    }

    const salon = new Salon({
      name,
      description,
      address,
      location,
      coverPhoto: finalCoverPhoto,
      photos: finalPhotos,
      serviceMenuPhotos: finalServiceMenuPhotos,
      contactNumber,
      email,
      openingHours,
      services: services || [],
      amenities: amenities || [],
      offers: offers || [],
      createdBy: req.user._id
    });

    await salon.save();

    // Prepare notification details
    const finalOwnerName = ownerName || name;
    const notificationResults = {
      email: { sent: false, error: null },
      sms: { sent: false, error: null },
      whatsapp: { sent: false, error: null }
    };

    // Send notifications
    try {
      const emailResult = await emailService.sendContractEmail(
        email,
        name,
        finalOwnerName
      );
      if (emailResult.success) {
        console.log('✅ Contract email sent successfully to:', email);
        notificationResults.email.sent = true;
      } else {
        console.error('❌ Failed to send contract email:', emailResult.error);
        notificationResults.email.error = emailResult.error;
      }
    } catch (emailError) {
      console.error('❌ Error sending contract email:', emailError);
      notificationResults.email.error = emailError.message;
    }

    if (contactNumber && contactNumber.trim()) {
      try {
        const smsResult = await messagingService.sendContractSMS(
          contactNumber,
          name,
          finalOwnerName
        );
        if (smsResult.success) {
          notificationResults.sms.sent = true;
        }
      } catch (smsError) {
        notificationResults.sms.error = smsError.message;
      }

      try {
        const whatsappResult = await messagingService.sendContractWhatsApp(
          contactNumber,
          name,
          finalOwnerName
        );
        if (whatsappResult.success) {
          notificationResults.whatsapp.sent = true;
        }
      } catch (whatsappError) {
        notificationResults.whatsapp.error = whatsappError.message;
      }
    }

    const sentChannels = [];
    if (notificationResults.email.sent) sentChannels.push('Email');
    if (notificationResults.sms.sent) sentChannels.push('SMS');
    if (notificationResults.whatsapp.sent) sentChannels.push('WhatsApp');

    const responseMessage = sentChannels.length > 0
      ? `Salon created successfully. Contract notifications sent via: ${sentChannels.join(', ')}`
      : 'Salon created successfully. Note: Contract notifications could not be sent.';

    res.status(201).json({
      success: true,
      message: responseMessage,
      data: salon,
      notifications: notificationResults
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

    // Handle cover photo update
    if (req.files && req.files.coverPhoto && req.files.coverPhoto[0]) {
      const uploadResult = await uploadToS3(
        req.files.coverPhoto[0].buffer,
        req.files.coverPhoto[0].originalname,
        req.files.coverPhoto[0].mimetype,
        'salons/cover'
      );
      updateData.coverPhoto = uploadResult.url;
    }

    // Handle gallery photos update
    if (req.files && req.files.galleryPhotos) {
      const uploadedGalleryUrls = await uploadImagesToS3(
        req.files.galleryPhotos,
        'salons/gallery'
      );
      
      // Append to existing photos if updateData.photos exists, otherwise replace
      if (updateData.appendGalleryPhotos === 'true') {
        updateData.photos = [...salon.photos, ...uploadedGalleryUrls];
      } else {
        updateData.photos = uploadedGalleryUrls;
      }
    }

    // Handle service menu photos update
    if (req.files && req.files.serviceMenuPhotos) {
      const uploadedMenuUrls = await uploadImagesToS3(
        req.files.serviceMenuPhotos,
        'salons/menu'
      );
      
      if (updateData.appendServiceMenuPhotos === 'true') {
        updateData.serviceMenuPhotos = [
          ...salon.serviceMenuPhotos,
          ...uploadedMenuUrls
        ];
      } else {
        updateData.serviceMenuPhotos = uploadedMenuUrls;
      }
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      if (key !== 'appendGalleryPhotos' && key !== 'appendServiceMenuPhotos') {
        salon[key] = updateData[key];
      }
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


// Add this function with your other exports
exports.uploadTempImages = async (req, res) => {
  try {
    const result = {};

    // Handle cover photo
    if (req.files && req.files.coverPhoto && req.files.coverPhoto[0]) {
      const uploadResult = await uploadToS3(
        req.files.coverPhoto[0].buffer,
        req.files.coverPhoto[0].originalname,
        req.files.coverPhoto[0].mimetype,
        'salons/cover'
      );
      result.coverPhoto = uploadResult.url;
    }

    // Handle gallery photos
    if (req.files && req.files.galleryPhotos) {
      const uploadedGalleryUrls = await uploadImagesToS3(
        req.files.galleryPhotos,
        'salons/gallery'
      );
      result.photos = uploadedGalleryUrls;
    }

    // Handle service menu photos
    if (req.files && req.files.serviceMenuPhotos) {
      const uploadedMenuUrls = await uploadImagesToS3(
        req.files.serviceMenuPhotos,
        'salons/menu'
      );
      result.serviceMenuPhotos = uploadedMenuUrls;
    }

    res.json({
      success: true,
      message: 'Images uploaded successfully',
      ...result
    });
  } catch (error) {
    console.error('Upload temp images error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload images'
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

// Add service menu photos (Admin only)
exports.addServiceMenuPhotos = async (req, res) => {
  try {
    const { id } = req.params;
    const { photos } = req.body;

    const salon = await Salon.findById(id);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found'
      });
    }

    let newPhotos = [];

    // Handle URL-based photos from body
    if (photos && Array.isArray(photos)) {
      newPhotos = photos.map(item => 
        typeof item === 'string' ? { url: item, description: '' } : item
      );
    }

    // Handle uploaded files
    if (req.files && req.files.length > 0) {
      const uploadedUrls = await uploadImagesToS3(req.files, 'salons/menu');
      const uploadedPhotos = uploadedUrls.map(url => ({
        url,
        description: ''
      }));
      newPhotos = [...newPhotos, ...uploadedPhotos];
    }

    if (newPhotos.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No photos provided (URL or file upload required)'
      });
    }

    salon.serviceMenuPhotos.push(...newPhotos);
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

// Slot management functions
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

    const dayHours = salon.openingHours[dayName];
    if (!dayHours || dayHours.closed) {
      return res.json({
        success: true,
        data: { slots: [], message: 'Salon is closed on this day' }
      });
    }

    const slots = generateTimeSlots(
      dayHours.open,
      dayHours.close,
      salon.bookingSettings.slotDuration,
      salon.bookingSettings.bufferTime
    );

    const disabledSlots = salon.disabledSlots.filter(ds => {
      const dsDate = new Date(ds.date);
      return dsDate.toDateString() === queryDate.toDateString();
    });

    const availableSlots = slots.filter(slot => {
      return !disabledSlots.some(ds => 
        isTimeInRange(slot.time, ds.startTime, ds.endTime)
      );
    });

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
module.exports.uploadMiddleware = uploadMiddleware;