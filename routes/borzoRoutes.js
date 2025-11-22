// server/routes/borzoRoutes.js
const express = require('express');
const router = express.Router();
const borzoController = require('../controllers/borzoController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// All routes require authentication
router.use(authMiddleware);

router.post(
  '/calculate/:orderId',
  adminMiddleware,
  borzoController.calculateDeliveryPrice
);

// Confirm order and create Borzo delivery
router.post(
  '/confirm/:orderId',
  adminMiddleware,
  borzoController.confirmAndCreateDelivery
);

// Cancel delivery
router.post(
  '/cancel/:orderId',
  adminMiddleware,
  borzoController.cancelDelivery
);

// Get all deliveries (admin view)
router.get(
  '/all',
  adminMiddleware,
  borzoController.getAllDeliveries
);


router.get(
  '/status/:orderId',
  borzoController.getDeliveryStatus
);

// Get courier location
router.get(
  '/courier-location/:orderId',
  borzoController.getCourierLocation
);

module.exports = router;