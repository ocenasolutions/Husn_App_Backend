// server/models/Order.js - FIXED: Address includes phone number
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // User reference
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Order identification
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },

  // Order type
  type: {
    type: String,
    enum: ['product', 'service', 'mixed'],
    required: true
  },

  // Order status
  status: {
    type: String,
    enum: [
      'placed',
      'confirmed',
      'preparing',
      'shipped',
      'out_for_delivery',
      'in_progress',
      'delivered',
      'completed',
      'cancelled',
      'rejected'
    ],
    default: 'placed'
  },

  // Product items
  productItems: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: false
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true,
      min: 0
    }
  }],

  serviceItems: [{
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: false
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    selectedDate: {
      type: Date,
      required: false
    },
    selectedTime: {
      type: String,
      required: false
    },
    professionalEmail: {
      type: String,
      required: false,
      lowercase: true,
      trim: true
    },
    professionalName: {
      type: String,
      required: false
    },
    professionalPhone: {
      type: String,
      required: false
    }
  }],

  // ✅ FIXED: Delivery/Service address with contact information
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
    },
    // ✅ NEW: Contact information for delivery
    phoneNumber: {
      type: String,
      required: false
    },
    contactName: {
      type: String,
      required: false
    },
    // Coordinates at root level for initial address
    latitude: {
      type: Number,
      required: false
    },
    longitude: {
      type: Number,
      required: false
    },
    fullAddress: {
      type: String,
      required: false
    }
  },

  // Real-time user location (for service orders)
  userLiveLocation: {
    type: {
      type: String,
      enum: ['Point'],
      required: false
    },
    coordinates: {
      type: [Number],
      required: false,
      validate: {
        validator: function(v) {
          return !v || (Array.isArray(v) && v.length === 2);
        },
        message: 'Coordinates must be an array of [longitude, latitude]'
      }
    },
    address: {
      type: String,
      required: false
    },
    lastUpdated: {
      type: Date,
      required: false
    }
  },

  // Real-time professional location (for service orders)
  professionalLiveLocation: {
    type: {
      type: String,
      enum: ['Point'],
      required: false
    },
    coordinates: {
      type: [Number],
      required: false,
      validate: {
        validator: function(v) {
          return !v || (Array.isArray(v) && v.length === 2);
        },
        message: 'Coordinates must be an array of [longitude, latitude]'
      }
    },
    lastUpdated: {
      type: Date,
      required: false
    }
  },

  // Live location tracking status
  isLiveLocationActive: {
    type: Boolean,
    default: false
  },

  liveLocationStartedAt: {
    type: Date,
    required: false
  },

  // Payment details
  paymentMethod: {
    type: String,
    enum: ['cod', 'online','wallet'],
    required: true
  },

  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },

  // Pricing breakdown
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
    default: 0,
    min: 0
  },

  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },

  // Service-specific fields
  serviceOtp: {
    type: String,
    required: false
  },

  serviceOtpVerified: {
    type: Boolean,
    default: false
  },

  serviceStartedAt: {
    type: Date,
    required: false
  },

  estimatedServiceTime: {
    type: Date,
    required: false
  },

  // Delivery-specific fields
  courier: {
    type: String,
    required: false
  },

  trackingNumber: {
    type: String,
    required: false
  },

  estimatedDelivery: {
    type: Date,
    required: false
  },

  // Status timestamps
  confirmedAt: {
    type: Date,
    required: false
  },

  shippedAt: {
    type: Date,
    required: false
  },

  outForDeliveryAt: {
    type: Date,
    required: false
  },

  deliveredAt: {
    type: Date,
    required: false
  },

  completedAt: {
    type: Date,
    required: false
  },

  cancellationPenalty: {
    type: Number,
    default: 0,
    min: 0
  },

  cancellationPenaltyPaid: {
    type: Boolean,
    default: false
  },

  cancellationDebtAmount: {
    type: Number,
    default: 0,
    min: 0
  },

  cancelledAt: {
    type: Date,
    required: false
  },

  cancellationReason: {
    type: String,
    required: false
  },

  cancellationPenaltyApplied: {
    type: Boolean,
    default: false
  },

  refundStatus: {
    type: String,
    enum: ['requested', 'approved', 'completed', 'rejected'],
    required: false
  },

  refundReason: {
    type: String,
    required: false
  },

  refundDescription: {
    type: String,
    required: false
  },

  refundType: {
    type: String,
    enum: ['wallet', 'original_payment'],
    default: 'wallet'
  },

  refundAmount: {
    type: Number,
    required: false
  },

  refundRequestedAt: {
    type: Date,
    required: false
  },

  refundCompletedAt: {
    type: Date,
    required: false
  },

  refundRejectedAt: {
    type: Date,
    required: false
  },

  refundProcessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },

  refundAdminNotes: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

// Indexes for better query performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ type: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ isLiveLocationActive: 1 });
orderSchema.index({ refundStatus: 1, refundRequestedAt: -1 });

// Conditional geospatial indexes
orderSchema.index(
  { 'userLiveLocation': '2dsphere' },
  { 
    sparse: true,
    partialFilterExpression: {
      'userLiveLocation.coordinates': { $exists: true, $ne: null }
    }
  }
);

orderSchema.index(
  { 'professionalLiveLocation': '2dsphere' },
  { 
    sparse: true,
    partialFilterExpression: {
      'professionalLiveLocation.coordinates': { $exists: true, $ne: null }
    }
  }
);

// Virtual for checking if order has services
orderSchema.methods.hasServices = function() {
  return this.serviceItems && this.serviceItems.length > 0;
};

// Virtual for checking if order has products
orderSchema.methods.hasProducts = function() {
  return this.productItems && this.productItems.length > 0;
};

// Virtual for checking if professional is assigned
orderSchema.methods.isProfessionalAssigned = function(professionalEmail) {
  if (!this.hasServices()) return false;
  return this.serviceItems.some(
    item => item.professionalEmail === professionalEmail.toLowerCase()
  );
};

// Static method to generate unique order number
orderSchema.statics.generateOrderNumber = async function() {
  const count = await this.countDocuments();
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `ORD${timestamp}${random}`;
};

// Pre-save middleware to generate OTP for service orders
orderSchema.pre('save', function(next) {
  // Generate OTP only for new service orders that don't have one
  if (this.isNew && this.hasServices() && !this.serviceOtp) {
    this.serviceOtp = Math.floor(100000 + Math.random() * 900000).toString();
  }
  
  // Remove empty GeoJSON objects before saving
  if (this.userLiveLocation && 
      (!this.userLiveLocation.coordinates || this.userLiveLocation.coordinates.length === 0)) {
    this.userLiveLocation = undefined;
  }
  
  if (this.professionalLiveLocation && 
      (!this.professionalLiveLocation.coordinates || this.professionalLiveLocation.coordinates.length === 0)) {
    this.professionalLiveLocation = undefined;
  }
  
  next();
});

// Method to update user location with proper GeoJSON structure
orderSchema.methods.updateUserLocation = function(latitude, longitude, address) {
  this.userLiveLocation = {
    type: 'Point',
    coordinates: [parseFloat(longitude), parseFloat(latitude)],
    address: address || null,
    lastUpdated: new Date()
  };
};

// Method to update professional location with proper GeoJSON structure
orderSchema.methods.updateProfessionalLocation = function(latitude, longitude) {
  this.professionalLiveLocation = {
    type: 'Point',
    coordinates: [parseFloat(longitude), parseFloat(latitude)],
    lastUpdated: new Date()
  };
};

// Method to start live tracking
orderSchema.methods.startLiveTracking = function() {
  this.isLiveLocationActive = true;
  if (!this.liveLocationStartedAt) {
    this.liveLocationStartedAt = new Date();
  }
};

// Method to stop live tracking
orderSchema.methods.stopLiveTracking = function() {
  this.isLiveLocationActive = false;
};

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;