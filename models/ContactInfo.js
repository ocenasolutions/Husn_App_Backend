
// models/ContactInfo.js
const mongoose = require('mongoose');

const contactInfoSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true
  },
  alternatePhone: {
    type: String,
    default: null
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  supportEmail: {
    type: String,
    lowercase: true,
    trim: true
  },
  address: {
    type: String,
    required: true
  },
  city: {
    type: String,
    default: 'Amritsar'
  },
  state: {
    type: String,
    default: 'Punjab'
  },
  pincode: {
    type: String,
    default: '143001'
  },
  country: {
    type: String,
    default: 'India'
  },
  workingHours: {
    type: String,
    default: 'Mon-Sat: 9:00 AM - 8:00 PM'
  },
  emergencyContact: {
    type: String,
    default: null
  },
  whatsappNumber: {
    type: String,
    default: null
  },
  socialMedia: {
    facebook: {
      type: String,
      default: null
    },
    instagram: {
      type: String,
      default: null
    },
    twitter: {
      type: String,
      default: null
    },
    linkedin: {
      type: String,
      default: null
    },
    youtube: {
      type: String,
      default: null
    }
  },
  mapLink: {
    type: String,
    default: null
  },
  websiteUrl: {
    type: String,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ContactInfo', contactInfoSchema);