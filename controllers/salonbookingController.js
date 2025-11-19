const Booking = require('../models/SalonBooking');
const Salon = require('../models/Salon');
const User = require('../models/User');

// Create a new booking (User)
exports.createBooking = async (req, res) => {
  try {
    const {
      salonId,
      bookingDate,
      timeSlot,
      numberOfGuests,
      specialRequests,
    } = req.body;

    // Validate required fields
    if (!salonId || !bookingDate || !timeSlot || !numberOfGuests) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields',
      });
    }

    // CRITICAL: Verify the user exists and get their data
    console.log('Creating booking for user ID:', req.user._id);
    const currentUser = await User.findById(req.user._id);
    
    if (!currentUser) {
      console.error('User not found in database:', req.user._id);
      return res.status(404).json({
        success: false,
        message: 'User not found. Please log in again.',
      });
    }

    console.log('User found:', {
      id: currentUser._id,
      name: currentUser.name,
      email: currentUser.email,
      phone: currentUser.phone
    });

    // Check if salon exists
    const salon = await Salon.findById(salonId);
    if (!salon) {
      return res.status(404).json({
        success: false,
        message: 'Salon not found',
      });
    }

    // Check for slot offers
    const bookingDateObj = new Date(bookingDate);
    const slotOffer = salon.slotOffers.find(offer => {
      const offerDate = new Date(offer.date);
      return (
        offer.active &&
        offerDate.toDateString() === bookingDateObj.toDateString() &&
        isTimeInSlotRange(timeSlot, offer.startTime, offer.endTime)
      );
    });

    let discount = 0;
    let discountPercentage = 0;
    if (slotOffer) {
      discountPercentage = slotOffer.discount;
      discount = discountPercentage;
    }

    // Create booking with verified user ID
    const booking = new Booking({
      user: currentUser._id, // Use the verified user's ID
      salon: salonId,
      bookingDate: new Date(bookingDate),
      timeSlot,
      numberOfGuests,
      discount: discountPercentage,
      specialRequests: specialRequests || '',
      status: 'pending',
    });

    await booking.save();
    console.log('Booking saved with user ID:', booking.user);

    // Manually fetch and attach user data
    const userData = await User.findById(booking.user).select('name email phone avatar role').lean();
    const salonData = await Salon.findById(salonId).select('name coverPhoto address contactNumber email').lean();

    console.log('Retrieved user data for response:', userData);

    const bookingResponse = booking.toObject();
    bookingResponse.user = userData || {
      name: currentUser.name,
      email: currentUser.email,
      phone: currentUser.phone
    };
    bookingResponse.salon = salonData;

    res.status(201).json({
      success: true,
      message: 'Booking created successfully',
      data: bookingResponse,
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create booking',
    });
  }
};

// Get user's bookings (User)
exports.getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    // Manually populate user and salon data
    const populatedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const user = await User.findById(booking.user).select('name email phone avatar role').lean();
        const salon = await Salon.findById(booking.salon).select('name coverPhoto address contactNumber email').lean();
        
        return {
          ...booking,
          user,
          salon
        };
      })
    );

    res.json({
      success: true,
      data: populatedBookings,
    });
  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
    });
  }
};

// Get booking by ID (User - own booking or Admin)
exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id).lean();

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Manually populate
    const user = await User.findById(booking.user).select('name email phone avatar role').lean();
    const salon = await Salon.findById(booking.salon).select('name coverPhoto address contactNumber email').lean();

    // Check if user owns the booking or is admin
    if (
      booking.user.toString() !== req.user._id.toString() &&
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const populatedBooking = {
      ...booking,
      user,
      salon
    };

    res.json({
      success: true,
      data: populatedBooking,
    });
  } catch (error) {
    console.error('Get booking by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking',
    });
  }
};

// Get all bookings (Admin only)
exports.getAllBookings = async (req, res) => {
  try {
    const {
      status,
      salonId,
      search,
      limit = 100,
      page = 1,
    } = req.query;

    let query = {};

    // Filters
    if (status) {
      query.status = status;
    }

    if (salonId) {
      query.salon = salonId;
    }

    // Search by user name or salon name
    if (search) {
      const users = await User.find({
        $or: [
          { name: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
          { phone: new RegExp(search, 'i') },
        ],
      }).select('_id');

      const salons = await Salon.find({
        name: new RegExp(search, 'i'),
      }).select('_id');

      query.$or = [
        { user: { $in: users.map(u => u._id) } },
        { salon: { $in: salons.map(s => s._id) } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    console.log(`Found ${bookings.length} bookings`);

    // Manually populate user and salon data for each booking
    const populatedBookings = await Promise.all(
      bookings.map(async (booking) => {
        console.log('Processing booking:', booking._id, 'User ID:', booking.user);
        
        // Try to find the user
        let user = await User.findById(booking.user)
          .select('name email phone avatar role')
          .lean();
        
        if (!user) {
          console.warn(`User not found for booking ${booking._id}, user ID: ${booking.user}`);
          // Create a placeholder with the ID for debugging
          user = { 
            _id: booking.user,
            name: `User ${booking.user.toString().slice(-4)}`, 
            email: 'User account deleted or not found', 
            phone: 'N/A' 
          };
        } else {
          console.log('User found:', user.name, user.email, user.phone);
        }
        
        const salon = await Salon.findById(booking.salon)
          .select('name coverPhoto address contactNumber email')
          .lean();
        
        return {
          ...booking,
          user,
          salon: salon || { name: 'Unknown Salon' }
        };
      })
    );

    const total = await Booking.countDocuments(query);

    // Log sample for debugging
    if (populatedBookings.length > 0) {
      console.log('Sample booking with user data:', JSON.stringify({
        bookingId: populatedBookings[0]._id,
        userName: populatedBookings[0].user?.name,
        userEmail: populatedBookings[0].user?.email,
        userPhone: populatedBookings[0].user?.phone
      }, null, 2));
    }

    res.json({
      success: true,
      data: populatedBookings,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get all bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bookings',
      error: error.message
    });
  }
};

// Get salon bookings (Admin only)
exports.getSalonBookings = async (req, res) => {
  try {
    const { salonId } = req.params;
    const { status, date } = req.query;

    const query = { salon: salonId };

    if (status) {
      query.status = status;
    }

    if (date) {
      const dateObj = new Date(date);
      const nextDay = new Date(dateObj);
      nextDay.setDate(nextDay.getDate() + 1);

      query.bookingDate = {
        $gte: dateObj,
        $lt: nextDay,
      };
    }

    const bookings = await Booking.find(query)
      .sort({ bookingDate: 1, timeSlot: 1 })
      .lean();

    // Manually populate
    const populatedBookings = await Promise.all(
      bookings.map(async (booking) => {
        const user = await User.findById(booking.user).select('name email phone avatar role').lean();
        return {
          ...booking,
          user: user || { name: 'Unknown User', email: 'N/A', phone: 'N/A' }
        };
      })
    );

    res.json({
      success: true,
      data: populatedBookings,
    });
  } catch (error) {
    console.error('Get salon bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salon bookings',
    });
  }
};

// Update booking status (Admin only)
exports.updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status',
      });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    booking.status = status;
    await booking.save();

    // Manually populate
    const user = await User.findById(booking.user).select('name email phone avatar role').lean();
    const salon = await Salon.findById(booking.salon).select('name coverPhoto address contactNumber email').lean();

    const bookingResponse = booking.toObject();
    bookingResponse.user = user;
    bookingResponse.salon = salon;

    res.json({
      success: true,
      message: 'Booking status updated successfully',
      data: bookingResponse,
    });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update booking status',
    });
  }
};

// Cancel booking (User - own booking only)
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Check if user owns the booking
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Check if booking can be cancelled
    if (booking.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel completed booking',
      });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Booking is already cancelled',
      });
    }

    // Check if booking is in the past
    const bookingDateTime = new Date(booking.bookingDate);
    if (bookingDateTime < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel past booking',
      });
    }

    booking.status = 'cancelled';
    await booking.save();

    const salon = await Salon.findById(booking.salon).select('name coverPhoto address contactNumber email').lean();

    const bookingResponse = booking.toObject();
    bookingResponse.salon = salon;

    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      data: bookingResponse,
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking',
    });
  }
};

// Reschedule booking (User - own booking only)
exports.rescheduleBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { bookingDate, timeSlot } = req.body;

    if (!bookingDate || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: 'Please provide new date and time slot',
      });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found',
      });
    }

    // Check if user owns the booking
    if (booking.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Check if booking can be rescheduled
    if (booking.status === 'completed' || booking.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reschedule completed or cancelled booking',
      });
    }

    booking.bookingDate = new Date(bookingDate);
    booking.timeSlot = timeSlot;
    booking.status = 'pending'; // Reset to pending for admin confirmation
    await booking.save();

    const salon = await Salon.findById(booking.salon).select('name coverPhoto address contactNumber email').lean();

    const bookingResponse = booking.toObject();
    bookingResponse.salon = salon;

    res.json({
      success: true,
      message: 'Booking rescheduled successfully',
      data: bookingResponse,
    });
  } catch (error) {
    console.error('Reschedule booking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reschedule booking',
    });
  }
};

// Get booking statistics (Admin only)
exports.getBookingStatistics = async (req, res) => {
  try {
    const { salonId, startDate, endDate } = req.query;

    const query = {};

    if (salonId) {
      query.salon = salonId;
    }

    if (startDate && endDate) {
      query.bookingDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const totalBookings = await Booking.countDocuments(query);
    const pendingBookings = await Booking.countDocuments({ ...query, status: 'pending' });
    const confirmedBookings = await Booking.countDocuments({ ...query, status: 'confirmed' });
    const completedBookings = await Booking.countDocuments({ ...query, status: 'completed' });
    const cancelledBookings = await Booking.countDocuments({ ...query, status: 'cancelled' });

    res.json({
      success: true,
      data: {
        totalBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        cancelledBookings,
      },
    });
  } catch (error) {
    console.error('Get booking statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking statistics',
    });
  }
};

// Helper function to check if time is in slot range
function isTimeInSlotRange(time, startTime, endTime) {
  const [tHour, tMin] = time.split(':').map(Number);
  const [sHour, sMin] = startTime.split(':').map(Number);
  const [eHour, eMin] = endTime.split(':').map(Number);

  const timeMinutes = tHour * 60 + tMin;
  const startMinutes = sHour * 60 + sMin;
  const endMinutes = eHour * 60 + eMin;

  return timeMinutes >= startMinutes && timeMinutes < endMinutes;
}

// DEBUG ENDPOINT - Remove in production
exports.debugBookings = async (req, res) => {
  try {
    const totalBookings = await Booking.countDocuments();
    const bookings = await Booking.find()
      .limit(5)
      .lean();
    
    // Check each booking's user ID
    const bookingDetails = await Promise.all(
      bookings.map(async (booking) => {
        console.log('Checking booking user ID:', booking.user);
        
        // Try to find user
        const user = await User.findById(booking.user).lean();
        console.log('Found user:', user);
        
        const salon = await Salon.findById(booking.salon).select('name').lean();
        
        return {
          bookingId: booking._id,
          userIdInBooking: booking.user,
          userExists: !!user,
          userData: user || 'USER NOT FOUND',
          salonData: salon,
          bookingStatus: booking.status
        };
      })
    );
    
    // Get all users to see what's available
    const allUsers = await User.find().select('_id name email phone').lean();
    
    // Also fetch a sample user to see the actual field names
    const sampleUser = await User.findOne().lean();
    
    res.json({
      success: true,
      totalBookings,
      totalUsers: allUsers.length,
      allUserIds: allUsers.map(u => u._id.toString()),
      bookingDetails,
      sampleUserFields: sampleUser ? Object.keys(sampleUser) : [],
      sampleUserData: sampleUser,
      message: 'Enhanced debug info'
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      stack: error.stack
    });
  }
};

module.exports = exports;