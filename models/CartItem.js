// server/models/CartItem.js
const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  service: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 200
  },
  // Booking details - added during checkout
  selectedDate: {
    type: Date,
    default: null
  },
  selectedTime: {
    type: String,
    default: null
  },
  professionalId: {
    type: String,
    default: null
  },
  professionalName: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

cartItemSchema.index({ user: 1, service: 1 });

module.exports = mongoose.model('CartItem', cartItemSchema);