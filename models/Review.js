// server/models/Review.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  // Either productId or serviceId will be set, not both
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    default: null
  },
  type: {
    type: String,
    enum: ['product', 'service'],
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  // Media uploads (images/videos)
  media: [{
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['image', 'video'],
      required: true
    },
    key: {
      type: String,
      required: true
    }
  }],
  // Admin response to review
  adminResponse: {
    comment: String,
    respondedAt: Date,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  // Helpful votes
  helpful: {
    type: Number,
    default: 0
  },
  helpfulVotes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    vote: {
      type: String,
      enum: ['up', 'down']
    }
  }],
  // Review status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  // Verification
  isVerifiedPurchase: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ serviceId: 1, createdAt: -1 });
reviewSchema.index({ user: 1 });
reviewSchema.index({ order: 1 });
reviewSchema.index({ status: 1 });
reviewSchema.index({ rating: 1 });

// Validation: Must have either productId or serviceId, not both
reviewSchema.pre('validate', function(next) {
  if ((this.productId && this.serviceId) || (!this.productId && !this.serviceId)) {
    next(new Error('Review must have either productId or serviceId, not both'));
  } else {
    next();
  }
});

// Update product/service average rating after save
reviewSchema.post('save', async function() {
  try {
    if (this.type === 'product' && this.productId) {
      await updateProductRating(this.productId);
    } else if (this.type === 'service' && this.serviceId) {
      await updateServiceRating(this.serviceId);
    }
  } catch (error) {
    console.error('Error updating rating:', error);
  }
});

// Update product/service average rating after remove
reviewSchema.post('remove', async function() {
  try {
    if (this.type === 'product' && this.productId) {
      await updateProductRating(this.productId);
    } else if (this.type === 'service' && this.serviceId) {
      await updateServiceRating(this.serviceId);
    }
  } catch (error) {
    console.error('Error updating rating:', error);
  }
});

// Helper function to update product rating
async function updateProductRating(productId) {
  const Product = mongoose.model('Product');
  const Review = mongoose.model('Review');
  
  const stats = await Review.aggregate([
    { $match: { productId: productId, status: 'approved' } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    await Product.findByIdAndUpdate(productId, {
      rating: Math.round(stats[0].averageRating * 10) / 10,
      reviewCount: stats[0].totalReviews
    });
  } else {
    await Product.findByIdAndUpdate(productId, {
      rating: 0,
      reviewCount: 0
    });
  }
}

// Helper function to update service rating
async function updateServiceRating(serviceId) {
  const Service = mongoose.model('Service');
  const Review = mongoose.model('Review');
  
  const stats = await Review.aggregate([
    { $match: { serviceId: serviceId, status: 'approved' } },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 }
      }
    }
  ]);

  if (stats.length > 0) {
    await Service.findByIdAndUpdate(serviceId, {
      rating: Math.round(stats[0].averageRating * 10) / 10,
      reviewCount: stats[0].totalReviews
    });
  } else {
    await Service.findByIdAndUpdate(serviceId, {
      rating: 0,
      reviewCount: 0
    });
  }
}

// Static method to get review summary for product
reviewSchema.statics.getProductSummary = async function(productId) {
  const summary = await this.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId), status: 'approved' } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    }
  ]);

  const total = await this.countDocuments({ 
    productId: productId, 
    status: 'approved' 
  });

  // Calculate average rating
  let averageRating = 0;
  if (total > 0) {
    const totalStars = summary.reduce((acc, item) => acc + (item._id * item.count), 0);
    averageRating = Math.round((totalStars / total) * 10) / 10; // Round to 1 decimal
  }

  const result = {
    total,
    averageRating, // ⭐ Added average rating
    breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  };

  summary.forEach(item => {
    result.breakdown[item._id] = item.count;
  });

  return result;
};

// Static method to get review summary for service
reviewSchema.statics.getServiceSummary = async function(serviceId) {
  const summary = await this.aggregate([
    { $match: { serviceId: new mongoose.Types.ObjectId(serviceId), status: 'approved' } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 }
      }
    }
  ]);

  const total = await this.countDocuments({ 
    serviceId: serviceId, 
    status: 'approved' 
  });

  // Calculate average rating
  let averageRating = 0;
  if (total > 0) {
    const totalStars = summary.reduce((acc, item) => acc + (item._id * item.count), 0);
    averageRating = Math.round((totalStars / total) * 10) / 10; // Round to 1 decimal
  }

  const result = {
    total,
    averageRating, // ⭐ Added average rating
    breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  };

  summary.forEach(item => {
    result.breakdown[item._id] = item.count;
  });

  return result;
};

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;