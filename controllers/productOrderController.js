// server/controllers/productOrderController.js
const ProductOrder = require('../models/ProductOrder.js');
const ProductCartItem = require('../models/ProductCartItem.js');
const Product = require('../models/Product');
const Address = require('../models/Address.js');
const Notification = require('../models/Notification');

// Create product order
exports.createProductOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod = 'cod', orderNotes } = req.body;

    // Get cart items
    const cartItems = await ProductCartItem.find({ user: req.user._id })
      .populate('product');

    if (cartItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cart is empty'
      });
    }

    // Verify address
    const address = await Address.findOne({ _id: addressId, user: req.user._id });
    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery address'
      });
    }

    // Check stock availability and calculate total
    let totalAmount = 0;
    const orderItems = [];

    for (const cartItem of cartItems) {
      const product = cartItem.product;
      
      if (!product.isActive) {
        return res.status(400).json({
          success: false,
          message: `Product "${product.name}" is no longer available`
        });
      }

      if (product.stock < cartItem.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Available: ${product.stock}`
        });
      }

      const itemTotal = cartItem.quantity * cartItem.price;
      totalAmount += itemTotal;

      orderItems.push({
        product: product._id,
        quantity: cartItem.quantity,
        price: cartItem.price,
        total: itemTotal
      });
    }

    // Generate order number
    const orderCount = await ProductOrder.countDocuments();
    const orderNumber = `PRD${Date.now()}${(orderCount + 1).toString().padStart(4, '0')}`;

    // Create order
    const productOrder = new ProductOrder({
      user: req.user._id,
      orderNumber,
      items: orderItems,
      totalAmount,
      shippingAddress: {
        fullName: address.fullName,
        phoneNumber: address.phoneNumber,
        address: address.address,
        landmark: address.landmark,
        city: address.city,
        state: address.state,
        pincode: address.pincode
      },
      paymentMethod,
      orderNotes: orderNotes || '',
      status: 'pending'
    });

    await productOrder.save();

    // Update product stock
    for (const cartItem of cartItems) {
      await Product.findByIdAndUpdate(
        cartItem.product._id,
        { $inc: { stock: -cartItem.quantity } }
      );
    }

    // Clear cart
    await ProductCartItem.deleteMany({ user: req.user._id });

    // Create notification
    await Notification.create({
      user: req.user._id,
      title: 'Order Placed Successfully',
      message: `Your order #${orderNumber} has been placed successfully. Total: ₹${totalAmount}`,
      type: 'order_placed',
      relatedOrder: productOrder._id
    });

    await productOrder.populate('items.product');

    res.json({
      success: true,
      message: 'Order placed successfully',
      data: productOrder
    });
  } catch (error) {
    console.error('Create product order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order'
    });
  }
};

// Get user's product orders
exports.getUserProductOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    let filter = { user: req.user._id };
    if (status && status !== 'all') {
      filter.status = status;
    }

    const orders = await ProductOrder.find(filter)
      .populate('items.product')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProductOrder.countDocuments(filter);

    res.json({
      success: true,
      data: orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get user product orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders'
    });
  }
};

// Get single product order
exports.getProductOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await ProductOrder.findOne({ _id: id, user: req.user._id })
      .populate('items.product');

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
    console.error('Get product order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order'
    });
  }
};

// Cancel product order
exports.cancelProductOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await ProductOrder.findOne({ _id: id, user: req.user._id });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product,
        { $inc: { stock: item.quantity } }
      );
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    await order.save();

    // Create notification
    await Notification.create({
      user: req.user._id,
      title: 'Order Cancelled',
      message: `Your order #${order.orderNumber} has been cancelled successfully.`,
      type: 'order_cancelled',
      relatedOrder: order._id
    });

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: order
    });
  } catch (error) {
    console.error('Cancel product order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order'
    });
  }
};

// Reorder products
exports.reorderProducts = async (req, res) => {
  try {
    const { orderId } = req.body;

    const order = await ProductOrder.findOne({ _id: orderId, user: req.user._id })
      .populate('items.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Add items back to cart
    for (const item of order.items) {
      const product = item.product;
      
      if (product && product.isActive && product.stock >= item.quantity) {
        // Check if item already exists in cart
        let cartItem = await ProductCartItem.findOne({
          user: req.user._id,
          product: product._id
        });

        if (cartItem) {
          cartItem.quantity += item.quantity;
          if (product.stock >= cartItem.quantity) {
            await cartItem.save();
          }
        } else {
          cartItem = new ProductCartItem({
            user: req.user._id,
            product: product._id,
            quantity: item.quantity,
            price: product.price
          });
          await cartItem.save();
        }
      }
    }

    res.json({
      success: true,
      message: 'Items added to cart successfully'
    });
  } catch (error) {
    console.error('Reorder products error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reorder products'
    });
  }
};