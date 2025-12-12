const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  professional: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Professional',
    required: true
  },
  professionalEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  professionalName: {
    type: String,
    required: true
  },
  
  // Week information
  weekStartDate: {
    type: Date,
    required: true
  },
  weekEndDate: {
    type: Date,
    required: true
  },
  
  // Financial details
  totalRevenue: {
    type: Number,
    required: true,
    default: 0
  },
  platformCommission: {
    type: Number, // 25%
    required: true,
    default: 0
  },
  professionalPayout: {
    type: Number, // 75%
    required: true,
    default: 0
  },
  
  // Service items included in this payout
  serviceItems: [{
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    orderNumber: String,
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service'
    },
    serviceName: String,
    amount: Number,
    quantity: Number,
    completedAt: Date,
    clientName: String,
    clientPhone: String
  }],
  
  // Bank details (snapshot at time of payout)
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String,
    branchName: String
  },
  
  // Payout status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Transfer details
  transferMethod: {
    type: String,
    enum: ['manual', 'automated'],
    default: 'manual'
  },
  transactionId: {
    type: String,
    default: null
  },
  transferredAt: {
    type: Date,
    default: null
  },
  transferredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Notes
  adminNotes: {
    type: String,
    default: null
  },
  failureReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
payoutSchema.index({ professional: 1, weekStartDate: -1 });
payoutSchema.index({ professionalEmail: 1, weekStartDate: -1 });
payoutSchema.index({ status: 1 });
payoutSchema.index({ weekStartDate: 1, weekEndDate: 1 });

const Payout = mongoose.model('Payout', payoutSchema);

module.exports = Payout;