import settingsService from "./settings_service.js";

class SettingsController {
  // ==================== PASSWORD SETTINGS ====================
  async changeAdminPassword(req, res) {
    try {
      const adminId = req.user.id;
      const { oldPassword, newPassword, confirmNewPassword } = req.body;
      
      await settingsService.changeAdminPassword(adminId, { 
        oldPassword, 
        newPassword, 
        confirmNewPassword 
      });
      
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
      const adminId = req.user.id;
      const settings = await settingsService.updateMaintenanceSettings(req.body, adminId);
      
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

  async getAllGateways(req, res) {
    try {
      const gateways = await settingsService.getAllPaymentGateways();
      
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

  async enablePaymentGateway(req, res) {
    try {
      const adminId = req.user.id;
      const { gateway, environment } = req.body;
      
      await settingsService.enablePaymentGateway(gateway, environment, adminId);
      
      return res.status(200).json({
        success: true,
        message: `Payment gateway ${gateway} enabled successfully`
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async disablePaymentGateway(req, res) {
    try {
      const adminId = req.user.id;
      const { gateway, environment } = req.body;
      
      await settingsService.disablePaymentGateway(gateway, environment, adminId);
      
      return res.status(200).json({
        success: true,
        message: `Payment gateway ${gateway} disabled successfully`
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async configurePaymentGateway(req, res) {
    try {
      const adminId = req.user.id;
      const gateway = await settingsService.configurePaymentGateway(req.body, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Payment gateway configured successfully',
        data: gateway
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
      const adminId = req.user.id;
      const limits = await settingsService.updateTransactionLimits(req.body, adminId);
      
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
      const settings = await settingsService.getSecuritySettings();
      
      return res.status(200).json({
        success: true,
        data: settings
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
      const adminId = req.user.id;
      const settings = await settingsService.updateSecuritySettings(req.body, adminId);
      
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

  // ==================== SECRET MANAGEMENT ====================
  async getSecrets(req, res) {
    try {
      const data = await settingsService.getSecretOverview();
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch secrets overview',
        error: error.message
      });
    }
  }

  async updateSecrets(req, res) {
    try {
      if (req.user.role !== 'SUPERADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Only super administrators can update secrets'
        });
      }

      const adminId = req.user.id;
      const data = await settingsService.updateSecrets(req.body, adminId);

      return res.status(200).json({
        success: true,
        message: 'Secrets updated successfully',
        data
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
      const adminId = req.user.id;
      const tier = await settingsService.createSubscriptionTier(req.body, adminId);
      
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
      const adminId = req.user.id;
      const tier = await settingsService.updateSubscriptionTier(id, req.body, adminId);
      
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

  async getNotificationTypes(req, res) {
    try {
      const types = await settingsService.getNotificationTypes();
      
      return res.status(200).json({
        success: true,
        data: types
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notification types',
        error: error.message
      });
    }
  }

  async enableNotificationType(req, res) {
    try {
      const adminId = req.user.id;
      const { type, category } = req.body;
      
      await settingsService.enableNotificationType(type, category, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Notification type enabled successfully'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async disableNotificationType(req, res) {
    try {
      const adminId = req.user.id;
      const { type, category } = req.body;
      
      await settingsService.disableNotificationType(type, category, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Notification type disabled successfully'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateEmailTemplates(req, res) {
    try {
      const adminId = req.user.id;
      const templates = await settingsService.updateEmailTemplates(req.body, adminId);
      
      return res.status(200).json({
        success: true,
        message: 'Email templates updated successfully',
        data: templates
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
      const adminId = req.user.id;
      const document = await settingsService.updateLegalDocument(type, req.body, adminId);
      
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
      const adminId = req.user.id;
      const settings = await settingsService.updateAgeVerificationSettings(req.body, adminId);
      
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
      const adminId = req.user.id;
      const settings = await settingsService.updateContactSettings(req.body, adminId);
      
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
      const adminId = req.user.id;
      const faq = await settingsService.createFaq(req.body, adminId);
      
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
      const faq = await settingsService.updateFaq(id, req.body);
      
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
      const adminId = req.user.id;
      const voucher = await settingsService.createVoucher(req.body, adminId);
      
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
      const voucher = await settingsService.updateVoucher(id, req.body);
      
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
      const adminId = req.user.id;
      const settings = await settingsService.updateSystemSettings(req.body, adminId);
      
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