// server/models/UserNotification.js
const mongoose = require('mongoose');

const userNotificationSchema = new mongoose.Schema({
  // User Reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'userType'
  },
  
  userType: {
    type: String,
    enum: ['User', 'Professional'],
    required: true
  },
  
  // Notification Reference
  notificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification',
    default: null
  },
  
  // Notification Content (stored for quick access)
  title: {
    type: String,
    required: true
  },
  
  body: {
    type: String,
    required: true
  },
  
  image: String,
  icon: String,
  
  type: {
    type: String,
    required: true
  },
  
  // Status
  isRead: {
    type: Boolean,
    default: false
  },
  
  readAt: {
    type: Date,
    default: null
  },
  
  isClicked: {
    type: Boolean,
    default: false
  },
  
  clickedAt: {
    type: Date,
    default: null
  },
  
  // Delivery Status
  deliveryStatus: {
    type: String,
    enum: ['pending', 'delivered', 'failed'],
    default: 'pending'
  },
  
  deliveredAt: {
    type: Date,
    default: null
  },
  
  // Action
  action: {
    type: String,
    default: 'none'
  },
  
  actionData: mongoose.Schema.Types.Mixed,
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Metadata
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Indexes
userNotificationSchema.index({ userId: 1, createdAt: -1 });
userNotificationSchema.index({ userId: 1, isRead: 1 });
userNotificationSchema.index({ userType: 1 });
userNotificationSchema.index({ type: 1 });
userNotificationSchema.index({ deliveryStatus: 1 });

// Auto-delete read notifications after 30 days
userNotificationSchema.index({ readAt: 1 }, { 
  expireAfterSeconds: 30 * 24 * 60 * 60,
  partialFilterExpression: { isRead: true }
});

module.exports = mongoose.model('UserNotification', userNotificationSchema);