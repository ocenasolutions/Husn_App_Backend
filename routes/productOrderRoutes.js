// server/routes/productOrderRoutes.js
const express = require('express');
const router = express.Router();
const productOrderController = require('../controllers/productOrderController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

router.get('/', productOrderController.getUserProductOrders);
router.post('/create', productOrderController.createProductOrder);
router.get('/:id', productOrderController.getProductOrderById);
router.patch('/:id/cancel', productOrderController.cancelProductOrder);
router.post('/reorder', productOrderController.reorderProducts);

module.exports = router;