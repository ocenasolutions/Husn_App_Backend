// server/models/Banner.js
const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Banner title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  image_url: {
    type: String,
    required: [true, 'Banner image is required']
  },
  imageKey: {
    type: String,
    default: null
  },
  link: {
    type: String,
    trim: true,
    default: null
  },
  position: {
    type: String,
    enum: ['top', 'middle', 'bottom'],
    default: 'top'
  },
  targetGender: {
    type: String,
    enum: ['all', 'men', 'women'],
    default: 'all'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
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

// Index for better query performance
bannerSchema.index({ isActive: 1, position: 1, order: 1 });

module.exports = mongoose.model('Banner', bannerSchema);