// server/controllers/stockNotificationController.js
const StockNotification = require('../models/StockNotification');
const Product = require('../models/Product');
const Wishlist = require('../models/Wishlist');

// Request notification when product is back in stock
exports.requestNotification = async (req, res) => {
  try {
    const { productId, fcmToken } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if product is already in stock
    if (product.stock > 0 && product.stockStatus !== 'out-of-stock') {
      return res.status(400).json({
        success: false,
        message: 'Product is already in stock'
      });
    }

    // Verify product is in user's wishlist
    const wishlistItem = await Wishlist.findOne({
      user: req.user._id,
      product: productId
    });

    if (!wishlistItem) {
      return res.status(400).json({
        success: false,
        message: 'Product must be in your wishlist to receive notifications'
      });
    }

    // Create or update notification request
    const notification = await StockNotification.requestNotification(
      req.user._id,
      productId,
      fcmToken
    );

    res.json({
      success: true,
      message: 'You will be notified when this product is back in stock',
      data: notification
    });

  } catch (error) {
    console.error('Request notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to request notification',
      error: error.message
    });
  }
};

// Cancel notification request
exports.cancelNotification = async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await StockNotification.cancelNotification(
      req.user._id,
      productId
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Notification request not found'
      });
    }

    res.json({
      success: true,
      message: 'Notification request cancelled'
    });

  } catch (error) {
    console.error('Cancel notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel notification',
      error: error.message
    });
  }
};

// Check if user has requested notification for a product
exports.checkNotificationStatus = async (req, res) => {
  try {
    const { productId } = req.params;

    const notification = await StockNotification.findOne({
      user: req.user._id,
      product: productId,
      notified: false
    });

    res.json({
      success: true,
      data: {
        hasRequested: !!notification,
        notification: notification
      }
    });

  } catch (error) {
    console.error('Check notification status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check notification status',
      error: error.message
    });
  }
};

// Get all notification requests for the user
exports.getUserNotificationRequests = async (req, res) => {
  try {
    const notifications = await StockNotification.find({
      user: req.user._id,
      notified: false
    })
      .populate('product')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: notifications
    });

  } catch (error) {
    console.error('Get user notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification requests',
      error: error.message
    });
  }
};