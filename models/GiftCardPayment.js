// models/GiftCardPayment.js
const mongoose = require('mongoose');

const giftCardPaymentSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 100,
    max: 10000
  },
  paymentMethod: {
    type: String,
    enum: ['wallet', 'upi', 'card', 'razorpay'],
    required: true
  },
  purpose: {
    type: String,
    default: 'gift_card'
  },
  status: {
    type: String,
    enum: ['initiated', 'pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'initiated',
    index: true
  },
  // Razorpay specific fields
  razorpayOrderId: {
    type: String,
    sparse: true,
    index: true
  },
  razorpayPaymentId: {
    type: String,
    sparse: true
  },
  razorpaySignature: {
    type: String
  },
  // Gift card metadata
  metadata: {
    recipientName: String,
    recipientEmail: String,
    recipientPhone: String,
    message: String,
    theme: {
      type: String,
      enum: ['birthday', 'anniversary', 'thank_you', 'congratulations', 'holiday', 'general'],
      default: 'general'
    }
  },
  // Payment gateway response
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed
  },
  // Refund details
  refund: {
    amount: Number,
    reason: String,
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed']
    },
    refundId: String,
    initiatedAt: Date,
    completedAt: Date
  },
  // Error tracking
  errorMessage: String,
  errorCode: String,
  // Timestamps
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  // IP and device info for security
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true
});

// Indexes for better query performance
giftCardPaymentSchema.index({ userId: 1, createdAt: -1 });
giftCardPaymentSchema.index({ status: 1, createdAt: -1 });
giftCardPaymentSchema.index({ transactionId: 1 });
giftCardPaymentSchema.index({ razorpayOrderId: 1 }, { sparse: true });

// Methods
giftCardPaymentSchema.methods.markAsCompleted = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

giftCardPaymentSchema.methods.markAsFailed = function(errorMessage, errorCode) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  this.errorCode = errorCode;
  return this.save();
};

giftCardPaymentSchema.methods.initiateRefund = function(amount, reason) {
  this.refund = {
    amount: amount || this.amount,
    reason,
    status: 'pending',
    initiatedAt: new Date()
  };
  this.status = 'refunded';
  return this.save();
};

// Static methods
giftCardPaymentSchema.statics.generateTransactionId = function() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 9);
  return `GIFTPAY_${timestamp}_${randomStr}`.toUpperCase();
};

giftCardPaymentSchema.statics.getPaymentStats = async function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
};

const GiftCardPayment = mongoose.model('GiftCardPayment', giftCardPaymentSchema);

module.exports = GiftCardPayment;