const mongoose = require('mongoose');
const crypto = require('crypto');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['credit', 'debit', 'refund'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true
  },
  referenceType: {
    type: String,
    enum: ['order', 'booking', 'refund', 'topup', 'withdrawal', 'giftcard'],
    required: true
  },
  referenceId: {
    type: String,
    default: null
  },
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'completed'
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

const walletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0,
    required: true
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR', 'USD']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  lockReason: {
    type: String,
    default: null
  },
  transactions: [transactionSchema],
  dailyLimit: {
    type: Number,
    default: 50000 
  },
  monthlyLimit: {
    type: Number,
    default: 200000 // ₹2,00,000 monthly limit
  },
  lastTopUpDate: {
    type: Date,
    default: null
  },
  totalCredits: {
    type: Number,
    default: 0
  },
  totalDebits: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Generate unique wallet address
walletSchema.statics.generateWalletAddress = function(userId) {
  const prefix = 'HUSN';
  const hash = crypto.createHash('sha256')
    .update(`${userId}-${Date.now()}-${crypto.randomBytes(16).toString('hex')}`)
    .digest('hex')
    .substring(0, 12)
    .toUpperCase();
  return `${prefix}${hash}`;
};

// Add transaction method
walletSchema.methods.addTransaction = async function(transactionData) {
  const { type, amount, description, referenceType, referenceId, metadata } = transactionData;
  
  if (this.isLocked) {
    throw new Error(`Wallet is locked: ${this.lockReason || 'Unknown reason'}`);
  }

  const balanceBefore = this.balance;
  let balanceAfter = balanceBefore;

  if (type === 'credit' || type === 'refund') {
    balanceAfter = balanceBefore + amount;
    this.totalCredits += amount;
  } else if (type === 'debit') {
    if (balanceBefore < amount) {
      throw new Error('Insufficient balance');
    }
    balanceAfter = balanceBefore - amount;
    this.totalDebits += amount;
  }

  const transaction = {
    type,
    amount,
    description,
    referenceType,
    referenceId,
    balanceBefore,
    balanceAfter,
    status: 'completed',
    metadata: metadata || {}
  };

  this.transactions.push(transaction);
  this.balance = balanceAfter;
  
  await this.save();
  
  return this.transactions[this.transactions.length - 1];
};

// Get transaction history with pagination
walletSchema.methods.getTransactionHistory = function(page = 1, limit = 20, filters = {}) {
  let transactions = [...this.transactions].reverse();
  
  // Apply filters
  if (filters.type) {
    transactions = transactions.filter(t => t.type === filters.type);
  }
  if (filters.referenceType) {
    transactions = transactions.filter(t => t.referenceType === filters.referenceType);
  }
  if (filters.startDate) {
    transactions = transactions.filter(t => new Date(t.createdAt) >= new Date(filters.startDate));
  }
  if (filters.endDate) {
    transactions = transactions.filter(t => new Date(t.createdAt) <= new Date(filters.endDate));
  }

  const total = transactions.length;
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedTransactions = transactions.slice(startIndex, endIndex);

  return {
    transactions: paginatedTransactions,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
};

// Check if user can make a transaction based on limits
walletSchema.methods.canMakeTransaction = function(amount) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayTransactions = this.transactions.filter(t => {
    const txDate = new Date(t.createdAt);
    txDate.setHours(0, 0, 0, 0);
    return txDate.getTime() === today.getTime() && t.type === 'debit';
  });
  
  const todayTotal = todayTransactions.reduce((sum, t) => sum + t.amount, 0);
  
  if (todayTotal + amount > this.dailyLimit) {
    return { allowed: false, reason: 'Daily limit exceeded' };
  }
  
  if (this.balance < amount) {
    return { allowed: false, reason: 'Insufficient balance' };
  }
  
  return { allowed: true };
};

// Lock wallet
walletSchema.methods.lockWallet = async function(reason) {
  this.isLocked = true;
  this.lockReason = reason;
  await this.save();
};

// Unlock wallet
walletSchema.methods.unlockWallet = async function() {
  this.isLocked = false;
  this.lockReason = null;
  await this.save();
};

module.exports = mongoose.model('Wallet', walletSchema);