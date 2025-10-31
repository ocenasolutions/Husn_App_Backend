// server/models/Order.js - Fixed OTP generation timing
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  type: {
    type: String,
    enum: ['product', 'service', 'mixed'],
    required: true
  },
  status: {
    type: String,
    enum: ['placed', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'placed'
  },
  // Service OTP - generated immediately for service orders
  serviceOtp: {
    type: String,
    default: null
  },
  serviceStartedAt: {
    type: Date,
    default: null
  },
  serviceOtpVerified: {
    type: Boolean,
    default: false
  },
  // Service items
  serviceItems: [{
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service'
    },
    quantity: {
      type: Number,
      min: 1
    },
    price: {
      type: Number,
      min: 0
    },
    selectedDate: Date,
    selectedTime: String,
    professionalId: String,
    professionalName: String
  }],
  // Product items
  productItems: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    quantity: {
      type: Number,
      min: 1
    },
    price: {
      type: Number,
      min: 0
    }
  }],
  // Address
  address: {
    type: {
      type: String,
      required: true
    },
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true
    },
    zipCode: {
      type: String,
      required: true
    }
  },
  // Payment
  paymentMethod: {
    type: String,
    enum: ['cod', 'online'],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  refundId: String,
  refundAmount: {
    type: Number,
    default: 0
  },
  refundStatus: {
    type: String,
    enum: ['none', 'pending', 'completed', 'failed'],
    default: 'none'
  },
  // Amounts
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  deliveryFee: {
    type: Number,
    default: 0,
    min: 0
  },
  serviceFee: {
    type: Number,
    default: 0,
    min: 0
  },
  tax: {
    type: Number,
    required: true,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  // Tracking
  trackingId: String,
  courier: String,
  estimatedDelivery: Date,
  estimatedServiceTime: String,
  // Status timestamps
  confirmedAt: Date,
  shippedAt: Date,
  outForDeliveryAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancellationReason: String
}, {
  timestamps: true
});

// Static method to generate unique order number
orderSchema.statics.generateOrderNumber = async function() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  let orderNumber = `ORD${timestamp}${random}`;
  
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const exists = await this.findOne({ orderNumber });
    if (!exists) {
      return orderNumber;
    }
    
    const newRandom = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    orderNumber = `ORD${timestamp}${newRandom}`;
    attempts++;
  }
  
  const count = await this.countDocuments();
  return `ORD${timestamp}${(count + 1).toString().padStart(4, '0')}`;
};

// Static method to generate 6-digit OTP
orderSchema.statics.generateServiceOtp = function() {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Pre-save middleware to generate order number
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    try {
      this.orderNumber = await this.constructor.generateOrderNumber();
    } catch (error) {
      console.error('Error generating order number:', error);
      return next(error);
    }
  }
  next();
});

// Generate OTP immediately for NEW service orders
orderSchema.pre('save', function(next) {
  // Only for new documents (not updates)
  if (this.isNew) {
    const hasServices = this.serviceItems && this.serviceItems.length > 0;
    if (hasServices && !this.serviceOtp) {
      this.serviceOtp = this.constructor.generateServiceOtp();
      console.log('âœ… Generated service OTP for new order:', this.serviceOtp);
    }
  }
  next();
});

// Generate tracking ID when shipped
orderSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'shipped' && !this.trackingId) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.trackingId = `TRK${timestamp}${random}`;
  }
  next();
});

// Auto-update payment status for COD when delivered
orderSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'delivered' && this.paymentMethod === 'cod') {
    this.paymentStatus = 'completed';
  }
  next();
});

// Indexes
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ status: 1 });
orderSchema.index({ type: 1 });
orderSchema.index({ createdAt: -1 });

// Virtual for total items
orderSchema.virtual('totalItems').get(function() {
  const serviceItemsCount = this.serviceItems.reduce((total, item) => total + item.quantity, 0);
  const productItemsCount = this.productItems.reduce((total, item) => total + item.quantity, 0);
  return serviceItemsCount + productItemsCount;
});

// Instance methods
orderSchema.methods.canBeCancelled = function() {
  return ['placed', 'confirmed'].includes(this.status);
};

orderSchema.methods.hasServices = function() {
  return this.serviceItems && this.serviceItems.length > 0;
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;