// server/models/StockNotification.js
const mongoose = require('mongoose');

const stockNotificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  notified: {
    type: Boolean,
    default: false
  },
  notifiedAt: {
    type: Date,
    default: null
  },
  fcmToken: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Compound index to ensure one notification request per user-product pair
stockNotificationSchema.index({ user: 1, product: 1 }, { unique: true });

// Index for querying pending notifications
stockNotificationSchema.index({ notified: 1, product: 1 });

// Static method to create or update notification request
stockNotificationSchema.statics.requestNotification = async function(userId, productId, fcmToken = null) {
  try {
    // Use findOneAndUpdate with upsert to create or update
    const notification = await this.findOneAndUpdate(
      { user: userId, product: productId },
      { 
        notified: false,
        notifiedAt: null,
        fcmToken: fcmToken,
        updatedAt: new Date()
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true
      }
    );
    
    return notification;
  } catch (error) {
    console.error('Error requesting stock notification:', error);
    throw error;
  }
};

// Static method to mark notifications as sent
stockNotificationSchema.statics.markAsNotified = async function(productId) {
  try {
    const result = await this.updateMany(
      { product: productId, notified: false },
      { 
        notified: true,
        notifiedAt: new Date()
      }
    );
    
    return result;
  } catch (error) {
    console.error('Error marking notifications as sent:', error);
    throw error;
  }
};

// Static method to get pending notifications for a product
stockNotificationSchema.statics.getPendingForProduct = async function(productId) {
  try {
    return await this.find({ 
      product: productId, 
      notified: false 
    }).populate('user', 'name email fcmToken');
  } catch (error) {
    console.error('Error getting pending notifications:', error);
    throw error;
  }
};

// Static method to cancel notification request
stockNotificationSchema.statics.cancelNotification = async function(userId, productId) {
  try {
    return await this.findOneAndDelete({ user: userId, product: productId });
  } catch (error) {
    console.error('Error canceling notification:', error);
    throw error;
  }
};

const StockNotification = mongoose.model('StockNotification', stockNotificationSchema);

module.exports = StockNotification;