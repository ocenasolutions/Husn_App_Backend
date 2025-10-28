// server/models/Professional.js
const mongoose = require('mongoose');

const professionalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },
  profilePicture: {
    type: String,
    default: null
  },
  // Services this professional provides
  services: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],
  specialization: {
    type: String,
    trim: true
  },
  experience: {
    type: Number, // in years
    min: 0
  },
  bio: {
    type: String,
    maxlength: 500
  },
  // Ratings
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  // Availability
  isAvailable: {
    type: Boolean,
    default: true
  },
  workingHours: {
    start: String, // e.g., "09:00"
    end: String    // e.g., "18:00"
  },
  // Statistics
  totalOrders: {
    type: Number,
    default: 0
  },
  completedOrders: {
    type: Number,
    default: 0
  },
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Indexes
professionalSchema.index({ name: 1 });
professionalSchema.index({ email: 1 });
professionalSchema.index({ services: 1 });
professionalSchema.index({ rating: -1 });
professionalSchema.index({ status: 1 });

const Professional = mongoose.model('Professional', professionalSchema);

module.exports = Professional;