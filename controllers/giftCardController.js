const GiftCard = require('../models/GiftCard');
const Wallet = require('../models/Wallet');
const User = require('../models/User');
const crypto = require('crypto');

// Purchase a gift card
exports.purchaseGiftCard = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      amount,
      recipientName,
      recipientEmail,
      recipientPhone,
      message,
      theme,
      paymentMethod,
      paymentTransactionId
    } = req.body;

    // Validation
    if (!amount || amount < 100 || amount > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be between ₹100 and ₹10,000'
      });
    }

    // Generate card number and PIN
    const cardNumber = GiftCard.generateCardNumber();
    const pin = GiftCard.generatePIN();
    
    // Store original PIN for response (will be hashed in model)
    const originalPin = pin;

    // Set expiry date (1 year from now)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // Create gift card
    const giftCard = new GiftCard({
      cardNumber,
      pin,
      amount,
      purchasedBy: userId,
      purchaseTransactionId: paymentTransactionId || `GC${Date.now()}`,
      recipientName,
      recipientEmail,
      recipientPhone,
      message,
      theme: theme || 'general',
      expiryDate
    });

    await giftCard.save();

    // Process payment (deduct from wallet or payment gateway)
    if (paymentMethod === 'wallet') {
      try {
        const wallet = await Wallet.findOne({ userId });
        if (!wallet || wallet.balance < amount) {
          await GiftCard.findByIdAndDelete(giftCard._id);
          return res.status(400).json({
            success: false,
            message: 'Insufficient wallet balance'
          });
        }

        await wallet.addTransaction({
          type: 'debit',
          amount,
          description: `Gift card purchase - ${cardNumber}`,
          referenceType: 'giftcard',
          referenceId: giftCard._id.toString(),
          metadata: { cardNumber }
        });
      } catch (walletError) {
        await GiftCard.findByIdAndDelete(giftCard._id);
        throw walletError;
      }
    }

    res.status(201).json({
      success: true,
      message: 'Gift card purchased successfully',
      data: {
        cardNumber,
        pin: originalPin, // Send unhashed PIN only once
        amount,
        expiryDate,
        theme,
        recipientName,
        message,
        shareUrl: `${process.env.APP_URL || 'https://husn.app'}/gift-card/${giftCard._id}`
      }
    });

  } catch (error) {
    console.error('Purchase gift card error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to purchase gift card'
    });
  }
};

// Get gift card details (for viewing/sharing)
exports.getGiftCardDetails = async (req, res) => {
  try {
    const { cardId } = req.params;

    const giftCard = await GiftCard.findById(cardId)
      .populate('purchasedBy', 'name email')
      .populate('redeemedBy', 'name email');

    if (!giftCard) {
      return res.status(404).json({
        success: false,
        message: 'Gift card not found'
      });
    }

    // Only show full details to purchaser or if not redeemed
    const isOwner = req.user && req.user._id.equals(giftCard.purchasedBy._id);
    const isRedeemer = req.user && giftCard.redeemedBy && req.user._id.equals(giftCard.redeemedBy._id);

    const responseData = {
      cardNumber: giftCard.cardNumber,
      amount: giftCard.amount,
      currency: giftCard.currency,
      theme: giftCard.theme,
      message: giftCard.message,
      recipientName: giftCard.recipientName,
      expiryDate: giftCard.expiryDate,
      status: giftCard.status,
      isRedeemed: giftCard.isRedeemed
    };

    if (isOwner || isRedeemer) {
      responseData.purchaseDate = giftCard.purchaseDate;
      responseData.purchasedBy = giftCard.purchasedBy;
      if (giftCard.isRedeemed) {
        responseData.redeemedDate = giftCard.redeemedDate;
        responseData.redeemedBy = giftCard.redeemedBy;
      }
    }

    res.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Get gift card details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gift card details'
    });
  }
};

// Verify gift card (check if valid before claiming)
exports.verifyGiftCard = async (req, res) => {
  try {
    const { cardNumber } = req.body;

    if (!cardNumber) {
      return res.status(400).json({
        success: false,
        message: 'Card number is required'
      });
    }

    const giftCard = await GiftCard.findOne({ cardNumber });

    if (!giftCard) {
      return res.status(404).json({
        success: false,
        message: 'Invalid gift card number'
      });
    }

    const validationResult = giftCard.canRedeem();

    res.json({
      success: validationResult.valid,
      message: validationResult.valid ? 'Gift card is valid' : validationResult.reason,
      data: validationResult.valid ? {
        amount: giftCard.amount,
        currency: giftCard.currency,
        theme: giftCard.theme,
        message: giftCard.message,
        expiryDate: giftCard.expiryDate
      } : null
    });

  } catch (error) {
    console.error('Verify gift card error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify gift card'
    });
  }
};

// Claim/Redeem gift card
exports.claimGiftCard = async (req, res) => {
  try {
    const userId = req.user._id;
    const { cardNumber, pin } = req.body;

    // Validation
    if (!cardNumber || !pin) {
      return res.status(400).json({
        success: false,
        message: 'Card number and PIN are required'
      });
    }

    // Find gift card
    const giftCard = await GiftCard.findOne({ cardNumber });

    if (!giftCard) {
      return res.status(404).json({
        success: false,
        message: 'Invalid gift card number'
      });
    }

    // Check if user is trying to redeem their own gift card
    if (giftCard.purchasedBy.equals(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot redeem a gift card you purchased'
      });
    }

    // Validate card status
    const validationResult = giftCard.canRedeem();
    if (!validationResult.valid) {
      return res.status(400).json({
        success: false,
        message: validationResult.reason
      });
    }

    // Verify PIN
    const isPinValid = await giftCard.verifyPIN(pin);
    if (!isPinValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid PIN'
      });
    }

    // Get or create user's wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      const Wallet = require('../models/Wallet');
      wallet = new Wallet({
        userId,
        walletAddress: Wallet.generateWalletAddress(userId),
        balance: 0
      });
      await wallet.save();
    }

    // Add money to wallet
    const transaction = await wallet.addTransaction({
      type: 'credit',
      amount: giftCard.amount,
      description: `Gift card redeemed - ${cardNumber}`,
      referenceType: 'giftcard',
      referenceId: giftCard._id.toString(),
      metadata: {
        cardNumber,
        purchasedBy: giftCard.purchasedBy.toString()
      }
    });

    // Mark gift card as redeemed
    await giftCard.markAsRedeemed(userId, transaction._id.toString());

    res.json({
      success: true,
      message: 'Gift card claimed successfully!',
      data: {
        amount: giftCard.amount,
        newBalance: wallet.balance,
        cardNumber: giftCard.cardNumber,
        message: giftCard.message,
        transaction: {
          id: transaction._id,
          amount: transaction.amount,
          createdAt: transaction.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Claim gift card error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to claim gift card'
    });
  }
};

// Get user's purchased gift cards
exports.getMyPurchasedGiftCards = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, status } = req.query;

    const query = { purchasedBy: userId };
    if (status) {
      query.status = status;
    }

    const giftCards = await GiftCard.find(query)
      .populate('redeemedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await GiftCard.countDocuments(query);

    res.json({
      success: true,
      data: {
        giftCards,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get purchased gift cards error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch gift cards'
    });
  }
};

// Get user's redeemed gift cards
exports.getMyRedeemedGiftCards = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    const giftCards = await GiftCard.find({ redeemedBy: userId })
      .populate('purchasedBy', 'name email')
      .sort({ redeemedDate: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await GiftCard.countDocuments({ redeemedBy: userId });

    res.json({
      success: true,
      data: {
        giftCards,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get redeemed gift cards error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch redeemed gift cards'
    });
  }
};

// Record gift card share
exports.recordShare = async (req, res) => {
  try {
    const { cardId } = req.params;
    const { platform } = req.body;

    const giftCard = await GiftCard.findById(cardId);

    if (!giftCard) {
      return res.status(404).json({
        success: false,
        message: 'Gift card not found'
      });
    }

    // Only purchaser can share
    if (!req.user._id.equals(giftCard.purchasedBy)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    await giftCard.recordShare(platform);

    res.json({
      success: true,
      message: 'Share recorded successfully'
    });

  } catch (error) {
    console.error('Record share error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record share'
    });
  }
};

// Cancel gift card (only if not redeemed)
exports.cancelGiftCard = async (req, res) => {
  try {
    const userId = req.user._id;
    const { cardId } = req.params;

    const giftCard = await GiftCard.findById(cardId);

    if (!giftCard) {
      return res.status(404).json({
        success: false,
        message: 'Gift card not found'
      });
    }

    // Only purchaser can cancel
    if (!giftCard.purchasedBy.equals(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (giftCard.isRedeemed) {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel a redeemed gift card'
      });
    }

    giftCard.status = 'cancelled';
    await giftCard.save();

    // Refund to wallet if purchased via wallet
    const wallet = await Wallet.findOne({ userId });
    if (wallet) {
      await wallet.addTransaction({
        type: 'refund',
        amount: giftCard.amount,
        description: `Gift card cancellation refund - ${giftCard.cardNumber}`,
        referenceType: 'giftcard',
        referenceId: giftCard._id.toString(),
        metadata: { cardNumber: giftCard.cardNumber }
      });
    }

    res.json({
      success: true,
      message: 'Gift card cancelled and refunded successfully'
    });

  } catch (error) {
    console.error('Cancel gift card error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel gift card'
    });
  }
};

module.exports = exports;