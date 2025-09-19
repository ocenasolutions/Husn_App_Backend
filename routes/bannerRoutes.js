const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const authMiddleware = require('../middlewares/authMiddleware');
const { uploadToS3 } = require('../config/s3Config');

// Middleware to handle multer errors
const handleMulterError = (err, req, res, next) => {
  if (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 5MB.'
      });
    }
    
    if (err.message && err.message.includes('Invalid file type')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only JPEG, JPG, PNG, GIF, and WEBP are allowed.'
      });
    }
    
    return res.status(400).json({
      success: false,
      message: err.message || 'File upload error'
    });
  }
  next();
};

// Create multer configuration specifically for banners
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const { s3 } = require('../config/s3Config');

const bannerUpload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_S3_BUCKET_NAME,
    acl: 'public-read',
    metadata: function (req, file, cb) {
      cb(null, {
        fieldName: file.fieldname,
        uploadedBy: req.user?.id || 'admin',
        uploadedAt: new Date().toISOString()
      });
    },
    key: function (req, file, cb) {
      const timestamp = Date.now();
      const extension = path.extname(file.originalname);
      const filename = `banners/${timestamp}_${Math.random().toString(36).substr(2, 9)}${extension}`;
      cb(null, filename);
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, JPG, PNG, GIF, and WEBP are allowed.'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// Public routes
router.get('/', bannerController.getActiveBanners);
router.get('/all', bannerController.getAllBanners);
router.get('/:id', bannerController.getBannerById);

// Protected routes (require authentication)
router.post('/', 
  authMiddleware, 
  bannerUpload.single('image'), 
  handleMulterError,
  bannerController.createBanner
);

router.put('/:id', 
  authMiddleware, 
  bannerUpload.single('image'), 
  handleMulterError,
  bannerController.updateBanner
);

router.delete('/:id', authMiddleware, bannerController.deleteBanner);

router.get('/my/banners', authMiddleware, bannerController.getMyBanners);

// Admin routes (you can create admin middleware later)
// router.get('/admin/all', authMiddleware, adminMiddleware, bannerController.getAllBannersForAdmin);
// router.patch('/admin/:id/status', authMiddleware, adminMiddleware, bannerController.updateBannerStatus);

module.exports = router;