// server/controllers/professionalLocationController.js
const ProfessionalLocation = require('../models/ProfessionalLocation');
const Order = require('../models/Order');

// Update professional's current location
exports.updateLocation = async (req, res) => {
  try {
    const { orderId, latitude, longitude } = req.body;
    const professionalId = req.user._id;

    if (!orderId || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Order ID, latitude, and longitude are required'
      });
    }

    // Verify order exists and professional is assigned
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if professional is assigned to any service in this order
    const isAssigned = order.serviceItems.some(
      item => item.professionalId && item.professionalId.toString() === professionalId.toString()
    );

    if (!isAssigned && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not assigned to this order'
      });
    }

    // Update or create location tracking
    let location = await ProfessionalLocation.findOne({ orderId, professionalId });
    
    if (location) {
      location.currentLocation = {
        type: 'Point',
        coordinates: [longitude, latitude]
      };
      location.locationHistory.push({
        coordinates: [longitude, latitude],
        timestamp: new Date()
      });
      location.lastUpdated = new Date();
      location.isActive = true;
    } else {
      location = new ProfessionalLocation({
        orderId,
        professionalId,
        customerId: order.user,
        customerAddress: {
          type: 'Point',
          coordinates: [
            order.address.longitude || 0,
            order.address.latitude || 0
          ],
          fullAddress: `${order.address.street}, ${order.address.city}, ${order.address.state} ${order.address.zipCode}`
        },
        currentLocation: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        startLocation: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        locationHistory: [{
          coordinates: [longitude, latitude],
          timestamp: new Date()
        }],
        isActive: true
      });
    }

    await location.save();

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: location
    });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get professional's current location for an order (Customer/Admin view)
exports.getLocationForOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).populate('user', 'name phone');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check permissions
    const isCustomer = order.user._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const location = await ProfessionalLocation.findOne({ 
      orderId, 
      isActive: true 
    }).populate('professionalId', 'name phone');

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'No active tracking found for this order'
      });
    }

    res.json({
      success: true,
      data: {
        professional: {
          id: location.professionalId._id,
          name: location.professionalId.name,
          phone: location.professionalId.phone
        },
        currentLocation: {
          latitude: location.currentLocation.coordinates[1],
          longitude: location.currentLocation.coordinates[0]
        },
        customerAddress: {
          latitude: location.customerAddress.coordinates[1],
          longitude: location.customerAddress.coordinates[0],
          fullAddress: location.customerAddress.fullAddress
        },
        startLocation: {
          latitude: location.startLocation.coordinates[1],
          longitude: location.startLocation.coordinates[0]
        },
        estimatedDistance: location.estimatedDistance,
        estimatedTime: location.estimatedTime,
        lastUpdated: location.lastUpdated,
        status: location.status
      }
    });
  } catch (error) {
    console.error('Get location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get location',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Start tracking (Professional starts journey)
exports.startTracking = async (req, res) => {
  try {
    const { orderId, latitude, longitude } = req.body;
    const professionalId = req.user._id;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const location = new ProfessionalLocation({
      orderId,
      professionalId,
      customerId: order.user,
      customerAddress: {
        type: 'Point',
        coordinates: [
          order.address.longitude || 0,
          order.address.latitude || 0
        ],
        fullAddress: `${order.address.street}, ${order.address.city}, ${order.address.state} ${order.address.zipCode}`
      },
      currentLocation: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      startLocation: {
        type: 'Point',
        coordinates: [longitude, latitude]
      },
      locationHistory: [{
        coordinates: [longitude, latitude],
        timestamp: new Date()
      }],
      status: 'on_the_way',
      isActive: true
    });

    await location.save();

    res.json({
      success: true,
      message: 'Tracking started successfully',
      data: location
    });
  } catch (error) {
    console.error('Start tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start tracking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Stop tracking (Professional reached/cancelled)
exports.stopTracking = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body; // 'reached' or 'cancelled'
    const professionalId = req.user._id;

    const location = await ProfessionalLocation.findOne({ 
      orderId, 
      professionalId,
      isActive: true 
    });

    if (!location) {
      return res.status(404).json({
        success: false,
        message: 'No active tracking found'
      });
    }

    location.status = status || 'reached';
    location.isActive = false;
    location.endTime = new Date();

    await location.save();

    res.json({
      success: true,
      message: 'Tracking stopped successfully',
      data: location
    });
  } catch (error) {
    console.error('Stop tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop tracking',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Admin: Get all active trackings
exports.getAllActiveTrackings = async (req, res) => {
  try {
    const trackings = await ProfessionalLocation.find({ isActive: true })
      .populate('professionalId', 'name phone')
      .populate('customerId', 'name phone')
      .populate('orderId', 'orderNumber status')
      .sort({ lastUpdated: -1 });

    res.json({
      success: true,
      data: trackings
    });
  } catch (error) {
    console.error('Get all trackings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get trackings',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};