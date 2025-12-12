const Razorpay = require('razorpay');
const crypto = require('crypto');
const Wallet = require('../models/Wallet');
const walletController = require('./walletController');

// Debug: Log environment variables
console.log('🔍 Razorpay Configuration Check:');
console.log('RAZORPAY_KEY_ID:', process.env.RAZORPAY_KEY_ID ? `${process.env.RAZORPAY_KEY_ID.substring(0, 15)}...` : '❌ NOT SET');
console.log('RAZORPAY_KEY_SECRET:', process.env.RAZORPAY_KEY_SECRET ? '✓ Set' : '❌ NOT SET');

// Validate environment variables
if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error('❌ ERROR: Razorpay credentials not found in environment variables!');
  console.error('Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file');
}

// Initialize Razorpay instance
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
  console.log('✓ Razorpay instance created successfully');
} catch (error) {
  console.error('❌ Failed to initialize Razorpay:', error.message);
}

// Create payment order for wallet top-up
exports.createPaymentOrder = async (req, res) => {
  try {
    console.log('📝 Create Payment Order Request:', {
      userId: req.user._id,
      amount: req.body.amount
    });

    // Check if Razorpay is initialized
    if (!razorpay) {
      console.error('❌ Razorpay not initialized');
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured. Please contact support.'
      });
    }

    const userId = req.user._id;
    const { amount } = req.body;

    // Validate amount
    if (!amount || amount < 10) {
      return res.status(400).json({
        success: false,
        message: 'Minimum amount is ₹10'
      });
    }

    if (amount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum amount is ₹50,000'
      });
    }

    // Create Razorpay order
    // Generate short receipt (max 40 chars allowed by Razorpay)
    const shortId = userId.toString().slice(-8); // Last 8 chars of userId
    const timestamp = Date.now().toString().slice(-8); // Last 8 digits of timestamp
    const receipt = `WT_${shortId}_${timestamp}`; // e.g., WT_0820468cb_24869195 (max 30 chars)
    
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: receipt,
      notes: {
        userId: userId.toString(),
        purpose: 'wallet_topup',
        amount: amount
      }
    };

    console.log('🔄 Creating Razorpay order with options:', options);

    const order = await razorpay.orders.create(options);

    console.log('✓ Razorpay order created:', order.id);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error('❌ Create payment order error:', error);
    console.error('Error details:', {
      message: error.message,
      description: error.error?.description,
      code: error.statusCode
    });
    
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.error?.description || error.message
    });
  }
};

// Verify payment and add money to wallet
exports.verifyPaymentAndAddMoney = async (req, res) => {
  try {
    const userId = req.user._id;
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      amount 
    } = req.body;

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

    // Fetch payment details from Razorpay to double-check
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        message: 'Payment not successful'
      });
    }

    // Verify amount matches
    const paidAmount = payment.amount / 100; // Convert from paise
    if (Math.abs(paidAmount - amount) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Amount mismatch'
      });
    }

    // Add money to wallet
    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      wallet = await walletController.createWallet(userId);
    }

    const transaction = await wallet.addTransaction({
      type: 'credit',
      amount: amount,
      description: `Wallet top-up via Razorpay`,
      referenceType: 'topup',
      referenceId: razorpay_payment_id,
      metadata: {
        paymentMethod: payment.method,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature
      }
    });

    res.json({
      success: true,
      message: 'Money added successfully',
      data: {
        balance: wallet.balance,
        amountAdded: amount,
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
          type: transaction.type,
          balanceAfter: transaction.balanceAfter,
          createdAt: transaction.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify payment'
    });
  }
};

// Create payment order for debt payment
exports.createDebtPaymentOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount } = req.body;

    // Get wallet to check debt
    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet || wallet.balance >= 0) {
      return res.status(400).json({
        success: false,
        message: 'No outstanding debt'
      });
    }

    const debtAmount = Math.abs(wallet.balance);

    if (!amount || amount < debtAmount) {
      return res.status(400).json({
        success: false,
        message: `Please pay at least ₹${debtAmount.toFixed(2)} to clear debt`
      });
    }

    // Create Razorpay order with short receipt
    const shortId = userId.toString().slice(-8);
    const timestamp = Date.now().toString().slice(-8);
    const receipt = `DP_${shortId}_${timestamp}`; // e.g., DP_0820468cb_24869195 (max 30 chars)
    
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: receipt,
      notes: {
        userId: userId.toString(),
        purpose: 'debt_payment',
        debtAmount: debtAmount,
        amount: amount
      }
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: amount,
        debtAmount: debtAmount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error('Create debt payment order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create debt payment order',
      error: error.message
    });
  }
};

// Verify debt payment
exports.verifyDebtPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      amount 
    } = req.body;

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

    // Fetch payment details
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        message: 'Payment not successful'
      });
    }

    // Get wallet
    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet || wallet.balance >= 0) {
      return res.status(400).json({
        success: false,
        message: 'No outstanding debt to clear'
      });
    }

    const debtAmount = Math.abs(wallet.balance);
    const paidAmount = payment.amount / 100;

    // Clear debt
    const transaction = await wallet.addTransaction({
      type: 'credit',
      amount: debtAmount,
      description: `Debt payment - Cancellation penalty cleared via Razorpay`,
      referenceType: 'topup',
      referenceId: razorpay_payment_id,
      metadata: {
        paymentMethod: payment.method,
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        debtCleared: true,
        previousBalance: wallet.balance
      }
    });

    // If paid more than debt, add extra as credit
    if (paidAmount > debtAmount) {
      const extraAmount = paidAmount - debtAmount;
      await wallet.addTransaction({
        type: 'credit',
        amount: extraAmount,
        description: `Wallet top-up after debt clearance`,
        referenceType: 'topup',
        referenceId: razorpay_payment_id,
        metadata: {
          paymentMethod: payment.method,
          extraCredit: true
        }
      });
    }

    res.json({
      success: true,
      message: 'Debt cleared successfully! You can now book services.',
      data: {
        debtCleared: debtAmount,
        currentBalance: wallet.balance,
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
          balanceAfter: transaction.balanceAfter,
          createdAt: transaction.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Verify debt payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to verify debt payment'
    });
  }
};

// Webhook handler for Razorpay events
exports.handleWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookBody = JSON.stringify(req.body);

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET)
      .update(webhookBody)
      .digest('hex');

    if (webhookSignature !== expectedSignature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log('Razorpay Webhook Event:', event);

    // Handle different events
    switch (event) {
      case 'payment.captured':
        // Payment was successfully captured
        console.log('Payment captured:', payload.payment.entity.id);
        break;

      case 'payment.failed':
        // Payment failed
        console.log('Payment failed:', payload.payment.entity.id);
        break;

      case 'order.paid':
        // Order was paid
        console.log('Order paid:', payload.order.entity.id);
        break;

      default:
        console.log('Unhandled webhook event:', event);
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
};

module.exports = exports;