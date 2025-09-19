// server/routes/cartRoutes.js - Updated with clear endpoint
const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const authMiddleware = require('../middlewares/authMiddleware');

// All cart routes require authentication
router.use(authMiddleware);

router.get('/', cartController.getCart);
router.post('/add', cartController.addToCart);
router.put('/:id', cartController.updateCartItem);
router.delete('/clear', cartController.clearCart); // Clear route must come before /:id
router.delete('/:id', cartController.removeFromCart);

module.exports = router;