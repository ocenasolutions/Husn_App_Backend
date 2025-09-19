// server/routes/productCartRoutes.js
const express = require('express');
const router = express.Router();
const productCartController = require('../controllers/productCartController');
const authMiddleware = require('../middlewares/authMiddleware');

// All product cart routes require authentication
router.use(authMiddleware);

router.get('/', productCartController.getProductCart);
router.post('/add', productCartController.addToProductCart);
router.put('/:id', productCartController.updateProductCartItem);
router.delete('/clear', productCartController.clearProductCart); // Clear route must come before /:id
router.delete('/:id', productCartController.removeFromProductCart);

module.exports = router;