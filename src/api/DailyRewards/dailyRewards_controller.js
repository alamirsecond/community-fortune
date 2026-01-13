import pool from "../../../../database.js";
import {
  DailyRewardConfigSchema,
  ClaimRewardSchema,
} from "./dailyRewards_validator.js";
import pointsController from "../Points/points_Controller.js"

const dailyRewardsController = {
  getTest: (req, res) => {
    res.status(200).json({
      message: "Daily Rewards Test Endpoint",
      timestamp: new Date().toISOString(),
    });
  },

  getMyStreak: async (req, res) => {
    try {
      const user_id = req.user.id;

      // Get user streak info
      const [streaks] = await pool.query(
        `SELECT * FROM user_streaks WHERE user_id = ?`,
        [user_id]
      );

      // Get today's reward status
      const [todayReward] = await pool.query(
        `SELECT * FROM daily_rewards 
         WHERE user_id = ? AND claimed_date = CURDATE()`,
        [user_id]
      );

      // Get rewards configuration
      const [config] = await pool.query(
        `SELECT * FROM daily_rewards_config ORDER BY day_number`
      );

      // Calculate next reward
      const currentStreak = streaks[0]?.current_streak || 0;
      const nextDay = (currentStreak % 7) + 1;
      const nextReward = config.find((c) => c.day_number === nextDay);

      const streakInfo = {
        current_streak: streaks[0]?.current_streak || 0,
        longest_streak: streaks[0]?.longest_streak || 0,
        total_logins: streaks[0]?.total_logins || 0,
        last_login_date: streaks[0]?.last_login_date,
        today_claimed: todayReward.length > 0,
        next_reward: nextReward,
        rewards_config: config,
      };

      res.status(200).json({
        success: true,
        data: streakInfo,
      });
    } catch (err) {
      console.error("Error fetching streak:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  claimDailyReward: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const user_id = req.user.id;
      const today = new Date().toISOString().split("T")[0];

      // Check if already claimed today
      const [existingClaim] = await connection.query(
        `SELECT * FROM daily_rewards 
         WHERE user_id = ? AND claimed_date = ?`,
        [user_id, today]
      );

      if (existingClaim.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Daily reward already claimed today",
        });
      }

      // Get or create user streak
      const [streaks] = await connection.query(
        `SELECT * FROM user_streaks WHERE user_id = ?`,
        [user_id]
      );

      let currentStreak = 0;
      let longestStreak = 0;
      let lastLoginDate = null;

      if (streaks.length === 0) {
        // First time login
        currentStreak = 1;
        longestStreak = 1;
        lastLoginDate = today;

        await connection.query(
          `INSERT INTO user_streaks (id, user_id, current_streak, longest_streak, last_login_date, total_logins)
           VALUES (UUID(), ?, ?, ?, ?, 1)`,
          [user_id, currentStreak, longestStreak, today]
        );
      } else {
        // Calculate streak
        const streak = streaks[0];
        const lastLogin = new Date(streak.last_login_date);
        const currentDate = new Date(today);
        const diffTime = currentDate - lastLogin;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          // Consecutive day
          currentStreak = streak.current_streak + 1;
        } else if (diffDays > 1) {
          // Broken streak
          currentStreak = 1;
        } else {
          // Same day (already claimed)
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: "Reward already claimed today",
          });
        }

        longestStreak = Math.max(currentStreak, streak.longest_streak);
        lastLoginDate = today;

        await connection.query(
          `UPDATE user_streaks 
           SET current_streak = ?, longest_streak = ?, last_login_date = ?, total_logins = total_logins + 1
           WHERE user_id = ?`,
          [currentStreak, longestStreak, today, user_id]
        );
      }

      // Calculate reward day (1-7 cycle)
      const rewardDay = ((currentStreak - 1) % 7) + 1;

      // Get reward configuration
      const [rewardConfig] = await connection.query(
        `SELECT * FROM daily_rewards_config WHERE day_number = ?`,
        [rewardDay]
      );

      if (rewardConfig.length === 0) {
        await connection.rollback();
        return res.status(500).json({
          success: false,
          message: "Reward configuration not found",
        });
      }

      const config = rewardConfig[0];

      // Award the reward based on type
      let awardedValue = config.reward_value;

      switch (config.reward_type) {
        case "POINTS":
          await pointsController.awardPointsToUser(
            connection,
            user_id,
            awardedValue,
            "DAILY_REWARD",
            `Daily login reward - Day ${rewardDay}`
          );
          break;
        case "SITE_CREDIT":
          await connection.query(
            `UPDATE wallets 
             SET balance = balance + ? 
             WHERE user_id = ? AND type = 'CREDIT'`,
            [awardedValue, user_id]
          );

          await connection.query(
            `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description)
             SELECT UUID(), id, ?, 'CREDIT', ?
             FROM wallets WHERE user_id = ? AND type = 'CREDIT'`,
            [awardedValue, `Daily login reward - Day ${rewardDay}`, user_id]
          );
          break;

        case "CASH":
          await connection.query(
            `UPDATE wallets 
             SET balance = balance + ? 
             WHERE user_id = ? AND type = 'CASH'`,
            [awardedValue, user_id]
          );

          await connection.query(
            `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description)
             SELECT UUID(), id, ?, 'CREDIT', ?
             FROM wallets WHERE user_id = ? AND type = 'CASH'`,
            [awardedValue, `Daily login reward - Day ${rewardDay}`, user_id]
          );
          break;

        case "FREE_TICKETS":
          // Implementation for free tickets would go here
          // This would depend on your ticket system
          break;
      }

      // Record the reward claim
      await connection.query(
        `INSERT INTO daily_rewards (id, user_id, day_number, reward_type, reward_value, reward_claimed, claimed_date)
         VALUES (UUID(), ?, ?, ?, ?, TRUE, ?)`,
        [user_id, rewardDay, config.reward_type, awardedValue, today]
      );

      await connection.commit();

      res.status(200).json({
        success: true,
        message: "Daily reward claimed successfully",
        reward: {
          day: rewardDay,
          type: config.reward_type,
          value: awardedValue,
          streak: currentStreak,
        },
      });
    } catch (err) {
      await connection.rollback();
      console.error("Error claiming daily reward:", err);
      res.status(500).json({
        success: false,
        error: "Failed to claim daily reward",
      });
    } finally {
      connection.release();
    }
  },

  getMyRewardHistory: async (req, res) => {
    try {
      const user_id = req.user.id;
      const { limit = 30, page = 1 } = req.query;
      const offset = (page - 1) * limit;

      const [rewards] = await pool.query(
        `SELECT * FROM daily_rewards 
         WHERE user_id = ? 
         ORDER BY claimed_date DESC 
         LIMIT ? OFFSET ?`,
        [user_id, parseInt(limit), offset]
      );

      const [total] = await pool.query(
        `SELECT COUNT(*) as total FROM daily_rewards WHERE user_id = ?`,
        [user_id]
      );

      res.status(200).json({
        success: true,
        data: rewards,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
      });
    } catch (err) {
      console.error("Error fetching reward history:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getRewardsConfig: async (req, res) => {
    try {
      const [config] = await pool.query(
        `SELECT * FROM daily_rewards_config ORDER BY day_number`
      );

      res.status(200).json({
        success: true,
        data: config,
      });
    } catch (err) {
      console.error("Error fetching rewards config:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  createRewardConfig: async (req, res) => {
    try {
      const parsed = DailyRewardConfigSchema.parse(req.body);

      await pool.query(
        `INSERT INTO daily_rewards_config (id, day_number, reward_type, reward_value, streak_required)
         VALUES (UUID(), ?, ?, ?, ?)`,
        [
          parsed.day_number,
          parsed.reward_type,
          parsed.reward_value,
          parsed.streak_required || false,
        ]
      );

      res.status(201).json({
        success: true,
        message: "Reward configuration created",
      });
    } catch (err) {
      console.error("Error creating reward config:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },

  updateRewardConfig: async (req, res) => {
    try {
      const { day_number } = req.params;
      const parsed = DailyRewardConfigSchema.parse(req.body);

      const [result] = await pool.query(
        `UPDATE daily_rewards_config 
         SET reward_type = ?, reward_value = ?, streak_required = ?
         WHERE day_number = ?`,
        [
          parsed.reward_type,
          parsed.reward_value,
          parsed.streak_required || false,
          day_number,
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Reward configuration not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Reward configuration updated",
      });
    } catch (err) {
      console.error("Error updating reward config:", err);
      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },

  getUserRewards: async (req, res) => {
    try {
      const { user_id } = req.params;

      const [rewards] = await pool.query(
        `SELECT dr.*, us.current_streak, us.longest_streak
         FROM daily_rewards dr
         LEFT JOIN user_streaks us ON dr.user_id = us.user_id
         WHERE dr.user_id = ?
         ORDER BY dr.claimed_date DESC`,
        [user_id]
      );

      res.status(200).json({
        success: true,
        data: rewards,
      });
    } catch (err) {
      console.error("Error fetching user rewards:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getAllUserStreaks: async (req, res) => {
    try {
      const { limit = 50, page = 1 } = req.query;
      const offset = (page - 1) * limit;

      const [streaks] = await pool.query(
        `SELECT us.*, u.username, u.email
         FROM user_streaks us
         JOIN users u ON us.user_id = u.id
         ORDER BY us.current_streak DESC, us.longest_streak DESC
         LIMIT ? OFFSET ?`,
        [parseInt(limit), offset]
      );

      const [total] = await pool.query(
        `SELECT COUNT(*) as total FROM user_streaks`
      );

      res.status(200).json({
        success: true,
        data: streaks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
      });
    } catch (err) {
      console.error("Error fetching user streaks:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
};

export default dailyRewardsController;
