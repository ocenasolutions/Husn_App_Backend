// server/models/Service.js
const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
    maxlength: [100, 'Service name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Service description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  price: {
    type: Number,
    required: [true, 'Service price is required'],
    min: [0, 'Price cannot be negative']
  },
  originalPrice: {
    type: Number,
    default: null
  },
  discount: {
    type: Number,
    min: [0, 'Discount cannot be negative'],
    max: [100, 'Discount cannot exceed 100%'],
    default: 0
  },
  category: {
    type: String,
    required: [true, 'Service category is required'],
    enum: ['beauty', 'wellness', 'skincare', 'hair', 'massage', 'facial', 'other'],
    default: 'other'
  },
  duration: {
    type: Number,
    required: [true, 'Service duration is required'],
    min: [15, 'Duration must be at least 15 minutes']
  },
  image_url: {
    type: String,
    default: null
  },
  imageKey: {
    type: String,
    default: null
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalBookings: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  featured: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  
  offerActive: {
    type: Boolean,
    default: false
  },
  offerTitle: {
    type: String,
    trim: true,
    maxlength: [100, 'Offer title cannot exceed 100 characters'],
    default: null
  },
  offerDescription: {
    type: String,
    trim: true,
    maxlength: [200, 'Offer description cannot exceed 200 characters'],
    default: null
  },
  offerDiscount: {
    type: Number,
    min: [0, 'Offer discount cannot be negative'],
    max: [90, 'Offer discount cannot exceed 90%'],
    default: 0
  },
  offerPrice: {
    type: Number,
    min: [0, 'Offer price cannot be negative'],
    default: null
  },
  offerStartDate: {
    type: Date,
    default: null
  },
  offerEndDate: {
    type: Date,
    default: null
  },
  
  availableSlots: [{
    day: {
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    },
    startTime: String,
    endTime: String    
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Virtual for calculated discount price
serviceSchema.virtual('discountedPrice').get(function() {
  if (this.discount > 0 && this.originalPrice) {
    return Math.round(this.originalPrice * (1 - this.discount / 100));
  }
  return this.price;
});

serviceSchema.virtual('finalPrice').get(function() {
  if (this.offerActive && this.offerEndDate && this.offerEndDate > new Date() && this.offerPrice) {
    return this.offerPrice;
  }
  if (this.discount > 0 && this.originalPrice) {
    return Math.round(this.originalPrice * (1 - this.discount / 100));
  }
  return this.price;
});

serviceSchema.virtual('isOfferValid').get(function() {
  if (!this.offerActive || !this.offerEndDate) return false;
  
  const now = new Date();
  const startDate = this.offerStartDate || this.createdAt;
  
  return now >= startDate && now <= this.offerEndDate;
});

// Virtual for offer savings amount
serviceSchema.virtual('offerSavings').get(function() {
  if (!this.isOfferValid || !this.offerPrice) return 0;
  return this.price - this.offerPrice;
});

// Index for better search performance
serviceSchema.index({ name: 'text', description: 'text', category: 1 });
serviceSchema.index({ isActive: 1, featured: -1, createdAt: -1 });
serviceSchema.index({ offerActive: 1, offerEndDate: 1 }); 

serviceSchema.pre('save', function(next) {
  if (this.discount > 0 && this.originalPrice) {
    this.price = Math.round(this.originalPrice * (1 - this.discount / 100));
  }
  
  // Auto-deactivate expired offers
  if (this.offerActive && this.offerEndDate && this.offerEndDate <= new Date()) {
    this.offerActive = false;
  }
  
  next();
});

// Ensure virtuals are included in JSON output
serviceSchema.set('toJSON', { virtuals: true });
serviceSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Service', serviceSchema);