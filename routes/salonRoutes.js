const express = require('express');
const router = express.Router();
const salonController = require('../controllers/salonController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Public routes
router.get('/', salonController.getAllSalons);
router.get('/nearby', salonController.getSalonsNearby);
router.get('/:id', salonController.getSalonById);
router.get('/:id/slots', salonController.getAvailableSlots);

// Admin routes - Salon Management
router.post('/', authMiddleware, adminMiddleware, salonController.createSalon);
router.put('/:id', authMiddleware, adminMiddleware, salonController.updateSalon);
router.delete('/:id', authMiddleware, adminMiddleware, salonController.deleteSalon);
router.patch('/:id/featured', authMiddleware, adminMiddleware, salonController.toggleFeatured);

// Admin routes - Services
router.post('/:id/services', authMiddleware, adminMiddleware, salonController.addServiceToSalon);
router.delete('/:id/services/:serviceId', authMiddleware, adminMiddleware, salonController.removeServiceFromSalon);

// Admin routes - Service Menu Photos
router.post('/:id/service-menu-photos', authMiddleware, adminMiddleware, salonController.addServiceMenuPhotos);
router.delete('/:id/service-menu-photos/:photoId', authMiddleware, adminMiddleware, salonController.removeServiceMenuPhoto);

// Admin routes - Slot Offers
router.post('/:id/slot-offers', authMiddleware, adminMiddleware, salonController.addSlotOffer);
router.patch('/:id/slot-offers/:offerId/toggle', authMiddleware, adminMiddleware, salonController.toggleSlotOffer);
router.delete('/:id/slot-offers/:offerId', authMiddleware, adminMiddleware, salonController.deleteSlotOffer);

// Admin routes - Slot Management
router.post('/:id/disable-slot', authMiddleware, adminMiddleware, salonController.disableSlot);
router.delete('/:id/disabled-slots/:slotId', authMiddleware, adminMiddleware, salonController.enableSlot);

module.exports = router;