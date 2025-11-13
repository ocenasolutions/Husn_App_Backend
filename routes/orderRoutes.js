// server/routes/orderRoutes.js - FIXED WITH START SERVICE ROUTE
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const professionalMiddleware = require('../middlewares/professionalMiddleware');
const cartController = require('../controllers/cartController');

// All order routes require authentication
router.use(authMiddleware);

// Debug middleware
router.use((req, res, next) => {
  console.log('Order Route:', req.method, req.path);
  console.log('User:', req.user?._id, 'Role:', req.user?.role);
  next();
});

router.post('/', 
  cartController.preventServiceOrderWithDebt, 
  orderController.createOrder
);

// ===== ADMIN ROUTES =====
router.get('/admin/all', adminMiddleware, orderController.getAllOrders);
router.get('/admin/active-locations', adminMiddleware, orderController.getActiveOrdersWithLocation);
router.put('/admin/:id/status', adminMiddleware, orderController.updateOrderStatus);
router.put('/admin/:id/delivery-date', adminMiddleware, orderController.setDeliveryDate);
router.put('/admin/:id/assign-professional', adminMiddleware, orderController.assignProfessionalToService);
router.post('/admin/:id/start-tracking', adminMiddleware, orderController.startLiveTracking);
router.post('/admin/:id/stop-tracking', adminMiddleware, orderController.stopLiveTracking);
// ✅ FIXED: Add the start-service route
router.post('/admin/:id/start-service', adminMiddleware, orderController.startService);

// ===== LIVE LOCATION TRACKING ROUTES =====
// User updates their location
router.patch('/:id/user-location', orderController.updateUserLocation);

// Professional updates their location
router.patch('/:id/professional-location', orderController.updateProfessionalLocation);

// Get order with location data (USER & PROFESSIONAL can access)
router.get('/:id/location', orderController.getOrderWithLocation);

// Start professional journey to user location
router.post('/:id/start-journey', orderController.startProfessionalJourney);

// ===== USER ROUTES =====
router.post('/', orderController.createOrder);
router.get('/my-orders', orderController.getUserOrders);
router.put('/:id/cancel', orderController.cancelOrder);
router.post('/:id/verify-otp', orderController.verifyCustomerOtp);

// This MUST be last
router.get('/:id', orderController.getOrderById);

router.get(
  '/professional/my-orders', 
  professionalMiddleware, 
  orderController.getProfessionalOrders
);

// Professional can start service with OTP
router.post(
  '/professional/:id/start-service',
  professionalMiddleware,
  orderController.startService
);

// Professional can update their location
router.patch(
  '/professional/:id/location',
  professionalMiddleware,
  orderController.updateProfessionalLocation
);

// Professional can start journey
router.post(
  '/professional/:id/start-journey',
  professionalMiddleware,
  orderController.startProfessionalJourney
);

// Professional can view order details
router.get(
  '/professional/:id',
  professionalMiddleware,
  orderController.getProfessionalOrderById
);

// ✅ NEW: Professional can update order status
router.put(
  '/professional/:id/status',
  professionalMiddleware,
  orderController.updateOrderStatusByProfessional
);
module.exports = router;