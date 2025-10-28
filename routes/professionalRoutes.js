// server/routes/professionalRoutes.js
const express = require('express');
const router = express.Router();
const professionalController = require('../controllers/professionalController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

router.get('/', professionalController.getAllProfessionals);
router.get('/by-services', professionalController.getProfessionalsByServices);

router.post(
  '/',
  authMiddleware,
  adminMiddleware,
  professionalController.createProfessional
);

router.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  professionalController.updateProfessional
);

router.delete(
  '/:id',
  authMiddleware,
  adminMiddleware,
  professionalController.deleteProfessional
);

module.exports = router;