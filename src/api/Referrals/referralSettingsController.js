import referralSettingsService from "./referralSettingsService.js"
import {UpdateReferralSettingsSchema, validate} from "./referralSettingValidation.js"

class ReferralSettingsController {
  // Get current referral settings
  async getSettings(req, res) {
    try {
      const settings = await referralSettingsService.getSettings();
      return res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch referral settings',
        error: error.message
      });
    }
  }

  // Update referral settings
  async updateSettings(req, res) {
    try {
      const validatedData = validate(UpdateReferralSettingsSchema, req.body);
      const updatedBy = req.user.id;
      
      const settings = await referralSettingsService.updateSettings(validatedData, updatedBy);
      
      return res.status(200).json({
        success: true,
        message: 'Referral settings updated successfully',
        data: settings
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update referral settings'
      });
    }
  }

  // Get all referral tiers
  async getTiers(req, res) {
    try {
      const tiers = await referralSettingsService.getAllTiers();
      
      return res.status(200).json({
        success: true,
        data: tiers
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch referral tiers',
        error: error.message
      });
    }
  }

  // Create or update referral tier
  async updateTier(req, res) {
    try {
      const validatedData = validate(ReferralTierSchema, req.body);
      const tierId = req.params.id;
      
      const tier = await referralSettingsService.updateTier(tierId, validatedData);
      
      return res.status(200).json({
        success: true,
        message: tierId ? 'Tier updated successfully' : 'Tier created successfully',
        data: tier
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update tier'
      });
    }
  }

  // Delete referral tier
  async deleteTier(req, res) {
    try {
      await referralSettingsService.deleteTier(req.params.id);
      
      return res.status(200).json({
        success: true,
        message: 'Tier deleted successfully'
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete tier'
      });
    }
  }
}

export default new ReferralSettingsController();