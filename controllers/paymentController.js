// server/controllers/paymentController.js
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');
const Payment = require('../models/Payment');

// Lazy initialization of Razorpay instance
let razorpay = null;
const getRazorpayInstance = () => {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return razorpay;
};

// Create Razorpay order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {}
    };

    const razorpayOrder = await getRazorpayInstance().orders.create(options);

    res.json({
      success: true,
      data: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Verify Razorpay payment signature
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderData
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification parameters'
      });
    }

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Payment verified successfully
    // Create payment record
    const payment = new Payment({
      user: req.user._id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      amount: orderData.totalAmount,
      currency: 'INR',
      status: 'completed',
      method: 'online'
    });

    await payment.save();

    // Create the actual order
    const order = new Order({
      user: req.user._id,
      orderNumber: await Order.generateOrderNumber(),
      type: orderData.type,
      status: 'placed',
      serviceItems: orderData.serviceItems || [],
      productItems: orderData.productItems || [],
      address: orderData.address,
      paymentMethod: 'online',
      paymentStatus: 'completed',
      paymentId: payment._id,
      subtotal: orderData.subtotal,
      deliveryFee: orderData.deliveryFee,
      serviceFee: orderData.serviceFee,
      tax: orderData.tax,
      totalAmount: orderData.totalAmount,
      courier: orderData.productItems?.length > 0 ? 'FedEx' : undefined
    });

    await order.save();

    await order.populate([
      { path: 'productItems.productId', model: 'Product' },
      { path: 'serviceItems.serviceId', model: 'Service' }
    ]);

    res.json({
      success: true,
      message: 'Payment verified and order created successfully',
      data: {
        payment,
        order
      }
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Handle payment failure
exports.handlePaymentFailure = async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id,
      error_description,
      error_reason 
    } = req.body;

    // Create failed payment record
    const payment = new Payment({
      user: req.user._id,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount: 0, // Will be updated if available
      currency: 'INR',
      status: 'failed',
      method: 'online',
      failureReason: error_description || error_reason || 'Payment failed'
    });

    await payment.save();

    res.json({
      success: true,
      message: 'Payment failure recorded',
      data: payment
    });

  } catch (error) {
    console.error('Handle payment failure error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record payment failure'
    });
  }
};

// Get payment details
exports.getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await Payment.findOne({
      _id: id,
      user: req.user._id
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: payment
    });

  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details'
    });
  }
};

// Get user's payment history
exports.getPaymentHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (status) filter.status = status;

    const payments = await Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(filter);

    res.json({
      success: true,
      data: {
        payments,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history'
    });
  }
};