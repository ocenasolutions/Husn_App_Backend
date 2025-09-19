// server/controllers/cartController.js - Updated with clear route fix
const CartItem = require('../models/CartItem');
const Service = require('../models/Service');

// Get user's cart
exports.getCart = async (req, res) => {
  try {
    const cartItems = await CartItem.find({ user: req.user._id })
      .populate('service')
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
    console.error('Get cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cart items'
    });
  }
};

// Add item to cart
exports.addToCart = async (req, res) => {
  try {
    const { serviceId, quantity = 1, selectedDate, selectedTime, notes } = req.body;

    if (!serviceId || !selectedDate || !selectedTime) {
      return res.status(400).json({
        success: false,
        message: 'Service ID, selected date, and time are required'
      });
    }

    const service = await Service.findOne({ _id: serviceId, isActive: true });
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found or inactive'
      });
    }

    // Check if item already exists in cart
    let cartItem = await CartItem.findOne({ 
      user: req.user._id, 
      service: serviceId,
      selectedDate: new Date(selectedDate),
      selectedTime 
    });

    if (cartItem) {
      // Update existing cart item
      cartItem.quantity = quantity;
      cartItem.price = service.price;
      cartItem.notes = notes || '';
    } else {
      // Create new cart item
      cartItem = new CartItem({
        user: req.user._id,
        service: serviceId,
        quantity,
        price: service.price,
        selectedDate: new Date(selectedDate),
        selectedTime,
        notes: notes || ''
      });
    }

    await cartItem.save();
    await cartItem.populate('service');

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      data: cartItem
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item to cart'
    });
  }
};

// Update cart item
exports.updateCartItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, selectedDate, selectedTime, notes } = req.body;

    const cartItem = await CartItem.findOne({ _id: id, user: req.user._id });
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    if (quantity) cartItem.quantity = quantity;
    if (selectedDate) cartItem.selectedDate = new Date(selectedDate);
    if (selectedTime) cartItem.selectedTime = selectedTime;
    if (notes !== undefined) cartItem.notes = notes;

    await cartItem.save();
    await cartItem.populate('service');

    res.json({
      success: true,
      message: 'Cart item updated successfully',
      data: cartItem
    });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart item'
    });
  }
};

// Remove item from cart
exports.removeFromCart = async (req, res) => {
  try {
    const { id } = req.params;

    const cartItem = await CartItem.findOneAndDelete({ _id: id, user: req.user._id });
    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    res.json({
      success: true,
      message: 'Item removed from cart successfully'
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart'
    });
  }
};

// Clear cart
exports.clearCart = async (req, res) => {
  try {
    await CartItem.deleteMany({ user: req.user._id });

    res.json({
      success: true,
      message: 'Cart cleared successfully'
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart'
    });
  }
};