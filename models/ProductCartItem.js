// server/models/ProductCartItem.js
const mongoose = require('mongoose');

const productCartItemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
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
  }
}, {
  timestamps: true
});

productCartItemSchema.index({ user: 1, product: 1 }, { unique: true });

module.exports = mongoose.model('ProductCartItem', productCartItemSchema);