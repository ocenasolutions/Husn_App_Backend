// server/models/Professional.js
const mongoose = require('mongoose');

const professionalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Professional name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
  },
  role: {
    type: String,
    default: 'Professional',
    trim: true
  },
  specialization: [{
    type: String,
    trim: true
  }],
  services: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service'
  }],
  experience: {
    type: Number,
    min: [0, 'Experience cannot be negative'],
    default: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalBookings: {
    type: Number,
    default: 0,
    min: 0
  },
  profileImage: {
    type: String,
    default: null
  },
  imageKey: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    trim: true,
    maxlength: [500, 'Bio cannot exceed 500 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  availableSlots: [{
    day: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    },
    startTime: String,
    endTime: String
  }],
  certifications: [{
    name: String,
    issuedBy: String,
    issuedDate: Date
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Index for better search performance
professionalSchema.index({ name: 'text', specialization: 1 });
professionalSchema.index({ isActive: 1, isAvailable: 1 });
professionalSchema.index({ services: 1 });

// Ensure virtuals are included in JSON output
professionalSchema.set('toJSON', { virtuals: true });
professionalSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Professional', professionalSchema);