// server/controllers/bookingController.js - Enhanced with OTP and notifications
const Booking = require('../models/Booking');
const Service = require('../models/Service');
const Notification = require('../models/Notification');

// Create a new service booking
exports.createBooking = async (req, res) => {
  try {
    const { 
      services, 
      customerInfo, 
      professionalId,
      professionalName,
      serviceType = 'At Home',
      paymentMethod = 'cod',
      totalAmount 
    } = req.body;

    if (!services || services.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one service is required'
      });
    }

    if (!customerInfo || !customerInfo.name || !customerInfo.phone) {
      return res.status(400).json({
        success: false,
        message: 'Customer name and phone are required'
      });
    }

    if (!totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Total amount is required'
      });
    }

    const processedServices = [];
    let calculatedTotal = 0;

    for (const serviceItem of services) {
      const service = await Service.findById(serviceItem.serviceId);
      if (!service || !service.isActive) {
        return res.status(404).json({
          success: false,
          message: `Service not found or inactive: ${serviceItem.serviceId}`
        });
      }

      if (!serviceItem.selectedDate || !serviceItem.selectedTime) {
        return res.status(400).json({
          success: false,
          message: 'Selected date and time are required for each service'
        });
      }

      processedServices.push({
        service: serviceItem.serviceId,
        quantity: serviceItem.quantity || 1,
        price: serviceItem.price || service.price,
        selectedDate: new Date(serviceItem.selectedDate),
        selectedTime: serviceItem.selectedTime,
        notes: serviceItem.notes || ''
      });

      calculatedTotal += (serviceItem.price || service.price) * (serviceItem.quantity || 1);
    }

    const bookingNumber = await Booking.generateBookingNumber();

    const booking = new Booking({
      bookingNumber,
      user: req.user._id,
      services: processedServices,
      customerInfo: {
        name: customerInfo.name,
        phone: customerInfo.phone,
        email: customerInfo.email || req.user.email,
        address: customerInfo.address || ''
      },
      professionalId,
      professionalName,
      serviceType,
      paymentMethod,
      totalAmount: calculatedTotal,
      status: 'pending'
    });

    await booking.save();
    await booking.populate('services.service');
    await booking.populate('user', 'name email phone');

    // Create admin notification for new booking
    try {
      await Notification.createBookingNotification(booking);
      console.log('✅ Booking notification created for admin');
    } catch (notifError) {
      console.error('⚠️ Failed to create booking notification:', notifError);
    }

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    });

  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user's bookings
exports.getUserBookings = async (req, res) => {
  try {
    console.log('🔍 Fetching bookings for user:', req.user._id);
    
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    
    if (status && status !== 'all') {
      filter.status = status;
      console.log('📌 Filtering by status:', status);
    }

    console.log('🔎 Query filter:', JSON.stringify(filter));

    const bookings = await Booking.find(filter)
      .populate('services.service')
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

    console.log('✅ Found bookings:', bookings.length, 'Total:', total);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('❌ Get user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all bookings (Admin only)
exports.getAllBookings = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { bookingNumber: { $regex: search, $options: 'i' } },
        { 'customerInfo.name': { $regex: search, $options: 'i' } },
        { 'customerInfo.phone': { $regex: search, $options: 'i' } }
      ];
    }

    const bookings = await Booking.find(filter)
      .populate('services.service')
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);

    const statusCounts = await Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const counts = statusCounts.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: bookings,
      counts,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings'
    });
  }
};

// Get single booking by ID
exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id)
      .populate('services.service')
      .populate('user', 'name email phone');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (req.user.role !== 'admin' && booking.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: booking
    });

  } catch (error) {
    console.error('Get booking by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking details'
    });
  }
};

// Update booking status (Admin only) - WITH OTP GENERATION
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rejectionReason, adminNotes } = req.body;

    const validStatuses = ['pending', 'confirmed', 'rejected', 'in_progress', 'completed', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const booking = await Booking.findById(id).populate('user', 'name email phone');
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    const now = new Date();
    let otpGenerated = false;
    
    switch (status) {
      case 'confirmed':
        booking.confirmedAt = now;
        // Generate OTP when booking is confirmed
        const otp = booking.generateOTP();
        otpGenerated = true;
        
        console.log('🔐 OTP Generated for booking:', booking.bookingNumber, 'OTP:', otp);
        
        // Create notification for user with OTP
        try {
          await Notification.create({
            user: booking.user._id,
            type: 'booking_confirmed',
            title: 'Booking Confirmed!',
            message: `Your booking #${booking.bookingNumber} has been confirmed. Your service OTP is: ${otp}. Please share this with the service provider when they arrive.`,
            data: {
              bookingId: booking._id,
              bookingNumber: booking.bookingNumber,
              otp: otp,
              status: 'confirmed'
            }
          });
          console.log('✅ OTP notification sent to user');
        } catch (notifError) {
          console.error('⚠️ Failed to send OTP notification:', notifError);
        }
        break;
        
      case 'rejected':
        booking.rejectedAt = now;
        if (rejectionReason) {
          booking.rejectionReason = rejectionReason;
        }
        break;
        
      case 'in_progress':
        booking.serviceStartedAt = now;
        break;
        
      case 'completed':
        booking.completedAt = now;
        booking.paymentStatus = 'completed';
        booking.canReview = true;
        break;
        
      case 'cancelled':
        booking.cancelledAt = now;
        break;
    }

    booking.status = status;
    if (adminNotes) {
      booking.adminNotes = adminNotes;
    }

    await booking.save();
    await booking.populate('services.service');

    const response = {
      success: true,
      message: otpGenerated 
        ? 'Booking confirmed successfully. OTP has been sent to the customer.' 
        : 'Booking status updated successfully',
      data: booking
    };

    if (otpGenerated) {
      response.otp = booking.serviceOtp;
      response.otpMessage = 'OTP has been generated and sent to customer';
    }

    res.json(response);

  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status'
    });
  }
};

// Set service time (Admin only)
exports.setServiceTime = async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceStartTime } = req.body;

    if (!serviceStartTime) {
      return res.status(400).json({
        success: false,
        message: 'Service start time is required'
      });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    booking.serviceStartTime = serviceStartTime;
    await booking.save();

    res.json({
      success: true,
      message: 'Service time set successfully',
      data: booking
    });

  } catch (error) {
    console.error('Set service time error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set service time'
    });
  }
};

// Start service with OTP verification (Admin only)
exports.startService = async (req, res) => {
  try {
    const { id } = req.params;
    const { otp } = req.body;

    if (!otp || otp.length !== 6) {
      return res.status(400).json({
        success: false,
        message: 'Valid 6-digit OTP is required'
      });
    }

    const booking = await Booking.findById(id).populate('user', 'name email phone');
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.status !== 'confirmed') {
      return res.status(400).json({
        success: false,
        message: 'Booking must be confirmed before starting service'
      });
    }

    // Verify OTP using the model method
    const verification = booking.verifyOTP(otp);
    
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message
      });
    }

    // Update booking status to in_progress
    booking.status = 'in_progress';
    booking.serviceStartedAt = new Date();
    booking.otpVerifiedAt = new Date();
    await booking.save();

    await booking.populate('services.service');

    // Create notification for user
    try {
      await Notification.create({
        user: booking.user._id,
        type: 'service_started',
        title: 'Service Started',
        message: `Your service for booking #${booking.bookingNumber} has been started.`,
        data: {
          bookingId: booking._id,
          bookingNumber: booking.bookingNumber,
          status: 'in_progress'
        }
      });
      console.log('✅ Service started notification sent to user');
    } catch (notifError) {
      console.error('⚠️ Failed to send service started notification:', notifError);
    }

    res.json({
      success: true,
      message: 'Service started successfully',
      data: booking
    });

  } catch (error) {
    console.error('Start service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start service'
    });
  }
};

// Cancel booking (User)
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findOne({ 
      _id: id, 
      user: req.user._id 
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (!booking.canBeCancelled()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel this booking'
      });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    await booking.save();

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: booking
    });

  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking'
    });
  }
};

// Submit review
exports.submitReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    const booking = await Booking.findOne({ 
      _id: id, 
      user: req.user._id 
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (!booking.canReview) {
      return res.status(400).json({
        success: false,
        message: 'This booking cannot be reviewed yet'
      });
    }

    if (booking.review) {
      return res.status(400).json({
        success: false,
        message: 'Booking already reviewed'
      });
    }

    booking.review = {
      rating,
      comment: comment || '',
      createdAt: new Date()
    };

    await booking.save();

    res.json({
      success: true,
      message: 'Review submitted successfully',
      data: booking
    });

  } catch (error) {
    console.error('Submit review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review'
    });
  }
};

// Get booking stats (Admin)
exports.getBookingStats = async (req, res) => {
  try {
    const stats = await Booking.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' }
        }
      }
    ]);

    const totalBookings = await Booking.countDocuments();
    const totalRevenue = await Booking.aggregate([
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);

    const todayBookings = await Booking.countDocuments({
      createdAt: {
        $gte: new Date().setHours(0, 0, 0, 0),
        $lt: new Date().setHours(23, 59, 59, 999)
      }
    });

    res.json({
      success: true,
      data: {
        totalBookings,
        totalRevenue: totalRevenue[0]?.total || 0,
        todayBookings,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat._id] = {
            count: stat.count,
            revenue: stat.totalRevenue
          };
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('Get booking stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking statistics'
    });
  }
};