// server/routes/cartRoutes.js - Fixed routes
const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');

const authMiddleware = require('../middlewares/authMiddleware');

// All cart routes require authentication
router.use(authMiddleware);

router.get('/', cartController.getCart);
router.get('/check-debt', cartController.checkWalletDebtBeforeCheckout);
router.post('/add', cartController.addToCart);
router.put('/update', cartController.updateCartItem);
router.patch('/:id', cartController.updateCartItem);
router.delete('/clear', cartController.clearCart);
router.delete('/:id', cartController.removeFromCart);

module.exports = router;