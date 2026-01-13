import { validate } from "uuid";
import referralAnalyticsService from "./referralAnalyticsService.js"
import {ReferralAnalyticsQuerySchema} from "./referralSettingValidation.js"

class ReferralAnalyticsController {
  // Get dashboard analytics
  async getDashboardStats(req, res) {
    try {
      const stats = await referralAnalyticsService.getDashboardStats();
      
      return res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch referral analytics',
        error: error.message
      });
    }
  }

  // Get top referrers
  async getTopReferrers(req, res) {
    try {
      const validatedQuery = validate(ReferralAnalyticsQuerySchema, req.query);
      const result = await referralAnalyticsService.getTopReferrers(validatedQuery);
      
      return res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch top referrers'
      });
    }
  }

  // Get detailed analytics with filters
  async getDetailedAnalytics(req, res) {
    try {
      const validatedQuery = validate(ReferralAnalyticsQuerySchema, req.query);
      const analytics = await referralAnalyticsService.getDetailedAnalytics(validatedQuery);
      
      return res.status(200).json({
        success: true,
        data: analytics
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to fetch detailed analytics'
      });
    }
  }

  // Export referral data
  async exportReferralData(req, res) {
    try {
      const { format = 'csv', start_date, end_date } = req.query;
      
      const data = await referralAnalyticsService.exportData({
        start_date,
        end_date,
        format
      });
      
      // Set headers for file download
      res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=referral-data-${Date.now()}.${format}`);
      
      return res.send(data);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to export referral data',
        error: error.message
      });
    }
  }
}

export default new ReferralAnalyticsController();