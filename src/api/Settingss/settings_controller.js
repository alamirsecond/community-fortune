import settingsService from "./settings_service.js";
import { validate } from "./settings_validation.js";
import {
  changePasswordSchema,
  maintenanceSchema,
  paymentGatewaySchema,
  transactionLimitsSchema,
  securitySchema,
  subscriptionTierSchema,
  notificationSchema,
  legalDocumentSchema,
  contactSettingsSchema,
  faqSchema,
  voucherSchema,
  systemSettingsSchema
} from "./settings_validation.js";

class SettingsController {
  // ==================== PASSWORD SETTINGS ====================
  async changeAdminPassword(req, res) {
    try {
      const validatedData = validate(changePasswordSchema, req.body);
      const adminId = req.user.id;
      
      await settingsService.changeAdminPassword(adminId, validatedData);
      
      return res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== MAINTENANCE MODE ====================
  async getMaintenanceSettings(req, res) {
    try {
      const settings = await settingsService.getMaintenanceSettings();
      
      return res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch maintenance settings',
        error: error.message
      });
    }
  }

  async updateMaintenanceSettings(req, res) {
    try {
      const validatedData = validate(maintenanceSchema, req.body);
      const adminId = req.user.id;
      
      const settings = await settingsService.updateMaintenanceSettings(validatedData, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Maintenance settings updated successfully',
        data: settings
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== PAYMENT GATEWAY ====================
  async getPaymentGateways(req, res) {
    try {
      const gateways = await settingsService.getPaymentGateways();
      
      return res.status(200).json({
        success: true,
        data: gateways
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payment gateways',
        error: error.message
      });
    }
  }

  async updatePaymentGateways(req, res) {
    try {
      const validatedData = validate(paymentGatewaySchema, req.body);
      const adminId = req.user.id;
      
      const gateways = await settingsService.updatePaymentGateways(validatedData, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Payment gateways updated successfully',
        data: gateways
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getTransactionLimits(req, res) {
    try {
      const limits = await settingsService.getTransactionLimits();
      
      return res.status(200).json({
        success: true,
        data: limits
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction limits',
        error: error.message
      });
    }
  }

  async updateTransactionLimits(req, res) {
    try {
      const validatedData = validate(transactionLimitsSchema, req.body);
      const adminId = req.user.id;
      
      const limits = await settingsService.updateTransactionLimits(validatedData, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Transaction limits updated successfully',
        data: limits
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== SECURITY & AUTHENTICATION ====================
  async getSecuritySettings(req, res) {
    try {
      const securitySettings = await settingsService.getSecuritySettings();
      
      return res.status(200).json({
        success: true,
        data: securitySettings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch security settings',
        error: error.message
      });
    }
  }

  async updateSecuritySettings(req, res) {
    try {
      const validatedData = validate(securitySchema, req.body);
      const adminId = req.user.id;
      
      const settings = await settingsService.updateSecuritySettings(validatedData, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Security settings updated successfully',
        data: settings
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== SUBSCRIPTION TIERS ====================
  async getSubscriptionTiers(req, res) {
    try {
      const tiers = await settingsService.getSubscriptionTiers();
      
      return res.status(200).json({
        success: true,
        data: tiers
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch subscription tiers',
        error: error.message
      });
    }
  }

  async getSubscriptionTierById(req, res) {
    try {
      const { id } = req.params;
      const tier = await settingsService.getSubscriptionTierById(id);
      
      return res.status(200).json({
        success: true,
        data: tier
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async createSubscriptionTier(req, res) {
    try {
      const validatedData = validate(subscriptionTierSchema, req.body);
      const adminId = req.user.id;
      
      const tier = await settingsService.createSubscriptionTier(validatedData, adminId);
      
      return res.status(201).json({
        success: true,
        message: 'Subscription tier created successfully',
        data: tier
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateSubscriptionTier(req, res) {
    try {
      const { id } = req.params;
      const validatedData = validate(subscriptionTierSchema, req.body);
      const adminId = req.user.id;
      
      const tier = await settingsService.updateSubscriptionTier(id, validatedData, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Subscription tier updated successfully',
        data: tier
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteSubscriptionTier(req, res) {
    try {
      const { id } = req.params;
      await settingsService.deleteSubscriptionTier(id);
      
      return res.status(200).json({
        success: true,
        message: 'Subscription tier deleted successfully'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== NOTIFICATION SETTINGS ====================
  async getNotificationSettings(req, res) {
    try {
      const settings = await settingsService.getNotificationSettings();
      
      return res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notification settings',
        error: error.message
      });
    }
  }

  async updateNotificationSettings(req, res) {
    try {
      const validatedData = validate(notificationSchema, req.body);
      const adminId = req.user.id;
      
      const settings = await settingsService.updateNotificationSettings(validatedData, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Notification settings updated successfully',
        data: settings
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== LEGAL & COMPLIANCE ====================
  async getLegalSettings(req, res) {
    try {
      const settings = await settingsService.getLegalSettings();
      
      return res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch legal settings',
        error: error.message
      });
    }
  }

  async getLegalDocument(req, res) {
    try {
      const { type } = req.params;
      const document = await settingsService.getLegalDocument(type);
      
      return res.status(200).json({
        success: true,
        data: document
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateLegalDocument(req, res) {
    try {
      const { type } = req.params;
      const validatedData = validate(legalDocumentSchema, req.body);
      const adminId = req.user.id;
      
      const document = await settingsService.updateLegalDocument(type, validatedData, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Legal document updated successfully',
        data: document
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getAgeVerificationSettings(req, res) {
    try {
      const settings = await settingsService.getAgeVerificationSettings();
      
      return res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch age verification settings',
        error: error.message
      });
    }
  }

  async updateAgeVerificationSettings(req, res) {
    try {
      const { requireAgeVerification } = req.body;
      const adminId = req.user.id;
      
      const settings = await settingsService.updateAgeVerificationSettings(requireAgeVerification, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Age verification settings updated successfully',
        data: settings
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== CONTACT SETTINGS ====================
  async getContactSettings(req, res) {
    try {
      const settings = await settingsService.getContactSettings();
      
      return res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch contact settings',
        error: error.message
      });
    }
  }

  async updateContactSettings(req, res) {
    try {
      const validatedData = validate(contactSettingsSchema, req.body);
      const adminId = req.user.id;
      
      const settings = await settingsService.updateContactSettings(validatedData, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Contact settings updated successfully',
        data: settings
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== FAQ SETTINGS ====================
  async getFaqs(req, res) {
    try {
      const faqs = await settingsService.getAllFaqs();
      
      return res.status(200).json({
        success: true,
        data: faqs
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch FAQs',
        error: error.message
      });
    }
  }

  async getFaqsByScope(req, res) {
    try {
      const { scope } = req.params;
      const faqs = await settingsService.getFaqsByScope(scope);
      
      return res.status(200).json({
        success: true,
        data: faqs
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch FAQs',
        error: error.message
      });
    }
  }

  async createFaq(req, res) {
    try {
      const validatedData = validate(faqSchema, req.body);
      const adminId = req.user.id;
      
      const faq = await settingsService.createFaq(validatedData, adminId);
      
      return res.status(201).json({
        success: true,
        message: 'FAQ created successfully',
        data: faq
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateFaq(req, res) {
    try {
      const { id } = req.params;
      const validatedData = validate(faqSchema, req.body);
      
      const faq = await settingsService.updateFaq(id, validatedData);
      
      return res.status(200).json({
        success: true,
        message: 'FAQ updated successfully',
        data: faq
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteFaq(req, res) {
    try {
      const { id } = req.params;
      await settingsService.deleteFaq(id);
      
      return res.status(200).json({
        success: true,
        message: 'FAQ deleted successfully'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== VOUCHER SETTINGS ====================
  async getVoucherSettings(req, res) {
    try {
      const vouchers = await settingsService.getVoucherSettings();
      
      return res.status(200).json({
        success: true,
        data: vouchers
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch voucher settings',
        error: error.message
      });
    }
  }

  async createVoucher(req, res) {
    try {
      const validatedData = validate(voucherSchema, req.body);
      const adminId = req.user.id;
      
      const voucher = await settingsService.createVoucher(validatedData, adminId);
      
      return res.status(201).json({
        success: true,
        message: 'Voucher created successfully',
        data: voucher
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateVoucher(req, res) {
    try {
      const { id } = req.params;
      const validatedData = validate(voucherSchema, req.body);
      
      const voucher = await settingsService.updateVoucher(id, validatedData);
      
      return res.status(200).json({
        success: true,
        message: 'Voucher updated successfully',
        data: voucher
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteVoucher(req, res) {
    try {
      const { id } = req.params;
      await settingsService.deleteVoucher(id);
      
      return res.status(200).json({
        success: true,
        message: 'Voucher deleted successfully'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // ==================== SYSTEM SETTINGS ====================
  async getSystemSettings(req, res) {
    try {
      const settings = await settingsService.getSystemSettings();
      
      return res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch system settings',
        error: error.message
      });
    }
  }

  async updateSystemSettings(req, res) {
    try {
      const validatedData = validate(systemSettingsSchema, req.body);
      const adminId = req.user.id;
      
      const settings = await settingsService.updateSystemSettings(validatedData, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'System settings updated successfully',
        data: settings
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

export default new SettingsController();