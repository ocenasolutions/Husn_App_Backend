// server/routes/orderRoutes.js - Added customer OTP verification
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// All order routes require authentication
router.use(authMiddleware);

// Debug middleware
router.use((req, res, next) => {
  console.log('Order Route:', req.method, req.path);
  console.log('User:', req.user?._id, 'Role:', req.user?.role);
  next();
});

// Admin routes - MUST come before /:id routes
router.get('/admin/all', adminMiddleware, orderController.getAllOrders);
router.put('/admin/:id/status', adminMiddleware, orderController.updateOrderStatus);
router.put('/admin/:id/delivery-date', adminMiddleware, orderController.setDeliveryDate);
router.put('/admin/:id/service-time', adminMiddleware, orderController.setServiceTime);
router.post('/admin/:id/start-service', adminMiddleware, orderController.startService);

// User routes
router.post('/', orderController.createOrder);
router.get('/my-orders', orderController.getUserOrders);
router.put('/:id/cancel', orderController.cancelOrder);

// Customer OTP verification - NEW
router.post('/:id/verify-otp', orderController.verifyCustomerOtp);

// This MUST be last
router.get('/:id', orderController.getOrderById);

module.exports = router;