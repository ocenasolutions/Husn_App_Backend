const mongoose = require('mongoose');

const salonSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Salon name is required'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  address: {
    street: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      trim: true
    },
    pincode: {
      type: String,
      required: true,
      trim: true
    },
    landmark: {
      type: String,
      trim: true
    }
  },
  location: {
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
  coverPhoto: {
    type: String,
    required: [true, 'Cover photo is required']
  },
  photos: [{
    type: String
  }],
  // NEW: Service menu photos
  serviceMenuPhotos: [{
    type: mongoose.Schema.Types.Mixed, 
    description: String
  }],
  contactNumber: {
    type: String,
    required: [true, 'Contact number is required']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  openingHours: {
    monday: { open: String, close: String, closed: { type: Boolean, default: false } },
    tuesday: { open: String, close: String, closed: { type: Boolean, default: false } },
    wednesday: { open: String, close: String, closed: { type: Boolean, default: false } },
    thursday: { open: String, close: String, closed: { type: Boolean, default: false } },
    friday: { open: String, close: String, closed: { type: Boolean, default: false } },
    saturday: { open: String, close: String, closed: { type: Boolean, default: false } },
    sunday: { open: String, close: String, closed: { type: Boolean, default: false } }
  },
  services: [{
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service'
    },
    serviceName: String,
    price: Number,
    duration: Number,
    available: {
      type: Boolean,
      default: true
    }
  }],
  amenities: [{
    type: String,
    enum: [
      'wifi', 'parking', 'ac', 'card-payment', 'upi', 
      'wheelchair-accessible', 'waiting-area', 'music',
      'refreshments', 'magazines', 'tv'
    ]
  }],
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalReviews: {
    type: Number,
    default: 0
  },
  offers: [{
    title: String,
    description: String,
    discount: Number,
    validFrom: Date,
    validUntil: Date,
    active: {
      type: Boolean,
      default: true
    }
  }],
  // NEW: Time-specific slot offers
  slotOffers: [{
    date: {
      type: Date,
      required: true
    },
    startTime: {
      type: String, // Format: "09:30"
      required: true
    },
    endTime: {
      type: String, // Format: "11:00"
      required: true
    },
    discount: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    title: String,
    description: String,
    active: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // NEW: Disabled time slots
  disabledSlots: [{
    date: {
      type: Date,
      required: true
    },
    startTime: String,
    endTime: String,
    reason: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // NEW: Booking settings
  bookingSettings: {
    slotDuration: {
      type: Number,
      default: 30 // minutes
    },
    maxGuestsPerSlot: {
      type: Number,
      default: 5
    },
    advanceBookingDays: {
      type: Number,
      default: 3 // Only today, tomorrow, and day after
    },
    bufferTime: {
      type: Number,
      default: 15 
    }
  },
  featured: {
    type: Boolean,
    default: false
  },
  verified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Create geospatial index for location-based queries
salonSchema.index({ location: '2dsphere' });

// Index for search
salonSchema.index({ name: 'text', description: 'text' });

// Index for slot offers date lookup
salonSchema.index({ 'slotOffers.date': 1, 'slotOffers.active': 1 });

// Index for disabled slots
salonSchema.index({ 'disabledSlots.date': 1 });

module.exports = mongoose.model('Salon', salonSchema);