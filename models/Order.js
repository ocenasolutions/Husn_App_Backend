// server/models/Order.js - Enhanced with Razorpay payment fields
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
  // Razorpay payment details
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  razorpaySignature: {
    type: String,
    default: null
  },
  // Refund details
  refundId: {
    type: String,
    default: null
  },
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

// Pre-save middleware to generate order number if not set
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

// Generate tracking ID when status changes to shipped
orderSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'shipped' && !this.trackingId) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.trackingId = `TRK${timestamp}${random}`;
  }
  next();
});

// Auto-update payment status for COD orders when delivered
orderSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'delivered' && this.paymentMethod === 'cod') {
    this.paymentStatus = 'completed';
  }
  next();
});

// Indexes for better performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ status: 1 });
orderSchema.index({ type: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ razorpayOrderId: 1 });
orderSchema.index({ razorpayPaymentId: 1 });

// Virtual for order age in days
orderSchema.virtual('orderAge').get(function() {
  const ageInMs = Date.now() - this.createdAt.getTime();
  return Math.floor(ageInMs / (1000 * 60 * 60 * 24));
});

// Virtual for total items count
orderSchema.virtual('totalItems').get(function() {
  const serviceItemsCount = this.serviceItems.reduce((total, item) => total + item.quantity, 0);
  const productItemsCount = this.productItems.reduce((total, item) => total + item.quantity, 0);
  return serviceItemsCount + productItemsCount;
});

// Instance method to check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  return ['placed', 'confirmed'].includes(this.status);
};

// Instance method to check if order can be refunded
orderSchema.methods.canBeRefunded = function() {
  return this.paymentMethod === 'online' && 
         this.paymentStatus === 'completed' && 
         this.razorpayPaymentId &&
         this.refundStatus === 'none';
};

// Static method to get orders summary for user
orderSchema.statics.getOrdersSummary = async function(userId) {
  try {
    const summary = await this.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$totalAmount' }
        }
      }
    ]);

    const result = {
      total: 0,
      totalAmount: 0,
      byStatus: {}
    };

    summary.forEach(item => {
      result.total += item.count;
      result.totalAmount += item.totalAmount;
      result.byStatus[item._id] = {
        count: item.count,
        totalAmount: item.totalAmount
      };
    });

    return result;
  } catch (error) {
    console.error('Error getting orders summary:', error);
    throw error;
  }
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;