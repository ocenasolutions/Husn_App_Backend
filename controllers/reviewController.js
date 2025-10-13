// server/controllers/reviewController.js
const Review = require('../models/Review');
const Order = require('../models/Order');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const Service = require('../models/Service');
const multer = require('multer');
const path = require('path');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/reviews/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'review-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Create a new review
exports.createReview = async (req, res) => {
  try {
    const {
      referenceType,
      referenceId,
      rating,
      comment,
      serviceQuality,
      deliverySpeed,
      valueForMoney,
      wouldRecommend
    } = req.body;

    // Validate required fields
    if (!referenceType || !referenceId || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Reference type, reference ID, and rating are required'
      });
    }

    // Validate rating range
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if reference exists and belongs to user
    let reference;
    if (referenceType === 'Order') {
      reference = await Order.findOne({
        _id: referenceId,
        user: req.user._id,
        status: { $in: ['delivered', 'completed'] }
      });
    } else if (referenceType === 'Booking') {
      reference = await Booking.findOne({
        _id: referenceId,
        user: req.user._id,
        status: 'completed'
      });
    }

    if (!reference) {
      return res.status(404).json({
        success: false,
        message: 'Reference not found or not eligible for review'
      });
    }

    // Check if user already reviewed this item
    const existingReview = await Review.findOne({
      user: req.user._id,
      referenceType,
      referenceId
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this item'
      });
    }

    // Handle image uploads
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => file.filename);
    }

    // Create review
    const review = new Review({
      user: req.user._id,
      referenceType,
      referenceId,
      rating,
      comment: comment?.trim(),
      serviceQuality,
      deliverySpeed,
      valueForMoney,
      wouldRecommend: wouldRecommend !== false,
      images,
      isVerifiedPurchase: true
    });

    await review.save();

    // Populate user details
    await review.populate('user', 'name profileImage');

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: review
    });

  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user's reviews
exports.getUserReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ user: req.user._id })
      .populate('user', 'name profileImage')
      .populate({
        path: 'referenceId',
        populate: {
          path: 'productItems.productId serviceItems.serviceId',
          select: 'name image title'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({ user: req.user._id });

    res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get user reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

// Get reviews for a specific item (product/service)
exports.getReviewsForItem = async (req, res) => {
  try {
    const { referenceType, referenceId } = req.params;
    const { page = 1, limit = 10, sortBy = 'newest' } = req.query;
    const skip = (page - 1) * limit;

    // Validate reference type
    if (!['Order', 'Booking'].includes(referenceType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reference type'
      });
    }

    // Sort options
    let sort = { createdAt: -1 }; // newest first
    if (sortBy === 'oldest') {
      sort = { createdAt: 1 };
    } else if (sortBy === 'highest_rating') {
      sort = { rating: -1, createdAt: -1 };
    } else if (sortBy === 'lowest_rating') {
      sort = { rating: 1, createdAt: -1 };
    }

    const reviews = await Review.find({
      referenceType,
      referenceId,
      status: 'approved'
    })
      .populate('user', 'name profileImage')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({
      referenceType,
      referenceId,
      status: 'approved'
    });

    // Get average rating and distribution
    const ratingStats = await Review.getAverageRating(referenceType, referenceId);

    res.json({
      success: true,
      data: {
        reviews,
        ratingStats,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get reviews for item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

// Update user's review
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rating,
      comment,
      serviceQuality,
      deliverySpeed,
      valueForMoney,
      wouldRecommend
    } = req.body;

    const review = await Review.findOne({
      _id: id,
      user: req.user._id
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Update fields if provided
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }
      review.rating = rating;
    }

    if (comment !== undefined) {
      review.comment = comment.trim();
    }

    if (serviceQuality !== undefined) {
      review.serviceQuality = serviceQuality;
    }

    if (deliverySpeed !== undefined) {
      review.deliverySpeed = deliverySpeed;
    }

    if (valueForMoney !== undefined) {
      review.valueForMoney = valueForMoney;
    }

    if (wouldRecommend !== undefined) {
      review.wouldRecommend = wouldRecommend;
    }

    // Handle new image uploads
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => file.filename);
      review.images = [...(review.images || []), ...newImages];
    }

    await review.save();
    await review.populate('user', 'name profileImage');

    res.json({
      success: true,
      message: 'Review updated successfully',
      data: review
    });

  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review'
    });
  }
};

// Delete user's review
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findOneAndDelete({
      _id: id,
      user: req.user._id
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.json({
      success: true,
      message: 'Review deleted successfully'
    });

  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review'
    });
  }
};

// Admin: Get all reviews
exports.getAllReviews = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status = 'all', 
      referenceType = 'all',
      sortBy = 'newest' 
    } = req.query;
    const skip = (page - 1) * limit;

    // Build filter
    let filter = {};
    if (status !== 'all') {
      filter.status = status;
    }
    if (referenceType !== 'all') {
      filter.referenceType = referenceType;
    }

    // Sort options
    let sort = { createdAt: -1 };
    if (sortBy === 'oldest') {
      sort = { createdAt: 1 };
    } else if (sortBy === 'highest_rating') {
      sort = { rating: -1, createdAt: -1 };
    } else if (sortBy === 'lowest_rating') {
      sort = { rating: 1, createdAt: -1 };
    }

    const reviews = await Review.find(filter)
      .populate('user', 'name email profileImage')
      .populate({
        path: 'referenceId',
        populate: {
          path: 'productItems.productId serviceItems.serviceId',
          select: 'name image title'
        }
      })
      .populate('adminResponse.respondedBy', 'name')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments(filter);

    // Get statistics
    const stats = await Review.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        reviews,
        stats,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get all reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

// Admin: Respond to review
exports.respondToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Response comment is required'
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.adminResponse = {
      comment: comment.trim(),
      respondedAt: new Date(),
      respondedBy: req.user._id
    };

    await review.save();
    await review.populate([
      { path: 'user', select: 'name profileImage' },
      { path: 'adminResponse.respondedBy', select: 'name' }
    ]);

    res.json({
      success: true,
      message: 'Response added successfully',
      data: review
    });

  } catch (error) {
    console.error('Respond to review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add response'
    });
  }
};

// Admin: Update review status
exports.updateReviewStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'approved', 'rejected'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    review.status = status;
    await review.save();

    res.json({
      success: true,
      message: 'Review status updated successfully',
      data: review
    });

  } catch (error) {
    console.error('Update review status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review status'
    });
  }
};

// Get reviews with images for a product/service (for display on product pages)
exports.getItemReviewsWithImages = async (req, res) => {
  try {
    const { referenceType, referenceId } = req.params;
    const { limit = 5 } = req.query;

    const reviews = await Review.find({
      referenceType,
      referenceId,
      status: 'approved',
      images: { $exists: true, $ne: [] }
    })
      .populate('user', 'name profileImage')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: reviews
    });

  } catch (error) {
    console.error('Get reviews with images error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

// Middleware for handling image uploads
exports.uploadImages = upload.array('images', 5); // Max 5 images per review