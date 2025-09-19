// server/controllers/wishlistController.js
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const ProductCartItem = require('../models/ProductCartItem');

// Get user's wishlist
exports.getWishlist = async (req, res) => {
  try {
    const wishlistItems = await Wishlist.find({ user: req.user._id })
      .populate('product')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: wishlistItems
    });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch wishlist items'
    });
  }
};

// Add product to wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if item already exists in wishlist
    const existingItem = await Wishlist.findOne({ 
      user: req.user._id, 
      product: productId 
    });

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: 'Product already in wishlist'
      });
    }

    const wishlistItem = new Wishlist({
      user: req.user._id,
      product: productId
    });

    await wishlistItem.save();
    await wishlistItem.populate('product');

    res.json({
      success: true,
      message: 'Product added to wishlist successfully',
      data: wishlistItem
    });
  } catch (error) {
    console.error('Add to wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add product to wishlist'
    });
  }
};

// Remove product from wishlist
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const wishlistItem = await Wishlist.findOneAndDelete({ 
      user: req.user._id, 
      product: productId 
    });

    if (!wishlistItem) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist item not found'
      });
    }

    res.json({
      success: true,
      message: 'Product removed from wishlist successfully'
    });
  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove product from wishlist'
    });
  }
};

// Move product from wishlist to cart
exports.moveToCart = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity = 1 } = req.body;

    // Check if product exists in wishlist
    const wishlistItem = await Wishlist.findOne({ 
      user: req.user._id, 
      product: productId 
    });

    if (!wishlistItem) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in wishlist'
      });
    }

    const product = await Product.findById(productId);
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or inactive'
      });
    }

    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock available'
      });
    }

    // Add to cart
    let cartItem = await ProductCartItem.findOne({ 
      user: req.user._id, 
      product: productId 
    });

    if (cartItem) {
      cartItem.quantity += quantity;
      if (product.stock < cartItem.quantity) {
        return res.status(400).json({
          success: false,
          message: 'Cannot add more items. Stock limit exceeded'
        });
      }
    } else {
      cartItem = new ProductCartItem({
        user: req.user._id,
        product: productId,
        quantity,
        price: product.price
      });
    }

    await cartItem.save();
    
    // Remove from wishlist
    await Wishlist.findOneAndDelete({ 
      user: req.user._id, 
      product: productId 
    });

    await cartItem.populate('product');

    res.json({
      success: true,
      message: 'Product moved to cart successfully',
      data: cartItem
    });
  } catch (error) {
    console.error('Move to cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to move product to cart'
    });
  }
};

// Check if product is in wishlist
exports.checkWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    const wishlistItem = await Wishlist.findOne({ 
      user: req.user._id, 
      product: productId 
    });

    res.json({
      success: true,
      data: {
        isInWishlist: !!wishlistItem
      }
    });
  } catch (error) {
    console.error('Check wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check wishlist status'
    });
  }
};