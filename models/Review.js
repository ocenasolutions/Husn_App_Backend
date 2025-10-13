// server/models/Review.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Reference to either order or booking
  referenceType: {
    type: String,
    enum: ['Order', 'Booking'],
    required: true
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'referenceType'
  },
  // Rating and feedback
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
  // Additional feedback fields
  serviceQuality: {
    type: Number,
    min: 1,
    max: 5
  },
  deliverySpeed: {
    type: Number,
    min: 1,
    max: 5
  },
  valueForMoney: {
    type: Number,
    min: 1,
    max: 5
  },
  wouldRecommend: {
    type: Boolean,
    default: true
  },
  // Images (optional)
  images: [{
    type: String
  }],
  // Admin response
  adminResponse: {
    comment: String,
    respondedAt: Date,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  // Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  isVerifiedPurchase: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
reviewSchema.index({ user: 1, createdAt: -1 });
reviewSchema.index({ referenceType: 1, referenceId: 1 });
reviewSchema.index({ rating: 1 });
reviewSchema.index({ status: 1 });

// Prevent duplicate reviews
reviewSchema.index({ user: 1, referenceType: 1, referenceId: 1 }, { unique: true });

// Virtual for average rating breakdown
reviewSchema.virtual('averageRating').get(function() {
  const ratings = [
    this.rating,
    this.serviceQuality,
    this.deliverySpeed,
    this.valueForMoney
  ].filter(r => r != null);
  
  if (ratings.length === 0) return this.rating;
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
});

// Static method to get average rating for an item
reviewSchema.statics.getAverageRating = async function(referenceType, referenceId) {
  const result = await this.aggregate([
    {
      $match: {
        referenceType,
        referenceId: new mongoose.Types.ObjectId(referenceId),
        status: 'approved'
      }
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        ratingDistribution: {
          $push: '$rating'
        }
      }
    }
  ]);

  if (result.length === 0) {
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
  }

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  result[0].ratingDistribution.forEach(rating => {
    distribution[rating]++;
  });

  return {
    averageRating: Math.round(result[0].averageRating * 10) / 10,
    totalReviews: result[0].totalReviews,
    ratingDistribution: distribution
  };
};

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;