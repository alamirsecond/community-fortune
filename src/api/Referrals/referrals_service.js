import pool from "../../../database.js";

export const ReferralService = {
  // Check if user can claim referral reward (first purchase)
  canClaimReferralReward: async (user_id) => {
    const [purchases] = await pool.query(
      `SELECT COUNT(*) as purchase_count 
       FROM purchases 
       WHERE user_id = ? AND status = 'PAID'`,
      [user_id]
    );
    return purchases[0].purchase_count === 1; // First purchase
  },

  // Award referral reward automatically
  awardReferralReward: async (user_id) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Call the stored procedure
      await connection.query(`CALL AwardReferralReward(?)`, [user_id]);

      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      console.error("Award referral reward error:", error);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  },

  // Get referral tier progress
  getTierProgress: async (user_id) => {
    const [progress] = await pool.query(
      `SELECT 
        r.current_tier,
        rt.tier_name,
        r.total_referrals,
        rt2.min_referrals as next_tier_requirement,
        rt2.tier_name as next_tier_name,
        (rt2.min_referrals - r.total_referrals) as referrals_needed
       FROM referrals r
       JOIN referral_tiers rt ON r.current_tier = rt.tier_level
       LEFT JOIN referral_tiers rt2 ON rt2.tier_level = r.current_tier + 1
       WHERE r.user_id = ?`,
      [user_id]
    );
    return progress[0] || null;
  },
};

export default ReferralService;
