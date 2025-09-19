// server/controllers/orderController.js - Fixed version
const Order = require('../models/Order');
const CartItem = require('../models/CartItem');
const ProductCartItem = require('../models/ProductCartItem');
const Service = require('../models/Service');
const Product = require('../models/Product');

// Create a new order
exports.createOrder = async (req, res) => {
  try {
    const { 
      address, 
      paymentMethod, 
      serviceItems = [], 
      productItems = [],
      totalAmount,
      type,
      status = 'placed'
    } = req.body;

    // Validation
    if (!address || !paymentMethod || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Address, payment method, and total amount are required'
      });
    }

    if (serviceItems.length === 0 && productItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one service or product item is required'
      });
    }

    // Calculate totals
    let subtotal = 0;
    let deliveryFee = 0;
    let serviceFee = 0;

    // Process service items
    const processedServiceItems = [];
    for (const item of serviceItems) {
      const service = await Service.findById(item.serviceId);
      if (!service) {
        return res.status(404).json({
          success: false,
          message: `Service not found: ${item.serviceId}`
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

    // Process product items
    const processedProductItems = [];
    for (const item of productItems) {
      console.log('Processing product item:', item);
      
      if (!item.productId) {
        console.error('Product ID missing in item:', item);
        return res.status(400).json({
          success: false,
          message: 'Product ID is required for each product item'
        });
      }

      const product = await Product.findById(item.productId);
      console.log('Found product:', product ? product.name : 'Not found');
      
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
    }

    // Calculate fees
    if (processedProductItems.length > 0) {
      deliveryFee = 50; // Delivery fee for products
    }
    if (processedServiceItems.length > 0) {
      serviceFee = 25; // Service fee
    }

    const tax = Math.round(subtotal * 0.18); // 18% GST
    const calculatedTotal = subtotal + deliveryFee + serviceFee + tax;

    // Generate order number manually (instead of relying on pre-save hook)
    const orderCount = await Order.countDocuments();
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const orderNumber = `ORD${timestamp}${random}`;

    console.log('Generated order number:', orderNumber);

    // Create order
    const order = new Order({
      user: req.user._id,
      orderNumber: orderNumber, // Explicitly set the order number
      type: type || (processedProductItems.length > 0 ? 'product' : 'service'),
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
      courier: 'FedEx',
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) // 2 days from now
    });

    console.log('Order data before save:', {
      user: order.user,
      orderNumber: order.orderNumber,
      type: order.type,
      serviceItemsCount: order.serviceItems.length,
      productItemsCount: order.productItems.length,
      totalAmount: order.totalAmount
    });

    await order.save();

    console.log('Order saved successfully with order number:', order.orderNumber);

    // Populate the order with service and product details
    await order.populate([
      { path: 'serviceItems.serviceId', model: 'Service' },
      { path: 'productItems.productId', model: 'Product' }
    ]);

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
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (status) filter.status = status;

    const orders = await Order.find(filter)
      .populate([
        { path: 'serviceItems.serviceId', model: 'Service' },
        { path: 'productItems.productId', model: 'Product' }
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

// Get single order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({ _id: id, user: req.user._id })
      .populate([
        { path: 'serviceItems.serviceId', model: 'Service' },
        { path: 'productItems.productId', model: 'Product' }
      ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
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
      message: 'Failed to fetch order details'
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

    const order = await Order.findOne({ _id: id, user: req.user._id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Set timestamp for status changes
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

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findOne({ _id: id, user: req.user._id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
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