const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

router.get('/', walletController.getWallet);

router.get('/balance', walletController.getBalance);

router.get('/debt-status', walletController.getDebtStatus);

router.post('/pay-debt', walletController.payDebt);

router.post('/add-money', walletController.addMoney);

router.post('/deduct-money', walletController.deductMoney);

router.get('/transactions', walletController.getTransactionHistory);

router.post('/lock', walletController.lockWallet);
router.post('/unlock', walletController.unlockWallet);

module.exports = router;