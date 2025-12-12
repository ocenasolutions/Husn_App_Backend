// controllers/giftCardpaymentController.js
const GiftCardPayment = require('../models/GiftCardPayment');
const User = require('../models/User');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// ==================== RAZORPAY ORDER CREATION ====================
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', metadata } = req.body;

    // Validate amount
    if (!amount || amount < 100 || amount > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be between ₹100 and ₹10,000'
      });
    }

    // Generate transaction ID
    const transactionId = GiftCardPayment.generateTransactionId();

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency,
      receipt: transactionId,
      notes: {
        userId: req.user._id.toString(),
        purpose: 'gift_card',
        ...metadata
      }
    });

    // Create payment record
    const payment = new GiftCardPayment({
      transactionId,
      userId: req.user._id,
      amount,
      paymentMethod: 'razorpay',
      purpose: 'gift_card',
      status: 'initiated',
      razorpayOrderId: razorpayOrder.id,
      metadata,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    await payment.save();

    res.status(201).json({
      success: true,
      message: 'Razorpay order created successfully',
      data: {
        transactionId,
        razorpayOrderId: razorpayOrder.id,
        amount,
        currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
};

// ==================== RAZORPAY PAYMENT VERIFICATION ====================
exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      transactionId
    } = req.body;

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature !== expectedSign) {
      // Mark payment as failed
      const payment = await GiftCardPayment.findOne({ transactionId });
      if (payment) {
        await payment.markAsFailed('Signature verification failed', 'INVALID_SIGNATURE');
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update payment record
    const payment = await GiftCardPayment.findOne({ transactionId });
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = 'completed';
    payment.completedAt = new Date();

    await payment.save();

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        transactionId: payment.transactionId,
        status: payment.status,
        amount: payment.amount
      }
    });
  } catch (error) {
    console.error('Verify Razorpay payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};

// ==================== WEBHOOK HANDLER ====================
exports.handleWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (webhookSignature !== expectedSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    const event = req.body.event;
    const payload = req.body.payload.payment.entity;

    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        await handlePaymentCaptured(payload);
        break;
      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;
      case 'refund.created':
        await handleRefundCreated(payload);
        break;
      default:
        console.log('Unhandled webhook event:', event);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
};

// Webhook helper functions
async function handlePaymentCaptured(payload) {
  const payment = await GiftCardPayment.findOne({
    razorpayOrderId: payload.order_id
  });

  if (payment && payment.status !== 'completed') {
    payment.status = 'completed';
    payment.completedAt = new Date();
    payment.razorpayPaymentId = payload.id;
    payment.gatewayResponse = payload;
    await payment.save();
  }
}

async function handlePaymentFailed(payload) {
  const payment = await GiftCardPayment.findOne({
    razorpayOrderId: payload.order_id
  });

  if (payment) {
    await payment.markAsFailed(
      payload.error_description || 'Payment failed',
      payload.error_code
    );
  }
}

async function handleRefundCreated(payload) {
  const payment = await GiftCardPayment.findOne({
    razorpayPaymentId: payload.payment_id
  });

  if (payment && payment.refund) {
    payment.refund.status = 'completed';
    payment.refund.refundId = payload.id;
    payment.refund.completedAt = new Date();
    await payment.save();
  }
}

// ==================== INITIATE PAYMENT ====================
exports.initiatePayment = async (req, res) => {
  try {
    const { amount, purpose = 'gift_card', paymentMethod, metadata } = req.body;
    const userId = req.user._id;

    // Validate amount
    if (!amount || amount < 100 || amount > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be between ₹100 and ₹10,000'
      });
    }

    // Validate payment method
    if (!['wallet', 'upi', 'card', 'razorpay'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment method'
      });
    }

    // For wallet payment, check balance
    if (paymentMethod === 'wallet') {
      const user = await User.findById(userId);
      if (!user || user.walletBalance < amount) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance'
        });
      }
    }

    // Generate transaction ID
    const transactionId = GiftCardPayment.generateTransactionId();

    // Create payment record
    const payment = new GiftCardPayment({
      transactionId,
      userId,
      amount,
      paymentMethod,
      purpose,
      status: paymentMethod === 'wallet' ? 'processing' : 'initiated',
      metadata,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    await payment.save();

    // If wallet payment, process immediately
    if (paymentMethod === 'wallet') {
      // Deduct from wallet
      const user = await User.findById(userId);
      user.walletBalance -= amount;
      await user.save();

      // Mark payment as completed
      await payment.markAsCompleted();
    }

    res.status(201).json({
      success: true,
      message: 'Payment initiated successfully',
      data: {
        transactionId,
        amount,
        paymentMethod,
        status: payment.status
      }
    });
  } catch (error) {
    console.error('Initiate payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment',
      error: error.message
    });
  }
};

// ==================== VERIFY PAYMENT ====================
exports.verifyPayment = async (req, res) => {
  try {
    const { transactionId, paymentReference } = req.body;

    const payment = await GiftCardPayment.findOne({ transactionId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Verify payment with gateway (implement based on your gateway)
    // For now, mark as completed
    if (payment.status === 'initiated' || payment.status === 'pending') {
      payment.status = 'completed';
      payment.completedAt = new Date();
      payment.gatewayResponse = { paymentReference };
      await payment.save();
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        transactionId: payment.transactionId,
        status: payment.status,
        amount: payment.amount
      }
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};

// ==================== GET PAYMENT STATUS ====================
exports.getPaymentStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const payment = await GiftCardPayment.findOne({ transactionId })
      .select('-gatewayResponse -__v');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if user is authorized to view this payment
    if (payment.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment status',
      error: error.message
    });
  }
};

// ==================== INITIATE REFUND ====================
exports.initiateRefund = async (req, res) => {
  try {
    const { transactionId, reason } = req.body;

    const payment = await GiftCardPayment.findOne({ transactionId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if user is authorized
    if (payment.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    // Check if payment is completed
    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Only completed payments can be refunded'
      });
    }

    // Check if already refunded
    if (payment.status === 'refunded') {
      return res.status(400).json({
        success: false,
        message: 'Payment already refunded'
      });
    }

    // Initiate refund based on payment method
    if (payment.paymentMethod === 'razorpay' && payment.razorpayPaymentId) {
      const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
        amount: payment.amount * 100, // Convert to paise
        notes: { reason }
      });

      await payment.initiateRefund(payment.amount, reason);
      payment.refund.refundId = refund.id;
      payment.refund.status = 'processing';
      await payment.save();
    } else if (payment.paymentMethod === 'wallet') {
      // Refund to wallet immediately
      const user = await User.findById(payment.userId);
      user.walletBalance += payment.amount;
      await user.save();

      await payment.initiateRefund(payment.amount, reason);
      payment.refund.status = 'completed';
      payment.refund.completedAt = new Date();
      await payment.save();
    }

    res.json({
      success: true,
      message: 'Refund initiated successfully',
      data: {
        transactionId: payment.transactionId,
        refundAmount: payment.amount,
        refundStatus: payment.refund.status
      }
    });
  } catch (error) {
    console.error('Initiate refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate refund',
      error: error.message
    });
  }
};

// ==================== GET PAYMENT DETAILS ====================
exports.getPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await GiftCardPayment.findById(paymentId)
      .populate('userId', 'name email phone');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check authorization
    if (payment.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details',
      error: error.message
    });
  }
};

// ==================== REFUND PAYMENT (Alternative endpoint) ====================
exports.refundPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount, reason } = req.body;

    const payment = await GiftCardPayment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check authorization
    if (payment.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    // Validate refund amount
    const refundAmount = amount || payment.amount;
    if (refundAmount > payment.amount) {
      return res.status(400).json({
        success: false,
        message: 'Refund amount cannot exceed payment amount'
      });
    }

    // Process refund (same logic as initiateRefund)
    if (payment.paymentMethod === 'razorpay' && payment.razorpayPaymentId) {
      const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
        amount: refundAmount * 100,
        notes: { reason }
      });

      await payment.initiateRefund(refundAmount, reason);
      payment.refund.refundId = refund.id;
      await payment.save();
    } else if (payment.paymentMethod === 'wallet') {
      const user = await User.findById(payment.userId);
      user.walletBalance += refundAmount;
      await user.save();

      await payment.initiateRefund(refundAmount, reason);
      payment.refund.status = 'completed';
      payment.refund.completedAt = new Date();
      await payment.save();
    }

    res.json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        paymentId: payment._id,
        refundAmount,
        status: payment.refund.status
      }
    });
  } catch (error) {
    console.error('Refund payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message
    });
  }
};

module.exports = exports;