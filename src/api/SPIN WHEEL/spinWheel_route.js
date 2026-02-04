import express from "express";
import authenticate from "../../../middleware/auth.js";
import SpinWheelController from "./spinWheel_con.js";
import pool from "../../../database.js";

const spinWheelRouter = express.Router();

// Get all active wheels available to the user
spinWheelRouter.get("/wheels/active", async (req, res) => {
  try {
    const { tier = "FREE" } = req.query;
    const connection = await pool.getConnection();

    const [wheels] = await connection.query(
      `
      SELECT 
        BIN_TO_UUID(id) as id,
        wheel_name,
        wheel_type,
        wheel_description,
        min_tier,
        spins_per_user_period,
        max_spins_per_period,
        cooldown_hours,
        background_image_url,
        animation_speed_ms,
        is_active
      FROM spin_wheels 
      WHERE is_active = TRUE 
        AND (min_tier IS NULL OR min_tier <= ? OR ? = 'TIER_3')
      ORDER BY 
        CASE wheel_type
          WHEN 'DAILY' THEN 1
          WHEN 'VIP' THEN 2
          WHEN 'SUBSCRIBER_ONLY' THEN 3
          WHEN 'EVENT' THEN 4
          ELSE 5
        END
    `,
      [tier, tier]
    );

    connection.release();

    res.json({ wheels });
  } catch (error) {
    console.error("Get active wheels error:", error);
    res.status(500).json({
      error: "Failed to fetch active wheels",
      details: error.message,
    });
  }
});

// User routes (require authentication)
spinWheelRouter.post("/spin", authenticate, SpinWheelController.spin);

spinWheelRouter.get(
  "/spin/history",
  authenticate,
  SpinWheelController.getSpinHistory
);

// Get user spin statistics
spinWheelRouter.get("/spin/statistics", authenticate, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const user_id = req.user.id;
    // const user_id = "66666666-7777-8888-9999-000000000000";

    // Get user's spin statistics
    const [stats] = await connection.query(
      `
      SELECT 
        COUNT(sh.id) as total_spins,
        COUNT(CASE WHEN DATE(sh.created_at) = CURDATE() THEN 1 END) as today_spins,
        COUNT(CASE WHEN sh.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 END) as week_spins,
        SUM(CASE WHEN sh.prize_type != 'NO_WIN' THEN sh.prize_value ELSE 0 END) as total_winnings,
        GROUP_CONCAT(DISTINCT BIN_TO_UUID(sh.wheel_id)) as wheel_ids
      FROM spin_history sh
      WHERE sh.user_id = UUID_TO_BIN(?)
    `,
      [user_id]
    );

    // Get wheel-specific stats
    const [wheelStats] = await connection.query(
      `
      SELECT 
        BIN_TO_UUID(sh.wheel_id) as wheel_id,
        sw.wheel_name as wheel_name,
        sw.wheel_type as wheel_type,
        COUNT(sh.id) as spin_count,
        MAX(sh.created_at) as last_spin
      FROM spin_history sh
      JOIN spin_wheels sw ON sh.wheel_id = sw.id
      WHERE sh.user_id = UUID_TO_BIN(?)
      GROUP BY sh.wheel_id
      ORDER BY last_spin DESC
    `,
      [user_id]
    );

    res.json({
      statistics: stats[0] || {},
      wheel_stats: wheelStats,
    });
  } catch (error) {
    console.error("Get spin statistics error:", error);
    res.status(500).json({
      error: "Failed to fetch spin statistics",
      details: error.message,
    });
  } finally {
    connection.release();
  }
});

// Get user's spin eligibility for all wheels
spinWheelRouter.get("/spin/eligibility", authenticate, async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const user_id = req.user.id;
    // const user_id = "66666666-7777-8888-9999-000000000000";

    // Get all active wheels
    const [wheels] = await connection.query(
      `
      SELECT 
        BIN_TO_UUID(id) as id,
        wheel_name,
        wheel_type,
        spins_per_user_period,
        max_spins_per_period,
        cooldown_hours,
        min_tier,
        is_active
      FROM spin_wheels 
      WHERE is_active = TRUE
      ORDER BY 
        CASE wheel_type
          WHEN 'DAILY' THEN 1
          WHEN 'VIP' THEN 2
          WHEN 'SUBSCRIBER_ONLY' THEN 3
          WHEN 'EVENT' THEN 4
          ELSE 5
        END
    `
    );

    const eligibilityResults = [];

    for (const wheel of wheels) {
      // Check user tier if required
      let tierValid = true;
      if (wheel.min_tier) {
        // Check user subscription tier
        const [userSubscription] = await connection.query(
          `SELECT tier_id FROM user_subscriptions WHERE user_id = UUID_TO_BIN(?) AND status = 'ACTIVE'`,
          [user_id]
        );

        if (userSubscription.length === 0 && wheel.min_tier !== "FREE") {
          tierValid = false;
        } else if (userSubscription.length > 0) {
          // Get tier level
          const [tierInfo] = await connection.query(
            `SELECT tier_level FROM subscription_tiers WHERE id = UUID_TO_BIN(?)`,
            [userSubscription[0].tier_id]
          );

          // Simple tier comparison - you might need to adjust based on your tier names
          const tierLevel = tierInfo[0]?.tier_level || 0;
          const requiredTierMap = {
            FREE: 0,
            TIER_1: 1,
            TIER_2: 2,
            TIER_3: 3,
          };

          tierValid = tierLevel >= (requiredTierMap[wheel.min_tier] || 0);
        }
      }

      if (!tierValid) {
        eligibilityResults.push({
          wheel_id: wheel.id,
          wheel_name: wheel.wheel_name,
          wheel_type: wheel.wheel_type,
          is_eligible: false,
          reason: `Minimum tier ${wheel.min_tier} required`,
          remaining_spins: 0,
          max_spins: wheel.max_spins_per_period,
        });
        continue;
      }

      // Determine period based on spins_per_user_period
      let periodStart;
      switch (wheel.spins_per_user_period?.toUpperCase()) {
        case "DAILY":
          periodStart = "CURDATE()";
          break;
        case "WEEKLY":
          periodStart = "DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)";
          break;
        case "MONTHLY":
          periodStart = 'DATE_FORMAT(CURDATE(), "%Y-%m-01")';
          break;
        default:
          periodStart = "CURDATE()";
      }

      // Get user's spin count for the period
      const [spinCountResult] = await connection.query(
        `
        SELECT COUNT(*) as count
        FROM spin_history
        WHERE user_id = UUID_TO_BIN(?)
          AND wheel_id = UUID_TO_BIN(?)
          AND created_at >= ${periodStart}
        `,
        [user_id, wheel.id]
      );

      const spinCount = spinCountResult[0]?.count || 0;
      const remainingSpins = Math.max(
        0,
        (wheel.max_spins_per_period || 0) - spinCount
      );

      // Get last spin time
      const [lastSpinResult] = await connection.query(
        `
        SELECT MAX(created_at) as last_spin
        FROM spin_history
        WHERE user_id = UUID_TO_BIN(?)
          AND wheel_id = UUID_TO_BIN(?)
        `,
        [user_id, wheel.id]
      );

      let nextAvailable = null;
      if (lastSpinResult[0]?.last_spin && wheel.cooldown_hours > 0) {
        const lastSpin = new Date(lastSpinResult[0].last_spin);
        nextAvailable = new Date(
          lastSpin.getTime() + wheel.cooldown_hours * 60 * 60 * 1000
        );
      }

      eligibilityResults.push({
        wheel_id: wheel.id,
        wheel_name: wheel.wheel_name,
        wheel_type: wheel.wheel_type,
        is_eligible: remainingSpins > 0,
        remaining_spins: remainingSpins,
        max_spins: wheel.max_spins_per_period,
        spins_used: spinCount,
        cooldown_hours: wheel.cooldown_hours,
        next_available: nextAvailable,
        last_spin: lastSpinResult[0]?.last_spin || null,
      });
    }

    res.json({
      wheels: eligibilityResults,
    });
  } catch (error) {
    console.error("Get spin eligibility error:", error);
    res.status(500).json({
      error: "Failed to fetch spin eligibility",
      details: error.message,
    });
  } finally {
    connection.release();
  }
});

// Admin routes
spinWheelRouter.post(
  "/admin/create_wheels",
  authenticate(["ADMIN","SUPERADMIN"]),
  SpinWheelController.createWheel
);

spinWheelRouter.get(
  "/admin/get_all_wheels",
  authenticate(["ADMIN","SUPERADMIN"]),
  SpinWheelController.listWheels
);

spinWheelRouter.get(
  "/admin/get_wheels_byId/:wheel_id",
  authenticate(["ADMIN","SUPERADMIN"]),
  SpinWheelController.getWheel
);

spinWheelRouter.put(
  "/admin/update_wheels/:wheel_id",
  authenticate(["ADMIN"]),
  SpinWheelController.updateWheel
);

spinWheelRouter.post(
  "/admin/wheels/add_segments",
  authenticate(["ADMIN","SUPERADMIN"]),
  SpinWheelController.addSegments
);

// Admin analytics
spinWheelRouter.get(
  "/admin/wheels/:wheel_id/analytics",
  authenticate(["ADMIN","SUPERADMIN"]),
  async (req, res) => {
    const connection = await pool.getConnection();

    try {
      const { wheel_id } = req.params;
      const { start_date, end_date } = req.query;

      // Validate dates
      const validStart = start_date && !isNaN(Date.parse(start_date));
      const validEnd = end_date && !isNaN(Date.parse(end_date));

      // Build queries and parameters separately
      let dateFilter = "";
      let params = [wheel_id];
      let segmentParams = [wheel_id, wheel_id];
      let topWinnersParams = [wheel_id];

      if (validStart && validEnd) {
        dateFilter = `AND sh.created_at BETWEEN ? AND ?`;
        params.push(start_date, end_date);
        topWinnersParams.push(start_date, end_date);
      }

      // -------------------------
      // 1. DAILY ANALYTICS
      // -------------------------
      const [analytics] = await connection.query(
        `
        SELECT 
          DATE(sh.created_at) AS spin_date,
          COUNT(sh.id) AS daily_spins,
          COUNT(DISTINCT sh.user_id) AS daily_unique_users,
          sh.prize_type,
          COUNT(CASE WHEN sh.prize_type != 'NO_WIN' THEN 1 END) AS wins,
          COUNT(CASE WHEN sh.prize_type = 'NO_WIN' THEN 1 END) AS losses,
          SUM(CASE WHEN sh.prize_value > 0 THEN sh.prize_value ELSE 0 END) AS total_prize_value
        FROM spin_history sh
        WHERE sh.wheel_id = UUID_TO_BIN(?) 
        ${dateFilter}
        GROUP BY DATE(sh.created_at), sh.prize_type
        ORDER BY spin_date DESC
        `,
        params
      );

      // -------------------------
      // 2. SEGMENT PERFORMANCE
      // -------------------------
      const [segmentPerformance] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(sws.id) AS segment_id,
          sws.position,
          sws.prize_name,
          sws.prize_type,
          sws.probability AS expected_probability,
          COUNT(sh.id) AS actual_wins,
          sws.stock,
          sws.current_stock
        FROM spin_wheel_segments sws
        LEFT JOIN spin_history sh 
          ON sws.id = sh.segment_id 
          AND sh.wheel_id = UUID_TO_BIN(?)
        WHERE sws.wheel_id = UUID_TO_BIN(?)
        GROUP BY sws.id
        ORDER BY sws.position
        `,
        segmentParams
      );

      // Compute overall total spins
      const totalSpins = analytics.reduce(
        (sum, day) => sum + day.daily_spins,
        0
      );

      const segmentPerformanceWithProb = segmentPerformance.map((seg) => ({
        ...seg,
        actual_probability:
          totalSpins > 0
            ? ((seg.actual_wins / totalSpins) * 100).toFixed(2)
            : "0.00",
      }));

      // -------------------------
      // 3. TOP WINNERS
      // -------------------------
      const [topWinners] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(u.id) AS user_id,
          u.username,
          u.email,
          COUNT(sh.id) AS total_spins,
          COUNT(CASE WHEN sh.prize_type != 'NO_WIN' THEN 1 END) AS wins,
          SUM(CASE WHEN sh.prize_value > 0 THEN sh.prize_value ELSE 0 END) AS total_winnings
        FROM spin_history sh
        JOIN users u ON sh.user_id = u.id
        WHERE sh.wheel_id = UUID_TO_BIN(?) 
        ${dateFilter}
        GROUP BY u.id
        ORDER BY total_winnings DESC
        LIMIT 10
        `,
        topWinnersParams
      );

      // -------------------------
      // 4. SUMMARY
      // -------------------------
      const summary = {
        total_spins: totalSpins,
        unique_users:
          analytics.length > 0
            ? analytics.reduce(
                (max, a) => Math.max(max, a.daily_unique_users),
                0
              )
            : 0,
        total_prize_value: analytics.reduce(
          (sum, a) => sum + (a.total_prize_value || 0),
          0
        ),
        win_rate:
          totalSpins > 0
            ? (
                (analytics.reduce((sum, a) => sum + a.wins, 0) / totalSpins) *
                100
              ).toFixed(2)
            : "0.00",
      };

      res.json({
        success: true,
        analytics,
        segment_performance: segmentPerformanceWithProb,
        top_winners: topWinners,
        summary,
      });
    } catch (error) {
      console.error("Get wheel analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch wheel analytics",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }
);

// Admin: Export spin history
spinWheelRouter.get(
  "/admin/wheels/:wheel_id/export",
  authenticate(["ADMIN","SUPERADMIN"]),
  async (req, res) => {
    const connection = await pool.getConnection();

    try {
      const { wheel_id } = req.params;
      const { format = "csv", start_date, end_date } = req.query;

      let dateFilter = "";
      const params = [wheel_id];

      if (start_date && end_date) {
        dateFilter = "AND sh.created_at BETWEEN ? AND ?";
        params.push(start_date, end_date);
      }

      const [spinHistory] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(sh.id) as spin_id,
          BIN_TO_UUID(u.id) as user_id,
          u.username,
          u.email,
          sh.created_at as spin_time,
          sws.prize_name,
          sh.prize_type,
          sh.prize_value,
          sh.spin_result
        FROM spin_history sh
        JOIN users u ON sh.user_id = u.id
        LEFT JOIN spin_wheel_segments sws ON sh.segment_id = sws.id
        WHERE sh.wheel_id = UUID_TO_BIN(?) ${dateFilter}
        ORDER BY sh.created_at DESC
      `,
        params
      );

      // Parse spin_result JSON
      // Parse spin_result JSON safely
      const formattedHistory = spinHistory.map((record) => {
        let result = record.spin_result;

        if (typeof result === "string") {
          try {
            result = JSON.parse(result);
          } catch (e) {
            console.error("Invalid JSON in spin_result:", result);
          }
        }

        return {
          ...record,
          spin_result: result,
        };
      });

      if (format === "csv") {
        // Convert to CSV
        const csvData = convertToCSV(formattedHistory);
        res.header("Content-Type", "text/csv");
        res.attachment(
          `wheel_${wheel_id}_history_${
            new Date().toISOString().split("T")[0]
          }.csv`
        );
        res.send(csvData);
      } else {
        // Return JSON
        res.json({
          wheel_id,
          total_records: formattedHistory.length,
          history: formattedHistory,
        });
      }
    } catch (error) {
      console.error("Export spin history error:", error);
      res.status(500).json({
        error: "Failed to export spin history",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }
);

// Helper function to convert to CSV
function convertToCSV(data) {
  if (data.length === 0) return "";

  const headers = Object.keys(data[0]);
  const csvRows = [];

  csvRows.push(headers.join(","));

  for (const row of data) {
    const values = headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "object")
        return JSON.stringify(value).replace(/"/g, '""');
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

export default spinWheelRouter;
