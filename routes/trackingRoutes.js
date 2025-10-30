// server/routes/trackingRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const Order = require('../models/Order');
const Professional = require('../models/Professional');

// Get tracking info for an order
router.get('/order/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate('user', 'name phone')
      .populate('serviceItems.serviceId', 'name');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if user owns this order or is admin
    if (order.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Get assigned professional info
    let professionalInfo = null;
    if (order.serviceItems && order.serviceItems.length > 0) {
      const serviceItem = order.serviceItems[0];
      if (serviceItem.professionalId) {
        const professional = await Professional.findById(serviceItem.professionalId);
        if (professional) {
          professionalInfo = {
            id: professional._id,
            name: professional.name,
            phone: professional.phone,
            profilePicture: professional.profilePicture,
            rating: professional.rating
          };
        }
      }
    }

    res.json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        serviceStartedAt: order.serviceStartedAt,
        estimatedServiceTime: order.estimatedServiceTime,
        address: order.address,
        professional: professionalInfo,
        serviceOtp: order.serviceOtp,
        canTrack: order.status === 'confirmed' || order.status === 'out_for_delivery'
      }
    });

  } catch (error) {
    console.error('Get tracking info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tracking information'
    });
  }
});

// Professional updates their location (REST endpoint as backup)
router.post('/location', authMiddleware, async (req, res) => {
  try {
    const { orderId, latitude, longitude, heading, speed } = req.body;

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

    res.json({
      success: true,
      message: 'Location updated',
      data: {
        orderId,
        latitude,
        longitude,
        timestamp: new Date()
      }
    });

  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location'
    });
  }
});

module.exports = router;