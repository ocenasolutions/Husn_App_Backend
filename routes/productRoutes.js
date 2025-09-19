// server/routes/productRoutes.js - Updated with offer routes
const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { uploadToS3 } = require('../config/s3Config');

// Public routes
router.get('/', productController.getAllProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/categories', productController.getProductCategories);
router.get('/brands', productController.getProductBrands);
router.get('/category/:category', productController.getProductsByCategory);
router.get('/:id', productController.getProductById);

// Helper middleware for optional file uploads
const optionalUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    uploadToS3.array('images', 10)(req, res, next); 
  } else {
    next();
  }
};

// Admin routes for product management
router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  optionalUpload,
  productController.createProduct
);

router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  optionalUpload,
  productController.updateProduct
);

router.delete(
  '/:id',
  authMiddleware,
  adminMiddleware,
  productController.deleteProduct
);

router.patch(
  '/:id/toggle-status',
  authMiddleware,
  adminMiddleware,
  productController.toggleProductStatus
);

router.patch(
  '/:id/status',
  authMiddleware,
  adminMiddleware,
  productController.updateProductStatus
);

router.patch(
  '/:id/stock-status',
  authMiddleware,
  adminMiddleware,
  productController.updateStockStatus
);

// New offer management routes
router.post(
  '/:id/apply-offer',
  authMiddleware,
  adminMiddleware,
  productController.applyOfferToProduct
);

router.delete(
  '/:id/remove-offer',
  authMiddleware,
  adminMiddleware,
  productController.removeOfferFromProduct
);

router.get(
  '/admin/offers',
  authMiddleware,
  adminMiddleware,
  productController.getAllProductsForOffers
);

router.get(
  '/admin/active-offers',
  authMiddleware,
  adminMiddleware,
  productController.getProductsWithOffers
);

module.exports = router;