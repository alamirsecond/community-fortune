import pool from "../../../database.js"
import { v4 as uuidv4 } from 'uuid';

class ReferralSettingsService {
async getSettings() {
  const [rows] = await pool.query(
    `
    SELECT 
      id,
      total_referral_amount,
      reward_per_referral,
      alternative_reward,
      condition_min_spend,
      total_new_user_amount,
      onboarding_reward,
      alternative_onboarding_reward,
      reward_type,
      amount_left,
      is_active,
      BIN_TO_UUID(updated_by) AS updated_by,
      updated_at
    FROM referral_settings
    ORDER BY updated_at DESC
    LIMIT 1
    `
  );

  if (rows.length === 0) {
    return this.createDefaultSettings();
  }

  return rows[0];
}


async updateSettings(data, updatedBy) {
  // 1️⃣ Validate user exists (UUID → BIN)
  const [[user]] = await pool.query(
    'SELECT 1 FROM users WHERE id = UUID_TO_BIN(?)',
    [updatedBy]
  );

  if (!user) {
    throw new Error('Invalid user for updated_by');
  }

  const current = await this.getSettings();

  // 2️⃣ Build dynamic SQL safely
  const fields = [];
  const values = [];

  for (const [key, value] of Object.entries(data)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  fields.push('updated_by = UUID_TO_BIN(?)');
  values.push(updatedBy);

  if (!current?.id) {
    // INSERT
    await pool.query(
      `
      INSERT INTO referral_settings
      SET ${fields.join(', ')}
      `,
      values
    );
  } else {
    // UPDATE
    await pool.query(
      `
      UPDATE referral_settings
      SET ${fields.join(', ')}
      WHERE id = ?
      `,
      [...values, current.id]
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
  await pool.query(
    `
    INSERT INTO referral_settings (
      total_referral_amount,
      reward_per_referral,
      alternative_reward,
      condition_min_spend,
      total_new_user_amount,
      onboarding_reward,
      alternative_onboarding_reward,
      reward_type,
      amount_left,
      is_active,
      updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `,
    [4000, 5, 100, 10, 4000, 5, 100, 'SITE_CREDIT', 2000, true]
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