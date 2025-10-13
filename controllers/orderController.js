// server/controllers/orderController.js - Enhanced with notifications
const Order = require('../models/Order');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Notification = require('../models/Notification');

// Create a new order
exports.createOrder = async (req, res) => {
  try {
    const { 
      address, 
      paymentMethod, 
      productItems = [],
      serviceItems = [],
      totalAmount,
      status = 'placed'
    } = req.body;

    if (!address || !paymentMethod || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Address, payment method, and total amount are required'
      });
    }

    if (productItems.length === 0 && serviceItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product or service item is required'
      });
    }

    let orderType = 'mixed';
    if (productItems.length > 0 && serviceItems.length === 0) {
      orderType = 'product';
    } else if (serviceItems.length > 0 && productItems.length === 0) {
      orderType = 'service';
    }

    let subtotal = 0;
    const deliveryFee = productItems.length > 0 ? 50 : 0;
    const serviceFee = serviceItems.length > 0 ? 30 : 0;
    
    const processedProductItems = [];
    for (const item of productItems) {
      if (!item.productId) {
        return res.status(400).json({
          success: false,
          message: 'Product ID is required for each product item'
        });
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product not found with ID: ${item.productId}`
        });
      }
      
      processedProductItems.push({
        productId: item.productId,
        quantity: item.quantity,
        price: item.price || product.price
      });
      
      subtotal += (item.price || product.price) * item.quantity;
      
      // ✨ Check stock levels and create notifications if needed
      const newStock = product.stock - item.quantity;
      if (newStock === 0) {
        try {
          await Notification.createOutOfStockNotification(product);
        } catch (notifError) {
          console.error('⚠️ Failed to create out of stock notification:', notifError);
        }
      } else if (newStock <= 5 && product.stock > 5) {
        try {
          await Notification.createLowStockNotification(product);
        } catch (notifError) {
          console.error('⚠️ Failed to create low stock notification:', notifError);
        }
      }
    }

    const processedServiceItems = [];
    for (const item of serviceItems) {
      if (!item.serviceId) {
        return res.status(400).json({
          success: false,
          message: 'Service ID is required for each service item'
        });
      }

      const service = await Service.findById(item.serviceId);
      if (!service) {
        return res.status(404).json({
          success: false,
          message: `Service not found with ID: ${item.serviceId}`
        });
      }
      
      processedServiceItems.push({
        serviceId: item.serviceId,
        quantity: item.quantity,
        price: item.price || service.price,
        selectedDate: item.selectedDate,
        selectedTime: item.selectedTime
      });
      
      subtotal += (item.price || service.price) * item.quantity;
    }

    const tax = Math.round(subtotal * 0.18);
    const calculatedTotal = subtotal + deliveryFee + serviceFee + tax;

    const orderNumber = await Order.generateOrderNumber();

    const order = new Order({
      user: req.user._id,
      orderNumber: orderNumber,
      type: orderType,
      status,
      serviceItems: processedServiceItems,
      productItems: processedProductItems,
      address,
      paymentMethod,
      subtotal,
      deliveryFee,
      serviceFee,
      tax,
      totalAmount: calculatedTotal,
      courier: productItems.length > 0 ? 'FedEx' : undefined,
    });

    await order.save();

    await order.populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'user', select: 'name email phone' }
    ]);

    // ✨ CREATE ADMIN NOTIFICATION FOR NEW ORDER
    try {
      await Notification.createOrderNotification(order);
      console.log('✅ Order notification created for admin');
    } catch (notifError) {
      console.error('⚠️ Failed to create order notification:', notifError);
      // Don't fail the order creation if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user's orders
exports.getUserOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (status) filter.status = status;
    if (type) filter.type = type;

    const orders = await Order.find(filter)
      .populate([
        { path: 'productItems.productId', model: 'Product' },
        { path: 'serviceItems.serviceId', model: 'Service' }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// Get all orders (Admin only)
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, search } = req.query;
    const skip = (page - 1) * limit;

    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'address.street': { $regex: search, $options: 'i' } }
      ];
    }

    const orders = await Order.find(filter)
      .populate([
        { path: 'productItems.productId', model: 'Product' },
        { path: 'serviceItems.serviceId', model: 'Service' },
        { path: 'user', select: 'name email phone' }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get all orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// Get single order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log('Fetching order:', id, 'for user:', req.user._id);

    // First try to find order belonging to this user
    let order = await Order.findOne({ 
      _id: id, 
      user: req.user._id
    }).populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' }
    ]);

    // If admin, allow access to any order
    if (!order && req.user.role === 'admin') {
      order = await Order.findById(id).populate([
        { path: 'productItems.productId', model: 'Product' },
        { path: 'serviceItems.serviceId', model: 'Service' },
        { path: 'user', select: 'name email phone' }
      ]);
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or access denied'
      });
    }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['placed', 'confirmed', 'preparing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const now = new Date();
    switch (status) {
      case 'confirmed':
        order.confirmedAt = now;
        break;
      case 'shipped':
        order.shippedAt = now;
        break;
      case 'out_for_delivery':
        order.outForDeliveryAt = now;
        break;
      case 'delivered':
        order.deliveredAt = now;
        order.paymentStatus = 'completed';
        break;
      case 'cancelled':
        order.cancelledAt = now;
        break;
    }

    order.status = status;
    await order.save();

    await order.populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' }
    ]);

    res.json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};

// Set delivery date (Admin only)
exports.setDeliveryDate = async (req, res) => {
  try {
    const { id } = req.params;
    const { estimatedDelivery } = req.body;

    if (!estimatedDelivery) {
      return res.status(400).json({
        success: false,
        message: 'Estimated delivery date is required'
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    order.estimatedDelivery = new Date(estimatedDelivery);
    await order.save();

    res.json({
      success: true,
      message: 'Delivery date set successfully',
      data: order
    });

  } catch (error) {
    console.error('Set delivery date error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set delivery date'
    });
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user._id
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (['delivered', 'cancelled'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel this order'
      });
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    if (reason) {
      order.cancellationReason = reason;
    }

    await order.save();

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: order
    });

  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order'
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

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user._id 
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!order.canReview) {
      return res.status(400).json({
        success: false,
        message: 'This order cannot be reviewed yet'
      });
    }

    if (order.review) {
      return res.status(400).json({
        success: false,
        message: 'Order already reviewed'
      });
    }

    order.review = {
      rating,
      comment: comment || '',
      createdAt: new Date()
    };

    await order.save();

    res.json({
      success: true,
      message: 'Review submitted successfully',
      data: order
    });

  } catch (error) {
    console.error('Submit review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review'
    });
  }
};