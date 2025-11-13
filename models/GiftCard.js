const mongoose = require('mongoose');
const crypto = require('crypto');

const giftCardSchema = new mongoose.Schema({
  // Gift Card Identification
  cardNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  pin: {
    type: String,
    required: true
  },
  
  // Card Details
  amount: {
    type: Number,
    required: true,
    min: 100,
    max: 10000
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD']
  },
  
  // Purchase Information
  purchasedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  purchaseDate: {
    type: Date,
    default: Date.now
  },
  purchaseTransactionId: {
    type: String,
    required: true
  },
  
  // Recipient Information
  recipientName: {
    type: String,
    default: null
  },
  recipientEmail: {
    type: String,
    default: null
  },
  recipientPhone: {
    type: String,
    default: null
  },
  message: {
    type: String,
    default: null,
    maxlength: 500
  },
  
  // Redemption Information
  isRedeemed: {
    type: Boolean,
    default: false
  },
  redeemedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  redeemedDate: {
    type: Date,
    default: null
  },
  redemptionTransactionId: {
    type: String,
    default: null
  },
  
  // Status and Validity
  status: {
    type: String,
    enum: ['active', 'redeemed', 'expired', 'cancelled'],
    default: 'active'
  },
  expiryDate: {
    type: Date,
    required: true
  },
  
  // Design and Theme
  theme: {
    type: String,
    enum: ['birthday', 'anniversary', 'thank_you', 'congratulations', 'holiday', 'general'],
    default: 'general'
  },
  
  // Sharing
  shareCount: {
    type: Number,
    default: 0
  },
  shareHistory: [{
    platform: String,
    sharedAt: Date
  }]
}, {
  timestamps: true
});

// Indexes
giftCardSchema.index({ purchasedBy: 1, status: 1 });
giftCardSchema.index({ redeemedBy: 1 });
giftCardSchema.index({ expiryDate: 1, status: 1 });

// Generate unique card number
giftCardSchema.statics.generateCardNumber = function() {
  const prefix = 'HUSN';
  const randomPart = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `${prefix}-${randomPart.substring(0, 4)}-${randomPart.substring(4, 8)}-${randomPart.substring(8, 12)}`;
};

// Generate 6-digit PIN
giftCardSchema.statics.generatePIN = function() {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Hash PIN before saving
giftCardSchema.pre('save', async function(next) {
  if (this.isModified('pin')) {
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    this.pin = await bcrypt.hash(this.pin, salt);
  }
  next();
});

// Verify PIN
giftCardSchema.methods.verifyPIN = async function(candidatePIN) {
  const bcrypt = require('bcryptjs');
  return await bcrypt.compare(candidatePIN, this.pin);
};

// Check if card is valid for redemption
giftCardSchema.methods.canRedeem = function() {
  const now = new Date();
  
  if (this.isRedeemed) {
    return { valid: false, reason: 'Gift card has already been redeemed' };
  }
  
  if (this.status === 'expired') {
    return { valid: false, reason: 'Gift card has expired' };
  }
  
  if (this.status === 'cancelled') {
    return { valid: false, reason: 'Gift card has been cancelled' };
  }
  
  if (this.expiryDate < now) {
    this.status = 'expired';
    this.save();
    return { valid: false, reason: 'Gift card has expired' };
  }
  
  return { valid: true };
};

// Mark as redeemed
giftCardSchema.methods.markAsRedeemed = async function(userId, transactionId) {
  this.isRedeemed = true;
  this.redeemedBy = userId;
  this.redeemedDate = new Date();
  this.redemptionTransactionId = transactionId;
  this.status = 'redeemed';
  await this.save();
};

// Increment share count
giftCardSchema.methods.recordShare = async function(platform) {
  this.shareCount += 1;
  this.shareHistory.push({
    platform,
    sharedAt: new Date()
  });
  await this.save();
};

// Get card details for sharing (without sensitive info)
giftCardSchema.methods.getShareableDetails = function() {
  return {
    cardNumber: this.cardNumber,
    amount: this.amount,
    currency: this.currency,
    theme: this.theme,
    message: this.message,
    recipientName: this.recipientName,
    expiryDate: this.expiryDate,
    status: this.status
  };
};

// Remove sensitive data when converting to JSON
giftCardSchema.methods.toJSON = function() {
  const cardObject = this.toObject();
  delete cardObject.pin;
  return cardObject;
};

module.exports = mongoose.model('GiftCard', giftCardSchema);