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

// Add item to cart - NO booking details required
exports.addToCart = async (req, res) => {
  try {
    const { serviceId, quantity = 1, notes } = req.body;

    if (!serviceId) {
      return res.status(400).json({
        success: false,
        message: 'Service ID is required'
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
      service: serviceId
    });

    if (cartItem) {
      // Update existing cart item
      cartItem.quantity += quantity;
      cartItem.price = service.price;
      if (notes) cartItem.notes = notes;
    } else {
      // Create new cart item without booking details
      cartItem = new CartItem({
        user: req.user._id,
        service: serviceId,
        quantity,
        price: service.price,
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
    const { serviceId, quantity, notes, selectedDate, selectedTime, professionalId, professionalName } = req.body;

    let cartItem;

    if (serviceId) {
      cartItem = await CartItem.findOne({ 
        user: req.user._id, 
        service: serviceId 
      });
    } else if (id) {
      cartItem = await CartItem.findOne({ 
        _id: id, 
        user: req.user._id 
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either serviceId or cart item id is required'
      });
    }

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: 'Cart item not found'
      });
    }

    // Update fields
    if (quantity !== undefined) {
      if (quantity < 1) {
        await CartItem.findByIdAndDelete(cartItem._id);
        return res.json({
          success: true,
          message: 'Cart item removed'
        });
      }
      cartItem.quantity = quantity;
    }
    
    if (notes !== undefined) cartItem.notes = notes;
    if (selectedDate !== undefined) cartItem.selectedDate = selectedDate;
    if (selectedTime !== undefined) cartItem.selectedTime = selectedTime;
    if (professionalId !== undefined) cartItem.professionalId = professionalId;
    if (professionalName !== undefined) cartItem.professionalName = professionalName;

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
      message: 'Failed to update cart item',
      error: error.message
    });
  }
};

// Remove item from cart
exports.removeFromCart = async (req, res) => {
  try {
    const { id } = req.params;

    const cartItem = await CartItem.findOneAndDelete({ 
      _id: id, 
      user: req.user._id 
    });
    
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


// Add this function to your cart controller (cartRoutes.js or similar)

// Check for wallet debt before allowing service checkout
exports.checkWalletDebtBeforeCheckout = async (req, res) => {
  try {
    const userId = req.user._id;
    
    const Wallet = require('../models/Wallet');
    let wallet = await Wallet.findOne({ userId });
    
    // If no wallet or positive balance, allow checkout
    if (!wallet || wallet.balance >= 0) {
      return res.json({
        success: true,
        canProceed: true,
        message: 'You can proceed with checkout'
      });
    }

    // User has negative balance (debt)
    const debtAmount = Math.abs(wallet.balance);
    
    return res.json({
      success: true,
      canProceed: false,
      hasDebt: true,
      debtAmount: debtAmount,
      message: `You have an outstanding cancellation penalty of ₹${debtAmount.toFixed(2)}. Please clear this amount before booking new services.`
    });

  } catch (error) {
    console.error('Check wallet debt error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check wallet status'
    });
  }
};

// Middleware to prevent service orders if user has debt
exports.preventServiceOrderWithDebt = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { serviceItems = [] } = req.body;

    // Only check if order contains services
    if (!serviceItems || serviceItems.length === 0) {
      return next();
    }

    const Wallet = require('../models/Wallet');
    let wallet = await Wallet.findOne({ userId });
    
    // If no wallet or positive balance, allow order
    if (!wallet || wallet.balance >= 0) {
      return next();
    }

    // User has negative balance (debt)
    const debtAmount = Math.abs(wallet.balance);
    
    return res.status(403).json({
      success: false,
      message: `You have an outstanding cancellation penalty of ₹${debtAmount.toFixed(2)}. Please clear this amount before booking new services.`,
      hasDebt: true,
      debtAmount: debtAmount,
      canProceed: false
    });

  } catch (error) {
    console.error('Debt check middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify wallet status'
    });
  }
};