// server/controllers/reviewController.js
const Review = require('../models/Review');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Professional = require('../models/Professional');
const { uploadToS3, deleteMultipleFromS3 } = require('../config/s3');

// Create a review for a product, service, or professional
exports.createReview = async (req, res) => {
  try {
    const { orderId, itemId, type, rating, comment, professionalId } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!orderId || !itemId || !type || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Order ID, item ID, type, and rating are required'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    // Check if order exists and belongs to user
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or access denied'
      });
    }

    // Verify order is delivered
    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Can only review delivered orders'
      });
    }

    // Verify the item is in the order
    let itemExists = false;
    if (type === 'product') {
      itemExists = order.productItems.some(item => 
        item.productId.toString() === itemId
      );
    } else if (type === 'service') {
      itemExists = order.serviceItems.some(item => 
        item.serviceId.toString() === itemId
      );
    }

    if (!itemExists) {
      return res.status(400).json({
        success: false,
        message: 'Item not found in this order'
      });
    }

    // For professional reviews, verify the professional exists and was assigned
    if (type === 'professional') {
      if (!professionalId) {
        return res.status(400).json({
          success: false,
          message: 'Professional ID is required for professional reviews'
        });
      }

      const professional = await Professional.findById(professionalId);
      if (!professional) {
        return res.status(404).json({
          success: false,
          message: 'Professional not found'
        });
      }

      // Check if user already reviewed this professional for this order
      const existingReview = await Review.findOne({
        user: userId,
        order: orderId,
        professionalId: professionalId
      });

      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: 'You have already reviewed this professional for this order'
        });
      }
    } else {
      // Check if user already reviewed this item
      const existingReview = await Review.findOne({
        user: userId,
        order: orderId,
        [type === 'product' ? 'productId' : 'serviceId']: itemId
      });

      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: 'You have already reviewed this item'
        });
      }
    }

    // Handle media uploads
    const media = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const mediaType = file.mimetype.startsWith('image/') ? 'image' : 'video';
        const folder = `reviews/${type}s/${mediaType}s`;
        
        const uploaded = await uploadToS3(
          file.buffer,
          file.originalname,
          file.mimetype,
          folder
        );

        media.push({
          url: uploaded.url,
          type: mediaType,
          key: uploaded.key
        });
      }
    }

    // Create review
    const reviewData = {
      user: userId,
      order: orderId,
      type,
      rating: parseInt(rating),
      comment: comment || '',
      media,
      isVerifiedPurchase: true
    };

    if (type === 'product') {
      reviewData.productId = itemId;
    } else if (type === 'service') {
      reviewData.serviceId = itemId;
    } else if (type === 'professional') {
      reviewData.professionalId = professionalId;
      reviewData.serviceId = itemId; // Keep serviceId for reference
    }

    const review = await Review.create(reviewData);

    await review.populate([
      { path: 'user', select: 'name profilePicture' },
      { path: 'productId', select: 'name primaryImage' },
      { path: 'serviceId', select: 'name image_url' },
      { path: 'professionalId', select: 'name profilePicture' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: review
    });

  } catch (error) {
    console.error('Create review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create review',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get reviews for a specific product
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;
    const skip = (page - 1) * limit;

    let sortOption = { createdAt: -1 };
    if (sort === 'helpful') sortOption = { helpful: -1, createdAt: -1 };
    else if (sort === 'rating_high') sortOption = { rating: -1, createdAt: -1 };
    else if (sort === 'rating_low') sortOption = { rating: 1, createdAt: -1 };

    const reviews = await Review.find({
      productId,
      status: 'approved'
    })
      .populate('user', 'name profilePicture')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({
      productId,
      status: 'approved'
    });

    const summary = await Review.getProductSummary(productId);

    res.json({
      success: true,
      data: {
        reviews,
        summary,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get product reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

// Get reviews for a specific service
exports.getServiceReviews = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;
    const skip = (page - 1) * limit;

    let sortOption = { createdAt: -1 };
    if (sort === 'helpful') sortOption = { helpful: -1, createdAt: -1 };
    else if (sort === 'rating_high') sortOption = { rating: -1, createdAt: -1 };
    else if (sort === 'rating_low') sortOption = { rating: 1, createdAt: -1 };

    const reviews = await Review.find({
      serviceId,
      status: 'approved'
    })
      .populate('user', 'name profilePicture')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({
      serviceId,
      status: 'approved'
    });

    const summary = await Review.getServiceSummary(serviceId);

    res.json({
      success: true,
      data: {
        reviews,
        summary,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get service reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

// Get reviews for a specific professional
exports.getProfessionalReviews = async (req, res) => {
  try {
    const { professionalId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;
    const skip = (page - 1) * limit;

    let sortOption = { createdAt: -1 };
    if (sort === 'helpful') sortOption = { helpful: -1, createdAt: -1 };
    else if (sort === 'rating_high') sortOption = { rating: -1, createdAt: -1 };
    else if (sort === 'rating_low') sortOption = { rating: 1, createdAt: -1 };

    const reviews = await Review.find({
      professionalId,
      status: 'approved'
    })
      .populate('user', 'name profilePicture')
      .populate('serviceId', 'name image_url')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({
      professionalId,
      status: 'approved'
    });

    const summary = await Review.getProfessionalSummary(professionalId);

    res.json({
      success: true,
      data: {
        reviews,
        summary,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Get professional reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviews'
    });
  }
};

// Get user's reviews
exports.getUserReviews = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10, type } = req.query;
    const skip = (page - 1) * limit;

    const filter = { user: userId };
    if (type && ['product', 'service', 'professional'].includes(type)) {
      filter.type = type;
    }

    const reviews = await Review.find(filter)
      .populate([
        { path: 'productId', select: 'name primaryImage' },
        { path: 'serviceId', select: 'name image_url' },
        { path: 'professionalId', select: 'name profilePicture' },
        { path: 'order', select: 'orderNumber' }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments(filter);

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

// Get reviewable items from an order (including professionals)
exports.getReviewableItems = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate('productItems.productId', 'name primaryImage')
      .populate('serviceItems.serviceId', 'name image_url')
      .populate('serviceItems.professionalId', 'name profilePicture');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    if (order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Order must be delivered to review items'
      });
    }

    // Get existing reviews for this order
    const existingReviews = await Review.find({
      user: userId,
      order: orderId
    });

    const reviewedProductIds = new Set(
      existingReviews
        .filter(r => r.productId)
        .map(r => r.productId.toString())
    );

    const reviewedServiceIds = new Set(
      existingReviews
        .filter(r => r.serviceId && !r.professionalId)
        .map(r => r.serviceId.toString())
    );

    const reviewedProfessionalIds = new Set(
      existingReviews
        .filter(r => r.professionalId)
        .map(r => r.professionalId.toString())
    );

    // Build reviewable items list
    const reviewableItems = [];

    // Add products
    order.productItems.forEach(item => {
      if (item.productId) {
        const reviewed = reviewedProductIds.has(item.productId._id.toString());
        reviewableItems.push({
          itemId: item.productId._id,
          type: 'product',
          name: item.productId.name,
          image: item.productId.primaryImage,
          price: item.price,
          quantity: item.quantity,
          reviewed
        });
      }
    });

    // Add services and professionals
    order.serviceItems.forEach(item => {
      if (item.serviceId) {
        const reviewed = reviewedServiceIds.has(item.serviceId._id.toString());
        reviewableItems.push({
          itemId: item.serviceId._id,
          type: 'service',
          name: item.serviceId.name,
          image: item.serviceId.image_url,
          price: item.price,
          quantity: item.quantity,
          reviewed
        });

        // Add professional review option if professional is assigned
        if (item.professionalId) {
          const professionalReviewed = reviewedProfessionalIds.has(item.professionalId._id.toString());
          reviewableItems.push({
            itemId: item.serviceId._id, // Keep service ID for order verification
            professionalId: item.professionalId._id,
            type: 'professional',
            name: item.professionalId.name,
            serviceName: item.serviceId.name,
            image: item.professionalId.profilePicture,
            price: item.price,
            quantity: item.quantity,
            reviewed: professionalReviewed
          });
        }
      }
    });

    res.json({
      success: true,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        items: reviewableItems
      }
    });

  } catch (error) {
    console.error('Get reviewable items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reviewable items'
    });
  }
};

// Update review
exports.updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    const review = await Review.findOne({ _id: reviewId, user: userId });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    if (rating) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5'
        });
      }
      review.rating = rating;
    }

    if (comment !== undefined) {
      review.comment = comment;
    }

    await review.save();

    await review.populate([
      { path: 'user', select: 'name profilePicture' },
      { path: 'productId', select: 'name primaryImage' },
      { path: 'serviceId', select: 'name image_url' },
      { path: 'professionalId', select: 'name profilePicture' }
    ]);

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

// Delete review
exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user._id;

    const review = await Review.findOne({ _id: reviewId, user: userId });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Delete media from S3
    if (review.media && review.media.length > 0) {
      const keys = review.media.map(m => m.key);
      await deleteMultipleFromS3(keys);
    }

    await review.remove();

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

// Vote review as helpful
exports.voteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { vote } = req.body;
    const userId = req.user._id;

    if (!['up', 'down'].includes(vote)) {
      return res.status(400).json({
        success: false,
        message: 'Vote must be "up" or "down"'
      });
    }

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    const existingVoteIndex = review.helpfulVotes.findIndex(
      v => v.user.toString() === userId.toString()
    );

    if (existingVoteIndex !== -1) {
      const existingVote = review.helpfulVotes[existingVoteIndex];
      
      if (existingVote.vote === vote) {
        review.helpfulVotes.splice(existingVoteIndex, 1);
        review.helpful = vote === 'up' ? review.helpful - 1 : review.helpful + 1;
      } else {
        existingVote.vote = vote;
        review.helpful = vote === 'up' ? review.helpful + 2 : review.helpful - 2;
      }
    } else {
      review.helpfulVotes.push({ user: userId, vote });
      review.helpful = vote === 'up' ? review.helpful + 1 : review.helpful - 1;
    }

    await review.save();

    res.json({
      success: true,
      message: 'Vote recorded',
      data: {
        helpful: review.helpful
      }
    });

  } catch (error) {
    console.error('Vote review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to vote review'
    });
  }
};

// Get all approved reviews (for public / user-facing screen)
exports.getAllPublicReviews = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, rating, sort = 'recent' } = req.query;
    const skip = (page - 1) * limit;

    const filter = { status: 'approved' };
    if (type && ['product', 'service', 'professional'].includes(type)) {
      filter.type = type;
    }
    if (rating && rating !== 'all') {
      filter.rating = parseInt(rating);
    }

    let sortOption = { createdAt: -1 };
    if (sort === 'helpful') sortOption = { helpful: -1, createdAt: -1 };
    else if (sort === 'rating_high') sortOption = { rating: -1, createdAt: -1 };
    else if (sort === 'rating_low') sortOption = { rating: 1, createdAt: -1 };

    const reviews = await Review.find(filter)
      .populate('user', 'name profilePicture')
      .populate('productId', 'name primaryImage')
      .populate('serviceId', 'name image_url')
      .populate('professionalId', 'name profilePicture')
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments(filter);

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
    console.error('Get all public reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch public reviews'
    });
  }
};
