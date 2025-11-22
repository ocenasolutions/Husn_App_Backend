// server/models/BorzoDelivery.js
const mongoose = require('mongoose');

const borzoDeliverySchema = new mongoose.Schema({
  // Reference to main order
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
  },

  borzoOrderId: {
    type: String,
    unique: true,
    sparse: true,
  },

  status: {
    type: String,
    enum: [
      'pending_admin_approval',
      'price_calculated',
      'creating',
      'new',
      'available',
      'active',
      'courier_assigned',
      'pickup_arrived',
      'picked_up',
      'delivering',
      'delivered',
      'cancelled',
      'failed',
    ],
    default: 'pending_admin_approval',
  },

  // Pickup details
  pickupAddress: {
    address: {
      type: String,
      required: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    contactName: {
      type: String,
      required: true,
    },
    contactPhone: {
      type: String,
      required: true,
    },
  },

  // Drop details
  dropAddress: {
    address: {
      type: String,
      required: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    contactName: {
      type: String,
      required: true,
    },
    contactPhone: {
      type: String,
      required: true,
    },
  },

  // Pricing details
  pricing: {
    estimatedPrice: {
      type: Number,
      default: 0,
    },
    finalPrice: {
      type: Number,
      default: 0,
    },
    distance: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
  },

  // Courier details
  courier: {
    name: String,
    phone: String,
    photo: String,
    latitude: Number,
    longitude: Number,
  },

  // Tracking
  trackingUrl: {
    type: String,
  },

  // Timestamps
  estimatedPickupTime: {
    type: Date,
  },

  estimatedDeliveryTime: {
    type: Date,
  },

  actualPickupTime: {
    type: Date,
  },

  actualDeliveryTime: {
    type: Date,
  },

  // Admin approval
  adminApproved: {
    type: Boolean,
    default: false,
  },

  adminApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },

  adminApprovedAt: {
    type: Date,
  },

  // Cancellation
  cancellationReason: {
    type: String,
  },

  cancelledAt: {
    type: Date,
  },

  // Error tracking
  errors: [{
    message: String,
    timestamp: {
      type: Date,
      default: Date.now,
    },
    details: mongoose.Schema.Types.Mixed,
  }],

  // Item details
  itemDescription: {
    type: String,
    required: true,
  },

  // Payment
  paymentMethod: {
    type: String,
    enum: ['cod', 'online', 'wallet'],
    required: true,
  },

  codAmount: {
    type: Number,
    default: 0,
  },

  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },

}, {
  timestamps: true,
});

// Indexes
borzoDeliverySchema.index({ order: 1 });
borzoDeliverySchema.index({ borzoOrderId: 1 });
borzoDeliverySchema.index({ status: 1 });
borzoDeliverySchema.index({ adminApproved: 1 });
borzoDeliverySchema.index({ createdAt: -1 });

// Methods
borzoDeliverySchema.methods.approve = function(adminId) {
  this.adminApproved = true;
  this.adminApprovedBy = adminId;
  this.adminApprovedAt = new Date();
  this.status = 'price_calculated';
};

borzoDeliverySchema.methods.updateCourier = function(courierData) {
  this.courier = {
    name: courierData.name,
    phone: courierData.phone,
    photo: courierData.photo,
    latitude: courierData.latitude,
    longitude: courierData.longitude,
  };
};

borzoDeliverySchema.methods.markDelivered = function() {
  this.status = 'delivered';
  this.actualDeliveryTime = new Date();
};

borzoDeliverySchema.methods.addError = function(errorMessage, errorDetails) {
  this.errors.push({
    message: errorMessage,
    details: errorDetails,
    timestamp: new Date(),
  });
};

const BorzoDelivery = mongoose.model('BorzoDelivery', borzoDeliverySchema);

module.exports = BorzoDelivery;