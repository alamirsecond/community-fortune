// withdrawalRoutes.js - UPDATED WITH NEW ENDPOINTS
import express from 'express';
import authenticate from '../../../middleware/auth.js';
import {
  apiLimiter,
  strictLimiter,
  withdrawalLimiter
} from '../../../middleware/rateLimiters.js';
import withdrawalController from './withdrawalController.js';

const router = express.Router();

// User routes
router.post('/request', authenticate(['']), withdrawalLimiter, withdrawalController.createWithdrawal);
router.post('/verify-otp', authenticate(['user']), apiLimiter, withdrawalController.verifyWithdrawalOTP);
router.get('/my-withdrawals', authenticate(['user']), apiLimiter, withdrawalController.getUserWithdrawals);
router.get('/my-withdrawals/:id', authenticate(['user']), apiLimiter, withdrawalController.getWithdrawalById);
router.get('/settings', authenticate(['user']), apiLimiter, withdrawalController.getWithdrawalSettings);
router.put('/limits', authenticate(['user']), apiLimiter, withdrawalController.updateSpendingLimits);

// Admin routes
router.get('/all', authenticate(['admin']), apiLimiter, withdrawalController.getAllWithdrawals);
router.put('/:id/status', authenticate(['admin']), strictLimiter, withdrawalController.updateWithdrawalStatus);
router.get('/stats', authenticate(['admin']), apiLimiter, withdrawalController.getWithdrawalStats);
router.post('/verify-kyc', authenticate(['admin']), strictLimiter, withdrawalController.verifyKycStatus);

// Webhook for payment processing (external services)
router.post('/webhook/processing', withdrawalController.handleProcessingWebhook);

export default router;