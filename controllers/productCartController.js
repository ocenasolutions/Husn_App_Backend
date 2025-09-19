// server/controllers/productCartController.js
const ProductCartItem = require('../models/ProductCartItem');
const Product = require('../models/Product');

// Get user's product cart
exports.getProductCart = async (req, res) => {
  try {
    const cartItems = await ProductCartItem.find({ user: req.user._id })
      .populate('product')
      .sort({ createdAt: -1 });

    const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    res.json({
      success: true,
      data: {
        items: cartItems,
        totalItems: cartItems.length,
        totalAmount: total
      }
    });
  } catch (error) {
    console.error('Get product cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product cart items'
    });
  }
};

// Add product to cart
exports.addToProductCart = async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or inactive'
      });
    }

    // Check if product is in stock
    if (product.stockStatus === 'out-of-stock' || product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: 'Product is out of stock or insufficient quantity'
      });
    }

    // Check if item already exists in cart
    let cartItem = await ProductCartItem.findOne({ 
      user: req.user._id, 
      product: productId
    });

    if (cartItem) {
      // Update existing cart item
      cartItem.quantity = quantity;
      cartItem.price = product.offerActive && product.offerPrice ? product.offerPrice : product.price;
    } else {
      // Create new cart item
      cartItem = new ProductCartItem({
        user: req.user._id,
        product: productId,
        quantity,
        price: product.offerActive && product.offerPrice ? product.offerPrice : product.price
      });
    }

    await cartItem.save();
    await cartItem.populate('product');

    res.json({
      success: true,
      message: 'Product added to cart successfully',
      data: cartItem
    });
  } catch (error) {
    console.error('Add to product cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add product to cart'
    });
  }
};

// Update product cart item
exports.updateProductCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const cartItem = await ProductCartItem.findOne({ _id: id, user: req.user._id });
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    // Check product availability
    const product = await Product.findById(cartItem.product);
    if (!product || !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found or inactive'
      });
    }

    if (product.stockStatus === 'out-of-stock' || product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient stock for requested quantity'
      });
    }

    cartItem.quantity = quantity;
    cartItem.price = product.offerActive && product.offerPrice ? product.offerPrice : product.price;

    await cartItem.save();
    await cartItem.populate('product');

    res.json({
      success: true,
      message: 'Cart item updated successfully',
      data: cartItem
    });
  } catch (error) {
    console.error('Update product cart item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item'
    });
  }
};

// Remove product from cart
exports.removeFromProductCart = async (req, res) => {
  try {
    const { id } = req.params;

    const cartItem = await ProductCartItem.findOneAndDelete({ _id: id, user: req.user._id });
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    res.json({
      success: true,
      message: 'Product removed from cart successfully'
    });
  } catch (error) {
    console.error('Remove from product cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove product from cart'
    });
  }
};

// Clear product cart
exports.clearProductCart = async (req, res) => {
  try {
    await ProductCartItem.deleteMany({ user: req.user._id });

    res.json({
      success: true,
      message: 'Product cart cleared successfully'
    });
  } catch (error) {
    console.error('Clear product cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear product cart'
    });
  }
};