// server/controllers/borzoController.js - FIXED USER PHONE NUMBER
const BorzoDelivery = require('../models/BorzoDelivery');
const Order = require('../models/Order');
const borzoService = require('../services/borzoService');
const { getIO } = require('../config/socketConfig');

exports.calculateDeliveryPrice = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).populate('user');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check if it's a product order
    if (order.type !== 'product' && order.type !== 'mixed') {
      return res.status(400).json({
        success: false,
        message: 'Only product orders can use Borzo delivery',
      });
    }

    const pickupLat = process.env.STORE_LATITUDE || '30.9010';
    const pickupLng = process.env.STORE_LONGITUDE || '75.8573';

    // Get drop location from order
    const dropLat = order.address.latitude;
    const dropLng = order.address.longitude;

    if (!dropLat || !dropLng) {
      return res.status(400).json({
        success: false,
        message: 'Order delivery address coordinates are required',
      });
    }

    // Calculate price via Borzo
    const priceResult = await borzoService.calculatePrice({
      pickupLat,
      pickupLng,
      dropLat,
      dropLng,
    });

    if (!priceResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to calculate delivery price',
        error: priceResult.message,
      });
    }

    // ✅ FIXED: Get user phone number correctly
    const userPhone = order.user.phoneNumber || order.user.phone || '';
    
    if (!userPhone) {
      return res.status(400).json({
        success: false,
        message: 'User phone number is required for delivery',
      });
    }

    // Create or update BorzoDelivery record
    let borzoDelivery = await BorzoDelivery.findOne({ order: orderId });

    if (!borzoDelivery) {
      borzoDelivery = new BorzoDelivery({
        order: orderId,
        pickupAddress: {
          address: process.env.STORE_ADDRESS || 'Store Address',
          latitude: parseFloat(pickupLat),
          longitude: parseFloat(pickupLng),
          contactName: process.env.STORE_CONTACT_NAME || 'Store Manager',
          contactPhone: process.env.STORE_CONTACT_PHONE || '+919876543210',
        },
        dropAddress: {
          address: `${order.address.street}, ${order.address.city}, ${order.address.state} ${order.address.zipCode}`,
          latitude: dropLat,
          longitude: dropLng,
          contactName: order.user.name,
          contactPhone: userPhone, // ✅ FIXED
        },
        itemDescription: `Order ${order.orderNumber} - ${order.productItems.length} items`,
        paymentMethod: order.paymentMethod,
        codAmount: order.paymentMethod === 'cod' ? order.totalAmount : 0,
        status: 'price_calculated',
      });
    }

    // Update pricing
    borzoDelivery.pricing = {
      estimatedPrice: priceResult.data.totalPrice,
      distance: priceResult.data.distance,
      currency: priceResult.data.currency,
    };

    await borzoDelivery.save();

    console.log('✅ Delivery price calculated:', priceResult.data.totalPrice);

    res.json({
      success: true,
      message: 'Delivery price calculated successfully',
      data: {
        deliveryPrice: priceResult.data.totalPrice,
        distance: priceResult.data.distance,
        currency: priceResult.data.currency,
        borzoDeliveryId: borzoDelivery._id,
      },
    });

  } catch (error) {
    console.error('❌ Calculate delivery price error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate delivery price',
      error: error.message,
    });
  }
};

// Admin confirms order and creates Borzo delivery
exports.confirmAndCreateDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const adminId = req.user._id;

    const order = await Order.findById(orderId).populate('user');
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // ✅ FIXED: Get user phone number from address first, then user profile
    const userPhone = order.address.phoneNumber || 
                     order.user.phoneNumber || 
                     order.user.phone || '';
    
    if (!userPhone) {
      return res.status(400).json({
        success: false,
        message: 'User phone number is required for delivery. Please update your address.',
      });
    }

    console.log('📱 User phone number:', userPhone);
    console.log('📱 Phone source:', order.address.phoneNumber ? 'address' : 'user profile');

    // Get or create BorzoDelivery record
    let borzoDelivery = await BorzoDelivery.findOne({ order: orderId });

    if (!borzoDelivery) {
      // Calculate price first if not done
      const pickupLat = process.env.STORE_LATITUDE || '30.9010';
      const pickupLng = process.env.STORE_LONGITUDE || '75.8573';
      const dropLat = order.address.latitude;
      const dropLng = order.address.longitude;

      if (!dropLat || !dropLng) {
        return res.status(400).json({
          success: false,
          message: 'Order delivery address coordinates are required',
        });
      }

      const priceResult = await borzoService.calculatePrice({
        pickupLat,
        pickupLng,
        dropLat,
        dropLng,
      });

      if (!priceResult.success) {
        return res.status(400).json({
          success: false,
          message: 'Failed to calculate delivery price',
        });
      }

      borzoDelivery = new BorzoDelivery({
        order: orderId,
        pickupAddress: {
          address: process.env.STORE_ADDRESS || 'Store Address',
          latitude: parseFloat(pickupLat),
          longitude: parseFloat(pickupLng),
          contactName: process.env.STORE_CONTACT_NAME || 'Store Manager',
          contactPhone: process.env.STORE_CONTACT_PHONE || '+919876543210',
        },
        dropAddress: {
          address: `${order.address.street}, ${order.address.city}, ${order.address.state} ${order.address.zipCode}`,
          latitude: dropLat,
          longitude: dropLng,
          contactName: order.user.name,
          contactPhone: userPhone, // ✅ FIXED
        },
        itemDescription: `Order ${order.orderNumber} - ${order.productItems.length} items`,
        paymentMethod: order.paymentMethod,
        codAmount: order.paymentMethod === 'cod' ? order.totalAmount : 0,
        pricing: {
          estimatedPrice: priceResult.data.totalPrice,
          distance: priceResult.data.distance,
          currency: priceResult.data.currency,
        },
      });
    } else {
      // ✅ FIXED: Update phone number if BorzoDelivery already exists but phone is missing
      if (!borzoDelivery.dropAddress.contactPhone) {
        borzoDelivery.dropAddress.contactPhone = userPhone;
      }
    }

    // Mark as admin approved
    borzoDelivery.approve(adminId);
    borzoDelivery.status = 'creating';
    await borzoDelivery.save();

    console.log('🚀 Creating Borzo delivery for order:', order.orderNumber);
    console.log('📱 Drop contact phone:', borzoDelivery.dropAddress.contactPhone);

    // Create delivery via Borzo API
    const deliveryResult = await borzoService.createDelivery({
      orderId: order._id,
      orderNumber: order.orderNumber,
      pickupAddress: borzoDelivery.pickupAddress.address,
      pickupLat: borzoDelivery.pickupAddress.latitude,
      pickupLng: borzoDelivery.pickupAddress.longitude,
      pickupPhone: borzoDelivery.pickupAddress.contactPhone,
      pickupContact: borzoDelivery.pickupAddress.contactName,
      dropAddress: borzoDelivery.dropAddress.address,
      dropLat: borzoDelivery.dropAddress.latitude,
      dropLng: borzoDelivery.dropAddress.longitude,
      dropPhone: borzoDelivery.dropAddress.contactPhone, // ✅ Now properly set
      dropContact: borzoDelivery.dropAddress.contactName,
      itemDescription: borzoDelivery.itemDescription,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
    });

    if (!deliveryResult.success) {
      borzoDelivery.status = 'failed';
      borzoDelivery.addError('Delivery creation failed', deliveryResult.error);
      await borzoDelivery.save();

      return res.status(400).json({
        success: false,
        message: deliveryResult.message,
        error: deliveryResult.error,
      });
    }

    // Update delivery record with Borzo details
    borzoDelivery.borzoOrderId = deliveryResult.data.borzoOrderId;
    borzoDelivery.status = deliveryResult.data.status;
    borzoDelivery.trackingUrl = deliveryResult.data.trackingUrl;
    borzoDelivery.pricing.finalPrice = deliveryResult.data.deliveryFee;
    borzoDelivery.estimatedPickupTime = deliveryResult.data.estimatedPickupTime;
    borzoDelivery.estimatedDeliveryTime = deliveryResult.data.estimatedDeliveryTime;

    if (deliveryResult.data.courier) {
      borzoDelivery.updateCourier(deliveryResult.data.courier);
    }

    await borzoDelivery.save();

    // Update main order
    order.status = 'confirmed';
    order.confirmedAt = new Date();
    order.courier = 'Borzo Delivery';
    order.trackingNumber = deliveryResult.data.borzoOrderId;
    await order.save();

    console.log('✅ Borzo delivery created:', deliveryResult.data.borzoOrderId);

    // Emit socket event
    const io = getIO();
    io.to(`user-${order.user._id}`).emit('delivery-created', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      trackingUrl: deliveryResult.data.trackingUrl,
      borzoOrderId: deliveryResult.data.borzoOrderId,
    });

    res.json({
      success: true,
      message: 'Delivery created successfully',
      data: {
        borzoOrderId: deliveryResult.data.borzoOrderId,
        trackingUrl: deliveryResult.data.trackingUrl,
        deliveryFee: deliveryResult.data.deliveryFee,
        estimatedDeliveryTime: deliveryResult.data.estimatedDeliveryTime,
        courier: deliveryResult.data.courier,
      },
    });

  } catch (error) {
    console.error('❌ Confirm and create delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create delivery',
      error: error.message,
    });
  }
};

// Get delivery status
exports.getDeliveryStatus = async (req, res) => {
  try {
    const { orderId } = req.params;

    const borzoDelivery = await BorzoDelivery.findOne({ order: orderId })
      .populate({
        path: 'order',
        populate: { path: 'user', select: 'name email phoneNumber phone' }, // ✅ Added both fields
      });

    if (!borzoDelivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery record not found',
      });
    }

    // If Borzo order exists, fetch live status
// If Borzo order exists, fetch live status
if (borzoDelivery.borzoOrderId) {
  const statusResult = await borzoService.getOrderStatus(borzoDelivery.borzoOrderId);

  if (statusResult.success) {
    // Update local record
    borzoDelivery.status = statusResult.data.status;
    if (statusResult.data.courier) {
      borzoDelivery.updateCourier(statusResult.data.courier);
    }
    await borzoDelivery.save();

    // âœ… NEW: Sync Borzo status to main Order
    const order = await Order.findById(borzoDelivery.order);
    if (order) {
      // Map Borzo status to Order status
      const statusMapping = {
        'new': 'confirmed',
        'available': 'confirmed',
        'active': 'confirmed',
        'courier_assigned': 'shipped',
        'pickup_arrived': 'shipped',
        'picked_up': 'out_for_delivery',
        'delivering': 'out_for_delivery',
        'delivered': 'delivered',
        'cancelled': 'cancelled'
      };

      const newOrderStatus = statusMapping[statusResult.data.status];
      if (newOrderStatus && order.status !== newOrderStatus) {
        order.status = newOrderStatus;
        
        // Update timestamps
        const now = new Date();
        if (newOrderStatus === 'delivered' && !order.deliveredAt) {
          order.deliveredAt = now;
          order.paymentStatus = 'completed';
        } else if (newOrderStatus === 'out_for_delivery' && !order.outForDeliveryAt) {
          order.outForDeliveryAt = now;
        } else if (newOrderStatus === 'shipped' && !order.shippedAt) {
          order.shippedAt = now;
        }
        
        await order.save();
        console.log(`âœ… Synced order status: ${order.orderNumber} -> ${newOrderStatus}`);
      }
    }
  }
}
    res.json({
      success: true,
      data: borzoDelivery,
    });

  } catch (error) {
    console.error('❌ Get delivery status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get delivery status',
      error: error.message,
    });
  }
};

// Cancel delivery
exports.cancelDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const borzoDelivery = await BorzoDelivery.findOne({ order: orderId });

    if (!borzoDelivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery record not found',
      });
    }

    if (!borzoDelivery.borzoOrderId) {
      return res.status(400).json({
        success: false,
        message: 'Borzo order not yet created',
      });
    }

    // Cancel via Borzo API
    const cancelResult = await borzoService.cancelDelivery(borzoDelivery.borzoOrderId);

    if (!cancelResult.success) {
      return res.status(400).json({
        success: false,
        message: cancelResult.message,
      });
    }

    // Update local record
    borzoDelivery.status = 'cancelled';
    borzoDelivery.cancellationReason = reason || 'Cancelled by admin';
    borzoDelivery.cancelledAt = new Date();
    await borzoDelivery.save();

    // Update main order
    const order = await Order.findById(orderId);
    if (order) {
      order.status = 'cancelled';
      order.cancelledAt = new Date();
      order.cancellationReason = reason || 'Delivery cancelled';
      await order.save();
    }

    console.log('✅ Delivery cancelled:', borzoDelivery.borzoOrderId);

    res.json({
      success: true,
      message: 'Delivery cancelled successfully',
    });

  } catch (error) {
    console.error('❌ Cancel delivery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel delivery',
      error: error.message,
    });
  }
};

// Get courier location
exports.getCourierLocation = async (req, res) => {
  try {
    const { orderId } = req.params;

    const borzoDelivery = await BorzoDelivery.findOne({ order: orderId });

    if (!borzoDelivery || !borzoDelivery.borzoOrderId) {
      return res.status(404).json({
        success: false,
        message: 'Delivery tracking not available',
      });
    }

    const locationResult = await borzoService.getCourierLocation(borzoDelivery.borzoOrderId);

    if (!locationResult.success) {
      return res.status(400).json({
        success: false,
        message: locationResult.message,
      });
    }

    res.json({
      success: true,
      data: locationResult.data,
    });

  } catch (error) {
    console.error('❌ Get courier location error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get courier location',
      error: error.message,
    });
  }
};

// Get all deliveries (Admin)
exports.getAllDeliveries = async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    const deliveries = await BorzoDelivery.find(filter)
      .populate({
        path: 'order',
        populate: { path: 'user', select: 'name email phoneNumber phone' }, // ✅ Added both fields
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await BorzoDelivery.countDocuments(filter);

    res.json({
      success: true,
      data: {
        deliveries,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });

  } catch (error) {
    console.error('❌ Get all deliveries error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch deliveries',
      error: error.message,
    });
  }
};