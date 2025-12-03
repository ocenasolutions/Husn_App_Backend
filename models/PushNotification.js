// server/models/PushNotification.js
const mongoose = require('mongoose');

const pushNotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  body: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['promotion', 'alert', 'reminder', 'announcement', 'custom'],
    default: 'custom'
  },
  targetAudience: {
    type: String,
    enum: ['all', 'users', 'professionals', 'specific'],
    required: true
  },
  specificUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  imageUrl: {
    type: String
  },
  deepLink: {
    type: String
  },
  priority: {
    type: String,
    enum: ['high', 'normal'],
    default: 'normal'
  },
  scheduledFor: {
    type: Date
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sent', 'failed'],
    default: 'draft'
  },
  sentAt: {
    type: Date
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  deliveryStats: {
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 }
  },
  data: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true
});

pushNotificationSchema.index({ status: 1, scheduledFor: 1 });
pushNotificationSchema.index({ targetAudience: 1 });
pushNotificationSchema.index({ sentBy: 1 });

module.exports = mongoose.model('PushNotification', pushNotificationSchema);