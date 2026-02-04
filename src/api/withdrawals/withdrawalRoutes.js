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
router.post('/request', authenticate(['USER']), withdrawalLimiter, withdrawalController.createWithdrawal);
router.post('/verify-otp', authenticate(['USER']), apiLimiter, withdrawalController.verifyWithdrawalOTP);
router.get('/my-withdrawals', authenticate(['USER']), apiLimiter, withdrawalController.getUserWithdrawals);
router.get('/my-withdrawals/:id', authenticate(['USER']), apiLimiter, withdrawalController.getWithdrawalById);
router.get('/settings', authenticate(['USER']), apiLimiter, withdrawalController.getWithdrawalSettings);
router.put('/limits', authenticate(['USER']), apiLimiter, withdrawalController.updateSpendingLimits); 
// Admin routes
router.get('/all', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.getAllWithdrawals);
router.put('/:id/status', authenticate(['SUPERADMIN', 'ADMIN']), strictLimiter, withdrawalController.updateWithdrawalStatus);
router.get('/stats', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.getWithdrawalStats);
router.post('/verify-kyc', authenticate(['SUPERADMIN', 'ADMIN']), strictLimiter, withdrawalController.verifyKycStatus);

// Webhook for payment processing (external services)
router.post('/webhook/processing', withdrawalController.handleProcessingWebhook);

export default router;