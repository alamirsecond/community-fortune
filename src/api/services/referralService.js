// services/referralService.js
import { v4 as uuidv4 } from 'uuid';
import pool from '../../../database.js';

class ReferralService {
  // Generate unique referral code
  async generateReferralCode(userId, customCode = null) {
    let code = customCode;
    
    if (!code) {
      code = this.generateRandomCode(8);
    }

    // Check if code exists in either table
    const [existing] = await pool.query(
      `SELECT id FROM referral_codes WHERE code = ? 
       UNION 
       SELECT id FROM referrals WHERE code = ?`,
      [code, code]
    );

    if (existing.length > 0) {
      throw new Error('Referral code already exists');
    }

    const codeId = uuidv4();
    
    // Insert into referral_codes table
    await pool.query(
      `INSERT INTO referral_codes (id, user_id, code) 
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?)`,
      [codeId, userId, code]
    );

    // Also insert into referrals table for backward compatibility
    const referralId = uuidv4();
    await pool.query(
      `INSERT INTO referrals (id, user_id, code, reward_type, reward_value, status) 
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'credit', 0, 'pending')`,
      [referralId, userId, code]
    );

    // Update user's referral code
    await pool.query(
      'UPDATE users SET referral_code = ? WHERE id = UUID_TO_BIN(?)',
      [code, userId]
    );

    return code;
  }

  generateRandomCode(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Process referral when new user registers
  async processReferral(referredUserId, referralCode) {
    if (!referralCode) return;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // Find referrer using the code
      const [referrers] = await connection.query(
        `SELECT BIN_TO_UUID(u.id) as id, u.level, u.total_referrals 
         FROM users u 
         WHERE u.referral_code = ? OR u.id = (
           SELECT user_id FROM referral_codes WHERE code = ?
         )`,
        [referralCode, referralCode]
      );

      if (referrers.length === 0) {
        await connection.rollback();
        return;
      }

      const referrer = referrers[0];

      // Update referred user's referred_by field
      await connection.query(
        'UPDATE users SET referred_by = UUID_TO_BIN(?) WHERE id = UUID_TO_BIN(?)',
        [referrer.id, referredUserId]
      );

      // Create referral history record
      const referralHistoryId = uuidv4();
      
      // Get the referral ID
      const [referralRecords] = await connection.query(
        `SELECT id FROM referrals WHERE user_id = UUID_TO_BIN(?) AND code = ?`,
        [referrer.id, referralCode]
      );
      
      if (referralRecords.length > 0) {
        await connection.query(
          `INSERT INTO referral_history (id, referral_id, referred_user_id, reward_given) 
           VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), FALSE)`,
          [referralHistoryId, referralRecords[0].id, referredUserId]
        );
      }

      // Update referrer's stats
      await connection.query(
        'UPDATE users SET total_referrals = total_referrals + 1 WHERE id = UUID_TO_BIN(?)',
        [referrer.id]
      );

      // Add XP to referrer based on their level
      const xpReward = this.calculateXPForReferral(referrer.level);
      await this.addXP(connection, referrer.id, xpReward);

      // Give initial reward to new user
      await this.giveWelcomeReward(connection, referredUserId);

      // Give referral reward to referrer
      await this.giveReferralReward(connection, referrer.id, referredUserId);

      await connection.commit();
      
      // Check for level ups
      await this.checkLevelUp(referrer.id);

    } catch (error) {
      await connection.rollback();
      console.error('Process referral error:', error);
      // Don't throw error to prevent registration failure
    } finally {
      connection.release();
    }
  }

  calculateXPForReferral(level) {
    const baseXP = 100;
    const multiplier = 1 + (level * 0.1);
    return Math.floor(baseXP * multiplier);
  }

  async addXP(connection, userId, xpAmount) {
    await connection.query(
      'UPDATE users SET xp_points = xp_points + ? WHERE id = UUID_TO_BIN(?)',
      [xpAmount, userId]
    );
  }

  async giveWelcomeReward(connection, userId) {
    const rewardId = uuidv4();
    await connection.query(
      `INSERT INTO user_rewards (id, user_id, reward_type, reward_amount, source, description, status) 
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'credit', 10.00, 'referral', 'Welcome reward for joining', 'credited')`,
      [rewardId, userId]
    );

    // Add to user's credit wallet
    await connection.query(
      `UPDATE wallets SET balance = balance + 10.00 
       WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
      [userId]
    );
  }

  async giveReferralReward(connection, referrerId, referredUserId) {
    const rewardId = uuidv4();
    
    // Give credit reward to referrer
    await connection.query(
      `INSERT INTO user_rewards (id, user_id, reward_type, reward_amount, source, description, status) 
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'credit', 25.00, 'referral', 'Referral reward', 'credited')`,
      [rewardId, referrerId]
    );

    // Add to referrer's credit wallet
    await connection.query(
      `UPDATE wallets SET balance = balance + 25.00 
       WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
      [referrerId]
    );

    // Update referral status to completed
    await connection.query(
      `UPDATE referrals SET status = 'completed', reward_value = 25.00 
       WHERE user_id = UUID_TO_BIN(?) AND id IN (
         SELECT referral_id FROM referral_history WHERE referred_user_id = UUID_TO_BIN(?)
       )`,
      [referrerId, referredUserId]
    );

    // Update referral history
    await connection.query(
      `UPDATE referral_history SET reward_given = TRUE 
       WHERE referred_user_id = UUID_TO_BIN(?)`,
      [referredUserId]
    );
  }

  async checkLevelUp(userId) {
    const [users] = await pool.query(
      `SELECT BIN_TO_UUID(id) as id, xp_points, level 
       FROM users WHERE id = UUID_TO_BIN(?)`,
      [userId]
    );

    if (users.length === 0) return;

    const user = users[0];
    const [levels] = await pool.query(
      'SELECT level, xp_required, perks FROM user_levels WHERE xp_required <= ? ORDER BY level DESC LIMIT 1',
      [user.xp_points]
    );

    if (levels.length > 0 && levels[0].level > user.level) {
      const newLevel = levels[0].level;
      
      // Update user level
      await pool.query(
        'UPDATE users SET level = ? WHERE id = UUID_TO_BIN(?)',
        [newLevel, userId]
      );

      // Give level up rewards
      await this.giveLevelUpRewards(userId, newLevel, levels[0].perks);

      return {
        levelUp: true,
        newLevel: newLevel,
        perks: levels[0].perks
      };
    }

    return { levelUp: false };
  }

  async giveLevelUpRewards(userId, newLevel, perks) {
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();

      // Parse perks JSON and apply rewards
      const perksObj = typeof perks === 'string' ? JSON.parse(perks) : perks;
      
      if (perksObj.credit) {
        const rewardId = uuidv4();
        await connection.query(
          `INSERT INTO user_rewards (id, user_id, reward_type, reward_amount, source, description, status) 
           VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'credit', ?, 'level_up', 'Level ${newLevel} reward', 'credited')`,
          [rewardId, userId, perksObj.credit]
        );

        await connection.query(
          `UPDATE wallets SET balance = balance + ? 
           WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
          [perksObj.credit, userId]
        );
      }

      if (perksObj.tickets) {
        const rewardId = uuidv4();
        await connection.query(
          `INSERT INTO user_rewards (id, user_id, reward_type, reward_amount, source, description, status) 
           VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'tickets', ?, 'level_up', 'Level ${newLevel} reward', 'credited')`,
          [rewardId, userId, perksObj.tickets]
        );
      }

      await connection.commit();

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // Get user's referral stats
  async getUserReferralStats(userId) {
    const [stats] = await pool.query(
      `SELECT 
        u.total_referrals,
        u.xp_points,
        u.level,
        u.referral_code,
        COUNT(rh.id) as successful_referrals,
        COALESCE(SUM(ur.reward_amount), 0) as total_rewards
       FROM users u
       LEFT JOIN referral_history rh ON u.id = (
         SELECT user_id FROM referrals WHERE id = rh.referral_id
       )
       LEFT JOIN user_rewards ur ON u.id = ur.user_id AND ur.source = 'referral'
       WHERE u.id = UUID_TO_BIN(?)
       GROUP BY u.id`,
      [userId]
    );

    const [rewards] = await pool.query(
      `SELECT BIN_TO_UUID(id) as id, reward_type, reward_amount, description, created_at 
       FROM user_rewards 
       WHERE user_id = UUID_TO_BIN(?) AND status = 'credited'
       ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    const [levelInfo] = await pool.query(
      `SELECT level_name, xp_required, perks 
       FROM user_levels 
       WHERE level = (SELECT level FROM users WHERE id = UUID_TO_BIN(?))`,
      [userId]
    );

    const [nextLevel] = await pool.query(
      'SELECT level, level_name, xp_required FROM user_levels WHERE level > ? ORDER BY level ASC LIMIT 1',
      [stats[0]?.level || 1]
    );

    const [referralHistory] = await pool.query(
      `SELECT 
        rh.created_at,
        u2.username as referred_username,
        rh.reward_given
       FROM referral_history rh
       JOIN referrals r ON rh.referral_id = r.id
       JOIN users u2 ON rh.referred_user_id = u2.id
       WHERE r.user_id = UUID_TO_BIN(?)
       ORDER BY rh.created_at DESC LIMIT 5`,
      [userId]
    );

    return {
      stats: stats[0] || {},
      recentRewards: rewards,
      currentLevel: levelInfo[0] || {},
      nextLevel: nextLevel[0] || null,
      referralHistory: referralHistory
    };
  }

  // Add XP from other activities (purchases, etc.)
  async addXpFromPurchase(userId, purchaseAmount) {
    const xpEarned = Math.floor(purchaseAmount * 10); // 10 XP per £1 spent
    
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await this.addXP(connection, userId, xpEarned);

      // Record the reward
      const rewardId = uuidv4();
      await connection.query(
        `INSERT INTO user_rewards (id, user_id, reward_type, reward_amount, source, description, status) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'xp', ?, 'purchase', 'XP from purchase', 'credited')`,
        [rewardId, userId, xpEarned]
      );

      await connection.commit();

      // Check for level up
      await this.checkLevelUp(userId);

      return xpEarned;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default new ReferralService();