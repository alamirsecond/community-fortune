import pool from "../../../database.js";
import { v4 as uuidv4 } from "uuid";
import instantWinSchemas from "./instantWins_zod.js";

class InstantWinController {
  static async createInstantWins(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const validationResult = instantWinSchemas.createInstantWin.safeParse(
        req.body
      );
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid instant win data",
          details: validationResult.error.errors,
        });
      }

      const { competition_id, ticket_numbers, pattern, prizes } =
        validationResult.data;

      const [competition] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(id) as id,
          title,
          total_tickets 
        FROM competitions 
        WHERE id = UUID_TO_BIN(?) AND status = 'ACTIVE'
        `,
        [competition_id]
      );

      if (!competition || competition.length === 0) {
        throw new Error("Competition not found or inactive");
      }

      const comp = competition[0];

      let winningTicketNumbers = [];

      if (pattern) {
        winningTicketNumbers = InstantWinController.generateTicketNumbers(
          pattern,
          comp.total_tickets
        );
      } else {
        winningTicketNumbers = ticket_numbers;
      }

      const invalidNumbers = winningTicketNumbers.filter(
        (num) => num < 1 || num > comp.total_tickets
      );

      if (invalidNumbers.length > 0) {
        throw new Error(
          `Invalid ticket numbers: ${invalidNumbers.join(
            ", "
          )}. Must be between 1 and ${comp.total_tickets}`
        );
      }

      const [existingWins] = await connection.query(
        `
        SELECT ticket_number FROM instant_wins 
        WHERE competition_id = UUID_TO_BIN(?) 
        AND ticket_number IN (?)
        `,
        [competition_id, winningTicketNumbers]
      );

      if (existingWins.length > 0) {
        const duplicates = existingWins.map((win) => win.ticket_number);
        throw new Error(
          `Duplicate instant wins found for tickets: ${duplicates.join(", ")}`
        );
      }

      const prizeDistribution = InstantWinController.distributePrizes(
        prizes,
        winningTicketNumbers
      );

      const instantWinIds = [];

      for (const [ticketNumber, prize] of Object.entries(prizeDistribution)) {
        const instantWinId = uuidv4();

        // Build the query dynamically based on available fields
        const fields = [
          "id",
          "competition_id",
          "ticket_number",
          "prize_name",
          "prize_value",
          "prize_type",
          "max_winners",
        ];
        const placeholders = [
          "UUID_TO_BIN(?)",
          "UUID_TO_BIN(?)",
          "?",
          "?",
          "?",
          "?",
          "?",
        ];
        const values = [
          instantWinId,
          competition_id,
          parseInt(ticketNumber),
          prize.name,
          prize.value,
          prize.type,
          prize.max_winners || 1,
        ];

        // Add optional fields if they exist
        if (prize.title) {
          fields.push("title");
          placeholders.push("?");
          values.push(prize.title);
        } else if (comp.title) {
          fields.push("title");
          placeholders.push("?");
          values.push(comp.title);
        }

        if (prize.image_url) {
          fields.push("image_url");
          placeholders.push("?");
          values.push(prize.image_url);
        }

        if (prize.payout_type) {
          fields.push("payout_type");
          placeholders.push("?");
          values.push(prize.payout_type);
        }

        if (prize.claimed_by) {
          fields.push("claimed_by");
          placeholders.push("UUID_TO_BIN(?)");
          values.push(prize.claimed_by);
        }

        if (prize.claimed_at) {
          fields.push("claimed_at");
          placeholders.push("?");
          values.push(prize.claimed_at);
        }

        if (prize.user_details) {
          fields.push("user_details");
          placeholders.push("?");
          values.push(JSON.stringify(prize.user_details));
        }

        await connection.query(
          `
          INSERT INTO instant_wins (${fields.join(", ")})
          VALUES (${placeholders.join(", ")})
          `,
          values
        );

        instantWinIds.push(instantWinId);
      }

      await connection.commit();

      res.json({
        success: true,
        instant_wins_created: instantWinIds.length,
        ticket_numbers: winningTicketNumbers,
        prize_distribution: prizeDistribution,
        competition: {
          id: comp.id,
          total_tickets: comp.total_tickets,
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Create instant wins error:", error);
      res.status(400).json({
        error: error.message,
        code: "INSTANT_WIN_CREATION_ERROR",
      });
    } finally {
      connection.release();
    }
  }

  // NEW METHOD: Manual insertion with all fields
  static async createInstantWinManually(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const validationResult =
        instantWinSchemas.createInstantWinManual.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid instant win data",
          details: validationResult.error.errors,
        });
      }

      const {
        competition_id,
        ticket_number,
        title,
        prize_name,
        prize_value,
        prize_type,
        payout_type,
        image_url,
        max_winners = 1,
        current_winners = 0,
        claimed_by,
        claimed_at,
        user_details,
      } = validationResult.data;

      // Check if competition exists
      const [competition] = await connection.query(
        `
        SELECT total_tickets FROM competitions 
        WHERE id = UUID_TO_BIN(?)
        `,
        [competition_id]
      );

      if (!competition || competition.length === 0) {
        throw new Error("Competition not found");
      }

      const comp = competition[0];

      // Validate ticket number
      if (ticket_number < 1 || ticket_number > comp.total_tickets) {
        throw new Error(
          `Ticket number must be between 1 and ${comp.total_tickets}`
        );
      }

      // Check for duplicate instant win
      const [existingWins] = await connection.query(
        `
        SELECT ticket_number FROM instant_wins 
        WHERE competition_id = UUID_TO_BIN(?) 
        AND ticket_number = ?
        `,
        [competition_id, ticket_number]
      );

      if (existingWins.length > 0) {
        throw new Error(
          `Instant win already exists for ticket ${ticket_number}`
        );
      }

      // Validate claimed_by user if provided
      if (claimed_by) {
        const [user] = await connection.query(
          `
          SELECT id FROM users 
          WHERE id = UUID_TO_BIN(?)
          `,
          [claimed_by]
        );

        if (!user || user.length === 0) {
          throw new Error("User not found");
        }
      }

      const instantWinId = uuidv4();

      // Insert the instant win
      await connection.query(
        `
        INSERT INTO instant_wins (
          id, competition_id, ticket_number,
          title, prize_name, prize_value,
          prize_type, payout_type, image_url,
          max_winners, current_winners,
          claimed_by, claimed_at, user_details
        ) VALUES (
          UUID_TO_BIN(?), UUID_TO_BIN(?), ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ${claimed_by ? "UUID_TO_BIN(?)" : "NULL"}, 
          ${claimed_at ? "?" : "NULL"},
          ${user_details ? "?" : "NULL"}
        )
        `,
        [
          instantWinId,
          competition_id,
          ticket_number,
          title,
          prize_name,
          prize_value,
          prize_type,
          payout_type,
          image_url,
          max_winners,
          current_winners,
          ...(claimed_by ? [claimed_by] : []),
          ...(claimed_at ? [claimed_at] : []),
          ...(user_details ? [JSON.stringify(user_details)] : []),
        ]
      );

      await connection.commit();

      res.json({
        success: true,
        instant_win_id: instantWinId,
        message: "Instant win created successfully",
        data: {
          ticket_number,
          prize_name,
          prize_value,
          prize_type,
          claimed_by: claimed_by ? "Set" : "Not set",
          claimed_at: claimed_at || "Not set",
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Create instant win manually error:", error);
      res.status(400).json({
        error: error.message,
        code: "INSTANT_WIN_MANUAL_CREATION_ERROR",
      });
    } finally {
      connection.release();
    }
  }

  // NEW METHOD: Update claimed status manually
  static async updateClaimedStatus(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const validationResult = instantWinSchemas.updateClaimedStatus.safeParse(
        req.body
      );
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid data",
          details: validationResult.error.errors,
        });
      }

      const {
        instant_win_id,
        claimed_by,
        claimed_at,
        user_details,
        increment_current_winners = false,
      } = validationResult.data;

      // Get current instant win
      const [instantWins] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(id) as id,
          max_winners,
          current_winners,
          claimed_by
        FROM instant_wins 
        WHERE id = UUID_TO_BIN(?)
        FOR UPDATE
        `,
        [instant_win_id]
      );

      if (!instantWins || instantWins.length === 0) {
        throw new Error("Instant win not found");
      }

      const instantWin = instantWins[0];

      // Validate user if claiming
      if (claimed_by) {
        const [user] = await connection.query(
          `
          SELECT id FROM users 
          WHERE id = UUID_TO_BIN(?)
          `,
          [claimed_by]
        );

        if (!user || user.length === 0) {
          throw new Error("User not found");
        }

        // Check if already claimed
        if (instantWin.claimed_by) {
          throw new Error("Instant win already claimed");
        }

        // Check max winners
        if (
          increment_current_winners &&
          instantWin.current_winners >= instantWin.max_winners
        ) {
          throw new Error("Maximum winners reached");
        }
      }

      // Build update query (safe parameterization)
      const updates = [];
      const values = [];

      if (claimed_by !== undefined) {
        if (claimed_by) {
          updates.push("claimed_by = UUID_TO_BIN(?)");
          values.push(claimed_by);
        } else {
          updates.push("claimed_by = NULL");
        }
      }

      if (claimed_at !== undefined) {
        if (claimed_at) {
          updates.push("claimed_at = ?");
          values.push(claimed_at);
        } else {
          updates.push("claimed_at = NULL");
        }
      }

      if (user_details !== undefined) {
        if (user_details) {
          updates.push("user_details = ?");
          values.push(JSON.stringify(user_details));
        } else {
          updates.push("user_details = NULL");
        }
      }

      if (increment_current_winners) {
        updates.push("current_winners = current_winners + 1");
      }

      if (updates.length === 0) {
        throw new Error("No fields to update");
      }

      // Execute update
      await connection.query(
        `
        UPDATE instant_wins 
        SET ${updates.join(", ")}
        WHERE id = UUID_TO_BIN(?)
        `,
        [...values, instant_win_id]
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Claimed status updated successfully",
        instant_win_id,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update claimed status error:", error);
      res.status(400).json({
        error: error.message,
        code: "CLAIMED_STATUS_UPDATE_ERROR",
      });
    } finally {
      connection.release();
    }
  }

  static generateTicketNumbers(pattern, totalTickets) {
    const numbers = [];

    switch (pattern.type) {
      case "RANDOM":
        const availableNumbers = Array.from(
          { length: totalTickets },
          (_, i) => i + 1
        );
        for (let i = 0; i < pattern.count; i++) {
          if (availableNumbers.length === 0) break;
          const randomIndex = Math.floor(
            Math.random() * availableNumbers.length
          );
          numbers.push(availableNumbers.splice(randomIndex, 1)[0]);
        }
        break;

      case "SEQUENTIAL":
        const start = pattern.start || 1;
        const end = Math.min(start + pattern.count - 1, totalTickets);
        for (let i = start; i <= end; i++) {
          numbers.push(i);
        }
        break;

      case "CUSTOM_RANGE":
        const rangeStart = pattern.start || 1;
        const rangeEnd = pattern.end || totalTickets;
        const rangeSize = rangeEnd - rangeStart + 1;

        if (pattern.count > rangeSize) {
          throw new Error(
            `Cannot select ${pattern.count} unique numbers from range ${rangeSize}`
          );
        }

        const rangeNumbers = Array.from(
          { length: rangeSize },
          (_, i) => rangeStart + i
        );
        for (let i = 0; i < pattern.count; i++) {
          const randomIndex = Math.floor(Math.random() * rangeNumbers.length);
          numbers.push(rangeNumbers.splice(randomIndex, 1)[0]);
        }
        break;
    }

    return numbers;
  }

  static distributePrizes(prizes, ticketNumbers) {
    const distribution = {};
    let ticketIndex = 0;

    const allPrizes = [];
    prizes.forEach((prize) => {
      for (let i = 0; i < prize.max_winners; i++) {
        allPrizes.push({ ...prize });
      }
    });

    allPrizes.forEach((prize, index) => {
      if (ticketIndex < ticketNumbers.length) {
        distribution[ticketNumbers[ticketIndex]] = prize;
        ticketIndex++;
      }
    });

    while (ticketIndex < ticketNumbers.length) {
      distribution[ticketNumbers[ticketIndex]] = {
        name: "No Instant Win",
        value: 0,
        type: "NO_WIN",
        max_winners: 1,
      };
      ticketIndex++;
    }

    return distribution;
  }

  static async processInstantWinClaim(
    connection,
    instant_win_id,
    user_id,
    user_details = {}
  ) {
    const [instantWin] = await connection.query(
      `
      SELECT 
        BIN_TO_UUID(id) as id,
        BIN_TO_UUID(competition_id) as competition_id,
        ticket_number,
        prize_name,
        prize_value,
        prize_type,
        max_winners,
        current_winners,
        claimed_by,
        claimed_at
      FROM instant_wins 
      WHERE id = UUID_TO_BIN(?) 
      AND claimed_by IS NULL
      AND current_winners < max_winners
      FOR UPDATE
      `,
      [instant_win_id]
    );

    if (!instantWin || instantWin.length === 0) {
      throw new Error(
        "Instant win not found, already claimed, or maximum winners reached"
      );
    }

    const win = instantWin[0];

    await connection.query(
      `
      UPDATE instant_wins 
      SET claimed_by = UUID_TO_BIN(?), 
        claimed_at = NOW(),
        current_winners = current_winners + 1,
        user_details = ?
      WHERE id = UUID_TO_BIN(?)
      `,
      [user_id, JSON.stringify(user_details), instant_win_id]
    );

    const awardResult = await InstantWinController.awardPrize(
      connection,
      user_id,
      win
    );

    return {
      success: true,
      instant_win: {
        id: win.id,
        prize_name: win.prize_name,
        prize_value: win.prize_value,
        prize_type: win.prize_type,
      },
      award_result: awardResult,
    };
  }

  static async awardPrize(connection, user_id, instantWin) {
    switch (instantWin.prize_type) {
      case "CASH":
        await connection.query(
          `
          INSERT INTO wallet_transactions (
            id, wallet_id, amount, type, reference, description
          ) SELECT UUID_TO_BIN(?), w.id, ?, 'CREDIT', UUID_TO_BIN(?), ?
          FROM wallets w 
          WHERE w.user_id = UUID_TO_BIN(?) AND w.type = 'CASH'
          `,
          [
            uuidv4(),
            instantWin.prize_value,
            uuidv4(),
            `Instant Win: ${instantWin.prize_name}`,
            user_id,
          ]
        );

        await connection.query(
          `
          UPDATE wallets 
          SET balance = balance + ?, updated_at = NOW()
          WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'
          `,
          [instantWin.prize_value, user_id]
        );

        return {
          type: "CASH",
          amount: instantWin.prize_value,
          status: "AWARDED",
        };

      case "SITE_CREDIT":
        await connection.query(
          `
          INSERT INTO wallet_transactions (
            id, wallet_id, amount, type, reference, description
          ) SELECT UUID_TO_BIN(?), w.id, ?, 'CREDIT', UUID_TO_BIN(?), ?
          FROM wallets w 
          WHERE w.user_id = UUID_TO_BIN(?) AND w.type = 'CREDIT'
          `,
          [
            uuidv4(),
            instantWin.prize_value,
            uuidv4(),
            `Instant Win: ${instantWin.prize_name}`,
            user_id,
          ]
        );

        await connection.query(
          `
          UPDATE wallets 
          SET balance = balance + ?, updated_at = NOW()
          WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'
          `,
          [instantWin.prize_value, user_id]
        );

        return {
          type: "SITE_CREDIT",
          amount: instantWin.prize_value,
          status: "AWARDED",
        };

      case "POINTS":
        await connection.query(
          `
          INSERT INTO points_history (
            id, user_id, points, type, source, description
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'EARNED', 'INSTANT_WIN', ?)
          `,
          [
            uuidv4(),
            user_id,
            instantWin.prize_value,
            `Instant Win: ${instantWin.prize_name}`,
          ]
        );

        await connection.query(
          `
          UPDATE user_points 
          SET total_points = total_points + ?, 
              earned_points = earned_points + ?,
              updated_at = NOW()
          WHERE user_id = UUID_TO_BIN(?)
          `,
          [instantWin.prize_value, instantWin.prize_value, user_id]
        );

        return {
          type: "POINTS",
          amount: instantWin.prize_value,
          status: "AWARDED",
        };

      case "FREE_TICKET":
        const ticketId = uuidv4();
        await connection.query(
          `
          INSERT INTO universal_tickets (
            id, user_id, source
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), 'INSTANT_WIN')
          `,
          [ticketId, user_id]
        );

        return {
          type: "FREE_TICKET",
          amount: 1,
          ticket_id: ticketId,
          status: "AWARDED",
        };

      case "PHYSICAL":
        const claimId = uuidv4();
        await connection.query(
          `
          INSERT INTO physical_prize_claims (
            id, user_id, instant_win_id, status
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), 'PENDING')
          `,
          [claimId, user_id, instantWin.id]
        );
        return {
          type: "PHYSICAL",
          status: "PENDING_FULFILLMENT",
          claim_id: claimId,
        };

      case "NO_WIN":
        return { type: "NO_WIN", message: "Better luck next time!" };

      default:
        throw new Error(`Unknown prize type: ${instantWin.prize_type}`);
    }
  }

  static async getCompetitionInstantWins(req, res) {
    const connection = await pool.getConnection();

    try {
      const { competition_id } = req.params;
      const { status, limit = 100, offset = 0 } = req.query;

      let query = `
        SELECT 
          BIN_TO_UUID(iw.id) as id,
          BIN_TO_UUID(iw.competition_id) as competition_id,
          BIN_TO_UUID(iw.claimed_by) as claimed_by,
          iw.ticket_number,
          iw.prize_name,
          iw.prize_value,
          iw.prize_type,
          iw.max_winners,
          iw.current_winners,
          iw.claimed_at,
          iw.user_details,
          iw.created_at,
          u.username as winner_username,
          u.email as winner_email,
          CASE 
            WHEN iw.claimed_by IS NOT NULL THEN 'CLAIMED'
            ELSE 'AVAILABLE'
          END as status,
          c.title as competition_title
        FROM instant_wins iw
        LEFT JOIN users u ON iw.claimed_by = u.id
        JOIN competitions c ON iw.competition_id = c.id
        WHERE iw.competition_id = UUID_TO_BIN(?)
      `;

      const params = [competition_id];

      if (status) {
        if (status === "CLAIMED") {
          query += ` AND iw.claimed_by IS NOT NULL`;
        } else if (status === "AVAILABLE") {
          query += ` AND iw.claimed_by IS NULL`;
        }
      }

      query += ` ORDER BY iw.ticket_number LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));

      const [instantWins] = await connection.query(query, params);

      const [countResult] = await connection.query(
        `
        SELECT COUNT(*) as total FROM instant_wins 
        WHERE competition_id = UUID_TO_BIN(?)
        `,
        [competition_id]
      );

      const [stats] = await connection.query(
        `
        SELECT 
          COUNT(*) as total_wins,
          COUNT(CASE WHEN claimed_by IS NOT NULL THEN 1 END) as claimed_wins,
          COUNT(CASE WHEN claimed_by IS NULL THEN 1 END) as available_wins,
          SUM(prize_value) as total_prize_value,
          SUM(CASE WHEN claimed_by IS NOT NULL THEN prize_value ELSE 0 END) as claimed_prize_value
        FROM instant_wins 
        WHERE competition_id = UUID_TO_BIN(?)
        `,
        [competition_id]
      );

      const [prizeDistribution] = await connection.query(
        `
        SELECT 
          prize_type,
          COUNT(*) as count,
          SUM(prize_value) as total_value,
          COUNT(CASE WHEN claimed_by IS NOT NULL THEN 1 END) as claimed,
          COUNT(CASE WHEN claimed_by IS NULL THEN 1 END) as available
        FROM instant_wins 
        WHERE competition_id = UUID_TO_BIN(?)
        GROUP BY prize_type
        ORDER BY prize_type
        `,
        [competition_id]
      );

      res.json({
        total: countResult[0]?.total || 0,
        statistics: stats[0] || {
          total_wins: 0,
          claimed_wins: 0,
          available_wins: 0,
          total_prize_value: 0,
          claimed_prize_value: 0,
        },
        prize_distribution: prizeDistribution,
        instant_wins: instantWins,
      });
    } catch (error) {
      console.error("Get competition instant wins error:", error);
      res.status(500).json({
        error: "Failed to fetch instant wins",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  static async getUserInstantWins(req, res) {
    const connection = await pool.getConnection();

    try {
      const user_id = req.user.id;
      // const user_id = "33333333-4444-5555-6666-777777777777";
      const { limit = 50, offset = 0, competition_id } = req.query;

      let query = `
        SELECT 
          BIN_TO_UUID(iw.id) as id,
          BIN_TO_UUID(iw.competition_id) as competition_id,
          iw.ticket_number,
          iw.prize_name,
          iw.prize_value,
          iw.prize_type,
          iw.claimed_at as win_date,
          iw.user_details,
          c.title as competition_title,
          c.featured_image as competition_image,
          c.status as competition_status
        FROM instant_wins iw
        JOIN competitions c ON iw.competition_id = c.id
        WHERE iw.claimed_by = UUID_TO_BIN(?)
      `;

      const params = [user_id];

      if (competition_id) {
        query += ` AND iw.competition_id = UUID_TO_BIN(?)`;
        params.push(competition_id);
      }

      query += ` ORDER BY iw.claimed_at DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));

      const [instantWins] = await connection.query(query, params);

      let countQuery = `
        SELECT COUNT(*) as total FROM instant_wins 
        WHERE claimed_by = UUID_TO_BIN(?)
      `;
      const countParams = [user_id];

      if (competition_id) {
        countQuery += ` AND competition_id = UUID_TO_BIN(?)`;
        countParams.push(competition_id);
      }

      const [countResult] = await connection.query(countQuery, countParams);

      let valueQuery = `
        SELECT SUM(prize_value) as total_value FROM instant_wins 
        WHERE claimed_by = UUID_TO_BIN(?)
      `;
      const valueParams = [user_id];

      if (competition_id) {
        valueQuery += ` AND competition_id = UUID_TO_BIN(?)`;
        valueParams.push(competition_id);
      }

      const [valueResult] = await connection.query(valueQuery, valueParams);

      const [prizeDistribution] = await connection.query(
        `
        SELECT 
          prize_type,
          COUNT(*) as count,
          SUM(prize_value) as total_value
        FROM instant_wins 
        WHERE claimed_by = UUID_TO_BIN(?)
        GROUP BY prize_type
        ORDER BY total_value DESC
        `,
        [user_id]
      );

      res.json({
        total_wins: countResult[0]?.total || 0,
        total_value: valueResult[0]?.total_value || 0,
        instant_wins: instantWins,
        prize_distribution: prizeDistribution,
      });
    } catch (error) {
      console.error("Get user instant wins error:", error);
      res.status(500).json({
        error: "Failed to fetch instant win history",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  static async getAvailableInstantWins(req, res) {
    const connection = await pool.getConnection();

    try {
      const { competition_id } = req.params;
      const user_id = req.user.id;
      // const user_id = "33333333-4444-5555-6666-777777777777";

      const [userTickets] = await connection.query(
        `
        SELECT ticket_number 
        FROM tickets 
        WHERE competition_id = UUID_TO_BIN(?) 
          AND user_id = UUID_TO_BIN(?)
          AND is_instant_win = FALSE
        `,
        [competition_id, user_id]
      );

      const userTicketNumbers = userTickets.map((t) => t.ticket_number);

      const [availableWins] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(id) as id,
          ticket_number,
          prize_name,
          prize_value,
          prize_type,
          max_winners,
          current_winners
        FROM instant_wins 
        WHERE competition_id = UUID_TO_BIN(?) 
          AND claimed_by IS NULL
          AND current_winners < max_winners
          AND ticket_number IN (?)
        ORDER BY ticket_number
        `,
        [competition_id, userTicketNumbers.length > 0 ? userTicketNumbers : [0]]
      );

      const [claimedWins] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(id) as id,
          ticket_number,
          prize_name,
          prize_value,
          prize_type,
          claimed_at
        FROM instant_wins 
        WHERE competition_id = UUID_TO_BIN(?) 
          AND claimed_by = UUID_TO_BIN(?)
        ORDER BY claimed_at DESC
        `,
        [competition_id, user_id]
      );

      res.json({
        available_instant_wins: availableWins,
        claimed_instant_wins: claimedWins,
        user_ticket_count: userTicketNumbers.length,
        potential_wins: availableWins.length,
      });
    } catch (error) {
      console.error("Get available instant wins error:", error);
      res.status(500).json({
        error: "Failed to fetch available instant wins",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // ==================== ADMIN: REPORTS (CARDS) ====================
  static async adminInstantWinReports(req, res) {
    const connection = await pool.getConnection();
    try {
      const q = (req.query.q || "").trim();
      const status = (req.query.status || "ACTIVE").trim();
      const page = Math.max(1, parseInt(req.query.page || "1", 10) || 1);
      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query.limit || "12", 10) || 12)
      );
      const offset = (page - 1) * limit;

      const where = ["c.category = 'INSTANT_WIN'"];
      const params = [];

      if (status && status !== "ALL") {
        where.push("c.status = ?");
        params.push(status);
      }
      if (q) {
        where.push("(c.title LIKE ? OR BIN_TO_UUID(c.id) LIKE ?)");
        const like = `%${q}%`;
        params.push(like, like);
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [rows] = await connection.query(
        `
        SELECT
          BIN_TO_UUID(c.id) AS competition_id,
          c.title AS competition_title,
          c.featured_image,
          c.status AS competition_status,
          COUNT(iw.id) AS configured_prizes,
          COUNT(CASE WHEN iw.claimed_by IS NOT NULL THEN 1 END) AS claimed_prizes,
          SUM(COALESCE(iw.prize_value, 0)) AS total_prize_value,
          MAX(iw.created_at) AS last_configured_at
        FROM competitions c
        JOIN instant_wins iw ON iw.competition_id = c.id
        ${whereSql}
        GROUP BY c.id
        ORDER BY last_configured_at DESC
        LIMIT ? OFFSET ?
        `,
        [...params, limit, offset]
      );

      const [countRows] = await connection.query(
        `
        SELECT COUNT(*) AS total
        FROM (
          SELECT c.id
          FROM competitions c
          JOIN instant_wins iw ON iw.competition_id = c.id
          ${whereSql}
          GROUP BY c.id
        ) x
        `,
        params
      );

      const total = Number(countRows?.[0]?.total || 0);
      const totalPages = Math.max(1, Math.ceil(total / limit));

      res.json({
        success: true,
        rows,
        pagination: { page, limit, total, totalPages },
      });
    } catch (error) {
      console.error("Admin instant win reports error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to load instant win reports",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // ==================== ADMIN: COMPETITION DETAILS ====================
  static async adminGetCompetitionInstantWins(req, res) {
    const connection = await pool.getConnection();
    try {
      const { competition_id } = req.params;
      const { status, limit = 200, offset = 0 } = req.query;

      let query = `
        SELECT
          BIN_TO_UUID(iw.id) as id,
          BIN_TO_UUID(iw.competition_id) as competition_id,
          BIN_TO_UUID(iw.claimed_by) as claimed_by,
          iw.ticket_number,
          iw.title,
          iw.prize_name,
          iw.prize_value,
          iw.prize_type,
          iw.max_winners,
          iw.current_winners,
          iw.claimed_at,
          iw.user_details,
          iw.created_at,
          u.username as winner_username,
          u.email as winner_email,
          CASE
            WHEN iw.claimed_by IS NOT NULL THEN 'CLAIMED'
            ELSE 'AVAILABLE'
          END as status,
          c.title as competition_title
        FROM instant_wins iw
        LEFT JOIN users u ON iw.claimed_by = u.id
        JOIN competitions c ON iw.competition_id = c.id
        WHERE iw.competition_id = UUID_TO_BIN(?)
      `;

      const params = [competition_id];
      if (status) {
        if (status === "CLAIMED") query += " AND iw.claimed_by IS NOT NULL";
        if (status === "AVAILABLE") query += " AND iw.claimed_by IS NULL";
      }

      query += " ORDER BY iw.ticket_number LIMIT ? OFFSET ?";
      params.push(parseInt(limit), parseInt(offset));

      const [instantWins] = await connection.query(query, params);

      const [stats] = await connection.query(
        `
        SELECT
          COUNT(*) as total_wins,
          COUNT(CASE WHEN claimed_by IS NOT NULL THEN 1 END) as claimed_wins,
          COUNT(CASE WHEN claimed_by IS NULL THEN 1 END) as available_wins,
          SUM(prize_value) as total_prize_value,
          SUM(CASE WHEN claimed_by IS NOT NULL THEN prize_value ELSE 0 END) as claimed_prize_value
        FROM instant_wins
        WHERE competition_id = UUID_TO_BIN(?)
        `,
        [competition_id]
      );

      res.json({
        success: true,
        statistics: stats[0] || {},
        instant_wins: instantWins,
      });
    } catch (error) {
      console.error("Admin competition instant wins error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch competition instant wins",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // ==================== ADMIN: EXPORT (CSV) ====================
  static escapeCsv(val) {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (/[\n\r,\"]/g.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  static async adminExportCompetitionInstantWinsCsv(req, res) {
    const connection = await pool.getConnection();
    try {
      const { competition_id } = req.params;
      const [rows] = await connection.query(
        `
        SELECT
          c.title AS competition_title,
          BIN_TO_UUID(iw.id) AS instant_win_id,
          iw.ticket_number,
          iw.prize_name,
          iw.prize_type,
          iw.prize_value,
          iw.max_winners,
          iw.current_winners,
          BIN_TO_UUID(iw.claimed_by) AS claimed_by,
          u.username AS claimed_username,
          u.email AS claimed_email,
          iw.claimed_at,
          iw.created_at
        FROM instant_wins iw
        JOIN competitions c ON iw.competition_id = c.id
        LEFT JOIN users u ON iw.claimed_by = u.id
        WHERE iw.competition_id = UUID_TO_BIN(?)
        ORDER BY iw.ticket_number
        `,
        [competition_id]
      );

      const headers = [
        "competition_title",
        "instant_win_id",
        "ticket_number",
        "prize_name",
        "prize_type",
        "prize_value",
        "max_winners",
        "current_winners",
        "claimed_by",
        "claimed_username",
        "claimed_email",
        "claimed_at",
        "created_at",
      ];

      const lines = [headers.join(",")];
      for (const r of rows) {
        lines.push(
          headers.map((h) => InstantWinController.escapeCsv(r[h])).join(",")
        );
      }

      const csv = lines.join("\n");
      const filename = `instant_wins_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"${filename}\"`
      );
      res.send(csv);
    } catch (error) {
      console.error("Admin instant wins export (competition) error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to export competition instant wins",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }

  static async adminExportAllInstantWinsCsv(req, res) {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        `
        SELECT
          c.title AS competition_title,
          BIN_TO_UUID(iw.competition_id) AS competition_id,
          BIN_TO_UUID(iw.id) AS instant_win_id,
          iw.ticket_number,
          iw.prize_name,
          iw.prize_type,
          iw.prize_value,
          BIN_TO_UUID(iw.claimed_by) AS claimed_by,
          u.username AS claimed_username,
          u.email AS claimed_email,
          iw.claimed_at,
          iw.created_at
        FROM instant_wins iw
        JOIN competitions c ON iw.competition_id = c.id
        LEFT JOIN users u ON iw.claimed_by = u.id
        ORDER BY iw.created_at DESC
        LIMIT 200000
        `
      );

      const headers = [
        "competition_title",
        "competition_id",
        "instant_win_id",
        "ticket_number",
        "prize_name",
        "prize_type",
        "prize_value",
        "claimed_by",
        "claimed_username",
        "claimed_email",
        "claimed_at",
        "created_at",
      ];

      const lines = [headers.join(",")];
      for (const r of rows) {
        lines.push(
          headers.map((h) => InstantWinController.escapeCsv(r[h])).join(",")
        );
      }

      const csv = lines.join("\n");
      const filename = `instant_wins_all_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=\"${filename}\"`
      );
      res.send(csv);
    } catch (error) {
      console.error("Admin instant wins export (all) error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to export instant wins",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // ==================== ADMIN: ANALYTICS ====================
  static async adminInstantWinAnalytics(req, res) {
    const connection = await pool.getConnection();
    try {
      const days = Math.min(
        30,
        Math.max(3, parseInt(req.query.days || "7", 10) || 7)
      );
      const monthOnly = String(req.query.month_only || "true") !== "false";

      // Entries over time (tickets for INSTANT_WIN competitions)
      const [dailyEntries] = await connection.query(
        `
        SELECT DATE(t.created_at) AS day, COUNT(*) AS entries
        FROM tickets t
        JOIN competitions c ON t.competition_id = c.id
        WHERE c.category = 'INSTANT_WIN'
          AND t.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(t.created_at)
        ORDER BY day ASC
        `,
        [days - 1]
      );

      // Top competitions this month by entries
      const topWhere = ["c.category = 'INSTANT_WIN'"];
      const topParams = [];
      if (monthOnly) {
        topWhere.push("t.created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')");
      }
      const [topCompetitions] = await connection.query(
        `
        SELECT c.title AS competition_title, BIN_TO_UUID(c.id) AS competition_id, COUNT(*) AS entries
        FROM tickets t
        JOIN competitions c ON t.competition_id = c.id
        WHERE ${topWhere.join(" AND ")}
        GROUP BY c.id
        ORDER BY entries DESC
        LIMIT 8
        `,
        topParams
      );

      // Instant win stats (claimed) grouped by prize_name
      const statsWhere = ["claimed_by IS NOT NULL"];
      if (monthOnly) {
        statsWhere.push("claimed_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')");
      }
      const [byPrizeName] = await connection.query(
        `
        SELECT COALESCE(prize_name, prize_type, 'UNKNOWN') AS label, COUNT(*) AS count
        FROM instant_wins
        WHERE ${statsWhere.join(" AND ")}
        GROUP BY label
        ORDER BY count DESC
        LIMIT 10
        `
      );

      res.json({
        success: true,
        entries_over_time: dailyEntries,
        top_competitions: topCompetitions,
        instant_win_statistics: byPrizeName,
        meta: { days, month_only: monthOnly },
      });
    } catch (error) {
      console.error("Admin instant wins analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to load instant win analytics",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // ==================== ADMIN: COMPETITION REPORT (KPIs + TABLES) ====================
  static async adminCompetitionReport(req, res) {
    const connection = await pool.getConnection();
    try {
      const { competition_id } = req.params;

      const [compRows] = await connection.query(
        `
        SELECT BIN_TO_UUID(id) AS id, title, status, category
        FROM competitions
        WHERE id = UUID_TO_BIN(?)
        LIMIT 1
        `,
        [competition_id]
      );

      if (!compRows?.length) {
        return res.status(404).json({
          success: false,
          message: "Competition not found",
        });
      }

      const competition = compRows[0];

      const [kpiRows] = await connection.query(
        `
        SELECT
          COUNT(*) AS configured_prizes,
          COUNT(CASE WHEN claimed_by IS NOT NULL THEN 1 END) AS claimed_wins,
          COALESCE(SUM(CASE WHEN claimed_by IS NOT NULL THEN prize_value ELSE 0 END), 0) AS total_amount_won
        FROM instant_wins
        WHERE competition_id = UUID_TO_BIN(?)
        `,
        [competition_id]
      );
      const kpis = kpiRows?.[0] || {
        configured_prizes: 0,
        claimed_wins: 0,
        total_amount_won: 0,
      };

      const [configuredRows] = await connection.query(
        `
        SELECT
          COALESCE(prize_name, title, '—') AS prize_name,
          COALESCE(prize_type, 'UNKNOWN') AS prize_type,
          COALESCE(prize_value, 0) AS prize_value,
          SUM(COALESCE(max_winners, 1)) AS max_claims,
          SUM(COALESCE(current_winners, 0)) AS current_claims,
          GROUP_CONCAT(LPAD(ticket_number, 4, '0') ORDER BY ticket_number SEPARATOR ', ') AS ticket_numbers
        FROM instant_wins
        WHERE competition_id = UUID_TO_BIN(?)
        GROUP BY COALESCE(prize_name, title, '—'), COALESCE(prize_type, 'UNKNOWN'), COALESCE(prize_value, 0)
        ORDER BY prize_value DESC, prize_name ASC
        `,
        [competition_id]
      );

      const configured_prizes = (configuredRows || []).map((r) => {
        const maxClaims = Number(r.max_claims || 0);
        const currentClaims = Number(r.current_claims || 0);
        const status =
          currentClaims <= 0
            ? "Awaiting Claims"
            : currentClaims < maxClaims
            ? "Active"
            : "Completed";
        return {
          prize_name: r.prize_name,
          prize_type: r.prize_type,
          prize_value: Number(r.prize_value || 0),
          ticket_numbers: r.ticket_numbers || "",
          max_claims: maxClaims,
          current_claims: currentClaims,
          status,
        };
      });

      const [winnerRows] = await connection.query(
        `
        SELECT
          LPAD(iw.ticket_number, 4, '0') AS ticket_number,
          u.username AS winner,
          u.email AS email,
          COALESCE(iw.prize_name, iw.title, '—') AS prize,
          COALESCE(iw.prize_value, 0) AS amount,
          iw.claimed_at AS date_won
        FROM instant_wins iw
        JOIN users u ON iw.claimed_by = u.id
        WHERE iw.competition_id = UUID_TO_BIN(?)
          AND iw.claimed_by IS NOT NULL
        ORDER BY iw.claimed_at DESC
        LIMIT 500
        `,
        [competition_id]
      );

      res.json({
        success: true,
        competition,
        kpis: {
          configured_prizes: Number(kpis.configured_prizes || 0),
          claimed_wins: Number(kpis.claimed_wins || 0),
          total_amount_won: Number(kpis.total_amount_won || 0),
        },
        configured_prizes,
        winners: winnerRows || [],
      });
    } catch (error) {
      console.error("Admin competition report error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to load instant win competition report",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }
}

export default InstantWinController;
