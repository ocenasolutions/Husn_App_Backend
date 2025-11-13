// server/routes/addressRoutes.js
const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

// Address CRUD operations
router.get('/', addressController.getAddresses);
router.post('/', addressController.addAddress);
router.put('/:id', addressController.updateAddress);
router.delete('/:id', addressController.deleteAddress);
router.patch('/:id/default', addressController.setDefaultAddress);

// Autocomplete and validation endpoints
router.get('/validate-pincode/:pincode', addressController.validatePincode);
router.get('/suggestions/states', addressController.getStateSuggestions);
router.get('/suggestions/cities', addressController.getCitySuggestions);
router.get('/reverse-geocode', addressController.reverseGeocode);

// NEW: Enhanced geocoding endpoint
router.post('/geocode-address', addressController.geocodeAddressEndpoint);

module.exports = router;