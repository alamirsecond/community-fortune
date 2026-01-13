import pool from "../../../database.js";
import { v4 as uuidv4 } from "uuid";
import ticketSchemas from "./tickets_zod.js";
import SpendingLimitsService from "../spendingLimits/spending_limit_con.js";
import processInstantWin from "../INSTANT WINS/instantWins_con.js";

class TicketSystemController {
  static async allocateTickets(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const validationResult = ticketSchemas.allocateTickets.safeParse(
        req.body
      );
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid request data",
          details: validationResult.error.errors,
        });
      }

      const {
        competition_id,
        quantity,
        use_universal_tickets,
        purchase_id,
        payment_method,
      } = validationResult.data;
      const user_id = req.user.id;
      // const user_id = "44314444-5555-6666-7777-888888888888";

      const [competition] = await connection.query(
        `
      SELECT 
  BIN_TO_UUID(c.id) AS id,
  c.title,
  c.description,
  c.featured_image,
  c.featured_video,
  c.price,
  c.total_tickets,
  c.sold_tickets,
  c.category,
  c.type,
  c.start_date,
  c.end_date,
  c.no_end_date,
  c.is_free_competition,
  c.points_per_pound,
  c.status,
  c.competition_type,
  c.skill_question_enabled,
  c.skill_question_text,
  c.skill_question_answer,
  c.free_entry_enabled,
  c.free_entry_instructions,
  c.postal_address,
  c.max_entries_per_user,
  c.requires_address,
  c.prize_option,
  c.ticket_model,
  c.threshold_type,
  c.threshold_value,
  c.subscription_tier,
  c.auto_entry_enabled,
  c.subscriber_competition_type,
  c.wheel_type,
  c.wheel_config,
  c.spins_per_user,
  c.game_id,
  c.game_type,
  c.game_name,
  c.game_code,
  c.points_per_play,
  c.leaderboard_type,
  c.created_at,
  c.updated_at,
  COUNT(t.id) AS user_tickets_count
FROM competitions c
LEFT JOIN tickets t 
  ON c.id = t.competition_id
  AND t.user_id = UUID_TO_BIN(?)
WHERE c.id = UUID_TO_BIN(?)
  AND c.status = 'ACTIVE'
FOR UPDATE;

        `,
        [user_id, competition_id]
      );

      if (!competition || competition.length === 0) {
        throw new Error("Competition not found or inactive");
      }

      const comp = competition[0];

      if (
        comp.max_entries_per_user &&
        comp.user_tickets_count + quantity > comp.max_entries_per_user
      ) {
        throw new Error(
          `Maximum ${comp.max_entries_per_user} tickets allowed per user`
        );
      }

      let allocatedTickets = [];

      if (use_universal_tickets) {
        allocatedTickets = await TicketSystemController.useUniversalTickets(
          connection,
          user_id,
          competition_id,
          quantity
        );
      } else {
        if (comp.price > 0) {
          const totalCost = comp.price * quantity;
          const limitCheck = await SpendingLimitsService.checkSpendingLimits(
            connection,
            user_id,
            totalCost,
            payment_method
          );

          if (!limitCheck.allowed) {
            throw new Error(`Spending limit exceeded: ${limitCheck.message}`);
          }

          if (payment_method === "CREDIT_WALLET") {
            await this.deductSiteCredit(connection, user_id, totalCost);
          }

          await SpendingLimitsService.updateSpending(
            connection,
            user_id,
            totalCost
          );
        }

        allocatedTickets =
          await TicketSystemController.allocateCompetitionTickets(
            connection,
            user_id,
            competition_id,
            quantity,
            purchase_id
          );
      }

      await connection.query(
        `
        UPDATE competitions 
        SET sold_tickets = sold_tickets + ? 
        WHERE id = UUID_TO_BIN(?)
        `,
        [quantity, competition_id]
      );

      await connection.commit();

      res.json({
        success: true,
        tickets: allocatedTickets,
        competition: {
          id: comp.id,
          title: comp.title,
          total_tickets: comp.total_tickets,
          sold_tickets: comp.sold_tickets + quantity,
          tickets_remaining:
            comp.total_tickets - (comp.sold_tickets + quantity),
          ticket_price: comp.price,
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Allocate tickets error:", error);
      res.status(400).json({
        error: error.message,
        code: error.code || "TICKET_ALLOCATION_ERROR",
      });
    } finally {
      connection.release();
    }
  }

  static async useUniversalTickets(
    connection,
    user_id,
    competition_id,
    quantity
  ) {
    const [universalTickets] = await connection.query(
      `
      SELECT BIN_TO_UUID(id) as id 
      FROM universal_tickets 
      WHERE user_id = UUID_TO_BIN(?) 
      AND is_used = FALSE 
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at
      LIMIT ?
      FOR UPDATE SKIP LOCKED
      `,
      [user_id, quantity]
    );

    if (universalTickets.length < quantity) {
      throw new Error(
        `Insufficient universal tickets. Available: ${universalTickets.length}, Required: ${quantity}`
      );
    }

    const allocatedTickets = [];

    for (let i = 0; i < quantity; i++) {
      const universalTicket = universalTickets[i];
      const ticket_number = await this.getNextTicketNumber(
        connection,
        competition_id
      );

      const ticketId = uuidv4();
      await connection.query(
        `
        INSERT INTO tickets (
          id, competition_id, user_id, ticket_number, 
          ticket_type, universal_ticket_id, is_used
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, 'UNIVERSAL', UUID_TO_BIN(?), TRUE)
        `,
        [ticketId, competition_id, user_id, ticket_number, universalTicket.id]
      );

      await connection.query(
        `
        UPDATE universal_tickets 
        SET is_used = TRUE, used_at = NOW() 
        WHERE id = UUID_TO_BIN(?)
        `,
        [universalTicket.id]
      );

      const isInstantWin = await this.checkInstantWin(
        connection,
        competition_id,
        ticket_number,
        user_id
      );

      allocatedTickets.push({
        id: ticketId,
        ticket_number,
        is_instant_win: isInstantWin,
        ticket_type: "UNIVERSAL",
        universal_ticket_id: universalTicket.id,
      });
    }

    return allocatedTickets;
  }

  static async allocateCompetitionTickets(
    connection,
    user_id,
    competition_id,
    quantity,
    purchase_id
  ) {
    const allocatedTickets = [];

    for (let i = 0; i < quantity; i++) {
      const ticket_number = await this.getNextTicketNumber(
        connection,
        competition_id
      );
      const ticketId = uuidv4();

      const isInstantWin = await this.checkInstantWin(
        connection,
        competition_id,
        ticket_number,
        user_id
      );

      await connection.query(
        `
        INSERT INTO tickets (
          id, competition_id, user_id, ticket_number,
          purchase_id, ticket_type, is_instant_win
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, 'COMPETITION', ?)
        `,
        [
          ticketId,
          competition_id,
          user_id,
          ticket_number,
          purchase_id,
          isInstantWin,
        ]
      );

      allocatedTickets.push({
        id: ticketId,
        ticket_number,
        is_instant_win: isInstantWin,
        ticket_type: "COMPETITION",
      });
    }

    return allocatedTickets;
  }

  static async getNextTicketNumber(connection, competition_id) {
    const [result] = await connection.query(
      `
      SELECT COALESCE(MAX(ticket_number), 0) + 1 as next_number
      FROM tickets 
      WHERE competition_id = UUID_TO_BIN(?)
      FOR UPDATE
      `,
      [competition_id]
    );

    return result[0].next_number;
  }

  static async checkInstantWin(
    connection,
    competition_id,
    ticket_number,
    user_id
  ) {
    const [instantWin] = await connection.query(
      `
      SELECT BIN_TO_UUID(id) as id 
      FROM instant_wins 
      WHERE competition_id = UUID_TO_BIN(?) 
      AND ticket_number = ?
      AND claimed_by IS NULL
      AND current_winners < max_winners
      FOR UPDATE SKIP LOCKED
      `,
      [competition_id, ticket_number]
    );

    if (instantWin.length > 0) {
      await processInstantWin(connection, instantWin[0].id, user_id);
      return true;
    }

    return false;
  }

  static async getUserTickets(req, res) {
    const connection = await pool.getConnection();

    try {
      const user_id = req.user.id;
      // const user_id = "44314444-5555-6666-7777-888888888888";
      const { competition_id, ticket_type, include_instant_wins } = req.query;

      let query = `
        SELECT 
          BIN_TO_UUID(t.id) as id,
          BIN_TO_UUID(t.competition_id) as competition_id,
          BIN_TO_UUID(t.user_id) as user_id,
          BIN_TO_UUID(t.universal_ticket_id) as universal_ticket_id,
          BIN_TO_UUID(t.purchase_id) as purchase_id,
          t.ticket_number,
          t.ticket_type,
          t.is_instant_win,
          t.is_used,
          t.created_at,
          c.title as competition_title,
          c.featured_image,
          c.status as competition_status,
          iw.prize_name as instant_win_prize,
          iw.prize_value as instant_win_value
        FROM tickets t
        JOIN competitions c ON t.competition_id = c.id
        LEFT JOIN instant_wins iw ON t.competition_id = iw.competition_id 
          AND t.ticket_number = iw.ticket_number
          AND iw.claimed_by = t.user_id
        WHERE t.user_id = UUID_TO_BIN(?)
      `;

      const params = [user_id];

      if (competition_id) {
        query += ` AND t.competition_id = UUID_TO_BIN(?)`;
        params.push(competition_id);
      }

      if (ticket_type) {
        query += ` AND t.ticket_type = ?`;
        params.push(ticket_type);
      }

      if (include_instant_wins === "true") {
        query += ` AND t.is_instant_win = TRUE`;
      }

      query += ` ORDER BY t.created_at DESC`;

      const [tickets] = await connection.query(query, params);

      res.json({
        total: tickets.length,
        tickets,
      });
    } catch (error) {
      console.error("Get user tickets error:", error);
      res.status(500).json({
        error: "Failed to fetch tickets",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  static async awardUniversalTickets(req, res) {
    const { user_id, source, quantity, expires_at = null } = req.body;

    if (!user_id || !source || !quantity) {
      return res.status(400).json({
        error: "Missing required fields: user_id, source, or quantity",
      });
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const ticketIds = [];

      for (let i = 0; i < quantity; i++) {
        const ticketId = uuidv4();
        await connection.query(
          `
          INSERT INTO universal_tickets (
            id, user_id, source, expires_at
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)
          `,
          [ticketId, user_id, source, expires_at]
        );
        ticketIds.push(ticketId);
      }

      await connection.commit();

      res.json({
        success: true,
        message: `${quantity} universal ticket(s) awarded`,
        tickets: ticketIds,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Award universal tickets error:", error);
      res.status(500).json({
        error: "Failed to award universal tickets",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  static async awardUniversalTicketsWithTransaction(
    connection,
    user_id,
    source,
    quantity,
    expires_at = null
  ) {
    const ticketIds = [];

    for (let i = 0; i < quantity; i++) {
      const ticketId = uuidv4();
      await connection.query(
        `
        INSERT INTO universal_tickets (
          id, user_id, source, expires_at
        ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?)
        `,
        [ticketId, user_id, source, expires_at]
      );

      ticketIds.push(ticketId);
    }

    return ticketIds;
  }

  static async getUniversalTicketsBalance(req, res) {
    const connection = await pool.getConnection();

    try {
      const user_id = req.user.id;
      // const user_id = "33333333-4444-5555-6666-777777777777";
      const { include_expired = false } = req.query;

      let query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN is_used = TRUE THEN 1 END) as used,
          COUNT(CASE WHEN is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 END) as available,
          COUNT(CASE WHEN is_used = FALSE AND expires_at <= NOW() THEN 1 END) as expired,
          GROUP_CONCAT(DISTINCT source) as sources
        FROM universal_tickets
        WHERE user_id = UUID_TO_BIN(?)
      `;

      if (!include_expired) {
        query += ` AND (expires_at IS NULL OR expires_at > NOW())`;
      }

      const [balance] = await connection.query(query, [user_id]);

      const [breakdown] = await connection.query(
        `
        SELECT 
          source,
          COUNT(*) as total,
          COUNT(CASE WHEN is_used = TRUE THEN 1 END) as used,
          COUNT(CASE WHEN is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW()) THEN 1 END) as available
        FROM universal_tickets
        WHERE user_id = UUID_TO_BIN(?)
        GROUP BY source
        ORDER BY source
        `,
        [user_id]
      );

      res.json({
        balance: balance[0] || {
          total: 0,
          used: 0,
          available: 0,
          expired: 0,
          sources: null,
        },
        breakdown,
      });
    } catch (error) {
      console.error("Get universal tickets balance error:", error);
      res.status(500).json({
        error: "Failed to fetch universal tickets balance",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  static async deductSiteCredit(connection, user_id, amount) {
    const [wallet] = await connection.query(
      `
      SELECT balance FROM wallets 
      WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'
      FOR UPDATE
      `,
      [user_id]
    );

    if (!wallet || wallet.length === 0 || wallet[0].balance < amount) {
      throw new Error("Insufficient site credit balance");
    }

    await connection.query(
      `
      UPDATE wallets 
      SET balance = balance - ?, updated_at = NOW()
      WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'
      `,
      [amount, user_id]
    );

    const transactionId = uuidv4();
    await connection.query(
      `
      INSERT INTO wallet_transactions (
        id, wallet_id, amount, type, reference, description
      ) SELECT UUID_TO_BIN(?), id, ?, 'DEBIT', UUID_TO_BIN(?), ?
      FROM wallets WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'
      `,
      [transactionId, amount, uuidv4(), "Ticket purchase", user_id]
    );
  }

  static async getCompetitionTicketStats(req, res) {
    const connection = await pool.getConnection();

    try {
      const { competition_id } = req.params;
      const user_id = req.user.id;
      // const user_id = "33333333-4444-5555-6666-777777777777";

      const [stats] = await connection.query(
        `
        SELECT 
          COUNT(*) as user_total_tickets,
          COUNT(CASE WHEN is_instant_win = TRUE THEN 1 END) as user_instant_wins,
          COUNT(CASE WHEN is_used = TRUE THEN 1 END) as user_used_tickets,
          MIN(ticket_number) as user_min_ticket,
          MAX(ticket_number) as user_max_ticket
        FROM tickets
        WHERE competition_id = UUID_TO_BIN(?) 
          AND user_id = UUID_TO_BIN(?)
        `,
        [competition_id, user_id]
      );

      const [compStats] = await connection.query(
        `
        SELECT 
          COUNT(*) as total_tickets_sold,
          sold_tickets,
          total_tickets,
          (total_tickets - sold_tickets) as tickets_remaining
        FROM competitions
        WHERE id = UUID_TO_BIN(?)
        `,
        [competition_id]
      );

      res.json({
        user_stats: stats[0] || {
          user_total_tickets: 0,
          user_instant_wins: 0,
          user_used_tickets: 0,
          user_min_ticket: null,
          user_max_ticket: null,
        },
        competition_stats: compStats[0] || {
          total_tickets_sold: 0,
          sold_tickets: 0,
          total_tickets: 0,
          tickets_remaining: 0,
        },
      });
    } catch (error) {
      console.error("Get competition ticket stats error:", error);
      res.status(500).json({
        error: "Failed to fetch competition ticket statistics",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }
}

export default TicketSystemController;
