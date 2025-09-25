// server/models/Booking.js - Fixed service bookings model
const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bookingNumber: {
    type: String,
    unique: true,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'rejected', 'completed', 'cancelled'],
    default: 'pending'
  },
  // Service items
  services: [{
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
    selectedDate: {
      type: Date,
      required: true
    },
    selectedTime: {
      type: String,
      required: true
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500
    }
  }],
  // Customer info
  customerInfo: {
    name: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    address: {
      type: String,
      trim: true
    }
  },
  // Professional assignment
  professionalId: String,
  professionalName: String,
  
  // Service type
  serviceType: {
    type: String,
    enum: ['At Home', 'At Salon'],
    default: 'At Home'
  },
  
  // Payment details
  paymentMethod: {
    type: String,
    enum: ['cod', 'online'],
    default: 'cod'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  
  // Amounts
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Admin actions
  rejectionReason: {
    type: String,
    trim: true
  },
  adminNotes: {
    type: String,
    trim: true
  },
  
  // Status timestamps
  confirmedAt: Date,
  rejectedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  
  // Review and rating
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  review: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  reviewedAt: Date
}, {
  timestamps: true
});

// Indexes
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ bookingNumber: 1 }, { unique: true });
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'services.selectedDate': 1 });
bookingSchema.index({ createdAt: -1 });

// Generate unique booking number - STATIC METHOD
bookingSchema.statics.generateBookingNumber = async function() {
  let bookingNumber;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    // Generate a more readable booking number
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of timestamp
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    bookingNumber = `BKG${timestamp}${random}`;
    
    // Check if this booking number already exists
    const existingBooking = await this.findOne({ bookingNumber });
    if (!existingBooking) {
      return bookingNumber;
    }
    
    attempts++;
  }
  
  // Fallback: use count + timestamp if all random attempts failed
  const count = await this.countDocuments();
  const timestamp = Date.now().toString().slice(-6);
  return `BKG${timestamp}${(count + 1).toString().padStart(4, '0')}`;
};

// Pre-save middleware to generate booking number if not provided
bookingSchema.pre('save', async function(next) {
  // Only generate booking number if it's a new document and doesn't have one
  if (this.isNew && !this.bookingNumber) {
    try {
      this.bookingNumber = await this.constructor.generateBookingNumber();
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Virtual for total service duration
bookingSchema.virtual('totalDuration').get(function() {
  if (!this.populated('services.service')) return 0;
  return this.services.reduce((total, item) => {
    if (item.service && item.service.duration) {
      return total + (item.service.duration * item.quantity);
    }
    return total;
  }, 0);
});

// Virtual for booking age in days
bookingSchema.virtual('bookingAge').get(function() {
  const ageInMs = Date.now() - this.createdAt.getTime();
  return Math.floor(ageInMs / (1000 * 60 * 60 * 24));
});

// Instance methods
bookingSchema.methods.canBeCancelled = function() {
  return ['pending', 'confirmed'].includes(this.status);
};

bookingSchema.methods.canBeModified = function() {
  return this.status === 'pending';
};

// Method to get formatted booking number for display
bookingSchema.methods.getFormattedBookingNumber = function() {
  if (!this.bookingNumber) return 'N/A';
  return this.bookingNumber.replace(/(.{3})(.{6})(.{4})/, '$1-$2-$3');
};

// Static method to get bookings summary
bookingSchema.statics.getBookingsSummary = async function(userId) {
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
    console.error('Error getting bookings summary:', error);
    throw error;
  }
};

// Static method to find booking by booking number
bookingSchema.statics.findByBookingNumber = function(bookingNumber) {
  return this.findOne({ bookingNumber })
    .populate('services.service')
    .populate('user', 'name email phone');
};

// Ensure virtuals are included in JSON output
bookingSchema.set('toJSON', { virtuals: true });
bookingSchema.set('toObject', { virtuals: true });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;