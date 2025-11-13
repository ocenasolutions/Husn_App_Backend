const Wallet = require('../models/Wallet');
const User = require('../models/User');
const crypto = require('crypto');

// Create wallet for user (auto-created on signup)
exports.createWallet = async (userId) => {
  try {
    const existingWallet = await Wallet.findOne({ userId });
    if (existingWallet) {
      return existingWallet;
    }

    const walletAddress = Wallet.generateWalletAddress(userId);
    
    const wallet = new Wallet({
      userId,
      walletAddress,
      balance: 0
    });

    await wallet.save();
    return wallet;
  } catch (error) {
    console.error('Create wallet error:', error);
    throw error;
  }
};

// Get wallet details
exports.getWallet = async (req, res) => {
  try {
    const userId = req.user._id;

    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      wallet = await exports.createWallet(userId);
    }

    res.json({
      success: true,
      data: {
        walletAddress: wallet.walletAddress,
        balance: wallet.balance,
        currency: wallet.currency,
        isActive: wallet.isActive,
        isLocked: wallet.isLocked,
        dailyLimit: wallet.dailyLimit,
        monthlyLimit: wallet.monthlyLimit,
        totalCredits: wallet.totalCredits,
        totalDebits: wallet.totalDebits
      }
    });
  } catch (error) {
    console.error('Get wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wallet details'
    });
  }
};

// Add money to wallet (Top-up)
exports.addMoney = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, paymentMethod, transactionId } = req.body;

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

    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      wallet = await exports.createWallet(userId);
    }

    // Add transaction
    const transaction = await wallet.addTransaction({
      type: 'credit',
      amount,
      description: `Wallet top-up via ${paymentMethod || 'payment gateway'}`,
      referenceType: 'topup',
      referenceId: transactionId || crypto.randomBytes(16).toString('hex'),
      metadata: {
        paymentMethod,
        transactionId
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
    console.error('Add money error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add money'
    });
  }
};

// Deduct money from wallet
exports.deductMoney = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, description, referenceType, referenceId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }

    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    // Check transaction limits
    const canTransact = wallet.canMakeTransaction(amount);
    if (!canTransact.allowed) {
      return res.status(400).json({
        success: false,
        message: canTransact.reason
      });
    }

    // Add transaction
    const transaction = await wallet.addTransaction({
      type: 'debit',
      amount,
      description: description || 'Payment',
      referenceType: referenceType || 'order',
      referenceId,
      metadata: {}
    });

    res.json({
      success: true,
      message: 'Payment successful',
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
    console.error('Deduct money error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to deduct money'
    });
  }
};

// Process payment from wallet
exports.processWalletPayment = async (userId, amount, description, referenceType, referenceId) => {
  try {
    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    // Check transaction limits
    const canTransact = wallet.canMakeTransaction(amount);
    if (!canTransact.allowed) {
      throw new Error(canTransact.reason);
    }

    // Add transaction
    const transaction = await wallet.addTransaction({
      type: 'debit',
      amount,
      description,
      referenceType,
      referenceId,
      metadata: {}
    });

    return {
      success: true,
      balance: wallet.balance,
      transaction
    };
  } catch (error) {
    throw error;
  }
};

// Refund to wallet
exports.refundToWallet = async (userId, amount, description, referenceId) => {
  try {
    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      wallet = await exports.createWallet(userId);
    }

    const transaction = await wallet.addTransaction({
      type: 'refund',
      amount,
      description,
      referenceType: 'refund',
      referenceId,
      metadata: {}
    });

    return {
      success: true,
      balance: wallet.balance,
      transaction
    };
  } catch (error) {
    throw error;
  }
};

// Get transaction history
exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, type, referenceType, startDate, endDate } = req.query;

    const wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      return res.json({
        success: true,
        data: {
          transactions: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 20,
            totalPages: 0
          }
        }
      });
    }

    const filters = {};
    if (type) filters.type = type;
    if (referenceType) filters.referenceType = referenceType;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    const result = wallet.getTransactionHistory(
      parseInt(page),
      parseInt(limit),
      filters
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get transaction history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction history'
    });
  }
};

// Get wallet balance
exports.getBalance = async (req, res) => {
  try {
    const userId = req.user._id;

    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      wallet = await exports.createWallet(userId);
    }

    res.json({
      success: true,
      data: {
        balance: wallet.balance,
        currency: wallet.currency
      }
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch balance'
    });
  }
};

// Lock wallet (Admin only)
exports.lockWallet = async (req, res) => {
  try {
    const { userId, reason } = req.body;

    if (!req.user.isAdmin()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    await wallet.lockWallet(reason);

    res.json({
      success: true,
      message: 'Wallet locked successfully'
    });
  } catch (error) {
    console.error('Lock wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to lock wallet'
    });
  }
};

// Unlock wallet (Admin only)
exports.unlockWallet = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!req.user.isAdmin()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    await wallet.unlockWallet();

    res.json({
      success: true,
      message: 'Wallet unlocked successfully'
    });
  } catch (error) {
    console.error('Unlock wallet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlock wallet'
    });
  }
};

exports.getDebtStatus = async (req, res) => {
  try {
    const userId = req.user._id;

    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      return res.json({
        success: true,
        hasDebt: false,
        debtAmount: 0,
        message: 'No outstanding debt'
      });
    }

    if (wallet.balance >= 0) {
      return res.json({
        success: true,
        hasDebt: false,
        debtAmount: 0,
        balance: wallet.balance,
        message: 'No outstanding debt'
      });
    }

    const debtAmount = Math.abs(wallet.balance);
    
    res.json({
      success: true,
      hasDebt: true,
      debtAmount: debtAmount,
      message: `You have an outstanding cancellation penalty of ₹${debtAmount.toFixed(2)}`,
      blockedFromServices: true
    });

  } catch (error) {
    console.error('Get debt status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch debt status'
    });
  }
};

// Pay wallet debt
exports.payDebt = async (req, res) => {
  try {
    const userId = req.user._id;
    const { amount, paymentMethod, transactionId } = req.body;

    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: 'Wallet not found'
      });
    }

    if (wallet.balance >= 0) {
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

    // Clear debt by adding money
    const transaction = await wallet.addTransaction({
      type: 'credit',
      amount: debtAmount,
      description: `Debt payment - Cancellation penalty cleared via ${paymentMethod || 'payment gateway'}`,
      referenceType: 'topup',
      referenceId: transactionId || require('crypto').randomBytes(16).toString('hex'),
      metadata: {
        paymentMethod,
        transactionId,
        debtCleared: true,
        previousBalance: wallet.balance
      }
    });

    // If user paid more than debt, add the extra as credit
    if (amount > debtAmount) {
      const extraAmount = amount - debtAmount;
      await wallet.addTransaction({
        type: 'credit',
        amount: extraAmount,
        description: `Wallet top-up after debt clearance`,
        referenceType: 'topup',
        referenceId: transactionId || require('crypto').randomBytes(16).toString('hex'),
        metadata: {
          paymentMethod,
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
    console.error('Pay debt error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process debt payment'
    });
  }
};

// Check if user can book services (no debt blocking)
exports.canBookServices = async (userId) => {
  try {
    let wallet = await Wallet.findOne({ userId });
    
    if (!wallet || wallet.balance >= 0) {
      return { allowed: true, debtAmount: 0 };
    }

    return { 
      allowed: false, 
      debtAmount: Math.abs(wallet.balance),
      message: `Outstanding debt of ₹${Math.abs(wallet.balance).toFixed(2)} must be cleared`
    };

  } catch (error) {
    throw error;
  }
};

module.exports = exports;