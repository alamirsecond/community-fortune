// src/api/wallet/walletRoutes.js
import express from 'express';
import authenticate from '../../../middleware/auth.js';
import { requireSubscriptionTier } from '../../../middleware/subscriptionTier.js';
import {
  apiLimiter,
  strictLimiter
} from '../../../middleware/rateLimiters.js';
import walletController from './walletController.js';
import spendingLimitsController from './spendingLimitsController.js';

const router = express.Router();


// User wallet routes
router.get('/balances', authenticate(), apiLimiter, walletController.getWalletBalances);
router.get('/transactions', authenticate(), apiLimiter, walletController.getWalletTransactions);
router.get('/spending-history', authenticate(), apiLimiter, walletController.getSpendingHistory);
router.put('/freeze-credit', authenticate(), strictLimiter, walletController.toggleCreditWalletFreeze);
// Only users with tier 2 or above can transfer between wallets
router.post('/transfer', authenticate(), requireSubscriptionTier(2), strictLimiter, walletController.transferBetweenWallets);
router.post('/buy-credit', authenticate(), strictLimiter, walletController.buySiteCredit);
// Redeem points for site credit
router.post('/redeem-points', authenticate(), strictLimiter, walletController.redeemPoints);

// Spending limits routes (responsible gaming)
router.get('/spending-limits', authenticate(), apiLimiter, spendingLimitsController.getSpendingLimits);
router.put('/spending-limits', authenticate(), strictLimiter, spendingLimitsController.updateSpendingLimits);

// Admin wallet routes
router.get('/admin/all', authenticate(['admin']), apiLimiter, walletController.getAllWallets);
router.post('/admin/reset-spending', authenticate(['admin']), strictLimiter, spendingLimitsController.resetSpendingCounts);

export default router;