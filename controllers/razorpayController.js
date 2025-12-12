const Razorpay = require('razorpay');
const crypto = require('crypto');
const Wallet = require('../models/Wallet');

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.createPaymentOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    if (amount < 10) {
      return res.status(400).json({
        success: false,
        message: 'Minimum top-up amount is ₹10'
      });
    }

    if (amount > 50000) {
      return res.status(400).json({
        success: false,
        message: 'Maximum top-up amount is ₹50,000'
      });
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Amount in paise
      currency: 'INR',
      receipt: `wallet_${userId}_${Date.now()}`,
      notes: {
        userId: userId.toString(),
        purpose: 'wallet_topup'
      }
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: amount,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order'
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
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return res.status(400).json({
        success: false,
        message: 'Payment not successful'
      });
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      const walletAddress = Wallet.generateWalletAddress(userId);
      wallet = new Wallet({
        userId,
        walletAddress,
        balance: 0
      });
    }

    // Add transaction to wallet
    const transaction = await wallet.addTransaction({
      type: 'credit',
      amount: payment.amount / 100, // Convert paise to rupees
      description: `Wallet top-up via ${payment.method}`,
      referenceType: 'topup',
      referenceId: razorpay_payment_id,
      metadata: {
        paymentMethod: payment.method,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        cardLast4: payment.card?.last4,
        cardNetwork: payment.card?.network,
        upiVpa: payment.vpa,
        bank: payment.bank
      }
    });

    res.json({
      success: true,
      message: 'Money added successfully',
      data: {
        balance: wallet.balance,
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

// Create payment order for debt clearance
exports.createDebtPaymentOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount } = req.body;

    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet || wallet.balance >= 0) {
      return res.status(400).json({
        success: false,
        message: 'No outstanding debt to pay'
      });
    }

    const debtAmount = Math.abs(wallet.balance);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment amount'
      });
    }

    if (amount < debtAmount) {
      return res.status(400).json({
        success: false,
        message: `Partial payment not allowed. Please pay the full debt amount of ₹${debtAmount.toFixed(2)}`
      });
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Amount in paise
      currency: 'INR',
      receipt: `debt_${userId}_${Date.now()}`,
      notes: {
        userId: userId.toString(),
        purpose: 'debt_payment',
        debtAmount: debtAmount
      }
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: amount,
        debtAmount: debtAmount,
        currency: 'INR',
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Create debt payment order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order'
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
      razorpay_signature 
    } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
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

    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    const debtAmount = Math.abs(wallet.balance);
    const paidAmount = payment.amount / 100;

    // Clear debt
    const transaction = await wallet.addTransaction({
      type: 'credit',
      amount: debtAmount,
      description: `Debt payment - Cancellation penalty cleared via ${payment.method}`,
      referenceType: 'topup',
      referenceId: razorpay_payment_id,
      metadata: {
        paymentMethod: payment.method,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        debtCleared: true,
        previousBalance: wallet.balance - debtAmount
      }
    });

    // Add extra amount if paid more than debt
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
      message: error.message || 'Failed to verify payment'
    });
  }
};

// Webhook handler for payment updates
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
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body.event;
    const payment = req.body.payload.payment.entity;

    console.log('Razorpay Webhook Event:', event);

    // Handle different events
    switch (event) {
      case 'payment.captured':
        console.log('Payment captured:', payment.id);
        break;
      case 'payment.failed':
        console.log('Payment failed:', payment.id);
        break;
      case 'order.paid':
        console.log('Order paid:', payment.id);
        break;
      default:
        console.log('Unhandled event:', event);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false });
  }
};

module.exports = exports;