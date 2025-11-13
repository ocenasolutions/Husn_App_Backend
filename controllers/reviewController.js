// server/controllers/reviewController.js - FIXED VERSION
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

    console.log('Create review request:', { orderId, itemId, type, rating, professionalId });

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

    console.log('Order found:', order.orderNumber, 'Status:', order.status);

    // Verify order is completed/delivered
    if (!['delivered', 'completed'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: 'Order must be completed to review items'
      });
    }

    // Verify the item is in the order - FIXED LOGIC FOR PROFESSIONAL REVIEWS
    let itemExists = false;
    if (type === 'product') {
      itemExists = order.productItems.some(item => 
        item.productId.toString() === itemId
      );
    } else if (type === 'service') {
      itemExists = order.serviceItems.some(item => 
        item.serviceId.toString() === itemId
      );
    } else if (type === 'professional') {
      // For professional reviews, itemId is the serviceId
      // Check if service exists in order
      itemExists = order.serviceItems.some(item => 
        item.serviceId.toString() === itemId
      );
    }

    if (!itemExists) {
      console.log('Item not found in order. Type:', type, 'ItemId:', itemId);
      console.log('Order items:', {
        products: order.productItems.map(i => i.productId?.toString()),
        services: order.serviceItems.map(i => i.serviceId?.toString())
      });
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

    console.log('Creating review with data:', reviewData);

    const review = await Review.create(reviewData);

    await review.populate([
      { path: 'user', select: 'name profilePicture' },
      { path: 'productId', select: 'name primaryImage' },
      { path: 'serviceId', select: 'name image_url' },
      { path: 'professionalId', select: 'name profilePicture' }
    ]);

    console.log('Review created successfully:', review._id);

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

// Get reviewable items from an order (including professionals) - FIXED
exports.getReviewableItems = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user._id;

    console.log('Fetching reviewable items for order:', orderId, 'user:', userId);

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate('productItems.productId', 'name primaryImage price')
      .populate('serviceItems.serviceId', 'name image_url price');

    if (!order) {
      console.log('Order not found or access denied');
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log('Order found:', order.orderNumber, 'Status:', order.status);

    // FIXED: Check for both 'delivered' and 'completed' status
    if (!['delivered', 'completed'].includes(order.status)) {
      console.log('Order not completed yet');
      return res.status(400).json({
        success: false,
        message: 'Order must be completed to review items'
      });
    }

    // Get existing reviews for this order
    const existingReviews = await Review.find({
      user: userId,
      order: orderId
    });

    console.log('Existing reviews:', existingReviews.length);

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
        if (item.professionalId && item.professionalName) {
          const professionalReviewed = reviewedProfessionalIds.has(item.professionalId.toString());
          reviewableItems.push({
            itemId: item.serviceId._id, // Keep service ID for order verification
            professionalId: item.professionalId,
            type: 'professional',
            name: item.professionalName,
            serviceName: item.serviceId.name,
            image: null, // Can add professional profile picture if needed
            price: item.price,
            quantity: item.quantity,
            reviewed: professionalReviewed
          });
        }
      }
    });

    console.log('Reviewable items:', reviewableItems.length);

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
      message: 'Failed to fetch reviewable items',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ... (rest of the controller methods remain the same)

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
