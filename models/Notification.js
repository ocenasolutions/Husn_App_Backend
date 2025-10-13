// server/models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['order', 'booking', 'low_stock', 'out_of_stock', 'system'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  // Related entity information
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  relatedModel: {
    type: String,
    enum: ['Order', 'Booking', 'Product']
  },
  // Additional data for quick access
  metadata: {
    orderNumber: String,
    bookingNumber: String,
    productName: String,
    stockLevel: Number,
    customerName: String,
    amount: Number
  },
  // Notification status
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,
  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  // For admin notifications
  recipient: {
    type: String,
    enum: ['admin', 'user', 'all_admins'],
    default: 'admin'
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Track if push notification was sent
  pushSent: {
    type: Boolean,
    default: false
  },
  pushSentAt: Date,
  // Auto-expire old notifications
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  }
}, {
  timestamps: true
});

// Indexes for better performance
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ relatedId: 1, relatedModel: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Static method to create order notification
notificationSchema.statics.createOrderNotification = async function(order) {
  try {
    const notification = new this({
      type: 'order',
      title: '🛒 New Order Received',
      message: `New order #${order.orderNumber} placed by ${order.user?.name || 'Customer'} for ₹${order.totalAmount}`,
      relatedId: order._id,
      relatedModel: 'Order',
      metadata: {
        orderNumber: order.orderNumber,
        customerName: order.user?.name || 'Unknown',
        amount: order.totalAmount
      },
      priority: order.totalAmount > 5000 ? 'high' : 'medium',
      recipient: 'admin'
    });
    
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating order notification:', error);
    throw error;
  }
};

// Static method to create booking notification
notificationSchema.statics.createBookingNotification = async function(booking) {
  try {
    const serviceNames = booking.services
      .map(s => s.service?.name || 'Service')
      .join(', ');
    
    const notification = new this({
      type: 'booking',
      title: '📅 New Service Booking',
      message: `New booking #${booking.bookingNumber} by ${booking.customerInfo.name} for ${serviceNames} - ₹${booking.totalAmount}`,
      relatedId: booking._id,
      relatedModel: 'Booking',
      metadata: {
        bookingNumber: booking.bookingNumber,
        customerName: booking.customerInfo.name,
        amount: booking.totalAmount
      },
      priority: 'high',
      recipient: 'admin'
    });
    
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating booking notification:', error);
    throw error;
  }
};

// Static method to create low stock notification
notificationSchema.statics.createLowStockNotification = async function(product) {
  try {
    // Check if similar notification exists in last 24 hours to avoid spam
    const existingNotification = await this.findOne({
      type: 'low_stock',
      relatedId: product._id,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    if (existingNotification) {
      return existingNotification;
    }
    
    const notification = new this({
      type: 'low_stock',
      title: '⚠️ Low Stock Alert',
      message: `${product.name} is running low on stock. Only ${product.stock} units remaining.`,
      relatedId: product._id,
      relatedModel: 'Product',
      metadata: {
        productName: product.name,
        stockLevel: product.stock
      },
      priority: product.stock === 0 ? 'urgent' : product.stock <= 3 ? 'high' : 'medium',
      recipient: 'admin'
    });
    
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating low stock notification:', error);
    throw error;
  }
};

// Static method to create out of stock notification
notificationSchema.statics.createOutOfStockNotification = async function(product) {
  try {
    // Check if similar notification exists in last 24 hours
    const existingNotification = await this.findOne({
      type: 'out_of_stock',
      relatedId: product._id,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });
    
    if (existingNotification) {
      return existingNotification;
    }
    
    const notification = new this({
      type: 'out_of_stock',
      title: '🚫 Out of Stock Alert',
      message: `${product.name} is now out of stock. Restock immediately!`,
      relatedId: product._id,
      relatedModel: 'Product',
      metadata: {
        productName: product.name,
        stockLevel: 0
      },
      priority: 'urgent',
      recipient: 'admin'
    });
    
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating out of stock notification:', error);
    throw error;
  }
};

// Instance method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

// Static method to mark all as read
notificationSchema.statics.markAllAsRead = async function() {
  return this.updateMany(
    { read: false },
    { $set: { read: true, readAt: new Date() } }
  );
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = async function() {
  return this.countDocuments({ read: false });
};

// Virtual for time ago
notificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = Math.floor((now - this.createdAt) / 1000); // seconds

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  
  return this.createdAt.toLocaleDateString('en-IN', { 
    month: 'short', 
    day: 'numeric' 
  });
});

notificationSchema.set('toJSON', { virtuals: true });
notificationSchema.set('toObject', { virtuals: true });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;