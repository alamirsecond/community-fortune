import pool from "../../../database.js"
import { v4 as uuidv4 } from 'uuid';

class ReferralSettingsService {
async getSettings() {
  const [rows] = await pool.query(
    'SELECT * FROM referral_settings ORDER BY updated_at DESC LIMIT 1'
  );

  if (rows.length === 0) {
    return this.createDefaultSettings();
  }

  return rows[0];
}

async updateSettings(data, updatedBy) {
  // 🔐 make sure updatedBy exists
  const [[user]] = await pool.query(
    'SELECT id FROM users WHERE id = ?',
    [updatedBy]
  );

  if (!user) {
    throw new Error('Invalid user for updated_by');
  }

  const current = await this.getSettings();

  if (!current?.id) {
    // No row yet → create
    await pool.query(
      'INSERT INTO referral_settings SET ?',
      { ...data, updated_by: updatedBy }
    );
  } else {
    // Update existing row
    await pool.query(
      'UPDATE referral_settings SET ? WHERE id = ?',
      [{ ...data, updated_by: updatedBy }, current.id]
    );
  }

  return this.getSettings();
}


  async getAllTiers() {
    const [tiers] = await pool.query(
      'SELECT * FROM referral_tiers ORDER BY min_referrals ASC'
    );
    
    // Get member counts for each tier
    for (const tier of tiers) {
      const [memberCount] = await pool.query(
        `SELECT COUNT(*) as count 
         FROM user_referral_stats 
         WHERE current_tier_id = ?`,
        [tier.id]
      );
      tier.current_members = memberCount[0]?.count || 0;
    }
    
    return tiers;
  }

  async updateTier(tierId, data) {
    if (tierId) {
      // Update existing tier
      const [result] = await pool.query(
        'UPDATE referral_tiers SET ? WHERE id = ?',
        [data, tierId]
      );
      
      if (result.affectedRows === 0) {
        throw new Error('Tier not found');
      }
      
      const [updatedTier] = await pool.query(
        'SELECT * FROM referral_tiers WHERE id = ?',
        [tierId]
      );
      
      return updatedTier[0];
    } else {
      // Create new tier
      const [result] = await pool.query(
        'INSERT INTO referral_tiers SET ?',
        [data]
      );
      
      const [newTier] = await pool.query(
        'SELECT * FROM referral_tiers WHERE id = ?',
        [result.insertId]
      );
      
      return newTier[0];
    }
  }

  async deleteTier(tierId) {
    // Check if any users are in this tier
    const [usersInTier] = await pool.query(
      'SELECT COUNT(*) as count FROM user_referral_stats WHERE current_tier_id = ?',
      [tierId]
    );
    
    if (usersInTier[0].count > 0) {
      throw new Error('Cannot delete tier with active members. Reassign users first.');
    }
    
    const [result] = await pool.query(
      'DELETE FROM referral_tiers WHERE id = ?',
      [tierId]
    );
    
    if (result.affectedRows === 0) {
      throw new Error('Tier not found');
    }
    
    return true;
  }

async createDefaultSettings() {
  const defaultSettings = {
    total_referral_amount: 4000,
    reward_per_referral: 5,
    alternative_reward: 100,
    condition_min_spend: 10,
    total_new_user_amount: 4000,
    onboarding_reward: 5,
    alternative_onboarding_reward: 100,
    reward_type: 'SITE_CREDIT',
    amount_left: 2000,
    is_active: true,
    updated_by: null // ✅ SAFE
  };

  await pool.query(
    'INSERT INTO referral_settings SET ?',
    [defaultSettings]
  );

  return this.getSettings();
}


  // Initialize default tiers
  async initializeDefaultTiers() {
    const defaultTiers = [
      {
        name: 'Bronze',
        min_referrals: 0,
        max_referrals: 5,
        cash_reward: 5.00,
        points_reward: 10,
        color: '#CD7F32'
      },
      {
        name: 'Silver',
        min_referrals: 6,
        max_referrals: 20,
        cash_reward: 10.00,
        points_reward: 25,
        color: '#C0C0C0'
      },
      {
        name: 'Gold',
        min_referrals: 21,
        max_referrals: 50,
        cash_reward: 20.00,
        points_reward: 50,
        color: '#FFD700'
      },
      {
        name: 'Platinum',
        min_referrals: 51,
        max_referrals: null,
        cash_reward: 50.00,
        points_reward: 100,
        color: '#E5E4E2'
      }
    ];
    
    for (const tier of defaultTiers) {
      await pool.query('INSERT IGNORE INTO referral_tiers SET ?', [tier]);
    }
    
    return this.getAllTiers();
  }
}

export default new ReferralSettingsService();