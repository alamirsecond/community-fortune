import pool from "../../../database.js";
import {
  AwardPointsSchema,
  RedeemPointsSchema,
  MissionActionSchema,
  PaginationQuerySchema
} from "./points_validation.js";

const pointsController = {
  getTest: (req, res) => {
    res.status(200).json({
      message: "Points System Test Endpoint",
      timestamp: new Date().toISOString(),
    });
  },

  getUserPoints: async (req, res) => {
    try {
      const user_id = req.user.id;

      // Get user points balance
      const [userPoints] = await pool.query(
        `SELECT total_points, earned_points, redeemed_points 
         FROM user_points WHERE user_id = ?`,
        [user_id]
      );

      if (userPoints.length === 0) {
        // Initialize points for new user
        await pool.query(
          `INSERT INTO user_points(id, user_id, total_points, earned_points, redeemed_points)
           VALUES (UUID(), ?, 0, 0, 0)`,
          [user_id]
        );
        
        return res.status(200).json({
          success: true,
          data: {
            total_points: 0,
            earned_points: 0,
            redeemed_points: 0,
            redeemable_value: 0,
            next_redemption: 1000
          }
        });
      }

      const points = userPoints[0];
      const redeemableValue = points.total_points / 1000; // £1 per 1000 points
      const nextRedemption = points.total_points >= 1000 ? 0 : 1000 - points.total_points;
      
      res.status(200).json({
        success: true,
        data: {
          ...points,
          redeemable_value: parseFloat(redeemableValue.toFixed(2)),
          next_redemption: nextRedemption
        },
      });
    } catch (err) {
      console.error("Error fetching user points:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getPointHistory: async (req, res) => {
    try {
      // Validate query parameters
      const parsedQuery = PaginationQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: parsedQuery.error.errors
        });
      }

      const { limit = 20, page = 1 } = parsedQuery.data;
      const user_id = req.user.id;
      const offset = (page - 1) * limit;

      // Get point transactions
      const [transactions] = await pool.query(
        `SELECT * FROM points_history 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [user_id, parseInt(limit), offset]
      );

      // Get total count
      const [total] = await pool.query(
        `SELECT COUNT(*) as total FROM points_history WHERE user_id = ?`,
        [user_id]
      );

      res.status(200).json({
        success: true,
        data: transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
      });
    } catch (err) {
      console.error("Error fetching point history:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  redeemPoints: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Validate request body
      const parsedBody = RedeemPointsSchema.safeParse(req.body);
      if (!parsedBody.success) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parsedBody.error.errors
        });
      }

      const { points } = parsedBody.data;
      const user_id = req.user.id;

      // Check user has enough points
      const [userPoints] = await connection.query(
        `SELECT total_points FROM user_points WHERE user_id = ? FOR UPDATE`,
        [user_id]
      );

      if (userPoints.length === 0 || userPoints[0].total_points < points) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Insufficient points",
        });
      }

      // Calculate site credit (£1 per 1000 points)
      const siteCredit = points / 1000;

      // Update user points
      await connection.query(
        `UPDATE user_points 
         SET total_points = total_points - ?, redeemed_points = redeemed_points + ?
         WHERE user_id = ?`,
        [points, points, user_id]
      );

      // Add site credit to user's wallet
      const [wallet] = await connection.query(
        `SELECT id FROM wallets WHERE user_id = ? AND wallet_type = 'SITE_CREDIT'`,
        [user_id]
      );

      if (wallet.length > 0) {
        await connection.query(
          `UPDATE wallets 
           SET balance = balance + ?, updated_at = NOW()
           WHERE id = ?`,
          [siteCredit, wallet[0].id]
        );
      } else {
        // Create wallet if doesn't exist
        await connection.query(
          `INSERT INTO wallets (id, user_id, wallet_type, balance)
           VALUES (UUID(), ?, 'SITE_CREDIT', ?)`,
          [user_id, siteCredit]
        );
      }

      // Record wallet transaction
      await connection.query(
        `INSERT INTO wallet_transactions (id, wallet_id, amount, transaction_type, description)
         SELECT UUID(), id, ?, 'CREDIT', ?
         FROM wallets WHERE user_id = ? AND wallet_type = 'SITE_CREDIT'`,
        [siteCredit, `Points redemption: ${points} points`, user_id]
      );

      // Record point transaction
      await connection.query(
        `INSERT INTO points_history (id, user_id, points, type, source, description)
         VALUES (UUID(), ?, ?, 'REDEEMED', 'POINTS_REDEMPTION', ?)`,
        [user_id, -points, `Redeemed ${points} points for £${siteCredit.toFixed(2)} site credit`]
      );

      await connection.commit();

      res.status(200).json({
        success: true,
        message: "Points redeemed successfully!",
        data: {
          points_redeemed: points,
          site_credit_added: parseFloat(siteCredit.toFixed(2)),
          new_balance: userPoints[0].total_points - points,
        },
      });
    } catch (err) {
      await connection.rollback();
      console.error("Error redeeming points:", err);
      res.status(500).json({
        success: false,
        error: "Failed to redeem points",
      });
    } finally {
      connection.release();
    }
  },

  getAvailableMissions: async (req, res) => {
    try {
      // Validate query parameters
      const parsedQuery = PaginationQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: parsedQuery.error.errors
        });
      }

      const { limit = 50, page = 1 } = parsedQuery.data;
      const user_id = req.user.id;
      const offset = (page - 1) * limit;

      // Get all active missions
      const [missions] = await pool.query(
        `SELECT m.*, 
                um.progress, um.completed, um.completed_at,
                CASE 
                  WHEN um.completed = TRUE THEN 'COMPLETED'
                  WHEN um.user_id IS NOT NULL THEN 'IN_PROGRESS'
                  ELSE 'AVAILABLE'
                END as status
         FROM missions m
         LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
         WHERE m.is_active = TRUE 
           AND (m.start_date IS NULL OR m.start_date <= NOW())
           AND (m.end_date IS NULL OR m.end_date >= NOW())
         ORDER BY m.mission_type, m.created_at
         LIMIT ? OFFSET ?`,
        [user_id, parseInt(limit), offset]
      );

      // Get total count
      const [total] = await pool.query(
        `SELECT COUNT(*) as total FROM missions 
         WHERE is_active = TRUE 
           AND (start_date IS NULL OR start_date <= NOW())
           AND (end_date IS NULL OR end_date >= NOW())`
      );

      res.status(200).json({
        success: true,
        data: missions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
      });
    } catch (err) {
      console.error("Error fetching missions:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getUserMissionProgress: async (req, res) => {
    try {
      const user_id = req.user.id;

      // Get mission progress summary
      const [summary] = await pool.query(
        `SELECT 
           COUNT(*) as total_missions,
           SUM(CASE WHEN um.completed = TRUE THEN 1 ELSE 0 END) as completed_missions,
           SUM(CASE WHEN um.user_id IS NOT NULL AND um.completed = FALSE THEN 1 ELSE 0 END) as in_progress_missions,
           COALESCE(SUM(CASE WHEN um.completed = TRUE THEN m.points ELSE 0 END), 0) as points_earned
         FROM missions m
         LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
         WHERE m.is_active = TRUE`,
        [user_id]
      );

      // Get missions by type
      const [byType] = await pool.query(
        `SELECT 
           m.mission_type,
           COUNT(*) as total,
           SUM(CASE WHEN um.completed = TRUE THEN 1 ELSE 0 END) as completed
         FROM missions m
         LEFT JOIN user_missions um ON m.id = um.mission_id AND um.user_id = ?
         WHERE m.is_active = TRUE
         GROUP BY m.mission_type`,
        [user_id]
      );

      res.status(200).json({
        success: true,
        data: {
          summary: summary[0],
          by_type: byType,
        },
      });
    } catch (err) {
      console.error("Error fetching mission progress:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  processMissionAction: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Validate request body
      const parsedBody = MissionActionSchema.safeParse(req.body);
      if (!parsedBody.success) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parsedBody.error.errors
        });
      }

      const { action, game_id, score, metadata } = parsedBody.data;
      const user_id = req.user.id;

      // Handle different action types
      switch (action) {
        case "DAILY_LOGIN":
          await handleDailyLogin(connection, user_id);
          break;

        case "GAME_COMPLETE":
          if (!game_id || score === undefined) {
            await connection.rollback();
            return res.status(400).json({
              success: false,
              error: "game_id and score are required for GAME_COMPLETE action",
            });
          }
          await handleGameComplete(connection, user_id, game_id, score, metadata);
          break;

        case "MISSION_COMPLETE":
          if (!metadata?.mission_id) {
            await connection.rollback();
            return res.status(400).json({
              success: false,
              error: "mission_id is required in metadata for MISSION_COMPLETE",
            });
          }
          await handleMissionComplete(connection, user_id, metadata.mission_id);
          break;

        default:
          await connection.rollback();
          return res.status(400).json({
            success: false,
            error: "Invalid action type",
          });
      }

      await connection.commit();

      res.status(200).json({
        success: true,
        message: "Mission action processed successfully",
      });
    } catch (err) {
      await connection.rollback();
      console.error("Error processing mission action:", err);
      res.status(500).json({
        success: false,
        error: "Failed to process mission action",
      });
    } finally {
      connection.release();
    }
  },

  getPointsLeaderboard: async (req, res) => {
    try {
      // Validate query parameters
      const parsedQuery = PaginationQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: parsedQuery.error.errors
        });
      }

      const { limit = 100, page = 1 } = parsedQuery.data;
      const { period = "weekly", game_id = null } = req.query;
      const offset = (page - 1) * limit;

      // Determine date range based on period
      let dateFilter = "";
      
      switch (period) {
        case "daily":
          dateFilter = "AND ph.created_at >= CURDATE()";
          break;
        case "weekly":
          dateFilter = "AND ph.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)";
          break;
        case "monthly":
          dateFilter = "AND ph.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
          break;
        case "all_time":
          dateFilter = "";
          break;
      }

      // Build game filter
      const gameFilter = game_id ? "AND ph.game_id = ?" : "";

      const queryParams = [];
      if (game_id) queryParams.push(game_id);
      queryParams.push(parseInt(limit), offset);

      const [leaderboard] = await pool.query(
        `SELECT 
           u.id as user_id,
           u.username,
           u.avatar,
           SUM(ph.points) as total_points,
           COUNT(DISTINCT ph.id) as transactions_count
         FROM points_history ph
         JOIN users u ON ph.user_id = u.id
         WHERE ph.type = 'EARNED'
           ${dateFilter}
           ${gameFilter}
         GROUP BY u.id, u.username, u.avatar
         ORDER BY total_points DESC
         LIMIT ? OFFSET ?`,
        queryParams
      );

      const [total] = await pool.query(
        `SELECT COUNT(DISTINCT ph.user_id) as total 
         FROM points_history ph
         WHERE ph.type = 'EARNED'
           ${dateFilter}
           ${gameFilter}`
      );

      res.status(200).json({
        success: true,
        data: leaderboard,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
        period,
        game_id,
      });
    } catch (err) {
      console.error("Error fetching leaderboard:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  awardPoints: async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Validate request body
      const parsedBody = AwardPointsSchema.safeParse(req.body);
      if (!parsedBody.success) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: parsedBody.error.errors
        });
      }

      const { user_id, points, reason, type = "MANUAL_AWARD", source = "ADMIN" } = parsedBody.data;

      // Check if user exists
      const [user] = await connection.query(
        `SELECT id FROM users WHERE id = ?`,
        [user_id]
      );

      if (user.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      // Update user points
      await connection.query(
        `INSERT INTO user_points (id, user_id, total_points, earned_points, redeemed_points)
         VALUES (UUID(), ?, ?, ?, 0)
         ON DUPLICATE KEY UPDATE 
           total_points = total_points + VALUES(total_points),
           earned_points = earned_points + VALUES(earned_points)`,
        [user_id, points, points]
      );

      // Record transaction
      await connection.query(
        `INSERT INTO points_history (id, user_id, points, type, source, description)
         VALUES (UUID(), ?, ?, 'EARNED', ?, ?)`,
        [user_id, points, source, `Admin award: ${reason}`]
      );

      await connection.commit();

      res.status(200).json({
        success: true,
        message: "Points awarded successfully",
        data: {
          user_id,
          points_awarded: points,
          reason,
          type,
        },
      });
    } catch (err) {
      await connection.rollback();
      console.error("Error awarding points:", err);
      res.status(500).json({
        success: false,
        error: "Failed to award points",
      });
    } finally {
      connection.release();
    }
  },

  getAllPointTransactions: async (req, res) => {
    try {
      // Validate query parameters
      const parsedQuery = PaginationQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({
          success: false,
          error: "Invalid query parameters",
          details: parsedQuery.error.errors
        });
      }

      const { limit = 50, page = 1 } = parsedQuery.data;
      const { start_date, end_date, user_id, type } = req.query;
      const offset = (page - 1) * limit;

      let whereClause = "WHERE 1=1";
      const queryParams = [];

      if (user_id) {
        whereClause += " AND ph.user_id = ?";
        queryParams.push(user_id);
      }

      if (type) {
        whereClause += " AND ph.type = ?";
        queryParams.push(type);
      }

      if (start_date) {
        whereClause += " AND ph.created_at >= ?";
        queryParams.push(start_date);
      }

      if (end_date) {
        whereClause += " AND ph.created_at <= ?";
        queryParams.push(end_date);
      }

      queryParams.push(parseInt(limit), offset);

      const [transactions] = await pool.query(
        `SELECT ph.*, u.username, u.email
         FROM points_history ph
         JOIN users u ON ph.user_id = u.id
         ${whereClause}
         ORDER BY ph.created_at DESC
         LIMIT ? OFFSET ?`,
        queryParams
      );

      const [total] = await pool.query(
        `SELECT COUNT(*) as total 
         FROM points_history ph
         JOIN users u ON ph.user_id = u.id
         ${whereClause}`
      );

      res.status(200).json({
        success: true,
        data: transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total[0].total,
          pages: Math.ceil(total[0].total / limit),
        },
      });
    } catch (err) {
      console.error("Error fetching all transactions:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },

  getUserPointsSummary: async (req, res) => {
    try {
      const { user_id } = req.params;

      // Get user points summary
      const [summary] = await pool.query(
        `SELECT 
           up.total_points,
           up.earned_points,
           up.redeemed_points,
           u.username,
           u.email,
           u.created_at as user_since,
           COUNT(ph.id) as total_transactions,
           SUM(CASE WHEN ph.type = 'EARNED' THEN ph.points ELSE 0 END) as total_earned,
           SUM(CASE WHEN ph.type = 'REDEEMED' THEN ABS(ph.points) ELSE 0 END) as total_redeemed,
           MAX(ph.created_at) as last_transaction
         FROM user_points up
         JOIN users u ON up.user_id = u.id
         LEFT JOIN points_history ph ON up.user_id = ph.user_id
         WHERE up.user_id = ?
         GROUP BY up.user_id, u.username, u.email, u.created_at`,
        [user_id]
      );

      if (summary.length === 0) {
        return res.status(404).json({
          success: false,
          error: "User points summary not found",
        });
      }

      // Get recent transactions
      const [recent] = await pool.query(
        `SELECT * FROM points_history 
         WHERE user_id = ? 
         ORDER BY created_at DESC 
         LIMIT 10`,
        [user_id]
      );

      res.status(200).json({
        success: true,
        data: {
          summary: summary[0],
          recent_transactions: recent,
        },
      });
    } catch (err) {
      console.error("Error fetching user points summary:", err);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
};

// Helper functions for mission actions
async function handleDailyLogin(connection, user_id) {
  const today = new Date().toISOString().split("T")[0];
  const points = 10; // daily login points

  // Check if already logged in today
  const [existing] = await connection.query(
    `SELECT * FROM daily_login_points 
     WHERE user_id = UUID_TO_BIN(?) AND login_date = ?`,
    [user_id, today]
  );

  if (existing.length === 0) {
    // Award daily login points
    await awardPointsToUser(
      connection,
      user_id,
      points,
      "DAILY_LOGIN",
      "Daily login reward"
    );

    // Record the daily login entry
    await connection.query(
      `INSERT INTO daily_login_points (id, user_id, login_date, points_awarded)
       VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?)`,
      [user_id, today, points]
    );
  }
}

async function handleGameComplete(connection, user_id, game_id, score, metadata) {
  // Check for game-specific missions
  const [missions] = await connection.query(
    `SELECT m.* FROM missions m
     WHERE m.is_active = TRUE
       AND m.mission_type = 'GAME'
       AND m.game_id = ?
       AND (m.start_date IS NULL OR m.start_date <= NOW())
       AND (m.end_date IS NULL OR m.end_date >= NOW())`,
    [game_id]
  );

  for (const mission of missions) {
    // Check if user already completed this mission
    const [userMission] = await connection.query(
      `SELECT * FROM user_missions 
       WHERE user_id = ? AND mission_id = ?`,
      [user_id, mission.id]
    );

    if (userMission.length === 0 || !userMission[0].completed) {
      let shouldAward = false;
      
      // Check mission conditions
      switch (mission.action) {
        case "SCORE_ABOVE":
          if (score > mission.target_value) shouldAward = true;
          break;
        case "TOP_PERCENTILE":
          // Would need to compare with other players
          // For now, implement basic logic
          if (score >= mission.target_value) shouldAward = true;
          break;
        case "PERSONAL_BEST":
          // Check if this is a personal best
          const [bestScore] = await connection.query(
            `SELECT MAX(score) as max_score FROM game_scores 
             WHERE user_id = ? AND game_id = ?`,
            [user_id, game_id]
          );
          if (score > (bestScore[0]?.max_score || 0)) shouldAward = true;
          break;
      }

      if (shouldAward) {
        await awardPointsToUser(
          connection,
          user_id,
          mission.points,
          "MISSION_COMPLETE",
          `Completed mission: ${mission.name}`
        );

        // Mark mission as completed
        await connection.query(
          `INSERT INTO user_missions (id, user_id, mission_id, completed, completed_at, progress)
           VALUES (UUID(), ?, ?, TRUE, NOW(), 100)
           ON DUPLICATE KEY UPDATE 
             completed = VALUES(completed),
             completed_at = VALUES(completed_at),
             progress = VALUES(progress)`,
          [user_id, mission.id]
        );
      }
    }
  }

  // Award base points for playing (e.g., 20 points)
  await awardPointsToUser(
    connection,
    user_id,
    20,
    "GAME_PLAY",
    `Completed game: ${game_id} with score ${score}`
  );
}

async function handleMissionComplete(connection, user_id, mission_id) {
  const [mission] = await connection.query(
    `SELECT * FROM missions WHERE id = ? AND is_active = TRUE`,
    [mission_id]
  );

  if (mission.length === 0) {
    throw new Error("Mission not found or inactive");
  }

  // Check if already completed
  const [userMission] = await connection.query(
    `SELECT * FROM user_missions 
     WHERE user_id = ? AND mission_id = ?`,
    [user_id, mission_id]
  );

  if (userMission.length > 0 && userMission[0].completed) {
    return; // Already completed
  }

  // Award points
  await awardPointsToUser(
    connection,
    user_id,
    mission[0].points,
    "MISSION_COMPLETE",
    `Completed mission: ${mission[0].name}`
  );

  // Mark as completed
  await connection.query(
    `INSERT INTO user_missions (id, user_id, mission_id, completed, completed_at, progress)
     VALUES (UUID(), ?, ?, TRUE, NOW(), 100)
     ON DUPLICATE KEY UPDATE 
       completed = VALUES(completed),
       completed_at = VALUES(completed_at),
       progress = VALUES(progress)`,
    [user_id, mission_id]
  );
}

async function awardPointsToUser(
  connection,
  user_id,
  points,
  source,
  description
) {
  // Update user points
  await connection.query(
    `INSERT INTO user_points (id, user_id, total_points, earned_points, redeemed_points)
     VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, 0)
     ON DUPLICATE KEY UPDATE 
       total_points = total_points + VALUES(total_points),
       earned_points = earned_points + VALUES(earned_points)`,
    [user_id, points, points]
  );

  // Record transaction
  await connection.query(
    `INSERT INTO points_history (id, user_id, points, type, source, description)
     VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, 'EARNED', ?, ?)`,
    [user_id, points, source, description]
  );
}


export default pointsController;
