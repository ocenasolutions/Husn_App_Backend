const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  
  // Locations
  pickupLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: {
      type: String,
      required: true
    }
  },
  dropoffLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    },
    address: {
      type: String,
      required: true
    }
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: [0, 0]
    }
  },
  
  // Ride details
  status: {
    type: String,
    enum: ['requested', 'accepted', 'arrived', 'started', 'completed', 'cancelled'],
    default: 'requested',
    index: true
  },
  fare: {
    type: Number,
    default: 0,
    min: 0
  },
  distance: {
    type: Number, // in kilometers
    default: 0,
    min: 0
  },
  duration: {
    type: Number, // in minutes
    default: 0,
    min: 0
  },
  actualDuration: {
    type: Number, // actual time taken in minutes
    default: null
  },
  rideType: {
    type: String,
    enum: ['economy', 'premium', 'xl'],
    default: 'economy'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'wallet'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  
  // Rating and feedback
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  feedback: {
    type: String,
    default: null,
    maxlength: 500
  },
  
  // Cancellation details
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  cancellationReason: {
    type: String,
    default: null,
    maxlength: 300
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  
  // Timestamps for each status
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  arrivedAt: {
    type: Date,
    default: null
  },
  startedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  
  // Additional metadata
  notes: {
    type: String,
    default: null,
    maxlength: 300
  },
  promoCode: {
    type: String,
    default: null
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  finalFare: {
    type: Number,
    default: 0,
    min: 0
  }
});

// Create geospatial indexes for location queries
rideSchema.index({ 'pickupLocation': '2dsphere' });
rideSchema.index({ 'dropoffLocation': '2dsphere' });
rideSchema.index({ 'currentLocation': '2dsphere' });

// Compound indexes for common queries
rideSchema.index({ user: 1, status: 1, createdAt: -1 });
rideSchema.index({ driver: 1, status: 1, createdAt: -1 });
rideSchema.index({ status: 1, createdAt: -1 });

// Pre-save middleware to calculate final fare
rideSchema.pre('save', function(next) {
  if (this.isModified('fare') || this.isModified('discount')) {
    this.finalFare = Math.max(0, this.fare - this.discount);
  }
  next();
});

// Pre-save middleware to calculate actual duration
rideSchema.pre('save', function(next) {
  if (this.isModified('completedAt') && this.startedAt && this.completedAt) {
    const durationMs = this.completedAt - this.startedAt;
    this.actualDuration = Math.round(durationMs / (1000 * 60)); // Convert to minutes
  }
  next();
});

// Virtual for ride duration in a readable format
rideSchema.virtual('durationFormatted').get(function() {
  if (!this.actualDuration && !this.duration) return 'N/A';
  const mins = this.actualDuration || this.duration;
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
});

// Virtual for ride cost breakdown
rideSchema.virtual('costBreakdown').get(function() {
  return {
    baseFare: this.fare,
    discount: this.discount,
    finalFare: this.finalFare
  };
});

// Method to check if ride is active
rideSchema.methods.isActive = function() {
  return ['requested', 'accepted', 'arrived', 'started'].includes(this.status);
};

// Method to check if ride can be cancelled
rideSchema.methods.canBeCancelled = function() {
  return ['requested', 'accepted', 'arrived'].includes(this.status);
};

// Method to check if ride can be rated
rideSchema.methods.canBeRated = function() {
  return this.status === 'completed' && !this.rating;
};

// Static method to find rides near a location
rideSchema.statics.findNearby = function(longitude, latitude, maxDistance = 5000) {
  return this.find({
    status: 'requested',
    pickupLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance // in meters
      }
    }
  });
};

// Static method to get ride statistics
rideSchema.statics.getStatistics = async function(userId, role = 'user') {
  const query = role === 'driver' ? { driver: userId } : { user: userId };
  
  const stats = await this.aggregate([
    { $match: query },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalFare: { $sum: '$finalFare' },
        avgRating: { $avg: '$rating' }
      }
    }
  ]);
  
  return stats;
};

// Ensure virtuals are included in JSON
rideSchema.set('toJSON', { virtuals: true });
rideSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Ride', rideSchema);