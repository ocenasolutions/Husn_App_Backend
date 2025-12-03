// server/models/DeviceToken.js
const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  platform: {
    type: String,
    enum: ['android', 'ios'],
    default: 'android'
  },
  deviceInfo: {
    model: String,
    brand: String,
    osVersion: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

deviceTokenSchema.index({ user: 1, token: 1 });
deviceTokenSchema.index({ isActive: 1 });
deviceTokenSchema.index({ lastUsed: 1 });

// Update lastUsed on save
deviceTokenSchema.pre('save', function(next) {
  this.lastUsed = new Date();
  next();
});

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);