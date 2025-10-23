// server/models/Booking.js - Enhanced with OTP functionality
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
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'rejected'],
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
  
  // OTP for service verification
  serviceOtp: {
    type: String,
    default: null
  },
  otpGeneratedAt: {
    type: Date,
    default: null
  },
  otpVerifiedAt: {
    type: Date,
    default: null
  },
  otpExpiresAt: {
    type: Date,
    default: null
  },
  
  // Service timing
  serviceStartTime: {
    type: String,
    default: null
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
  serviceStartedAt: Date,
  completedAt: Date,
  cancelledAt: Date,
  
  // Review and rating
  canReview: {
    type: Boolean,
    default: false
  },
  review: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    createdAt: Date
  }
}, {
  timestamps: true
});

// Indexes
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ bookingNumber: 1 }, { unique: true });
bookingSchema.index({ status: 1 });
bookingSchema.index({ 'services.selectedDate': 1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ serviceOtp: 1 });

// Generate unique booking number - STATIC METHOD
bookingSchema.statics.generateBookingNumber = async function() {
  let bookingNumber;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    bookingNumber = `BKG${timestamp}${random}`;
    
    const existingBooking = await this.findOne({ bookingNumber });
    if (!existingBooking) {
      return bookingNumber;
    }
    
    attempts++;
  }
  
  const count = await this.countDocuments();
  const timestamp = Date.now().toString().slice(-6);
  return `BKG${timestamp}${(count + 1).toString().padStart(4, '0')}`;
};

// Generate 6-digit OTP
bookingSchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.serviceOtp = otp;
  this.otpGeneratedAt = new Date();
  this.otpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  return otp;
};

// Verify OTP
bookingSchema.methods.verifyOTP = function(otp) {
  if (!this.serviceOtp) {
    return { valid: false, message: 'No OTP generated for this booking' };
  }
  
  if (this.serviceOtp !== otp.toString()) {
    return { valid: false, message: 'Invalid OTP' };
  }
  
  if (this.otpExpiresAt && new Date() > this.otpExpiresAt) {
    return { valid: false, message: 'OTP has expired' };
  }
  
  return { valid: true, message: 'OTP verified successfully' };
};

// Check if OTP is valid (not expired)
bookingSchema.methods.isOTPValid = function() {
  if (!this.serviceOtp || !this.otpExpiresAt) return false;
  return new Date() <= this.otpExpiresAt;
};

// Pre-save middleware to generate booking number if not provided
bookingSchema.pre('save', async function(next) {
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

// Instance methods
bookingSchema.methods.canBeCancelled = function() {
  return ['pending', 'confirmed'].includes(this.status);
};

bookingSchema.methods.canBeModified = function() {
  return this.status === 'pending';
};

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