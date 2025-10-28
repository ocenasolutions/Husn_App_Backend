// server/models/ProfessionalLocation.js
const mongoose = require('mongoose');

const professionalLocationSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  professionalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Customer's destination address
  customerAddress: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    fullAddress: String
  },
  // Professional's current location
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  // Starting point when tracking began
  startLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  // Location history (breadcrumb trail)
  locationHistory: [{
    coordinates: {
      type: [Number],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Tracking status
  status: {
    type: String,
    enum: ['on_the_way', 'reached', 'cancelled'],
    default: 'on_the_way'
  },
  // Is tracking currently active
  isActive: {
    type: Boolean,
    default: true
  },
  // Estimated distance in meters
  estimatedDistance: {
    type: Number,
    default: null
  },
  // Estimated time in minutes
  estimatedTime: {
    type: Number,
    default: null
  },
  // Start and end times
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date,
    default: null
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create geospatial indexes for location queries
professionalLocationSchema.index({ currentLocation: '2dsphere' });
professionalLocationSchema.index({ customerAddress: '2dsphere' });
professionalLocationSchema.index({ orderId: 1, professionalId: 1 });
professionalLocationSchema.index({ isActive: 1 });

// Calculate distance between current location and customer address
professionalLocationSchema.methods.calculateDistance = function() {
  const R = 6371e3; // Earth radius in meters
  const lat1 = this.currentLocation.coordinates[1] * Math.PI / 180;
  const lat2 = this.customerAddress.coordinates[1] * Math.PI / 180;
  const deltaLat = (this.customerAddress.coordinates[1] - this.currentLocation.coordinates[1]) * Math.PI / 180;
  const deltaLon = (this.customerAddress.coordinates[0] - this.currentLocation.coordinates[0]) * Math.PI / 180;

  const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
          Math.cos(lat1) * Math.cos(lat2) *
          Math.sin(deltaLon/2) * Math.sin(deltaLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
};

// Estimate time based on average speed (assuming 30 km/h in city)
professionalLocationSchema.methods.calculateEstimatedTime = function() {
  const distanceInKm = this.calculateDistance() / 1000;
  const averageSpeedKmh = 30;
  return Math.ceil((distanceInKm / averageSpeedKmh) * 60); // Time in minutes
};

// Pre-save middleware to update distance and time
professionalLocationSchema.pre('save', function(next) {
  if (this.isModified('currentLocation') && this.isActive) {
    this.estimatedDistance = Math.round(this.calculateDistance());
    this.estimatedTime = this.calculateEstimatedTime();
    this.lastUpdated = new Date();
  }
  next();
});

const ProfessionalLocation = mongoose.model('ProfessionalLocation', professionalLocationSchema);

module.exports = ProfessionalLocation;