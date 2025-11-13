const Ride = require('../models/Ride');
const User = require('../models/User');

// Helper function to extract user ID from req.user
function getUserId(user) {
  if (!user) return null;
  if (user._id) return user._id.toString();
  if (user.userId) return user.userId;
  if (user.id) return user.id;
  return null;
}

// Create a new location tracking request
exports.createRide = async (req, res) => {
  try {
    const { userLocation } = req.body;
    
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }
    
    // Validate required fields
    if (!userLocation || !userLocation.coordinates) {
      return res.status(400).json({
        success: false,
        message: 'User location is required'
      });
    }

    // Create ride with user's current location as both pickup and dropoff
    const ride = new Ride({
      user: userId,
      pickupLocation: userLocation,
      dropoffLocation: userLocation, // Same as pickup for this use case
      currentLocation: userLocation,
      rideType: 'economy',
      paymentMethod: 'cash',
      distance: 0,
      fare: 0,
      duration: 0,
      status: 'requested'
    });

    await ride.save();
    
    // Emit socket event to notify ALL online drivers
    const io = req.app.get('io');
    if (io) {
      io.emit('new-ride-request', {
        _id: ride._id,
        user: {
          name: req.user.name || 'User',
          _id: userId
        },
        pickupLocation: ride.pickupLocation,
        createdAt: ride.createdAt,
        fare: 0,
        distance: 0,
        rideType: 'economy'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Location tracking requested successfully',
      data: ride
    });
  } catch (error) {
    console.error('Create ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create request',
      error: error.message
    });
  }
};

// Get available rides for drivers (NO ROLE CHECK)
exports.getAvailableRides = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }
    
    // Get user info
    const driver = await User.findById(userId);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if driver is online
    if (!driver.isOnline) {
      return res.json({
        success: true,
        data: [],
        message: 'Driver is offline'
      });
    }
    
    // Find rides that are in 'requested' status (not yet accepted)
    const rides = await Ride.find({
      status: 'requested'
    })
    .populate('user', 'name phone')
    .sort({ createdAt: -1 })
    .limit(20);

    res.json({
      success: true,
      data: rides
    });
  } catch (error) {
    console.error('Get available rides error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available rides',
      error: error.message
    });
  }
};

// Accept ride (NO ROLE CHECK - any user can accept)
exports.acceptRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }
    
    // Get fresh driver data from database
    const driver = await User.findById(userId);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('🚗 Accept ride attempt:', {
      driverId: userId,
      driverEmail: driver.email,
      isOnline: driver.isOnline,
      rideId: rideId
    });

    // Check if driver is online - USE FRESH DATA FROM DB
    if (!driver.isOnline) {
      console.log('❌ Driver is not online in database');
      return res.status(400).json({
        success: false,
        message: 'You must be online to accept requests'
      });
    }

    // Check if driver already has an active ride
    const activeRide = await Ride.findOne({
      driver: userId,
      status: { $in: ['accepted', 'arrived', 'started'] }
    });

    if (activeRide) {
      console.log('❌ Driver already has active ride:', activeRide._id);
      return res.status(400).json({
        success: false,
        message: 'You already have an active request'
      });
    }
    
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }
    
    if (ride.status !== 'requested') {
      console.log('❌ Ride status is not requested:', ride.status);
      return res.status(400).json({
        success: false,
        message: 'Request is not available'
      });
    }

    // Accept the ride
    ride.driver = userId;
    ride.status = 'accepted';
    ride.acceptedAt = new Date();
    await ride.save();

    console.log('✅ Ride accepted successfully');

    // Populate details
    await ride.populate('driver', 'name phone vehicleNumber vehicleType vehicleModel vehicleColor');
    await ride.populate('user', 'name phone');

    const io = req.app.get('io');
    if (io) {
      // Notify the user that their request was accepted
      io.to(`user-${ride.user._id}`).emit('ride-accepted', {
        rideId: ride._id,
        driver: {
          id: ride.driver._id,
          name: ride.driver.name,
          phone: ride.driver.phone,
          vehicleNumber: ride.driver.vehicleNumber,
          vehicleType: ride.driver.vehicleType
        },
        status: ride.status
      });

      // Notify all drivers that this ride is no longer available
      io.emit('ride-taken', {
        rideId: ride._id
      });
      
      console.log('📡 Socket events emitted for ride acceptance');
    }

    res.json({
      success: true,
      message: 'Request accepted successfully',
      data: ride
    });
  } catch (error) {
    console.error('❌ Accept ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept request',
      error: error.message
    });
  }
};

// Update ride status
exports.updateRideStatus = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { status } = req.body;
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const validStatuses = ['requested', 'accepted', 'arrived', 'started', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }
    
    const ride = await Ride.findById(rideId)
      .populate('user', 'name phone')
      .populate('driver', 'name phone vehicleNumber vehicleType');
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Verify user has permission
    const isDriver = ride.driver && ride.driver._id.toString() === userId;
    const isUser = ride.user._id.toString() === userId;

    if (!isDriver && !isUser) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this request'
      });
    }

    ride.status = status;
    
    if (status === 'arrived') {
      ride.arrivedAt = new Date();
    } else if (status === 'started') {
      ride.startedAt = new Date();
    } else if (status === 'completed') {
      ride.completedAt = new Date();
    }
    
    await ride.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`ride-${rideId}`).emit('ride-status-updated', {
        rideId: ride._id,
        status: ride.status,
        timestamp: new Date()
      });

      if (ride.user) {
        io.to(`user-${ride.user._id}`).emit('ride-status-updated', {
          rideId: ride._id,
          status: ride.status
        });
      }

      if (ride.driver) {
        io.to(`driver-${ride.driver._id}`).emit('ride-status-updated', {
          rideId: ride._id,
          status: ride.status
        });
      }
    }

    res.json({
      success: true,
      message: 'Status updated',
      data: ride
    });
  } catch (error) {
    console.error('Update ride status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
};

// Update driver location
exports.updateDriverLocation = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { latitude, longitude } = req.body;
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Verify the driver owns this ride
    if (!ride.driver || ride.driver.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update location for your own requests'
      });
    }

    ride.currentLocation = {
      type: 'Point',
      coordinates: [longitude, latitude]
    };
    
    await ride.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`ride-${rideId}`).emit('driver-location-updated', {
        latitude,
        longitude,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Location updated',
      data: {
        latitude,
        longitude
      }
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
};

// Get ride details
exports.getRideDetails = async (req, res) => {
  try {
    const { rideId } = req.params;
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }
    
    const ride = await Ride.findById(rideId)
      .populate('user', 'name phone')
      .populate('driver', 'name phone vehicleNumber vehicleType vehicleModel vehicleColor');
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Verify user has permission to view
    const isUser = ride.user && ride.user._id.toString() === userId;
    const isDriver = ride.driver && ride.driver._id.toString() === userId;

    if (!isUser && !isDriver) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this request'
      });
    }

    res.json({
      success: true,
      data: ride
    });
  } catch (error) {
    console.error('Get ride details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get request details',
      error: error.message
    });
  }
};

// Get user's active ride
exports.getActiveRide = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }
    
    const ride = await Ride.findOne({
      user: userId,
      status: { $in: ['requested', 'accepted', 'arrived', 'started'] }
    })
    .populate('driver', 'name phone vehicleNumber vehicleType vehicleModel vehicleColor')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: ride
    });
  } catch (error) {
    console.error('Get active ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active request',
      error: error.message
    });
  }
};

// Get user's ride history
exports.getUserRideHistory = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    const { page = 1, limit = 20, status } = req.query;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const query = { user: userId };
    
    if (status) {
      query.status = status;
    }

    const rides = await Ride.find(query)
      .populate('driver', 'name phone vehicleNumber vehicleType')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Ride.countDocuments(query);

    res.json({
      success: true,
      data: rides,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalRides: count
    });
  } catch (error) {
    console.error('Get user ride history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get history',
      error: error.message
    });
  }
};

// Rate ride
exports.rateRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { rating, feedback } = req.body;
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }
    
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    if (ride.user.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only rate your own requests'
      });
    }

    if (ride.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'You can only rate completed requests'
      });
    }

    if (ride.rating) {
      return res.status(400).json({
        success: false,
        message: 'You have already rated this request'
      });
    }

    ride.rating = rating;
    ride.feedback = feedback || '';
    await ride.save();

    res.json({
      success: true,
      message: 'Rating submitted successfully',
      data: ride
    });
  } catch (error) {
    console.error('Rate ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate request',
      error: error.message
    });
  }
};

// Cancel ride
exports.cancelRide = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { reason } = req.body;
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }
    
    const ride = await Ride.findById(rideId)
      .populate('user', 'name phone')
      .populate('driver', 'name phone');
    
    if (!ride) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    const isUser = ride.user._id.toString() === userId;
    const isDriver = ride.driver && ride.driver._id.toString() === userId;

    console.log('🚫 Cancel ride attempt:', {
      rideId: rideId,
      userId: userId,
      isUser: isUser,
      isDriver: isDriver,
      currentStatus: ride.status
    });

    if (!isUser && !isDriver) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to cancel this request'
      });
    }

    if (['completed', 'cancelled'].includes(ride.status)) {
      return res.status(400).json({
        success: false,
        message: 'This request cannot be cancelled'
      });
    }

    ride.status = 'cancelled';
    ride.cancelledBy = userId;
    ride.cancellationReason = reason || 'No reason provided';
    ride.cancelledAt = new Date();
    
    await ride.save();

    console.log('✅ Ride cancelled successfully');

    const io = req.app.get('io');
    if (io) {
      const cancelData = {
        rideId: ride._id,
        cancelledBy: isUser ? 'user' : 'driver',
        reason: ride.cancellationReason
      };

      // Notify both user and driver
      io.to(`ride-${rideId}`).emit('ride-cancelled', cancelData);

      if (ride.user) {
        io.to(`user-${ride.user._id}`).emit('ride-cancelled', cancelData);
      }

      if (ride.driver) {
        io.to(`driver-${ride.driver._id}`).emit('ride-cancelled', cancelData);
      }

      // Broadcast to all drivers if user cancelled (ride is available again)
      if (isUser && ride.status === 'requested') {
        io.emit('ride-cancelled-by-user', cancelData);
      }
      
      console.log('📡 Cancellation events emitted');
    }

    res.json({
      success: true,
      message: 'Request cancelled successfully',
      data: ride
    });
  } catch (error) {
    console.error('❌ Cancel ride error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel request',
      error: error.message
    });
  }
};