import paymentService from "./payment_service.js";
import { validationResult } from 'express-validator';
import SubscriptionTicketService from "./SubscriptionTicketService.js";

class PaymentController {
  async handlePayPalWebhook(req, res) {
    try {
      const event = req.body;
      await paymentService.handlePayPalWebhook(event);
      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      console.error('PayPal webhook error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async handleStripeWebhook(req, res) {
    try {
      const event = req.body;
      await paymentService.handleStripeWebhook(event);
      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async handleRevolutWebhook(req, res) {
    try {
      const event = req.body;
      await paymentService.handleRevolutWebhook(event);
      res.status(200).json({ success: true, message: 'Webhook processed' });
    } catch (error) {
      console.error('Revolut webhook error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getEnabledGateways(req, res) {
    try {
      const { country = 'GB' } = req.query;
      const gateways = await paymentService.getEnabledGateways(country);
      res.status(200).json({ success: true, data: gateways });
    } catch (error) {
      console.error('Get enabled gateways error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserPaymentMethods(req, res) {
    try {
      const userId = req.user.id;
      const methods = await paymentService.getUserPaymentMethods(userId);
      res.status(200).json({ success: true, data: methods });
    } catch (error) {
      console.error('Get user payment methods error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async addPaymentMethod(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const userId = req.user.id;
      const methodData = req.body;
      const method = await paymentService.addPaymentMethod(userId, methodData);
      res.status(201).json({ success: true, message: 'Payment method added successfully', data: method });
    } catch (error) {
      console.error('Add payment method error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async updatePaymentMethod(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const userId = req.user.id;
      const methodId = req.params.methodId;
      const updateData = req.body;
      const method = await paymentService.updatePaymentMethod(userId, methodId, updateData);
      res.status(200).json({ success: true, message: 'Payment method updated successfully', data: method });
    } catch (error) {
      console.error('Update payment method error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async removePaymentMethod(req, res) {
    try {
      const userId = req.user.id;
      const methodId = req.params.methodId;
      const result = await paymentService.removePaymentMethod(userId, methodId);
      res.status(200).json({ success: true, message: 'Payment method removed successfully', data: result });
    } catch (error) {
      console.error('Remove payment method error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async setDefaultPaymentMethod(req, res) {
    try {
      const userId = req.user.id;
      const methodId = req.params.methodId;
      const result = await paymentService.setDefaultPaymentMethod(userId, methodId);
      res.status(200).json({ success: true, message: 'Default payment method set successfully', data: result });
    } catch (error) {
      console.error('Set default payment method error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getUserDeposits(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;
      const result = await paymentService.getUserDeposits(userId, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get user deposits error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async createDeposit(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const userId = req.user.id;
      const depositData = req.body;
      const result = await paymentService.createDeposit(userId, depositData);
      res.status(201).json({ success: true, message: 'Deposit initiated successfully', data: result });
    } catch (error) {
      console.error('Create deposit error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getDepositDetails(req, res) {
    try {
      const userId = req.user.id;
      const depositId = req.params.depositId;
      const deposit = await paymentService.getDepositDetails(userId, depositId);
      res.status(200).json({ success: true, data: deposit });
    } catch (error) {
      console.error('Get deposit details error:', error);
      res.status(404).json({ success: false, error: error.message });
    }
  }

  async cancelDeposit(req, res) {
    try {
      const userId = req.user.id;
      const depositId = req.params.depositId;
      const result = await paymentService.cancelDeposit(userId, depositId);
      res.status(200).json({ success: true, message: 'Deposit cancelled successfully', data: result });
    } catch (error) {
      console.error('Cancel deposit error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async retryDeposit(req, res) {
    try {
      const userId = req.user.id;
      const depositId = req.params.depositId;
      const result = await paymentService.retryDeposit(userId, depositId);
      res.status(200).json({ success: true, message: 'Deposit retry initiated', data: result });
    } catch (error) {
      console.error('Retry deposit error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getUserWithdrawals(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;
      const result = await paymentService.getUserWithdrawals(userId, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get user withdrawals error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async createWithdrawal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const userId = req.user.id;
      const withdrawalData = req.body;
      const result = await paymentService.createWithdrawal(userId, withdrawalData);
      res.status(201).json({ success: true, message: 'Withdrawal request submitted successfully', data: result });
    } catch (error) {
      console.error('Create withdrawal error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getWithdrawalDetails(req, res) {
    try {
      const userId = req.user.id;
      const withdrawalId = req.params.withdrawalId;
      const withdrawal = await paymentService.getWithdrawalDetails(userId, withdrawalId);
      res.status(200).json({ success: true, data: withdrawal });
    } catch (error) {
      console.error('Get withdrawal details error:', error);
      res.status(404).json({ success: false, error: error.message });
    }
  }

  async cancelWithdrawal(req, res) {
    try {
      const userId = req.user.id;
      const withdrawalId = req.params.withdrawalId;
      const result = await paymentService.cancelWithdrawal(userId, withdrawalId);
      res.status(200).json({ success: true, message: 'Withdrawal cancelled successfully', data: result });
    } catch (error) {
      console.error('Cancel withdrawal error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getUserTransactions(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0, ...filters } = req.query;
      const result = await paymentService.getUserTransactions(userId, filters, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get user transactions error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getTransactionDetails(req, res) {
    try {
      const userId = req.user.id;
      const transactionId = req.params.transactionId;
      const transaction = await paymentService.getTransactionDetails(userId, transactionId);
      res.status(200).json({ success: true, data: transaction });
    } catch (error) {
      console.error('Get transaction details error:', error);
      res.status(404).json({ success: false, error: error.message });
    }
  }

  async getUserPaymentRequests(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 50, offset = 0 } = req.query;
      const result = await paymentService.getUserPaymentRequests(userId, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get user payment requests error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getPaymentRequestDetails(req, res) {
    try {
      const userId = req.user.id;
      const requestId = req.params.requestId;
      const request = await paymentService.getPaymentRequestDetails(userId, requestId);
      res.status(200).json({ success: true, data: request });
    } catch (error) {
      console.error('Get payment request details error:', error);
      res.status(404).json({ success: false, error: error.message });
    }
  }

  async getAllPaymentRequests(req, res) {
    try {
      const { limit = 50, offset = 0, ...filters } = req.query;
      const result = await paymentService.getAllPaymentRequests(filters, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get all payment requests error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async approvePaymentRequest(req, res) {
    try {
      const adminId = req.user.id;
      const requestId = req.params.requestId;
      const { notes = '' } = req.body;
      const result = await paymentService.approvePaymentRequest(adminId, requestId, notes);
      res.status(200).json({ success: true, message: 'Payment request approved successfully', data: result });
    } catch (error) {
      console.error('Approve payment request error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async rejectPaymentRequest(req, res) {
    try {
      const adminId = req.user.id;
      const requestId = req.params.requestId;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Reason is required for rejection' });
      }
      const result = await paymentService.rejectPaymentRequest(adminId, requestId, reason);
      res.status(200).json({ success: true, message: 'Payment request rejected successfully', data: result });
    } catch (error) {
      console.error('Reject payment request error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async completePaymentRequest(req, res) {
    try {
      const adminId = req.user.id;
      const requestId = req.params.requestId;
      const { gateway_reference } = req.body;
      const result = await paymentService.completePaymentRequest(adminId, requestId, gateway_reference);
      res.status(200).json({ success: true, message: 'Payment request completed successfully', data: result });
    } catch (error) {
      console.error('Complete payment request error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getAllTransactions(req, res) {
    try {
      const { limit = 50, offset = 0, ...filters } = req.query;
      const result = await paymentService.getAllTransactions(filters, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get all transactions error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async refundTransaction(req, res) {
    try {
      const adminId = req.user.id;
      const transactionId = req.params.transactionId;
      const { amount, reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Reason is required for refund' });
      }
      const result = await paymentService.refundTransaction(adminId, transactionId, amount, reason);
      res.status(200).json({ success: true, message: 'Transaction refunded successfully', data: result });
    } catch (error) {
      console.error('Refund transaction error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getAllWithdrawals(req, res) {
    try {
      const { limit = 50, offset = 0, ...filters } = req.query;
      const result = await paymentService.getAllWithdrawals(filters, parseInt(limit), parseInt(offset));
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Get all withdrawals error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async processWithdrawal(req, res) {
    try {
      const adminId = req.user.id;
      const withdrawalId = req.params.withdrawalId;
      const { transaction_reference } = req.body;
      const result = await paymentService.processWithdrawal(adminId, withdrawalId, transaction_reference);
      res.status(200).json({ success: true, message: 'Withdrawal processed successfully', data: result });
    } catch (error) {
      console.error('Process withdrawal error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async rejectWithdrawal(req, res) {
    try {
      const adminId = req.user.id;
      const withdrawalId = req.params.withdrawalId;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Reason is required for rejection' });
      }
      const result = await paymentService.rejectWithdrawal(adminId, withdrawalId, reason);
      res.status(200).json({ success: true, message: 'Withdrawal rejected successfully', data: result });
    } catch (error) {
      console.error('Reject withdrawal error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getDailyReport(req, res) {
    try {
      const { date } = req.query;
      const report = await paymentService.getDailyReport(date);
      res.status(200).json({ success: true, data: report });
    } catch (error) {
      console.error('Get daily report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getMonthlyReport(req, res) {
    try {
      const { year, month } = req.query;
      const report = await paymentService.getMonthlyReport(year ? parseInt(year) : null, month ? parseInt(month) : null);
      res.status(200).json({ success: true, data: report });
    } catch (error) {
      console.error('Get monthly report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getGatewayReport(req, res) {
    try {
      const { start_date, end_date } = req.query;
      const report = await paymentService.getGatewayReport(start_date, end_date);
      res.status(200).json({ success: true, data: report });
    } catch (error) {
      console.error('Get gateway report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getGatewayConfigurations(req, res) {
    try {
      const configs = await paymentService.getGatewayConfigurations();
      res.status(200).json({ success: true, data: configs });
    } catch (error) {
      console.error('Get gateway configurations error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updateGatewayConfiguration(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const configData = req.body;
      const updatedConfig = await paymentService.updateGatewayConfiguration(configData);
      res.status(200).json({ success: true, message: 'Gateway configuration updated successfully', data: updatedConfig });
    } catch (error) {
      console.error('Update gateway configuration error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async testGatewayConnection(req, res) {
    try {
      const gateway = req.params.gateway;
      const { environment = 'LIVE' } = req.query;
      const result = await paymentService.testGatewayConnection(gateway, environment);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Test gateway connection error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getPaymentSettings(req, res) {
    try {
      const settings = await paymentService.getPaymentSettings();
      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      console.error('Get payment settings error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async updatePaymentSettings(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      const settings = req.body;
      const result = await paymentService.updatePaymentSettings(settings);
      res.status(200).json({ success: true, message: 'Payment settings updated successfully', data: result });
    } catch (error) {
      console.error('Update payment settings error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async refundPayment(req, res) {
    try {
      const adminId = req.user.id;
      const requestId = req.params.requestId;
      const { amount, reason } = req.body;
      if (!reason) {
        return res.status(400).json({ success: false, error: 'Reason is required for refund' });
      }
      const result = await paymentService.refundPayment(adminId, requestId, amount, reason);
      res.status(200).json({ success: true, message: 'Payment refunded successfully', data: result });
    } catch (error) {
      console.error('Refund payment error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  // ADDITIONAL METHODS FOR COMPETITION SYSTEM
 async processSubscriptionPayment(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      
      const userId = req.user.id;
      const { tier_id, payment_method_id } = req.body;
      
      const result = await SubscriptionTicketService.processSubscriptionPayment(
        userId, tier_id, payment_method_id
      );
      
      res.status(200).json({
        success: true,
        message: 'Subscription payment processed successfully',
        data: result
      });
    } catch (error) {
      console.error('Process subscription payment error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async cancelSubscription(req, res) {
    try {
      const userId = req.user.id;
      const subscriptionId = req.params.subscriptionId;
      const { reason = '' } = req.body;
      
      const result = await SubscriptionTicketService.cancelSubscription(
        userId, subscriptionId, reason
      );
      
      res.status(200).json({
        success: true,
        message: 'Subscription cancelled successfully',
        data: result
      });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async purchaseTickets(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      
      const userId = req.user.id;
      const purchaseData = req.body;
      
      const result = await SubscriptionTicketService.purchaseTickets(userId, purchaseData);
      
      res.status(200).json({
        success: true,
        message: 'Tickets purchased successfully',
        data: result
      });
    } catch (error) {
      console.error('Purchase tickets error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async purchaseUniversalTickets(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }
      
      const userId = req.user.id;
      const purchaseData = req.body;
      
      const result = await SubscriptionTicketService.purchaseUniversalTickets(userId, purchaseData);
      
      res.status(200).json({
        success: true,
        message: 'Universal tickets purchased successfully',
        data: result
      });
    } catch (error) {
      console.error('Purchase universal tickets error:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getUserSubscriptions(req, res) {
    try {
      const userId = req.user.id;
      const subscriptions = await SubscriptionTicketService.getUserSubscriptions(userId);
      
      res.status(200).json({
        success: true,
        data: subscriptions
      });
    } catch (error) {
      console.error('Get user subscriptions error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getUserTickets(req, res) {
    try {
      const userId = req.user.id;
      const filters = req.query;
      
      const tickets = await SubscriptionTicketService.getUserTickets(userId, filters);
      
      res.status(200).json({
        success: true,
        data: tickets
      });
    } catch (error) {
      console.error('Get user tickets error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getSubscriptionTiers(req, res) {
    try {
      const tiers = await SubscriptionTicketService.getSubscriptionTiers();
      
      res.status(200).json({
        success: true,
        data: tiers
      });
    } catch (error) {
      console.error('Get subscription tiers error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }


}

export default new PaymentController();