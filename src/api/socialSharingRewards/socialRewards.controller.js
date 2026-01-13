import pool from "../../../../database.js";
import {
  ShareCompetitionSchema,
  UpdateLimitsSchema,
} from "./socialSharing_validator.js";

const socialSharingController = {
  getTest: (req, res) => {
    res.status(200).json({
      message: "Social Sharing Test Endpoint",
      timestamp: new Date().toISOString(),
    });
  },

  shareCompetition: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const user_id = req.user.id;
      const { competition_id, platform } = ShareCompetitionSchema.parse(
        req.body
      );
      const ip_address = req.ip;

      // Check if sharing is allowed for this platform
      const [platformLimits] = await connection.query(
        `SELECT * FROM share_limits WHERE platform = ?`,
        [platform]
      );

      if (platformLimits.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Sharing not allowed on this platform",
        });
      }

      const limit = platformLimits[0];

      // Check daily limit
      const [todayShares] = await connection.query(
        `SELECT COUNT(*) as share_count 
         FROM share_events 
         WHERE user_id = ? AND platform = ? AND DATE(created_at) = CURDATE()`,
        [user_id, platform]
      );

      if (todayShares[0].share_count >= limit.daily_limit) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Daily sharing limit reached for this platform",
        });
      }

      // Check weekly limit
      const [weekStart] = await connection.query(
        `SELECT DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) as week_start`
      );
      const [weeklyShares] = await connection.query(
        `SELECT COUNT(*) as share_count 
         FROM share_events 
         WHERE user_id = ? AND platform = ? AND DATE(created_at) >= ?`,
        [user_id, platform, weekStart[0].week_start]
      );

      if (weeklyShares[0].share_count >= limit.weekly_limit) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Weekly sharing limit reached for this platform",
        });
      }

      // Check if already shared this competition on this platform
      const [existingShare] = await connection.query(
        `SELECT id FROM share_events 
         WHERE user_id = ? AND competition_id = ? AND platform = ?`,
        [user_id, competition_id, platform]
      );

      if (existingShare.length > 0) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: "Already shared this competition on this platform",
        });
      }

      // Award points
      const pointsEarned = limit.points_per_share;
      let pointsCapped = false;

      // Check if points would be capped due to limits
      if (todayShares[0].share_count + 1 > limit.daily_limit) {
        pointsCapped = true;
      }

      // Record the share event
      await connection.query(
        `INSERT INTO share_events (id, user_id, platform, competition_id, points_earned, points_capped, ip_address)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
        [
          user_id,
          platform,
          competition_id,
          pointsCapped ? 0 : pointsEarned,
          pointsCapped,
          ip_address,
        ]
      );

      // Award points if not capped
      if (!pointsCapped) {
        // Update user points
        await connection.query(
          `UPDATE user_points 
           SET total_points = total_points + ?, earned_points = earned_points + ?
           WHERE user_id = ?`,
          [pointsEarned, pointsEarned, user_id]
        );

        // Record points history
        await connection.query(
          `INSERT INTO points_history (id, user_id, points, type, source, description)
           VALUES (UUID(), ?, ?, 'EARNED', 'SOCIAL_SHARE', ?)`,
          [user_id, pointsEarned, `Shared on ${platform}`]
        );
      }

      await connection.commit();

      res.status(200).json({
        success: true,
        message: "Competition shared successfully",
        data: {
          platform,
          points_earned: pointsCapped ? 0 : pointsEarned,
          points_capped: pointsCapped,
          daily_remaining: limit.daily_limit - (todayShares[0].share_count + 1),
          weekly_remaining:
            limit.weekly_limit - (weeklyShares[0].share_count + 1),
        },
      });
    } catch (err) {
      await connection.rollback();
      console.error("Error sharing competition:", err);

      if (err.name === "ZodError") {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: err.errors,
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to share competition",
      });
    } finally {
      connection.release();
    }
  },

  getMySharingStats: async (req, res) => {
    try {
      const user_id = req.user.id;

      // Get platform limits
      const [platformLimits] = await pool.query(
        `SELECT * FROM share_limits ORDER BY platform`
      );

      // Get user's today's shares per platform
      const [todayShares] = await pool.query(
        `SELECT platform, COUNT(*) as shares_today
         FROM share_events 
         WHERE user_id = ? AND DATE(created_at) = CURDATE()
         GROUP BY platform`,
        [user_id]
      );

      // Get user's weekly shares per platform
      const [weekStart] = await pool.query(
        `SELECT DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) as week_start`
      );
      const [weeklyShares] = await pool.query(
        `SELECT platform, COUNT(*) as shares_this_week
         FROM share_events 
         WHERE user_id = ? AND DATE(created_at) >= ?
         GROUP BY platform`,
        [user_id, weekStart[0].week_start]
      );

      // Get total points earned from sharing
      const [totalPoints] = await pool.query(
        `SELECT COALESCE(SUM(points_earned), 0) as total_points 
         FROM share_events 
         WHERE user_id = ?`,
        [user_id]
      );

      // Format stats
      const stats = platformLimits.map((limit) => {
        const today = todayShares.find(
          (ts) => ts.platform === limit.platform
        ) || { shares_today: 0 };
        const weekly = weeklyShares.find(
          (ws) => ws.platform === limit.platform
        ) || { shares_this_week: 0 };

        return {
          platform: limit.platform,
          points_per_share: limit.points_per_share,
          daily_limit: limit.daily_limit,
          weekly_limit: limit.weekly_limit,
          shares_today: today.shares_today,
          shares_this_week: weekly.shares_this_week,
          daily_remaining: limit.daily_limit - today.shares_today,
          weekly_remaining: limit.weekly_limit - weekly.shares_this_week,
        };
      });

      res.status(200).json({
        success: true,
        data: {
          platforms: stats,
          total_points_earned: totalPoints[0].total_points,
        },
      });
    } catch (err) {
      console.error("Error fetching sharing stats:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getMySharingHistory: async (req, res) => {
    try {
      const user_id = req.user.id;
      const { limit = 20, page = 1 } = req.query;
      const offset = (page - 1) * limit;

      const [history] = await pool.query(
        `SELECT 
          se.*,
          c.title as competition_title,
          c.featured_image as competition_image
         FROM share_events se
         LEFT JOIN competitions c ON se.competition_id = c.id
         WHERE se.user_id = ?
         ORDER BY se.created_at DESC
         LIMIT ? OFFSET ?`,
        [user_id, parseInt(limit), offset]
      );

      const [total] = await pool.query(
        `SELECT COUNT(*) as total FROM share_events WHERE user_id = ?`,
        [user_id]
      );

      res.status(200).json({
        success: true,
        data: history,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
      });
    } catch (err) {
      console.error("Error fetching sharing history:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getSharingLimits: async (req, res) => {
    try {
      const [limits] = await pool.query(
        `SELECT * FROM share_limits ORDER BY platform`
      );
      res.status(200).json({
        success: true,
        data: limits,
      });
    } catch (err) {
      console.error("Error fetching sharing limits:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  updateSharingLimits: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const updates = UpdateLimitsSchema.parse(req.body);

      for (const update of updates) {
        const { platform, points_per_share, daily_limit, weekly_limit } =
          update;

        const [result] = await connection.query(
          `UPDATE share_limits 
           SET points_per_share = ?, daily_limit = ?, weekly_limit = ?
           WHERE platform = ?`,
          [points_per_share, daily_limit, weekly_limit, platform]
        );

        if (result.affectedRows === 0) {
          // Insert if doesn't exist
          await connection.query(
            `INSERT INTO share_limits (id, platform, points_per_share, daily_limit, weekly_limit)
             VALUES (UUID(), ?, ?, ?, ?)`,
            [platform, points_per_share, daily_limit, weekly_limit]
          );
        }
      }

      await connection.commit();

      res.status(200).json({
        success: true,
        message: "Sharing limits updated successfully",
      });
    } catch (err) {
      await connection.rollback();
      console.error("Error updating sharing limits:", err);

      if (err.name === "ZodError") {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: err.errors,
        });
      }

      res.status(500).json({
        success: false,
        error: "Failed to update sharing limits",
      });
    } finally {
      connection.release();
    }
  },

  getSharingAnalytics: async (req, res) => {
    try {
      const { days = 30 } = req.query;

      // Total shares over time
      const [sharesOverTime] = await pool.query(
        `SELECT DATE(created_at) as date, COUNT(*) as share_count
         FROM share_events 
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [days]
      );

      // Shares by platform
      const [sharesByPlatform] = await pool.query(
        `SELECT platform, COUNT(*) as share_count
         FROM share_events 
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY platform`,
        [days]
      );

      // Top shared competitions
      const [topCompetitions] = await pool.query(
        `SELECT 
          c.title as competition_title,
          COUNT(*) as share_count
         FROM share_events se
         JOIN competitions c ON se.competition_id = c.id
         WHERE se.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY se.competition_id, c.title
         ORDER BY share_count DESC
         LIMIT 10`,
        [days]
      );

      // Top sharers
      const [topSharers] = await pool.query(
        `SELECT 
          u.username,
          COUNT(*) as share_count,
          SUM(se.points_earned) as total_points_earned
         FROM share_events se
         JOIN users u ON se.user_id = u.id
         WHERE se.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         GROUP BY se.user_id, u.username
         ORDER BY share_count DESC
         LIMIT 10`,
        [days]
      );

      res.status(200).json({
        success: true,
        data: {
          shares_over_time: sharesOverTime,
          shares_by_platform: sharesByPlatform,
          top_competitions: topCompetitions,
          top_sharers: topSharers,
          period_days: parseInt(days),
        },
      });
    } catch (err) {
      console.error("Error fetching sharing analytics:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
};

export default socialSharingController;
