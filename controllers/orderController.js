// server/controllers/orderController.js - Updated for products only
const Order = require('../models/Order');
const Product = require('../models/Product');

// Create a new order (products only)
exports.createOrder = async (req, res) => {
  try {
    const { 
      address, 
      paymentMethod, 
      productItems = [],
      totalAmount,
      status = 'placed'
    } = req.body;

    // Validation
    if (!address || !paymentMethod || !totalAmount) {
      return res.status(400).json({
        success: false,
        message: 'Address, payment method, and total amount are required'
      });
    }

    if (productItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product item is required'
      });
    }

    // Calculate totals
    let subtotal = 0;
    const deliveryFee = 50; // Fixed delivery fee for products
    
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

    const tax = Math.round(subtotal * 0.18); // 18% GST
    const calculatedTotal = subtotal + deliveryFee + tax;

    // Generate order number
    const orderCount = await Order.countDocuments();
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const orderNumber = `ORD${timestamp}${random}`;

    // Create order (product only)
    const order = new Order({
      user: req.user._id,
      orderNumber: orderNumber,
      type: 'product',
      status,
      serviceItems: [], // Empty for product orders
      productItems: processedProductItems,
      address,
      paymentMethod,
      subtotal,
      deliveryFee,
      serviceFee: 0, // No service fee for product orders
      tax,
      totalAmount: calculatedTotal,
      courier: 'FedEx',
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    });

    await order.save();

    // Populate with product details
    await order.populate([
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

// Get user's orders (products only)
exports.getUserOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type = 'product' } = req.query;
    const skip = (page - 1) * limit;

    const filter = { 
      user: req.user._id,
      type: 'product', // Only product orders
      productItems: { $exists: true, $not: { $size: 0 } } // Must have product items
    };
    
    if (status) filter.status = status;

    console.log('Fetching product orders with filter:', filter);

    const orders = await Order.find(filter)
      .populate([
        { path: 'productItems.productId', model: 'Product' }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);

    console.log(`Found ${orders.length} product orders out of ${total} total`);

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

// Get single order by ID (products only)
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user._id,
      type: 'product'
    }).populate([
      { path: 'productItems.productId', model: 'Product' }
    ]);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Product order not found'
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

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user._id,
      type: 'product'
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Product order not found'
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

    const order = await Order.findOne({ 
      _id: id, 
      user: req.user._id,
      type: 'product'
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Product order not found'
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