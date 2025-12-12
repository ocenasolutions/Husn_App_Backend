// routes/giftCardRoutes.js
const express = require('express');
const router = express.Router();
const giftCardController = require('../controllers/giftCardController');
const authMiddleware = require('../middlewares/authMiddleware');

// All routes require authentication except public view
router.post('/purchase', authMiddleware, giftCardController.purchaseGiftCard);
router.post('/verify', authMiddleware, giftCardController.verifyGiftCard);
router.post('/claim', authMiddleware, giftCardController.claimGiftCard);

router.get('/my-purchased', authMiddleware, giftCardController.getMyPurchasedGiftCards);
router.get('/my-redeemed', authMiddleware, giftCardController.getMyRedeemedGiftCards);

router.post('/:cardNumber/share', authMiddleware, giftCardController.recordShare);
router.post('/:cardId/cancel', authMiddleware, giftCardController.cancelGiftCard);

router.get('/:cardId', giftCardController.getGiftCardDetails);

module.exports = router;