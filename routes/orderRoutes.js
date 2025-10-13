// server/routes/orderRoutes.js - Complete fixed version with debugging
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// All order routes require authentication - MUST BE FIRST
router.use(authMiddleware);

// Debug middleware - AFTER auth so we can see user
router.use((req, res, next) => {
  console.log('Order Route:', req.method, req.path);
  console.log('User:', req.user?._id, 'Role:', req.user?.role);
  next();
});

// Admin routes - MUST come before /:id routes
router.get('/admin/all', adminMiddleware, orderController.getAllOrders);
router.put('/admin/:id/status', adminMiddleware, orderController.updateOrderStatus);
router.put('/admin/:id/delivery-date', adminMiddleware, orderController.setDeliveryDate);

// User routes
router.post('/', orderController.createOrder);
router.get('/my-orders', orderController.getUserOrders);
router.put('/:id/cancel', orderController.cancelOrder);

// This MUST be last to avoid catching admin routes
router.get('/:id', orderController.getOrderById);

module.exports = router;