import db from "../../../database.js";
import winnerSchema from "./winners_zod.js";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

// Create a validate function for Zod schemas
const validate = (schema, data) => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = {};
      error.errors.forEach((err) => {
        const field = err.path.join('.');
        errors[field] = err.message;
      });
      
      const validationError = new Error('Validation error');
      validationError.errors = errors;
      throw validationError;
    }
    throw error;
  }
};


const winnersController = {
  // ==================== ADMIN: STATS ====================
  getAdminStats: async (req, res) => {
    try {
      const validationResult = winnerSchema.adminStats.safeParse(req);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: validationResult.error.errors,
        });
      }

      const days = Math.max(
        1,
        Math.min(365, parseInt(req.query.days, 10) || 7)
      );

  // Original query has issues with prize_distributions table
const [[mainTotals]] = await db.query(
  `SELECT
    COUNT(*) AS total_winners,
    COALESCE(SUM(w.prize_value), 0) AS total_prize_value,
    COALESCE(SUM(CASE WHEN w.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN w.prize_value ELSE 0 END), 0) AS amount_won_recent
   FROM winners w`,
  [days]
);

// And for instant wins
const [[instantTotals]] = await db.query(
  `SELECT
    COUNT(*) AS total_winners,
    COALESCE(SUM(iw.prize_value), 0) AS total_prize_value,
    COALESCE(SUM(CASE WHEN iw.claimed_at >= DATE_SUB(NOW(), INTERVAL ? DAY) THEN iw.prize_value ELSE 0 END), 0) AS amount_won_recent
   FROM instant_wins iw
   WHERE iw.claimed_by IS NOT NULL`,
  [days]
);

      const totalWinners =
        (mainTotals?.total_winners || 0) + (instantTotals?.total_winners || 0);
      const totalPrizeValue =
        (parseFloat(mainTotals?.total_prize_value || 0) || 0) +
        (parseFloat(instantTotals?.total_prize_value || 0) || 0);
      const amountWonRecent =
        (parseFloat(mainTotals?.amount_won_recent || 0) || 0) +
        (parseFloat(instantTotals?.amount_won_recent || 0) || 0);

      res.json({
        success: true,
        data: {
          total_winners: totalWinners,
          total_prize_value: totalPrizeValue,
          amount_won_recent: amountWonRecent,
          window_days: days,
        },
      });
    } catch (error) {
      console.error("Admin winners stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch winners stats",
        error: error.message,
      });
    }
  },

  // ==================== ADMIN: LIST (PAGINATED) ====================
  getAdminList: async (req, res) => {
    try {
      const validationResult = winnerSchema.adminList.safeParse(req);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: validationResult.error.errors,
        });
      }

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const perPage = Math.max(
        5,
        Math.min(100, parseInt(req.query.per_page, 10) || 20)
      );
      const offset = (page - 1) * perPage;
      const q = (req.query.q || "").trim();
      const category = (req.query.category || "ALL").trim();
      const source = req.query.source || "ALL";
      const sort = req.query.sort || "newest";
      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;

      const orderBy = sort === "oldest" ? "event_at ASC" : "event_at DESC";

      const whereParts = [];
      const params = [];

      if (q) {
        whereParts.push(
          "(username LIKE ? OR competition_title LIKE ? OR ticket_number LIKE ?)"
        );
        const like = `%${q}%`;
        params.push(like, like, like);
      }
      if (category && category !== "ALL") {
        whereParts.push("competition_category = ?");
        params.push(category);
      }
      if (from && !Number.isNaN(from.getTime())) {
        whereParts.push("event_at >= ?");
        params.push(from);
      }
      if (to && !Number.isNaN(to.getTime())) {
        whereParts.push("event_at <= ?");
        params.push(to);
      }

      const whereClause = whereParts.length
        ? `WHERE ${whereParts.join(" AND ")}`
        : "";

     const mainSelect = `SELECT
    'MAIN' AS source,
    BIN_TO_UUID(w.id) AS winner_id,
    BIN_TO_UUID(w.user_id) AS user_id,
    BIN_TO_UUID(w.competition_id) AS competition_id,
    BIN_TO_UUID(w.ticket_id) AS ticket_id,
    u.username AS username,
    u.profile_photo AS profile_photo,
    c.title AS competition_title,
    c.category AS competition_category,
    c.price AS entry_price,
    c.end_date AS date_ended,
    w.prize_description AS prize_description,
    COALESCE(w.prize_value, 0) AS reward_value,
    COALESCE(CAST(t.ticket_number AS CHAR), '') AS ticket_number,
    w.created_at AS event_at
  FROM winners w
  JOIN users u ON w.user_id = u.id
  JOIN competitions c ON w.competition_id = c.id
  LEFT JOIN tickets t ON w.ticket_id = t.id`;

    const instantSelect = `SELECT
    'INSTANT' AS source,
    BIN_TO_UUID(iw.id) AS winner_id,
    BIN_TO_UUID(iw.claimed_by) AS user_id,
    BIN_TO_UUID(iw.competition_id) AS competition_id,
    NULL AS ticket_id,
    u.username AS username,
    u.profile_photo AS profile_photo,
    c.title AS competition_title,
    c.category AS competition_category,
    c.price AS entry_price,
    c.end_date AS date_ended,
    iw.title AS prize_description,
    COALESCE(iw.prize_value, 0) AS reward_value,
    COALESCE(CAST(iw.ticket_number AS CHAR), '') AS ticket_number,
    iw.claimed_at AS event_at
  FROM instant_wins iw
  JOIN users u ON iw.claimed_by = u.id
  JOIN competitions c ON iw.competition_id = c.id
  WHERE iw.claimed_by IS NOT NULL`;

      let baseQuery;
      if (source === "MAIN") {
        baseQuery = `(${mainSelect}) AS winners_union`;
      } else if (source === "INSTANT") {
        baseQuery = `(${instantSelect}) AS winners_union`;
      } else {
        baseQuery = `(${mainSelect} UNION ALL ${instantSelect}) AS winners_union`;
      }

      const [[countRow]] = await db.query(
        `SELECT COUNT(*) AS total FROM ${baseQuery} ${whereClause}`,
        params
      );

      const [rows] = await db.query(
        `SELECT * FROM ${baseQuery}
         ${whereClause}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`,
        [...params, perPage, offset]
      );

      res.json({
        success: true,
        data: {
          page,
          per_page: perPage,
          total: countRow?.total || 0,
          rows,
        },
      });
    } catch (error) {
      console.error("Admin winners list error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch winners list",
        error: error.message,
      });
    }
  },

  // ==================== ADMIN: EXPORT (CSV) ====================
  exportAdminWinners: async (req, res) => {
    try {
      const validationResult = winnerSchema.adminExport.safeParse(req);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: validationResult.error.errors,
        });
      }

      const q = (req.query.q || "").trim();
      const category = (req.query.category || "ALL").trim();
      const source = req.query.source || "ALL";
      const sort = req.query.sort || "newest";
      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;
      const orderBy = sort === "oldest" ? "event_at ASC" : "event_at DESC";

      const whereParts = [];
      const params = [];

      if (q) {
        whereParts.push(
          "(username LIKE ? OR competition_title LIKE ? OR ticket_number LIKE ?)"
        );
        const like = `%${q}%`;
        params.push(like, like, like);
      }
      if (category && category !== "ALL") {
        whereParts.push("competition_category = ?");
        params.push(category);
      }
      if (from && !Number.isNaN(from.getTime())) {
        whereParts.push("event_at >= ?");
        params.push(from);
      }
      if (to && !Number.isNaN(to.getTime())) {
        whereParts.push("event_at <= ?");
        params.push(to);
      }

      const whereClause = whereParts.length
        ? `WHERE ${whereParts.join(" AND ")}`
        : "";

      const mainSelect = `SELECT
          'MAIN' AS source,
          BIN_TO_UUID(w.id) AS winner_id,
          u.username AS username,
          u.email AS email,
          c.title AS competition_title,
          c.category AS competition_category,
          c.price AS entry_price,
          c.end_date AS date_ended,
          w.prize_description AS prize_description,
          COALESCE(pd.prize_value, 0) AS reward_value,
          COALESCE(CAST(t.ticket_number AS CHAR), '') AS ticket_number,
          w.created_at AS event_at
        FROM winners w
        JOIN users u ON w.user_id = u.id
        JOIN competitions c ON w.competition_id = c.id
        LEFT JOIN tickets t ON w.ticket_id = t.id
        LEFT JOIN prize_distributions pd ON pd.winner_id = w.id`;

      const instantSelect = `SELECT
          'INSTANT' AS source,
          BIN_TO_UUID(iw.id) AS winner_id,
          u.username AS username,
          u.email AS email,
          c.title AS competition_title,
          c.category AS competition_category,
          c.price AS entry_price,
          c.end_date AS date_ended,
          iw.title AS prize_description,
          COALESCE(iw.prize_value, 0) AS reward_value,
          COALESCE(CAST(iw.ticket_number AS CHAR), '') AS ticket_number,
          iw.claimed_at AS event_at
        FROM instant_wins iw
        JOIN users u ON iw.claimed_by = u.id
        JOIN competitions c ON iw.competition_id = c.id
        WHERE iw.claimed_by IS NOT NULL`;

      let baseQuery;
      if (source === "MAIN") {
        baseQuery = `(${mainSelect}) AS winners_union`;
      } else if (source === "INSTANT") {
        baseQuery = `(${instantSelect}) AS winners_union`;
      } else {
        baseQuery = `(${mainSelect} UNION ALL ${instantSelect}) AS winners_union`;
      }

      const [rows] = await db.query(
        `SELECT * FROM ${baseQuery}
         ${whereClause}
         ORDER BY ${orderBy}`,
        params
      );

      const headers = [
        "source",
        "winner_id",
        "username",
        "email",
        "competition_title",
        "competition_category",
        "reward_value",
        "entry_price",
        "date_ended",
        "ticket_number",
        "prize_description",
        "event_at",
      ];

      const escapeCsv = (val) => {
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (/[\n\r,\"]/g.test(str)) return `"${str.replace(/\"/g, '""')}"`;
        return str;
      };

      const lines = [headers.join(",")];
      for (const r of rows) {
        lines.push(headers.map((h) => escapeCsv(r[h])).join(","));
      }

      const csv = lines.join("\n");
      const filename = `winners_export_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"${filename}\"`
      );
      res.send(csv);
    } catch (error) {
      console.error("Admin winners export error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to export winners",
        error: error.message,
      });
    }
  },

  // ==================== ADMIN: EXPORT PRESET ROUTES ====================
  exportWinnersAllSources: (req, res) => {
    req.query.source = "ALL";
    return winnersController.exportAdminWinners(req, res);
  },

  exportWinnersMainSource: (req, res) => {
    req.query.source = "MAIN";
    return winnersController.exportAdminWinners(req, res);
  },

  exportWinnersInstantSource: (req, res) => {
    req.query.source = "INSTANT";
    return winnersController.exportAdminWinners(req, res);
  },

  exportWinnersJackpotCategory: (req, res) => {
    req.query.category = "JACKPOT";
    return winnersController.exportAdminWinners(req, res);
  },

  exportWinnersSubscriptionCategory: (req, res) => {
    req.query.category = "SUBSCRIPTION";
    return winnersController.exportAdminWinners(req, res);
  },

  // ==================== GET RECENT WINNERS ====================
  getRecentWinners: async (req, res) => {
    try {
      // Main competition winners (includes all types)
      const [mainWinners] = await db.query(
        `SELECT 
          BIN_TO_UUID(w.id) as id,
          BIN_TO_UUID(w.competition_id) as competition_id,
          BIN_TO_UUID(w.user_id) as user_id,
          BIN_TO_UUID(w.ticket_id) as ticket_id,
          w.prize_description,
          w.draw_method,
          w.created_at,
          c.title as competition_title,
          c.category as competition_category,
          u.username,
          u.profile_photo,
          t.ticket_number
         FROM winners w
         JOIN competitions c ON w.competition_id = c.id
         JOIN users u ON w.user_id = u.id
         LEFT JOIN tickets t ON w.ticket_id = t.id
         ORDER BY w.created_at DESC 
         LIMIT 20`
      );

      // Instant win winners
      const [instantWins] = await db.query(
        `SELECT 
          BIN_TO_UUID(iw.id) as id,
          BIN_TO_UUID(iw.competition_id) as competition_id,
          BIN_TO_UUID(iw.claimed_by) as user_id,
          iw.ticket_number,
          iw.title as prize_name,
          iw.prize_value,
          iw.payout_type,
          iw.claimed_at,
          c.title as competition_title,
          u.username,
          u.profile_photo
         FROM instant_wins iw
         JOIN users u ON iw.claimed_by = u.id
         JOIN competitions c ON iw.competition_id = c.id
         WHERE iw.claimed_by IS NOT NULL
         ORDER BY iw.claimed_at DESC 
         LIMIT 10`
      );

      // Mini-game winners (highest scores)
      const [miniGameWinners] = await db.query(
        `SELECT 
          BIN_TO_UUID(mgs.id) as id,
          BIN_TO_UUID(mgs.user_id) as user_id,
          BIN_TO_UUID(mgs.game_id) as game_id,
          BIN_TO_UUID(mgs.competition_id) as competition_id,
          mgs.score,
          mgs.created_at,
          u.username,
          u.profile_photo,
          g.name as game_name,
          c.title as competition_title
         FROM mini_game_scores mgs
         JOIN users u ON mgs.user_id = u.id
         JOIN games g ON mgs.game_id = g.id
         LEFT JOIN competitions c ON mgs.competition_id = c.id
         WHERE mgs.score > 0
         ORDER BY mgs.score DESC, mgs.created_at DESC 
         LIMIT 10`
      );

      // Subscription competition winners
      const [subscriptionWinners] = await db.query(
        `SELECT 
          BIN_TO_UUID(w.id) as id,
          BIN_TO_UUID(w.competition_id) as competition_id,
          BIN_TO_UUID(w.user_id) as user_id,
          BIN_TO_UUID(w.ticket_id) as ticket_id,
          w.prize_description,
          w.prize_value,
          w.draw_method,
          w.created_at,
          c.title as competition_title,
          c.subscription_tier,
          u.username,
          u.profile_photo
         FROM winners w
         JOIN competitions c ON w.competition_id = c.id
         JOIN users u ON w.user_id = u.id
         WHERE c.category = 'SUBSCRIPTION'
         ORDER BY w.created_at DESC 
         LIMIT 10`
      );

      // Jackpot winners
      const [jackpotWinners] = await db.query(
        `SELECT 
          BIN_TO_UUID(w.id) as id,
          BIN_TO_UUID(w.competition_id) as competition_id,
          BIN_TO_UUID(w.user_id) as user_id,
          BIN_TO_UUID(w.ticket_id) as ticket_id,
          w.prize_description,
          w.prize_value,
          w.draw_method,
          w.created_at,
          c.title as competition_title,
          c.prize_option,
          u.username,
          u.profile_photo
         FROM winners w
         JOIN competitions c ON w.competition_id = c.id
         JOIN users u ON w.user_id = u.id
         WHERE c.category = 'JACKPOT'
         ORDER BY w.created_at DESC 
         LIMIT 10`
      );

      res.json({
        success: true,
        data: {
          main_draw_winners: mainWinners,
          instant_wins: instantWins,
          mini_game_winners: miniGameWinners,
          subscription_winners: subscriptionWinners,
          jackpot_winners: jackpotWinners,
          statistics: {
            total_winners:
              mainWinners.length +
              instantWins.length +
              miniGameWinners.length +
              subscriptionWinners.length +
              jackpotWinners.length,
            main_draw_winners: mainWinners.length,
            instant_wins: instantWins.length,
            mini_game_winners: miniGameWinners.length,
            subscription_winners: subscriptionWinners.length,
            jackpot_winners: jackpotWinners.length,
          },
        },
      });
    } catch (error) {
      console.error("Get recent winners error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch winners",
        error: error.message,
      });
    }
  },

  // ==================== DECLARE WINNER (MANUAL SELECTION) ====================
  declareWinner: async (req, res) => {
    try {
      const validationResult = winnerSchema.declareWinner.safeParse(req);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: validationResult.error.errors,
        });
      }

      const {
        competition_id,
        user_id,
        ticket_id,
        prize_description,
        draw_method = "MANUAL",
      } = req.body;

      const winnerId = uuidv4();

      await db.query(
        `INSERT INTO winners (id, competition_id, ticket_id, user_id, prize_description, draw_method, created_at)
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, CURRENT_TIMESTAMP)`,
        [
          winnerId,
          competition_id,
          ticket_id || null,
          user_id,
          prize_description || "Main Prize",
          draw_method,
        ]
      );

      // Update competition status if all winners have been selected
      const [competition] = await db.query(
        `SELECT category, status, total_tickets, sold_tickets, BIN_TO_UUID(game_id) as game_id
         FROM competitions 
         WHERE id = UUID_TO_BIN(?)`,
        [competition_id]
      );

      if (competition[0]) {
        // Check if competition should be marked as completed
        const [winnersCount] = await db.query(
          `SELECT COUNT(*) as count FROM winners WHERE competition_id = UUID_TO_BIN(?)`,
          [competition_id]
        );

        // Optional: Update competition status if it's complete
        if (winnersCount[0].count >= 1) {
          // Adjust based on your logic
          await db.query(
            `UPDATE competitions SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
            [competition_id]
          );
        }
        // If this is a mini-game competition, also add a mini_game_scores record
        try {
          if (competition[0].category === 'MINI_GAME') {
            const gameId = competition[0].game_id; // BIN_TO_UUID(game_id) returned as string
            if (!gameId) {
              console.warn(`Mini-game competition ${competition_id} has no game_id; skipping mini_game_scores insert`);
            } else {
              // Use a score of 0 for manual admin-declared winners unless caller provides a score in future
              await db.query(
                `INSERT INTO mini_game_scores (id, user_id, game_id, competition_id, score, created_at)
                 VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, CURRENT_TIMESTAMP)`,
                [user_id, gameId, competition_id, 0]
              );
            }
          }
        } catch (e) {
          console.error('Failed to insert mini_game_scores for manual winner declare:', e.message);
        }
      }

      // Get winner details for response
      const [winnerDetails] = await db.query(
        `SELECT 
          BIN_TO_UUID(w.id) as id,
          BIN_TO_UUID(w.competition_id) as competition_id,
          BIN_TO_UUID(w.user_id) as user_id,
          BIN_TO_UUID(w.ticket_id) as ticket_id,
          w.prize_description,
          w.draw_method,
          w.created_at,
          c.title as competition_title,
          u.username,
          u.email,
          t.ticket_number
         FROM winners w
         JOIN competitions c ON w.competition_id = c.id
         JOIN users u ON w.user_id = u.id
         LEFT JOIN tickets t ON w.ticket_id = t.id
         WHERE w.id = UUID_TO_BIN(?)`,
        [winnerId]
      );

      // Log admin action
      await db.query(
        `INSERT INTO admin_activities (id, admin_id, action, target_id, module, created_at)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, 'winners', CURRENT_TIMESTAMP)`,
        [req.user?.id || null, "MANUAL_WINNER_SELECTION", competition_id]
      );

      res.json({
        success: true,
        message: "Winner declared successfully",
        data: winnerDetails[0],
      });
    } catch (error) {
      console.error("Declare winner error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to declare winner",
        error: error.message,
      });
    }
  },

  // ==================== SELECT WINNERS BY METHOD ====================
  selectWinners: async (req, res) => {
    try {
      const validationResult = winnerSchema.selectWinners.safeParse(req);
      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: validationResult.error.errors,
        });
      }

      const {
        competition_id,
        method,
        winners_count = 1,
        criteria = {},
      } = req.body;

      // Check competition exists and is active
      const [competition] = await db.query(
        `SELECT * FROM competitions WHERE id = UUID_TO_BIN(?)`,
        [competition_id]
      );

      if (!competition[0]) {
        return res.status(404).json({
          success: false,
          message: "Competition not found",
        });
      }

      const comp = competition[0];

      // Check if competition has ended
      if (
        comp.status === "ACTIVE" &&
        comp.end_date &&
        new Date(comp.end_date) > new Date()
      ) {
        return res.status(400).json({
          success: false,
          message: "Competition has not ended yet",
        });
      }

      let winners = [];

      switch (method) {
        case "RANDOM_DRAW":
          winners = await selectRandomWinners(
            competition_id,
            winners_count,
            comp.category
          );
          break;

        case "MANUAL_SELECTION":
          if (!criteria.user_ids || !Array.isArray(criteria.user_ids)) {
            return res.status(400).json({
              success: false,
              message: "User IDs array required for manual selection",
            });
          }
          winners = await selectManualWinners(
            competition_id,
            criteria.user_ids,
            criteria.prize_descriptions
          );
          break;

        case "SKILL_BASED":
          winners = await selectSkillBasedWinners(
            competition_id,
            winners_count,
            criteria
          );
          break;

        case "FIRST_ENTRY":
          winners = await selectFirstEntryWinners(
            competition_id,
            winners_count
          );
          break;

        case "WEIGHTED_DRAW":
          winners = await selectWeightedWinners(
            competition_id,
            winners_count,
            criteria
          );
          break;

        default:
          return res.status(400).json({
            success: false,
            message: "Invalid selection method",
          });
      }

      if (winners.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No eligible participants found for winner selection",
        });
      }

      // Record winners in database
      const recordedWinners = await recordWinners(
        competition_id,
        winners,
        method
      );

      // Update competition status to completed
      await db.query(
        `UPDATE competitions SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
        [competition_id]
      );

      // Send notifications to winners (optional)
      await notifyWinners(competition_id, recordedWinners);

      // Log admin action
      await db.query(
        `INSERT INTO admin_activities (id, admin_id, action, target_id, module, details, created_at)
         VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, 'winners', ?, CURRENT_TIMESTAMP)`,
        [
          req.user?.id || null,
          "BULK_WINNER_SELECTION",
          competition_id,
          JSON.stringify({ method, count: winners.length }),
        ]
      );

      res.json({
        success: true,
        message: `${
          winners.length
        } winner(s) selected successfully using ${method
          .replace("_", " ")
          .toLowerCase()}`,
        data: {
          competition_id,
          method,
          winners_count: winners.length,
          winners: recordedWinners,
          next_steps: [
            "Winner notifications sent",
            "Competition marked as completed",
            "Prize distribution pending",
          ],
        },
      });
    } catch (error) {
      console.error("Select winners error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to select winners",
        error: error.message,
      });
    }
  },

  // ==================== GET COMPETITION WINNERS ====================
  getCompetitionWinners: async (req, res) => {
    try {
      const { competition_id } = req.params;

    const [winners] = await db.query(
  `SELECT 
    BIN_TO_UUID(w.id) as id,
    BIN_TO_UUID(w.user_id) as user_id,
    BIN_TO_UUID(w.ticket_id) as ticket_id,
    w.prize_description,
    w.prize_value,
    w.draw_method,
    w.created_at,
    w.verification_status,
    u.username,
    u.profile_photo,
    u.email,
    t.ticket_number,
    c.title as competition_title,
    c.category as competition_category,
    CASE 
      WHEN w.draw_method = 'MANUAL' OR w.draw_method = 'MANUAL_SELECTION' THEN 'Admin Selection'
      WHEN w.draw_method = 'RANDOM_DRAW' THEN 'Random Draw'
      WHEN w.draw_method = 'SKILL_BASED' THEN 'Skill Based'
      WHEN w.draw_method = 'FIRST_ENTRY' THEN 'First Entry'
      WHEN w.draw_method = 'WEIGHTED_DRAW' THEN 'Weighted Draw'
      ELSE w.draw_method
    END as draw_method_display
   FROM winners w
   JOIN users u ON w.user_id = u.id
   JOIN competitions c ON w.competition_id = c.id
   LEFT JOIN tickets t ON w.ticket_id = t.id
   WHERE w.competition_id = UUID_TO_BIN(?)
   ORDER BY w.created_at DESC`,
  [competition_id]
);
      // Get instant win winners for this competition
      const [instantWins] = await db.query(
        `SELECT 
          BIN_TO_UUID(iw.id) as id,
          BIN_TO_UUID(iw.claimed_by) as user_id,
          iw.ticket_number,
          iw.title as prize_name,
          iw.prize_value,
          iw.payout_type,
          iw.claimed_at,
          u.username,
          u.profile_photo
         FROM instant_wins iw
         JOIN users u ON iw.claimed_by = u.id
         WHERE iw.competition_id = UUID_TO_BIN(?) AND iw.claimed_by IS NOT NULL
         ORDER BY iw.claimed_at DESC`,
        [competition_id]
      );

      // Get competition details
      const [competition] = await db.query(
        `SELECT 
          BIN_TO_UUID(id) as id,
          title,
          description,
          category,
          competition_type,
          status,
          start_date,
          end_date,
          total_tickets,
          sold_tickets
         FROM competitions 
         WHERE id = UUID_TO_BIN(?)`,
        [competition_id]
      );

      res.json({
        success: true,
        data: {
          competition: competition[0],
          main_winners: winners,
          instant_win_winners: instantWins,
          statistics: {
            total_winners: winners.length + instantWins.length,
            main_winners: winners.length,
            instant_wins: instantWins.length,
            prize_distribution: calculatePrizeDistribution(winners),
          },
        },
      });
    } catch (error) {
      console.error("Get competition winners error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch competition winners",
        error: error.message,
      });
    }
  },

  // ==================== VERIFY WINNER CLAIM ====================
  verifyWinnerClaim: async (req, res) => {
    try {
      const { winner_id, verification_status, admin_notes } = req.body;

      const [winner] = await db.query(
        `SELECT * FROM winners WHERE id = UUID_TO_BIN(?)`,
        [winner_id]
      );

      if (!winner[0]) {
        return res.status(404).json({
          success: false,
          message: "Winner not found",
        });
      }

      // Update winner verification status
      await db.query(
        `UPDATE winners SET verification_status = ?, admin_notes = ?, verified_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
        [verification_status, admin_notes, winner_id]
      );

      // If verified, process prize distribution
      if (verification_status === "VERIFIED") {
        await processPrizeDistribution(winner[0]);
      }

      res.json({
        success: true,
        message: `Winner claim ${verification_status.toLowerCase()}`,
        data: {
          winner_id,
          verification_status,
          verified_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Verify winner claim error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to verify winner claim",
        error: error.message,
      });
    }
  },
};

// ==================== HELPER FUNCTIONS ====================

// Random Draw Method
async function selectRandomWinners(competition_id, count, category) {
  const [entries] = await db.query(
    `SELECT 
      DISTINCT BIN_TO_UUID(t.user_id) as user_id,
      BIN_TO_UUID(t.id) as ticket_id,
      t.ticket_number
     FROM tickets t
     WHERE t.competition_id = UUID_TO_BIN(?)
     AND t.is_used = FALSE
     ORDER BY RAND()
     LIMIT ?`,
    [competition_id, count]
  );

  return entries.map((entry) => ({
    user_id: entry.user_id,
    ticket_id: entry.ticket_id,
    ticket_number: entry.ticket_number,
    prize_description: getPrizeDescription(category, 1),
  }));
}

// Manual Selection Method
async function selectManualWinners(competition_id, user_ids, prize_descriptions = []) {
  const winners = [];

  for (let i = 0; i < user_ids.length; i++) {
    const userId = user_ids[i];

    // Get user's ticket for this competition
    const [ticket] = await db.query(
      `SELECT 
        BIN_TO_UUID(id) as ticket_id,
        ticket_number
       FROM tickets 
       WHERE competition_id = UUID_TO_BIN(?) 
       AND user_id = UUID_TO_BIN(?)
       AND is_used = FALSE
       LIMIT 1`,
      [competition_id, userId]
    );

    if (ticket[0]) {
      winners.push({
        user_id: userId,
        ticket_id: ticket[0].ticket_id,
        ticket_number: ticket[0].ticket_number,
        prize_description: prize_descriptions[i] || "Main Prize",
      });
    }
  }

  return winners;
}

// Skill-Based Selection Method
async function selectSkillBasedWinners(competition_id, count, criteria) {
  // Build WHERE clauses then GROUP BY and optional HAVING
  const whereClauses = [`competition_id = UUID_TO_BIN(?)`];
  const params = [competition_id];

  if (criteria.min_score) {
    whereClauses.push("score >= ?");
    params.push(criteria.min_score);
  }

  let query = `SELECT 
      BIN_TO_UUID(user_id) as user_id,
      MAX(score) as high_score,
      COUNT(*) as play_count
    FROM mini_game_scores
    WHERE ${whereClauses.join(" AND ")}
    GROUP BY user_id`;

  if (criteria.min_plays) {
    query += ` HAVING play_count >= ?`;
    params.push(criteria.min_plays);
  }

  query += ` ORDER BY high_score DESC LIMIT ?`;
  params.push(count);

  const [scores] = await db.query(query, params);

  // Get ticket information for winners
  const winners = [];
  for (const score of scores) {
    const [ticket] = await db.query(
      `SELECT 
        BIN_TO_UUID(id) as ticket_id,
        ticket_number
       FROM tickets 
       WHERE competition_id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?)
       LIMIT 1`,
      [competition_id, score.user_id]
    );

    if (ticket[0]) {
      winners.push({
        user_id: score.user_id,
        ticket_id: ticket[0].ticket_id,
        ticket_number: ticket[0].ticket_number,
        prize_description: `Skill Based Winner (Score: ${score.high_score})`,
        score: score.high_score,
      });
    }
  }

  return winners;
}

// First Entry Selection Method
async function selectFirstEntryWinners(competition_id, count) {
  const [entries] = await db.query(
    `SELECT 
      BIN_TO_UUID(ce.user_id) as user_id,
      BIN_TO_UUID(t.id) as ticket_id,
      t.ticket_number,
      ce.entry_date
     FROM competition_entries ce
     JOIN tickets t ON ce.competition_id = t.competition_id AND ce.user_id = t.user_id
     WHERE ce.competition_id = UUID_TO_BIN(?)
     AND ce.status = 'ACTIVE'
     ORDER BY ce.entry_date ASC
     LIMIT ?`,
    [competition_id, count]
  );

  return entries.map((entry, index) => ({
    user_id: entry.user_id,
    ticket_id: entry.ticket_id,
    ticket_number: entry.ticket_number,
    prize_description: `First Entry Winner (Position: ${index + 1})`,
    entry_date: entry.entry_date,
  }));
}

// Weighted Draw Method
async function selectWeightedWinners(competition_id, count, criteria) {
  const [entries] = await db.query(
    `SELECT 
      BIN_TO_UUID(ce.user_id) as user_id,
      BIN_TO_UUID(t.id) as ticket_id,
      t.ticket_number,
      COUNT(*) as ticket_count
     FROM competition_entries ce
     JOIN tickets t ON ce.competition_id = t.competition_id AND ce.user_id = t.user_id
     WHERE ce.competition_id = UUID_TO_BIN(?)
     AND ce.status = 'ACTIVE'
     GROUP BY ce.user_id, t.id
     ORDER BY ticket_count DESC
     LIMIT ?`,
    [competition_id, count * 3] // Get more entries for weighted selection
  );

  // Create weighted array based on ticket count (cap repeated entries to avoid memory blowup)
  const weightedEntries = [];
  entries.forEach((entry) => {
    const rawWeight = entry.ticket_count * (criteria.weight_multiplier || 1);
    const weight = Math.min(100, Math.max(1, Math.round(rawWeight)));
    for (let i = 0; i < weight; i++) {
      weightedEntries.push(entry);
    }
  });

  // Shuffle and select winners
  const shuffled = weightedEntries.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  // Remove duplicates by user_id
  const uniqueWinners = [];
  const seenUsers = new Set();

  for (const entry of selected) {
    if (!seenUsers.has(entry.user_id)) {
      seenUsers.add(entry.user_id);
      uniqueWinners.push({
        user_id: entry.user_id,
        ticket_id: entry.ticket_id,
        ticket_number: entry.ticket_number,
        prize_description: `Weighted Draw Winner (Tickets: ${entry.ticket_count})`,
        ticket_count: entry.ticket_count,
      });
    }
  }

  return uniqueWinners.slice(0, count);
}

// Record winners in database
async function recordWinners(competition_id, winners, method) {
  const recordedWinners = [];
  // Fetch competition meta to determine if this is a MINI_GAME and get game_id
  let competitionCategory = null;
  let competitionGameId = null;
  try {
    const [compRows] = await db.query(
      `SELECT category, BIN_TO_UUID(game_id) as game_id FROM competitions WHERE id = UUID_TO_BIN(?)`,
      [competition_id]
    );
    if (compRows && compRows[0]) {
      competitionCategory = compRows[0].category;
      competitionGameId = compRows[0].game_id;
    }
  } catch (e) {
    console.warn('Unable to fetch competition meta for recordWinners:', e.message);
  }

  for (const winner of winners) {
    const winnerId = uuidv4();

    await db.query(
      `INSERT INTO winners (id, competition_id, ticket_id, user_id, prize_description, draw_method, created_at)
       VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, CURRENT_TIMESTAMP)`,
      [
        winnerId,
        competition_id,
        winner.ticket_id || null,
        winner.user_id,
        winner.prize_description,
        method,
      ]
    );

    // Get full winner details
    const [recordedWinner] = await db.query(
      `SELECT 
        BIN_TO_UUID(w.id) as id,
        BIN_TO_UUID(w.user_id) as user_id,
        BIN_TO_UUID(w.ticket_id) as ticket_id,
        w.prize_description,
        w.draw_method,
        w.created_at,
        u.username,
        u.email,
        t.ticket_number
       FROM winners w
       JOIN users u ON w.user_id = u.id
       LEFT JOIN tickets t ON w.ticket_id = t.id
       WHERE w.id = UUID_TO_BIN(?)`,
      [winnerId]
    );

    if (recordedWinner[0]) {
      recordedWinners.push(recordedWinner[0]);
      // If this is a mini-game competition, insert a matching mini_game_scores record
      try {
        if (competitionCategory === 'MINI_GAME') {
          if (!competitionGameId) {
            console.warn(`Mini-game competition ${competition_id} has no game_id; skipping mini_game_scores insert`);
          } else {
            const scoreToInsert = typeof winner.score !== 'undefined' ? winner.score : 0;
            await db.query(
              `INSERT INTO mini_game_scores (id, user_id, game_id, competition_id, score, created_at)
               VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, CURRENT_TIMESTAMP)`,
              [winner.user_id, competitionGameId, competition_id, scoreToInsert]
            );
          }
        }
      } catch (e) {
        console.error('Failed to insert mini_game_scores for recorded winner:', e.message);
      }
    }
  }

  return recordedWinners;
}

// Notify winners (placeholder function)
async function notifyWinners(competition_id, winners) {
  // In a real implementation, this would send emails, push notifications, etc.
  console.log(
    `Notifying ${winners.length} winners for competition ${competition_id}`
  );

  // Log notification attempts
  for (const winner of winners) {
    await db.query(
      `INSERT INTO notifications (id, user_id, type, title, message, data, created_at)
       VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'WINNER', 'Congratulations!', ?, ?, CURRENT_TIMESTAMP)`,
      [
        winner.user_id,
        `You won in competition! Prize: ${winner.prize_description}`,
        JSON.stringify({
          competition_id,
          winner_id: winner.id,
          prize: winner.prize_description,
        }),
      ]
    );
  }
}

// Process prize distribution
async function processPrizeDistribution(winner) {
  const prizeDescription = winner.prize_description.toLowerCase();
  let prizeType = 'OTHER';
  let prizeValue = winner.prize_value || 0;

  // Determine prize type and value
  if (prizeDescription.includes("cash") || prizeDescription.includes("£")) {
    prizeType = 'CASH';
    prizeValue = extractCashAmount(prizeDescription) || prizeValue;
    
    // Award cash to wallet
    await db.query(
      `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
      [prizeValue, winner.user_id]
    );
  } else if (prizeDescription.includes("credit")) {
    prizeType = 'CREDIT';
    prizeValue = extractCreditAmount(prizeDescription) || prizeValue;
    
    // Award site credit
    await db.query(
      `UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
      [prizeValue, winner.user_id]
    );
  } else if (prizeDescription.includes("ticket")) {
    prizeType = 'TICKETS';
    
    // Award universal tickets
    await db.query(
      `INSERT INTO universal_tickets (id, user_id, ticket_type, source, quantity, expires_at, created_at)
       VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), 'WINNER_PRIZE', 'WINNER', 1, DATE_ADD(CURDATE(), INTERVAL 30 DAY), CURRENT_TIMESTAMP)`,
      [winner.user_id]
    );
  }

  // Create prize distribution record
  await db.query(
    `INSERT INTO prize_distributions (id, winner_id, prize_type, prize_value, status, distributed_at, created_at)
     VALUES (UUID_TO_BIN(UUID()), UUID_TO_BIN(?), ?, ?, 'COMPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [winner.id, prizeType, prizeValue]
  );

  // Update winner's prize value
  await db.query(
    `UPDATE winners SET prize_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = UUID_TO_BIN(?)`,
    [prizeValue, winner.id]
  );
}

// Helper functions
function getPrizeDescription(category, position) {
  const prizes = {
    JACKPOT: ["£1,000,000 Jackpot", "£100,000 Prize", "£50,000 Prize"],
    PAID: ["Main Prize", "Second Prize", "Third Prize"],
    FREE: ["Free Prize", "Consolation Prize"],
    SUBSCRIPTION: ["Subscriber Prize", "Monthly Draw Prize"],
    MINI_GAME: ["High Score Prize", "Skill Prize"],
  };

  const categoryPrizes = prizes[category] || ["Main Prize"];
  return categoryPrizes[position - 1] || categoryPrizes[0];
}

function extractCashAmount(description) {
  const match = description.match(/£([\d,]+)/);
  return match ? parseFloat(match[1].replace(",", "")) : 0;
}

function extractCreditAmount(description) {
  const match = description.match(/(\d+) credit/i);
  return match ? parseFloat(match[1]) : 0;
}

function extractPrizeValue(description) {
  return (
    extractCashAmount(description) || extractCreditAmount(description) || 0
  );
}

function determinePrizeType(description) {
  if (description.includes("cash") || description.includes("£")) return "CASH";
  if (description.includes("credit")) return "CREDIT";
  if (description.includes("ticket")) return "TICKETS";
  return "OTHER";
}

function calculatePrizeDistribution(winners) {
  const distribution = {
    total_cash: 0,
    total_credit: 0,
    total_tickets: 0,
    prize_types: {},
  };

  winners.forEach((winner) => {
    const desc = winner.prize_description.toLowerCase();
    const cash = extractCashAmount(desc);
    const credit = extractCreditAmount(desc);

    if (cash > 0) {
      distribution.total_cash += cash;
      distribution.prize_types["CASH"] =
        (distribution.prize_types["CASH"] || 0) + 1;
    } else if (credit > 0) {
      distribution.total_credit += credit;
      distribution.prize_types["CREDIT"] =
        (distribution.prize_types["CREDIT"] || 0) + 1;
    } else if (desc.includes("ticket")) {
      distribution.total_tickets += 1;
      distribution.prize_types["TICKETS"] =
        (distribution.prize_types["TICKETS"] || 0) + 1;
    } else {
      distribution.prize_types["OTHER"] =
        (distribution.prize_types["OTHER"] || 0) + 1;
    }
  });

  return distribution;
}

export default winnersController;
