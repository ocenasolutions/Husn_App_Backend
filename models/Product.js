// server/models/Product.js - Updated with offer fields
const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Product name cannot exceed 200 characters']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
    default: ''
  },
  
  category: {
    type: String,
    required: true,
    enum: [
      'skincare', 
      'haircare', 
      'makeup', 
      'wellness', 
      'treatments', 
      'tools', 
      'supplements',
      'accessories',
      'bundles'
    ],
    default: 'skincare'
  },
  
  brand: {
    type: String,
    trim: true,
    maxlength: [100, 'Brand name cannot exceed 100 characters'],
    default: ''
  },
  
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  
  originalPrice: {
    type: Number,
    min: [0, 'Original price cannot be negative'],
    default: null
  },
  
  currency: {
    type: String,
    enum: ['INR'],
    default: 'INR'
  },
  
  stockStatus: {
    type: String,
    enum: {
      values: ['in-stock', 'low-stock', 'out-of-stock'],
      message: 'Stock status must be: in-stock, low-stock, or out-of-stock'
    },
    default: 'in-stock',
    required: true
  },
  
  stock: {
    type: Number,
    required: true,
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  featured: {
    type: Boolean,
    default: false
  },
  
  isActive: {
    type: Boolean,
    default: true
  },

  // Offer-related fields
  offerActive: {
    type: Boolean,
    default: false
  },
  
  offerTitle: {
    type: String,
    trim: true,
    maxlength: [100, 'Offer title cannot exceed 100 characters']
  },
  
  offerDescription: {
    type: String,
    trim: true,
    maxlength: [200, 'Offer description cannot exceed 200 characters']
  },
  
  offerDiscount: {
    type: Number,
    min: [1, 'Offer discount must be at least 1%'],
    max: [90, 'Offer discount cannot exceed 90%']
  },
  
  offerPrice: {
    type: Number,
    min: [0, 'Offer price cannot be negative']
  },
  
  offerStartDate: {
    type: Date
  },
  
  offerEndDate: {
    type: Date
  },
  
  images: [{
    url: {
      type: String,
      required: true
    },
    key: String, 
    alt: String,
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  
  primaryImage: {
    type: String,
    default: null
  },

  variants: [{
    name: String,
    value: String,
    price: Number,
    stock: Number
  }],

  views: {
    type: Number,
    default: 0,
    min: 0
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ featured: 1, isActive: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ tags: 1 });
productSchema.index({ status: 1, isActive: 1 });
productSchema.index({ stockStatus: 1 });
productSchema.index({ offerActive: 1, isActive: 1 });
productSchema.index({ offerEndDate: 1 }); 
productSchema.index({ name: 'text', description: 'text', brand: 'text' }); 

productSchema.virtual('discountPercentage').get(function() {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  }
  return 0;
});

// Virtual for effective price (considering offers)
productSchema.virtual('effectivePrice').get(function() {
  if (this.offerActive && this.offerPrice) {
    return this.offerPrice;
  }
  return this.price;
});

// Virtual for savings amount
productSchema.virtual('savingsAmount').get(function() {
  if (this.offerActive && this.offerPrice) {
    return this.price - this.offerPrice;
  }
  return 0;
});

// Pre-save middleware
productSchema.pre('save', function(next) {
  // Set primary image
  if (this.images && this.images.length > 0 && !this.primaryImage) {
    const primaryImg = this.images.find(img => img.isPrimary);
    this.primaryImage = primaryImg ? primaryImg.url : this.images[0].url;
  }

  // Clean and process tags
  if (this.tags && this.tags.length > 0) {
    this.tags = this.tags
      .filter(tag => tag && tag.trim().length > 0)
      .map(tag => tag.trim().toLowerCase())
      .filter((tag, index, arr) => arr.indexOf(tag) === index);
  }
  
  // Auto-update stock status based on quantity
  if (this.isModified('stock') && !this.isModified('stockStatus')) {
    if (this.stock === 0) {
      this.stockStatus = 'out-of-stock';
    } else if (this.stock <= 5) {
      this.stockStatus = 'low-stock';
    } else {
      this.stockStatus = 'in-stock';
    }
  }

  // Validate offer dates
  if (this.offerActive) {
    if (this.offerEndDate && this.offerStartDate && this.offerEndDate <= this.offerStartDate) {
      const error = new Error('Offer end date must be after start date');
      return next(error);
    }
    
    // Auto-deactivate expired offers
    if (this.offerEndDate && new Date() > this.offerEndDate) {
      this.offerActive = false;
    }
  }
  
  next();
});

// Static methods
productSchema.statics.findByCategory = function(category, options = {}) {
  const query = { category, isActive: true, status: 'published', ...options };
  return this.find(query).populate('createdBy', 'name email');
};

productSchema.statics.findFeatured = function(limit = 10) {
  return this.find({ featured: true, isActive: true, status: 'published' })
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit);
};

productSchema.statics.findWithActiveOffers = function(limit = 50) {
  return this.find({ 
    offerActive: true, 
    isActive: true, 
    status: 'published',
    offerEndDate: { $gte: new Date() } // Only non-expired offers
  })
    .populate('createdBy', 'name email')
    .sort({ offerEndDate: 1 }) // Sort by expiration date
    .limit(limit);
};

productSchema.statics.searchProducts = function(searchTerm, options = {}) {
  const query = {
    isActive: true,
    status: 'published',
    $or: [
      { name: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { brand: { $regex: searchTerm, $options: 'i' } },
      { tags: { $in: [new RegExp(searchTerm, 'i')] } }
    ],
    ...options
  };
  
  return this.find(query).populate('createdBy', 'name email');
};

// Instance methods
productSchema.methods.incrementViews = function() {
  this.views += 1;
  return this.save();
};

productSchema.methods.applyOffer = function(offerData) {
  this.offerActive = true;
  this.offerTitle = offerData.offerTitle;
  this.offerDescription = offerData.offerDescription || '';
  this.offerDiscount = offerData.offerDiscount;
  this.offerPrice = Math.round(this.price * (1 - offerData.offerDiscount / 100));
  this.offerStartDate = offerData.offerStartDate ? new Date(offerData.offerStartDate) : new Date();
  this.offerEndDate = new Date(offerData.offerEndDate);
  
  return this.save();
};

productSchema.methods.removeOffer = function() {
  this.offerActive = false;
  this.offerTitle = undefined;
  this.offerDescription = undefined;
  this.offerDiscount = undefined;
  this.offerPrice = undefined;
  this.offerStartDate = undefined;
  this.offerEndDate = undefined;
  
  return this.save();
};

productSchema.methods.isOfferValid = function() {
  if (!this.offerActive) return false;
  if (!this.offerEndDate) return true;
  return new Date() <= this.offerEndDate;
};

const Product = mongoose.model('Product', productSchema);

module.exports = Product;