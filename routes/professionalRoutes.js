// server/routes/professionalRoutes.js
const express = require('express');
const router = express.Router();
const professionalController = require('../controllers/professionalController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { uploadToS3 } = require('../config/s3Config');

const conditionalUpload = (req, res, next) => {
    uploadToS3.single('profileImage')(req, res, (err) => {
    if (err) {
    return next(err);
    }
    next();
    });
};

// Public routes
router.get('/', professionalController.getAllProfessionals);
router.get('/specializations', professionalController.getSpecializations);
router.get('/service/:serviceId', professionalController.getProfessionalsByService);
router.get('/:id', professionalController.getProfessionalById);

// Admin routes
router.post(
  '/', 
  authMiddleware, 
  adminMiddleware, 
  conditionalUpload,
  professionalController.createProfessional
);

router.put(
  '/:id', 
  authMiddleware, 
  adminMiddleware, 
  conditionalUpload,
  professionalController.updateProfessional
);

router.delete(
  '/:id', 
  authMiddleware, 
  adminMiddleware, 
  professionalController.deleteProfessional
);

router.patch(
  '/:id/toggle-status', 
  authMiddleware, 
  adminMiddleware, 
  professionalController.toggleProfessionalStatus
);

router.patch(
  '/:id/toggle-availability', 
  authMiddleware, 
  adminMiddleware, 
  professionalController.toggleProfessionalAvailability
);

module.exports = router;