// src/api/wallet/spendingLimitsController.js
import pool from '../../../database.js';

const spendingLimitsController = {
  // Get user's spending limits
  getSpendingLimits: async (req, res) => {
    try {
      const userId = req.user.id;

      const [limits] = await pool.query(
        `SELECT 
          daily_limit as dailyLimit,
          weekly_limit as weeklyLimit,
          monthly_limit as monthlyLimit,
          single_purchase_limit as singlePurchaseLimit,
          daily_spent as dailySpent,
          weekly_spent as weeklySpent,
          monthly_spent as monthlySpent,
          limit_reset_date as limitResetDate,
          created_at as createdAt,
          updated_at as updatedAt
         FROM spending_limits 
         WHERE user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      // If no limits set, return defaults
      if (limits.length === 0) {
        return res.json({
          success: true,
          data: {
            dailyLimit: 0,
            weeklyLimit: 0,
            monthlyLimit: 0,
            singlePurchaseLimit: 0,
            dailySpent: 0,
            weeklySpent: 0,
            monthlySpent: 0,
            limitResetDate: null
          }
        });
      }

      res.json({
        success: true,
        data: limits[0]
      });

    } catch (error) {
      console.error('Get spending limits error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  },

  // Update spending limits
  updateSpendingLimits: async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
      const { dailyLimit, weeklyLimit, monthlyLimit, singlePurchaseLimit } = req.body;
      const userId = req.user.id;

      // Validate limits
      if (dailyLimit < 0 || weeklyLimit < 0 || monthlyLimit < 0 || singlePurchaseLimit < 0) {
        return res.status(400).json({
          success: false,
          message: 'Limits cannot be negative'
        });
      }

      await connection.beginTransaction();

      // Check if limits already exist
      const [existing] = await connection.query(
        `SELECT id FROM spending_limits WHERE user_id = UUID_TO_BIN(?)`,
        [userId]
      );

      if (existing.length > 0) {
        // Update existing limits
        await connection.query(
          `UPDATE spending_limits 
           SET daily_limit = ?, weekly_limit = ?, monthly_limit = ?, 
               single_purchase_limit = ?, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = UUID_TO_BIN(?)`,
          [dailyLimit, weeklyLimit, monthlyLimit, singlePurchaseLimit, userId]
        );
      } else {
        // Insert new limits
        await connection.query(
          `INSERT INTO spending_limits 
           (id, user_id, daily_limit, weekly_limit, monthly_limit, single_purchase_limit, limit_reset_date)
           VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, ?, ?, CURDATE())`,
          [userId, dailyLimit, weeklyLimit, monthlyLimit, singlePurchaseLimit]
        );
      }

      await connection.commit();

      res.json({
        success: true,
        message: 'Spending limits updated successfully',
        data: {
          dailyLimit,
          weeklyLimit,
          monthlyLimit,
          singlePurchaseLimit,
          updatedAt: new Date().toISOString()
        }
      });

    } catch (error) {
      await connection.rollback();
      console.error('Update spending limits error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    } finally {
      connection.release();
    }
  },

  // Reset spending counts (admin only or daily cron job)
  resetSpendingCounts: async (req, res) => {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Reset daily spending
      await connection.query(
        `UPDATE spending_limits 
         SET daily_spent = 0 
         WHERE limit_reset_date < CURDATE() OR limit_reset_date IS NULL`
      );

      // Reset weekly spending on Mondays
      if (new Date().getDay() === 1) { // Monday
        await connection.query(
          `UPDATE spending_limits 
           SET weekly_spent = 0`
        );
      }

      // Reset monthly spending on 1st of month
      if (new Date().getDate() === 1) {
        await connection.query(
          `UPDATE spending_limits 
           SET monthly_spent = 0`
        );
      }

      // Update reset date
      await connection.query(
        `UPDATE spending_limits 
         SET limit_reset_date = CURDATE()`
      );

      await connection.commit();

      res.json({
        success: true,
        message: 'Spending counts reset successfully'
      });

    } catch (error) {
      await connection.rollback();
      console.error('Reset spending counts error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    } finally {
      connection.release();
    }
  }
};

export default spendingLimitsController;