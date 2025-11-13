const User = require('../models/User');
const Ride = require('../models/Ride');

// Helper function to extract user ID from req.user
function getUserId(user) {
  if (!user) return null;
  if (user._id) return user._id.toString();
  if (user.userId) return user.userId;
  if (user.id) return user.id;
  return null;
}

function isAuthorizedDriver(email) {
  const authorizedDriverEmails = [
    'aditya2.ocena@gmail.com',
    'testing.ocena@gmail.com',
    'testingaditya5@gmail.com',
  ];
  return authorizedDriverEmails.includes(email.toLowerCase());
}

exports.getAvailableRidesForDriver = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is an authorized driver
    if (!isAuthorizedDriver(user.email)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only authorized drivers can view available rides.'
      });
    }

    console.log('🚗 Driver fetching rides:', {
      email: user.email,
      isOnline: user.isOnline,
      userId: userId
    });

    // Check if driver already has an active ride
    const activeRide = await Ride.findOne({
      driver: userId,
      status: { $in: ['accepted', 'arrived', 'started'] }
    });

    if (activeRide) {
      console.log('⚠️ Driver has active ride:', activeRide._id);
      return res.json({
        success: true,
        data: [],
        activeRide: {
          _id: activeRide._id,
          status: activeRide.status
        },
        message: 'You already have an active ride'
      });
    }

    // Find rides that are in 'requested' status
    const rides = await Ride.find({
      status: 'requested'
    })
    .populate('user', 'name phone')
    .sort({ createdAt: -1 })
    .limit(20);

    console.log(`📋 Found ${rides.length} rides with status 'requested'`);
    
    if (rides.length > 0) {
      console.log('First ride:', {
        id: rides[0]._id,
        user: rides[0].user?.name,
        address: rides[0].pickupLocation?.address
      });
    }

    // Return rides even if offline, but include warning
    res.json({
      success: true,
      data: rides,
      count: rides.length,
      driverOnline: user.isOnline,
      message: !user.isOnline ? 'Turn online to accept rides' : undefined
    });

  } catch (error) {
    console.error('❌ Get available rides error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available rides',
      error: error.message
    });
  }
};

// Get driver status (No role check - any user can be a "driver")
exports.getDriverStatus = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const driver = await User.findById(userId);
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if this user is an authorized driver
    const isDriver = isAuthorizedDriver(driver.email);

    // Find active ride if any
    const activeRide = await Ride.findOne({
      driver: userId,
      status: { $in: ['accepted', 'arrived', 'started'] }
    })
    .populate('user', 'name phone')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        isOnline: driver.isOnline || false,
        isAuthorizedDriver: isDriver,
        activeRide: activeRide || null
      }
    });
  } catch (error) {
    console.error('Get driver status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get status',
      error: error.message
    });
  }
};

// Update driver online status (No role check)
exports.updateDriverStatus = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    const { isOnline } = req.body;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    if (typeof isOnline !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isOnline must be a boolean value'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is authorized driver
    if (!isAuthorizedDriver(user.email)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only authorized drivers can update online status.'
      });
    }

    // Update status for authorized driver
    const driver = await User.findByIdAndUpdate(
      userId,
      { isOnline },
      { new: true }
    );

    console.log(`Driver ${user.email} is now ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('driver-status-updated', {
        driverId: userId,
        isOnline
      });
      
      // If driver just came online, send them available rides
      if (isOnline) {
        const availableRides = await Ride.find({
          status: 'requested'
        })
        .populate('user', 'name phone')
        .sort({ createdAt: -1 })
        .limit(20);
        
        console.log(`Sending ${availableRides.length} available rides to newly online driver`);
      }
    }

    res.json({
      success: true,
      message: `You are now ${isOnline ? 'online' : 'offline'}`,
      data: {
        isOnline: driver.isOnline
      }
    });
  } catch (error) {
    console.error('Update driver status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
};

// Get driver profile
exports.getDriverProfile = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const driver = await User.findById(userId).select('-password');
    
    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: driver
    });
  } catch (error) {
    console.error('Get driver profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
};

// Update driver profile
exports.updateDriverProfile = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    const { vehicleNumber, vehicleType, vehicleModel, vehicleColor } = req.body;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const updateData = {};
    if (vehicleNumber) updateData.vehicleNumber = vehicleNumber;
    if (vehicleType) updateData.vehicleType = vehicleType;
    if (vehicleModel) updateData.vehicleModel = vehicleModel;
    if (vehicleColor) updateData.vehicleColor = vehicleColor;

    const driver = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: driver
    });
  } catch (error) {
    console.error('Update driver profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

// Get driver earnings
exports.getDriverEarnings = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const completedRides = await Ride.find({
      driver: userId,
      status: 'completed'
    });

    const totalEarnings = completedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
    const totalRides = completedRides.length;
    const averageFare = totalRides > 0 ? totalEarnings / totalRides : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayRides = completedRides.filter(ride => 
      new Date(ride.completedAt) >= today
    );
    const todayEarnings = todayRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    
    const weekRides = completedRides.filter(ride => 
      new Date(ride.completedAt) >= weekStart
    );
    const weekEarnings = weekRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthRides = completedRides.filter(ride => 
      new Date(ride.completedAt) >= monthStart
    );
    const monthEarnings = monthRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);

    res.json({
      success: true,
      data: {
        totalEarnings,
        totalRides,
        averageFare: Math.round(averageFare),
        today: {
          earnings: todayEarnings,
          rides: todayRides.length
        },
        week: {
          earnings: weekEarnings,
          rides: weekRides.length
        },
        month: {
          earnings: monthEarnings,
          rides: monthRides.length
        }
      }
    });
  } catch (error) {
    console.error('Get driver earnings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get earnings',
      error: error.message
    });
  }
};

// Get driver ride history
exports.getDriverRideHistory = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    const { page = 1, limit = 20, status } = req.query;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const query = { driver: userId };
    
    if (status) {
      query.status = status;
    }

    const rides = await Ride.find(query)
      .populate('user', 'name phone')
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
    console.error('Get driver ride history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get history',
      error: error.message
    });
  }
};

// Get driver statistics
exports.getDriverStatistics = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found'
      });
    }

    const allRides = await Ride.find({ driver: userId });
    
    const statusCounts = {
      total: allRides.length,
      completed: allRides.filter(r => r.status === 'completed').length,
      cancelled: allRides.filter(r => r.status === 'cancelled').length,
      active: allRides.filter(r => ['accepted', 'arrived', 'started'].includes(r.status)).length
    };

    const ratedRides = allRides.filter(r => r.rating);
    const averageRating = ratedRides.length > 0
      ? ratedRides.reduce((sum, r) => sum + r.rating, 0) / ratedRides.length
      : 0;

    const totalDistance = allRides.reduce((sum, r) => sum + (r.distance || 0), 0);

    const totalEarnings = allRides
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + (r.fare || 0), 0);

    res.json({
      success: true,
      data: {
        statusCounts,
        averageRating: averageRating.toFixed(1),
        totalRatings: ratedRides.length,
        totalDistance: totalDistance.toFixed(1),
        totalEarnings,
        completionRate: statusCounts.total > 0 
          ? ((statusCounts.completed / statusCounts.total) * 100).toFixed(1)
          : 0
      }
    });
  } catch (error) {
    console.error('Get driver statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: error.message
    });
  }
};

// Update driver location (real-time tracking)
exports.updateDriverLocation = async (req, res) => {
  try {
    const userId = getUserId(req.user);
    const { latitude, longitude } = req.body;
    
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

    await User.findByIdAndUpdate(userId, {
      lastLocation: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      lastLocationUpdate: new Date()
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('driver-location-updated', {
        driverId: userId,
        latitude,
        longitude,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Location updated successfully'
    });
  } catch (error) {
    console.error('Update driver location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: error.message
    });
  }
};