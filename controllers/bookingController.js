
// server/controllers/bookingController.js
const Booking = require('../models/Booking');
const CartItem = require('../models/CartItem');
const Service = require('../models/Service');
const Notification = require('../models/Notification');

// Create booking from cart
exports.createBooking = async (req, res) => {
  try {
    const { customerInfo, paymentMethod } = req.body;

    if (!customerInfo || !customerInfo.name || !customerInfo.phone) {
      return res.status(400).json({
        success: false,
        message: 'Customer name and phone are required'
      });
    }

    // Get cart items
    const cartItems = await CartItem.find({ user: req.user._id }).populate('service');
    
    if (cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Calculate total amount
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create booking
    const booking = new Booking({
      user: req.user._id,
      services: cartItems.map(item => ({
        service: item.service._id,
        quantity: item.quantity,
        price: item.price,
        selectedDate: item.selectedDate,
        selectedTime: item.selectedTime,
        notes: item.notes
      })),
      totalAmount,
      paymentMethod: paymentMethod || 'card',
      customerInfo
    });

    await booking.save();
    
    // Clear cart after booking
    await CartItem.deleteMany({ user: req.user._id });

    // Populate booking with service details
    await booking.populate('services.service user');

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: booking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create booking'
    });
  }
};

// Get user's bookings
exports.getUserBookings = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = { user: req.user._id };
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate('services.service')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBookings: total,
        hasNext: page * limit < total
      }
    });
  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings'
    });
  }
};

// Get single booking
exports.getBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findOne({ 
      _id: id, 
      user: req.user._id 
    }).populate('services.service processedBy', 'name email');

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    res.json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking'
    });
  }
};

// Cancel booking (user)
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findOne({ 
      _id: id, 
      user: req.user._id,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found or cannot be cancelled'
      });
    }

    booking.status = 'cancelled';
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

// Admin: Get all bookings
exports.getAllBookings = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate } = req.query;

    const query = {};
    if (status) query.status = status;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const bookings = await Booking.find(query)
      .populate('user', 'name email phone')
      .populate('services.service')
      .populate('processedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(query);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBookings: total,
        hasNext: page * limit < total
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

// Admin: Update booking status
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, rejectionReason } = req.body;

    if (!['pending', 'confirmed', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const booking = await Booking.findById(id).populate('user services.service');
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    booking.status = status;
    booking.processedBy = req.user._id;
    booking.processedAt = new Date();
    
    if (adminNotes) booking.adminNotes = adminNotes;
    if (status === 'rejected' && rejectionReason) {
      booking.rejectionReason = rejectionReason;
    }

    await booking.save();

    // Create notification for user
    const notificationTypes = {
      confirmed: 'booking_confirmed',
      rejected: 'booking_rejected',
      completed: 'booking_completed'
    };

    const messages = {
      confirmed: 'Your booking has been confirmed! We look forward to serving you.',
      rejected: `Your booking has been rejected. ${rejectionReason || 'Please contact us for more details.'}`,
      completed: 'Your service has been completed. Thank you for choosing us!'
    };

    if (notificationTypes[status]) {
      const notification = new Notification({
        user: booking.user._id,
        title: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: messages[status],
        type: notificationTypes[status],
        relatedBooking: booking._id
      });
      await notification.save();
    }

    res.json({
      success: true,
      message: `Booking ${status} successfully`,
      data: booking
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status'
    });
  }
};
