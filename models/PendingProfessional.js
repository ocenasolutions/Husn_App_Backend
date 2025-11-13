// server/models/PendingProfessional.js
const mongoose = require('mongoose');

const pendingProfessionalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    default: null
  },
  skills: [{
    category: {
      type: String,
      required: true,
      trim: true
    },
    subcategories: [{
      type: String,
      trim: true
    }]
  }],
  specialization: {
    type: String,
    required: true,
    trim: true
  },
  experience: {
    type: Number,
    required: true,
    min: 0
  },
  bio: {
    type: String,
    required: true,
    maxlength: 500
  },
  availableDays: [{
    type: String,
    enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    required: true
  }],
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
    default: null
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
pendingProfessionalSchema.index({ email: 1 });
pendingProfessionalSchema.index({ userId: 1 });
pendingProfessionalSchema.index({ verificationStatus: 1 });
pendingProfessionalSchema.index({ submittedAt: -1 });

const PendingProfessional = mongoose.model('PendingProfessional', pendingProfessionalSchema);

module.exports = PendingProfessional;