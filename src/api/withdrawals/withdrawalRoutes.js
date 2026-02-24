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
// Admin routes
router.get('/all', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.getAllWithdrawals);
router.get('/export/all', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.exportAllWithdrawalsCsv);
router.get('/export/pending', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.exportPendingWithdrawalsCsv);
router.get('/export/approved', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.exportApprovedWithdrawalsCsv);
router.get('/export/rejected', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.exportRejectedWithdrawalsCsv);
router.get('/export/completed', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.exportCompletedWithdrawalsCsv);
router.get('/export/weekly-completed', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.exportWeeklyCompletedWithdrawalsCsv);
router.get('/export/large-amount', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.exportLargeAmountWithdrawalsCsv);
router.get('/export/first-time', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.exportFirstTimeWithdrawalsCsv);
router.put('/:id/status', authenticate(['SUPERADMIN', 'ADMIN']), strictLimiter, withdrawalController.updateWithdrawalStatus);
router.get('/stats', authenticate(['SUPERADMIN', 'ADMIN']), apiLimiter, withdrawalController.getWithdrawalStats);
router.post('/verify-kyc', authenticate(['SUPERADMIN', 'ADMIN']), strictLimiter, withdrawalController.verifyKycStatus);

// Webhook for payment processing (external services)
router.post('/webhook/processing', withdrawalController.handleProcessingWebhook);

export default router;