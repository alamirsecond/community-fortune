// src/api/wallet/spendingLimitsController.js
import pool from '../../../database.js';
import SpendingLimitsService from '../spendingLimits/spending_limit_con.js';

const spendingLimitsController = {
  // Get user's spending limits
  getSpendingLimits: async (req, res) => {
    try {
      const userId = req.user.id;
      const connection = await pool.getConnection();
      const limits = await SpendingLimitsService.getLimits(connection, userId);
      connection.release();

      if (!limits) {
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

      // map database names to camel case shown to clients
      const formatted = {
        dailyLimit: limits.daily_limit,
        weeklyLimit: limits.weekly_limit,
        monthlyLimit: limits.monthly_limit,
        singlePurchaseLimit: limits.single_purchase_limit,
        dailySpent: limits.daily_spent,
        weeklySpent: limits.weekly_spent,
        monthlySpent: limits.monthly_spent,
        limitResetDate: limits.limit_reset_date,
        createdAt: limits.created_at,
        updatedAt: limits.updated_at
      };

      res.json({ success: true, data: formatted });

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
      await connection.beginTransaction();
      const userId = req.user.id;
      const validated = await SpendingLimitsService.saveLimits(connection, userId, {
        daily_limit: req.body.dailyLimit,
        weekly_limit: req.body.weeklyLimit,
        monthly_limit: req.body.monthlyLimit,
        single_purchase_limit: req.body.singlePurchaseLimit
      });
      await connection.commit();

      res.json({
        success: true,
        message: 'Spending limits updated successfully',
        data: {
          limits: validated,
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