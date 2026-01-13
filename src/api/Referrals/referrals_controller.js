import pool from "../../../database.js";
import { 
  ReferralSchema, 
  ReferralHistorySchema, 
  ApplyReferralSchema 
} from "./referrals_validation.js";

const referralController = {
  getTest: (req, res) => {
    res.status(200).json({ 
      message: "Referral Test Endpoint",
      timestamp: new Date().toISOString()
    });
  },

  getMyReferralStats: async (req, res) => {
    try {
      const user_id = req.user.id;

      const [referralStats] = await pool.query(
        `SELECT 
          r.*,
          rt.tier_name,
          rt.perks,
          (SELECT COUNT(*) FROM referral_history rh WHERE rh.referral_id = r.id AND rh.reward_given = TRUE) as successful_referrals,
          (SELECT COUNT(*) FROM referral_history rh WHERE rh.referral_id = r.id AND rh.reward_given = FALSE) as pending_referrals
         FROM referrals r
         JOIN referral_tiers rt ON r.current_tier = rt.tier_level
         WHERE r.user_id = ?`,
        [user_id]
      );

      if (referralStats.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "Referral record not found" 
        });
      }

      // Get next tier info
      const [nextTier] = await pool.query(
        `SELECT * FROM referral_tiers 
         WHERE tier_level > ? 
         ORDER BY tier_level ASC 
         LIMIT 1`,
        [referralStats[0].current_tier]
      );
      const stats = {
        ...referralStats[0],
        referral_link: `${process.env.FRONTEND_URL}/signup?ref=${referralStats[0].code}`,
        next_tier: nextTier[0] || null,
        referrals_needed: nextTier[0] ? nextTier[0].min_referrals - referralStats[0].total_referrals : 0
      };
      res.status(200).json({ 
        success: true, 
        stats 
      });
    } catch (err) {
      console.error("Get referral stats error:", err);
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  },

  getUserReferrals: async (req, res) => {
    try {
      const { user_id } = ReferralSchema.parse(req.params);

      const [referrals] = await pool.query(
        `SELECT * FROM referrals WHERE user_id = ?`,
        [user_id]
      );

      res.status(200).json({ 
        success: true, 
        referrals: referrals[0] || null 
      });
    } catch (err) {
      console.error("Get user referrals error:", err);
      res.status(400).json({ 
        success: false, 
        error: err.message 
      });
    }
  },

  getMyReferralHistory: async (req, res) => {
    try {
      const user_id = req.user.id;

      // Get user's referral ID first
      const [referral] = await pool.query(
        `SELECT id FROM referrals WHERE user_id = ?`,
        [user_id]
      );

      if (referral.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: "Referral record not found" 
        });
      }

      const referral_id = referral[0].id;

      const [history] = await pool.query(
        `SELECT 
          rh.*,
          u.username as referred_username,
          u.email as referred_email,
          u.created_at as referred_join_date,
          CASE 
            WHEN rh.reward_given = TRUE THEN 'REWARDED'
            WHEN EXISTS (SELECT 1 FROM purchases p WHERE p.user_id = rh.referred_user_id AND p.status = 'PAID') THEN 'PURCHASED'
            ELSE 'PENDING'
          END as referral_status
         FROM referral_history rh
         JOIN users u ON rh.referred_user_id = u.id
         WHERE rh.referral_id = ?
         ORDER BY rh.created_at DESC`,
        [referral_id]
      );

      res.status(200).json({ 
        success: true, 
        history,
        total_count: history.length
      });
    } catch (err) {
      console.error("Get referral history error:", err);
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  },

  applyReferralCode: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const { referral_code, new_user_id } = ApplyReferralSchema.parse(req.body);
      // Verify referral code exists and is active
      const [referral] = await connection.query(
        `SELECT r.* FROM referrals r 
         WHERE r.code = ? AND r.status = 'ACTIVE'`,
        [referral_code]
      );
      if (referral.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          success: false, 
          message: "Invalid or inactive referral code" 
        });
      }
      const referrer_id = referral[0].user_id;
      // Check if user already used a referral code
      const [existingReferral] = await connection.query(
        `SELECT referred_by FROM users WHERE id = ? AND referred_by IS NOT NULL`,
        [new_user_id]
      );
      if (existingReferral.length > 0) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: "User already used a referral code" 
        });
      }
      // Update user's referred_by field
      await connection.query(
        `UPDATE users SET referred_by = ? WHERE id = ?`,
        [referrer_id, new_user_id]
      );
      // Call stored procedure to process referral
      await connection.query(
        `CALL ProcessReferralSignup(?, ?)`,
        [new_user_id, referral_code]
      );
      await connection.commit();
      res.status(200).json({ 
        success: true, 
        message: "Referral code applied successfully",
        referrer_username: referral[0].username
      });
    } catch (err) {
      await connection.rollback();
      console.error("Apply referral code error:", err);
      
      if (err.message.includes("already used")) {
        return res.status(400).json({ 
          success: false, 
          error: err.message 
        });
      }
      res.status(500).json({ 
        success: false, 
        error: "Failed to apply referral code" 
      });
    } finally {
      connection.release();
    }
  },

  getReferralLeaderboard: async (req, res) => {
    try {
      const { limit = 10 } = req.query;

      const [leaderboard] = await pool.query(
        `SELECT 
          r.user_id,
          u.username,
          u.profile_photo,
          r.total_referrals,
          r.total_earned,
          r.current_tier,
          rt.tier_name,
          DENSE_RANK() OVER (ORDER BY r.total_referrals DESC, r.total_earned DESC) as rank
         FROM referrals r
         JOIN users u ON r.user_id = u.id
         JOIN referral_tiers rt ON r.current_tier = rt.tier_level
         WHERE r.status = 'ACTIVE'
         ORDER BY r.total_referrals DESC, r.total_earned DESC
         LIMIT ?`,
        [parseInt(limit)]
      );

      res.status(200).json({ 
        success: true, 
        leaderboard,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error("Get leaderboard error:", err);
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  },

  getAllReferralActivities: async (req, res) => {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const offset = (page - 1) * limit;

      let query = `
        SELECT 
          rh.*,
          u1.username as referrer_username,
          u2.username as referred_username,
          r.code as referral_code,
          rt.tier_name
        FROM referral_history rh
        JOIN referrals r ON rh.referral_id = r.id
        JOIN users u1 ON r.user_id = u1.id
        JOIN users u2 ON rh.referred_user_id = u2.id
        JOIN referral_tiers rt ON rh.tier_at_time = rt.tier_level
      `;
      
      let countQuery = `
        SELECT COUNT(*) as total 
        FROM referral_history rh
        JOIN referrals r ON rh.referral_id = r.id
      `;

      const params = [];
      const countParams = [];

      if (status) {
        query += ` WHERE rh.reward_given = ?`;
        countQuery += ` WHERE rh.reward_given = ?`;
        params.push(status === 'REWARDED' ? 1 : 0);
        countParams.push(status === 'REWARDED' ? 1 : 0);
      }

      query += ` ORDER BY rh.created_at DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), offset);

      const [activities] = await pool.query(query, params);
      const [countResult] = await pool.query(countQuery, countParams);

      res.status(200).json({
        success: true,
        activities,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (err) {
      console.error("Get all activities error:", err);
      res.status(500).json({ 
        success: false, 
        error: "Internal server error" 
      });
    }
  }
  
};

export default referralController;
