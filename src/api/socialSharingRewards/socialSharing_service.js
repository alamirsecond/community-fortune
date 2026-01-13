import pool from "../../../../database.js";

export const SocialSharingService = {
  // Check if user can share (within limits)
  canUserShare: async (user_id, platform) => {
    try {
      const [limits] = await pool.query(
        `SELECT * FROM share_limits WHERE platform = ?`,
        [platform]
      );

      if (limits.length === 0) {
        return { canShare: false, reason: "Platform not allowed" };
      }

      const limit = limits[0];

      // Check daily limit
      const [todayShares] = await pool.query(
        `SELECT COUNT(*) as share_count 
         FROM share_events 
         WHERE user_id = ? AND platform = ? AND DATE(created_at) = CURDATE()`,
        [user_id, platform]
      );

      if (todayShares[0].share_count >= limit.daily_limit) {
        return {
          canShare: false,
          reason: "Daily limit reached",
          limit: limit.daily_limit,
          used: todayShares[0].share_count,
        };
      }

      // Check weekly limit
      const [weekStart] = await pool.query(
        `SELECT DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) as week_start`
      );
      const [weeklyShares] = await pool.query(
        `SELECT COUNT(*) as share_count 
         FROM share_events 
         WHERE user_id = ? AND platform = ? AND DATE(created_at) >= ?`,
        [user_id, platform, weekStart[0].week_start]
      );

      if (weeklyShares[0].share_count >= limit.weekly_limit) {
        return {
          canShare: false,
          reason: "Weekly limit reached",
          limit: limit.weekly_limit,
          used: weeklyShares[0].share_count,
        };
      }

      return {
        canShare: true,
        points: limit.points_per_share,
        dailyRemaining: limit.daily_limit - todayShares[0].share_count,
        weeklyRemaining: limit.weekly_limit - weeklyShares[0].share_count,
      };
    } catch (error) {
      console.error("Error checking share eligibility:", error);
      throw new Error("Failed to check share eligibility");
    }
  },

  // Get user's sharing statistics
  getUserSharingStats: async (user_id) => {
    try {
      const [stats] = await pool.query(
        `SELECT 
          platform,
          COUNT(*) as total_shares,
          SUM(points_earned) as total_points,
          MAX(created_at) as last_shared
         FROM share_events 
         WHERE user_id = ?
         GROUP BY platform`,
        [user_id]
      );

      return stats;
    } catch (error) {
      console.error("Error getting user sharing stats:", error);
      throw new Error("Failed to get sharing statistics");
    }
  },
};

export default SocialSharingService;
