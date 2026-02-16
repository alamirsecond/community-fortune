import pool from '../../../../database.js';
import { v4 as uuidv4 } from 'uuid';

class Competition {
  // ==================== CREATE COMPETITION ====================
  static parseJSONField(value, fallback = null) {
    if (value === null || value === undefined) {
      return fallback;
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (error) {
        return value;
      }
    }

    return value;
  }

  static normalizeGalleryImages(value) {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return [];
      }

      if (trimmed.includes(',')) {
        return trimmed
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
      }

      return [trimmed];
    }

    return [];
  }
  
  static async create(competitionData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
console.log(competitionData);

      // Generate UUID for competition
      const competitionId = uuidv4();
      const binaryId = this.uuidToBinary(competitionId);

      // Extract all possible fields

      const fields = [
        'title', 'description', 'featured_image', 'featured_video', 'price', 'total_tickets',
        'category', 'type', 'start_date', 'end_date', 'no_end_date', 'is_free_competition',
        'points_per_pound', 'competition_type', 'skill_question_enabled', 'skill_question_text',
        'skill_question_answer', 'free_entry_enabled', 'free_entry_instructions',
        'postal_address', 'max_entries_per_user', 'requires_address', 'status',
        'prize_option', 'ticket_model', 'threshold_type', 'threshold_value',
        'subscription_tier', 'auto_entry_enabled', 'subscriber_competition_type',
        'wheel_type', 'spins_per_user',
        'game_id', 'game_type', 'leaderboard_type', 'game_name', 'game_code', 'points_per_play',
        'gallery_images', 'rules_and_restrictions'
      ];

      const values = fields.map(field => {
        if (field === 'id') return binaryId;
        if (field === 'game_id' && competitionData[field]) return this.uuidToBinary(competitionData[field]);
        if (field === 'gallery_images') {
          // Store as JSON string if array
          return competitionData[field] ? JSON.stringify(competitionData[field]) : null;
        }
        if (field === 'rules_and_restrictions') {
          return competitionData[field] ? JSON.stringify(competitionData[field]) : JSON.stringify([]);
        }
        return competitionData[field] !== undefined ? competitionData[field] : null;
      });

      // Build SQL query
      const placeholders = fields.map(() => '?').join(', ');
      const sql = `INSERT INTO competitions (id, ${fields.join(', ')}) VALUES (?, ${placeholders})`;

      await connection.execute(sql, [binaryId, ...values]);

      await connection.commit();
      return competitionId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  // Basic competition stats using only competitions table
static async getCompetitionStatsDashboard() {
  try {
    const statusCase = `CASE 
      WHEN status = 'CANCELLED' THEN 'CANCELLED'
      WHEN start_date IS NOT NULL AND NOW() < start_date THEN 'UPCOMING'
      WHEN end_date IS NOT NULL AND NOW() > end_date THEN 'COMPLETED'
      ELSE status
    END`;

    // Execute all queries in parallel for better performance
    const [
      [activeResult],
      [monthlyResult],
      [completedResult],
      [endingResult],
      [totalTicketsResult],
      [soldTicketsResult]
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM competitions WHERE ${statusCase} = 'ACTIVE'`),
      pool.query(`
        SELECT COUNT(*) as count 
        FROM competitions 
        WHERE ${statusCase} = 'ACTIVE' 
        AND MONTH(created_at) = MONTH(CURRENT_DATE()) 
        AND YEAR(created_at) = YEAR(CURRENT_DATE())
      `),
      pool.query(`
        SELECT COUNT(*) as count 
        FROM competitions 
        WHERE ${statusCase} = 'COMPLETED'
        AND MONTH(updated_at) = MONTH(CURRENT_DATE()) 
        AND YEAR(updated_at) = YEAR(CURRENT_DATE())
      `),
      pool.query(`
        SELECT COUNT(*) as count 
        FROM competitions 
        WHERE ${statusCase} = 'ACTIVE'
        AND end_date IS NOT NULL
        AND DATE(end_date) = CURDATE()
      `),
      pool.query(`
        SELECT COALESCE(SUM(total_tickets), 0) as total 
        FROM competitions 
        WHERE ${statusCase} = 'ACTIVE'
      `),
      pool.query(`
        SELECT COALESCE(SUM(sold_tickets), 0) as sold 
        FROM competitions 
        WHERE ${statusCase} = 'ACTIVE'
      `)
    ]);

    // Extract values from results
    const active = activeResult[0]?.count || 0;
    const thisMonth = monthlyResult[0]?.count || 0;
    const completed = completedResult[0]?.count || 0;
    const ending = endingResult[0]?.count || 0;
    const totalTickets = totalTicketsResult[0]?.total || 0;
    const soldTickets = soldTicketsResult[0]?.sold || 0;
    const fillRate = totalTickets > 0 ? (soldTickets / totalTickets * 100).toFixed(1) : 0;

    // Calculate entries "today" based on some logic
    // This is a placeholder - adjust based on your actual data
    const todayEntries = Math.round(soldTickets / 30); // Approximate daily average

    // Return the data object, NOT a response
    return {
      active,
      thisMonth,
      completed,
      ending,
      totalTickets,
      soldTickets,
      fillRate: parseFloat(fillRate),
      todayEntries
    };

  } catch (err) {
    console.error("Get competition stats dashboard error:", err);
    throw new Error("Failed to fetch competition statistics");
  }
}

  // ==================== CREATE INSTANT WINS ====================
  
  static async createInstantWins(competitionId, instantWins) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const binaryCompetitionId = this.uuidToBinary(competitionId);

      for (const instantWin of instantWins) {
        for (const ticketNumber of instantWin.ticket_numbers) {
          await connection.execute(
            `INSERT INTO instant_wins (
               id, competition_id, ticket_number, prize_name, prize_value, prize_type,
               max_winners, current_winners, image_url
             ) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              binaryCompetitionId,
              ticketNumber,
              instantWin.prize_name,
              instantWin.prize_amount,
              instantWin.payout_type,
              1,
              0,
              instantWin.image_url || null
            ]
          );
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== CREATE ACHIEVEMENTS ====================
  
  static async createAchievements(competitionId, achievements) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const binaryCompetitionId = this.uuidToBinary(competitionId);

      for (const achievement of achievements) {
        const safe = (v) => (v === undefined ? null : v);
        await connection.execute(
          `INSERT INTO competition_achievements (id, competition_id, title, description, type, condition_value, points_awarded, image_url)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, ?)`,
          [
            binaryCompetitionId,
            safe(achievement.title),
            safe(achievement.description),
            safe(achievement.type),
            safe(achievement.condition_value),
            safe(achievement.points_awarded),
            safe(achievement.image_url)
          ]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== CREATE WHEEL SEGMENTS ====================
  
  static async createWheelSegments(competitionId, segments) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const binaryCompetitionId = this.uuidToBinary(competitionId);

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        await connection.execute(
          `INSERT INTO wheel_segments (id, competition_id, segment_index, label, prize_type, amount, color, probability, image_url)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            binaryCompetitionId,
            i,
            segment.label,
            segment.prize_type,
            segment.amount || null,
            segment.color,
            segment.probability,
            segment.image_url
          ]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== FIND COMPETITION BY ID ====================
  
  static async findById(competitionId) {
    const statusCase = `CASE 
        WHEN status = 'CANCELLED' THEN 'CANCELLED'
        WHEN start_date IS NOT NULL AND NOW() < start_date THEN 'UPCOMING'
        WHEN end_date IS NOT NULL AND NOW() > end_date THEN 'COMPLETED'
        ELSE status
      END`;

    const [rows] = await pool.execute(
      `SELECT 
        BIN_TO_UUID(id) as id,
        title, description, featured_image, featured_video,
        price, total_tickets, sold_tickets, category, type,
        start_date, end_date, no_end_date, is_free_competition,
        points_per_pound, ${statusCase} as status, competition_type,
        skill_question_enabled, skill_question_text, skill_question_answer,
        free_entry_enabled, free_entry_instructions, postal_address,
        max_entries_per_user, requires_address,
        prize_option, ticket_model, threshold_type, threshold_value,
        subscription_tier, auto_entry_enabled, subscriber_competition_type,
        wheel_type, spins_per_user,
        game_id, game_type, leaderboard_type, game_name, game_code, points_per_play,
        gallery_images,
        rules_and_restrictions,
        created_at, updated_at,
        (SELECT COUNT(*) FROM instant_wins WHERE competition_id = UUID_TO_BIN(?)) as instant_wins_count,
        (SELECT COUNT(*) FROM instant_wins WHERE competition_id = UUID_TO_BIN(?) AND claimed_by IS NOT NULL) as instant_wins_claimed_count,
        (SELECT COUNT(*) FROM competition_achievements WHERE competition_id = UUID_TO_BIN(?)) as achievements_count,
        TIMESTAMPDIFF(SECOND, NOW(), end_date) as countdown_seconds
       FROM competitions 
       WHERE id = UUID_TO_BIN(?)`,
      [competitionId, competitionId, competitionId, competitionId]
    );
    
    const competition = rows[0] || null;
    if (!competition) {
      return null;
    }

    competition.gallery_images = this.normalizeGalleryImages(
      this.parseJSONField(competition.gallery_images, [])
    );
    competition.rules_and_restrictions = this.parseJSONField(competition.rules_and_restrictions, []);
    if (!Array.isArray(competition.rules_and_restrictions)) {
      competition.rules_and_restrictions = [];
    }

    return competition;
  }

  // ==================== FIND COMPETITIONS WITH FILTERS ====================
  
  static async findCompetitions(filters = {}) {
    const statusCase = `CASE 
      WHEN c.status = 'CANCELLED' THEN 'CANCELLED'
      WHEN c.start_date IS NOT NULL AND NOW() < c.start_date THEN 'UPCOMING'
      WHEN c.end_date IS NOT NULL AND NOW() > c.end_date THEN 'COMPLETED'
      ELSE c.status
    END`;

    const userSelect = filters.user_id
      ? `,
        (SELECT COUNT(*) FROM competition_entries ce WHERE ce.competition_id = c.id AND ce.user_id = UUID_TO_BIN(?)) as user_entries,
        (SELECT MAX(entry_date) FROM competition_entries ce WHERE ce.competition_id = c.id AND ce.user_id = UUID_TO_BIN(?)) as last_entry_date
      `
      : '';

    let query = `
      SELECT 
        BIN_TO_UUID(c.id) as id,
        c.title, c.description, c.featured_image, c.featured_video,
        c.price, c.total_tickets, c.sold_tickets, c.category, c.type,
        c.start_date, c.end_date, c.no_end_date, c.is_free_competition,
        ${statusCase} as status, c.competition_type, c.created_at,
        c.prize_option, c.ticket_model, c.subscription_tier,
        c.wheel_type, c.game_type, BIN_TO_UUID(c.game_id) as game_id,
        c.leaderboard_type, c.game_name, c.game_code, c.points_per_play,
        c.gallery_images, c.rules_and_restrictions,
        (SELECT COUNT(*) FROM instant_wins iw WHERE iw.competition_id = c.id) as instant_wins_count,
        (SELECT COUNT(*) FROM instant_wins iw WHERE iw.competition_id = c.id AND iw.claimed_by IS NOT NULL) as instant_wins_claimed_count,
        (SELECT COUNT(*) FROM competition_achievements ca WHERE ca.competition_id = c.id) as achievements_count,
        TIMESTAMPDIFF(SECOND, NOW(), c.end_date) as countdown_seconds,
        (SELECT COUNT(*) FROM competition_entries ce WHERE ce.competition_id = c.id) as total_entries,
        (SELECT COUNT(DISTINCT user_id) FROM competition_entries ce WHERE ce.competition_id = c.id) as unique_participants
        ${userSelect}
      FROM competitions c
      WHERE 1=1
    `;
    
    const params = [];
    if (filters.user_id) {
      params.push(filters.user_id, filters.user_id);
    }
    const hasLimit = Number.isInteger(filters.limit) && filters.limit > 0;
    const offset = hasLimit ? (filters.page - 1) * filters.limit : null;
    
    // Apply filters
    if (filters.category) {
      query += ' AND c.category = ?';
      params.push(filters.category);
    }
    
    if (filters.status) {
      query += ` AND (${statusCase}) = ?`;
      params.push(filters.status);
    }
    
    if (filters.competition_type) {
      query += ' AND c.competition_type = ?';
      params.push(filters.competition_type);
    }
    
    if (filters.is_free !== undefined) {
      query += ' AND c.is_free_competition = ?';
      params.push(filters.is_free);
    }
    
    if (filters.min_price !== undefined) {
      query += ' AND c.price >= ?';
      params.push(filters.min_price);
    }
    
    if (filters.max_price !== undefined) {
      query += ' AND c.price <= ?';
      params.push(filters.max_price);
    }
    
    if (filters.search) {
      query += ' AND (c.title LIKE ? OR c.description LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm);
    }

    if (filters.only_entered_by_user && filters.user_id) {
      query += ` AND EXISTS (
        SELECT 1 FROM competition_entries ce
        WHERE ce.competition_id = c.id
          AND ce.user_id = UUID_TO_BIN(?)
      )`;
      params.push(filters.user_id);
    }
    
    if (filters.user_id) {
      // Exclude subscription competitions user cannot access
      if (filters.exclude_inaccessible_subscription) {
        query += ` AND (
          c.category != 'SUBSCRIPTION' 
          OR EXISTS (
            SELECT 1 FROM user_subscriptions us 
            JOIN subscription_tiers st ON us.tier_id = st.id
            WHERE us.user_id = UUID_TO_BIN(?)
            AND us.status = 'ACTIVE'
            AND (
              (c.subscription_tier = 'TIER_1' AND st.tier_level >= 1)
              OR (c.subscription_tier = 'TIER_2' AND st.tier_level >= 2)
              OR (c.subscription_tier = 'TIER_3' AND st.tier_level >= 3)
              OR c.subscription_tier = 'CUSTOM'
            )
          )
        )`;
        params.push(filters.user_id);
      }
    }
    
    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as count_query`;
    const [countResult] = await pool.execute(countQuery, params);
    const total = countResult[0].total;
    const totalPages = hasLimit ? Math.ceil(total / filters.limit) : 1;
    
    // Add sorting and pagination
    query += ` ORDER BY ${filters.sort_by} ${filters.sort_order}`;
    if (hasLimit) {
      query += ' LIMIT ? OFFSET ?';
      params.push(filters.limit, offset);
    }
    
    const [rows] = await pool.query(query, params);

    rows.forEach(row => {
      row.gallery_images = this.normalizeGalleryImages(
        this.parseJSONField(row.gallery_images, [])
      );
      row.rules_and_restrictions = this.parseJSONField(row.rules_and_restrictions, []);
      if (!Array.isArray(row.rules_and_restrictions)) {
        row.rules_and_restrictions = [];
      }
    });

    // Add user eligibility to each row
    if (filters.user_id) {
      for (const row of rows) {
        if (row.user_entries !== undefined) {
          row.user_eligibility = {
            entries: row.user_entries,
            last_entry: row.last_entry_date,
            can_enter_more: row.user_entries < row.max_entries_per_user
          };
        }
      }
    }
    
    return {
      competitions: rows,
      total,
      totalPages
    };
  }

  // ==================== UPDATE COMPETITION ====================
  
  static async update(competitionId, updateData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const fields = [];
      const values = [];

      Object.keys(updateData).forEach(key => {
        if (key !== 'id' && key !== 'created_at') {
          if (key === 'gallery_images' && Array.isArray(updateData[key])) {
            fields.push(`${key} = ?`);
            values.push(JSON.stringify(updateData[key]));
          } else if (key === 'rules_and_restrictions' && Array.isArray(updateData[key])) {
            fields.push(`${key} = ?`);
            values.push(JSON.stringify(updateData[key]));
          } else {
            fields.push(`${key} = ?`);
            values.push(updateData[key]);
          }
        }
      });

      values.push(this.uuidToBinary(competitionId));

      const [result] = await connection.execute(
        `UPDATE competitions 
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        values
      );

      // Log the update in audit table
      await connection.execute(
        `INSERT INTO competition_audit (id, competition_id, change_type, old_values, new_values)
         VALUES (UUID_TO_BIN(UUID()), ?, 'UPDATE', NULL, ?)`,
        [this.uuidToBinary(competitionId), JSON.stringify(updateData)]
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== UPDATE COMPETITION STATUS ====================

  static async updateStatus(competitionId, status, reason = null, changedBy = null, meta = {}) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const binaryCompetitionId = this.uuidToBinary(competitionId);

      const [rows] = await connection.execute(
        `SELECT status FROM competitions WHERE id = ?`,
        [binaryCompetitionId]
      );

      if (!rows.length) {
        await connection.rollback();
        return false;
      }

      const oldStatus = rows[0].status;

      await connection.execute(
        `UPDATE competitions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, binaryCompetitionId]
      );

      await connection.execute(
        `INSERT INTO competition_audit (
           id,
           competition_id,
           changed_by,
           change_type,
           old_values,
           new_values,
           change_reason,
           ip_address,
           user_agent
         ) VALUES (UUID_TO_BIN(UUID()), ?, ?, 'STATUS_CHANGE', ?, ?, ?, ?, ?)`
        ,
        [
          binaryCompetitionId,
          changedBy ? this.uuidToBinary(changedBy) : null,
          JSON.stringify({ status: oldStatus }),
          JSON.stringify({ status }),
          reason || null,
          meta.ip_address || null,
          meta.user_agent || null
        ]
      );

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== DELETE COMPETITION ====================
  static async deleteCompetition(competitionId, changedBy = null, meta = {}) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const binaryCompetitionId = this.uuidToBinary(competitionId);

      // Check if competition exists and fetch current row for audit
      const [rows] = await connection.execute(
        `SELECT * FROM competitions WHERE id = ?`,
        [binaryCompetitionId]
      );

      if (!rows.length) {
        await connection.rollback();
        return false;
      }

      const oldRow = rows[0];

      // Log audit for deletion with optional changed_by and meta (store old values before deleting)
      await connection.execute(
        `INSERT INTO competition_audit (id, competition_id, changed_by, change_type, old_values, new_values, change_reason, ip_address, user_agent)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, 'DELETE', ?, NULL, ?, ?, ?)`,
        [
          binaryCompetitionId,
          changedBy ? this.uuidToBinary(changedBy) : null,
          JSON.stringify(oldRow),
          meta.reason || null,
          meta.ip_address || null,
          meta.user_agent || null
        ]
      );

      // Delete competition (rely on FK ON DELETE CASCADE for related data)
      const [result] = await connection.execute(
        `DELETE FROM competitions WHERE id = ?`,
        [binaryCompetitionId]
      );

      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== CHECK USER CAN ENTER ====================
  
  static async canUserEnter(competitionId, userId) {
    const competition = await this.findById(competitionId);
    if (!competition) {
      return { canEnter: false, reason: 'Competition not found' };
    }
    // Check if competition is active
    if (competition.status !== 'ACTIVE') {
      return { canEnter: false, reason: 'Competition is not active' };
    }
    // Check if competition has started
    if (new Date(competition.start_date) > new Date()) {
      return { canEnter: false, reason: 'Competition has not started yet' };
    }
    // Check if competition has ended
    if (competition.end_date && new Date(competition.end_date) < new Date()) {
      return { canEnter: false, reason: 'Competition has ended' };
    }
    // KYC check: if high-value or KYC-required competition, block if user not verified
    if (competition.kyc_required) {
      const [userRows] = await pool.execute(
        `SELECT kyc_status FROM users WHERE id = UUID_TO_BIN(?)`,
        [userId]
      );
      if (!userRows.length || userRows[0].kyc_status !== 'verified') {
        return { canEnter: false, reason: 'KYC verification required for this competition' };
      }
    }
    // Check max entries per user
    const [entries] = await pool.execute(
      `SELECT COUNT(*) as entry_count
       FROM competition_entries
       WHERE competition_id = UUID_TO_BIN(?) AND user_id = UUID_TO_BIN(?)`,
      [competitionId, userId]
    );
    if (entries[0].entry_count >= competition.max_entries_per_user) {
      return { canEnter: false, reason: 'Maximum entries reached' };
    }
    // Check subscription eligibility for subscription competitions
    if (competition.category === 'SUBSCRIPTION') {
      const eligibility = await this.checkSubscriptionEligibility(competitionId, userId);
      if (!eligibility.eligible) {
        return { canEnter: false, reason: eligibility.reason };
      }
    }
    // Check if tickets are available
    if (competition.sold_tickets >= competition.total_tickets) {
      return { canEnter: false, reason: 'Competition is sold out' };
    }
    return { canEnter: true };
  }

  // ==================== CHECK SUBSCRIPTION ELIGIBILITY ====================
  
  static async checkSubscriptionEligibility(competitionId, userId) {
    const [rows] = await pool.execute(
      `SELECT c.subscription_tier, c.subscriber_competition_type,
              us.tier_id, st.tier_level, st.tier_name,
              CASE 
                WHEN us.status = 'ACTIVE' THEN TRUE
                ELSE FALSE
              END as has_active_subscription
       FROM competitions c
       LEFT JOIN user_subscriptions us ON us.user_id = UUID_TO_BIN(?) AND us.status = 'ACTIVE'
       LEFT JOIN subscription_tiers st ON us.tier_id = st.id
       WHERE c.id = UUID_TO_BIN(?)`,
      [userId, competitionId]
    );
    
    if (rows.length === 0) return { eligible: false, reason: 'Competition not found' };
    
    const competition = rows[0];
    
    if (!competition.subscription_tier) {
      return { eligible: true }; // No subscription required
    }
    
    if (!competition.has_active_subscription) {
      return { eligible: false, reason: 'Active subscription required' };
    }
    
    // Check if user's tier matches or exceeds required tier
    const tierMapping = { TIER_1: 1, TIER_2: 2, TIER_3: 3 };
    const requiredTier = tierMapping[competition.subscription_tier];
    
    if (competition.tier_level >= requiredTier) {
      return { 
        eligible: true,
        tier: competition.tier_name,
        competition_type: competition.subscriber_competition_type
      };
    } else {
      return { 
        eligible: false, 
        reason: `Higher subscription tier required. Current: ${competition.tier_name}, Required: ${competition.subscription_tier}` 
      };
    }
  }

  // ==================== RECORD ENTRY ====================
  
  static async recordEntry(entryData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const entryId = uuidv4();
      const binaryEntryId = this.uuidToBinary(entryId);
      const binaryCompetitionId = this.uuidToBinary(entryData.competition_id);
      const binaryUserId = this.uuidToBinary(entryData.user_id);

      await connection.execute(
        `INSERT INTO competition_entries (
          id, competition_id, user_id, entry_type,
          skill_question_answered, skill_question_correct,
          postal_entry_received, user_address, postal_proof, status,
          entry_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          binaryEntryId,
          binaryCompetitionId,
          binaryUserId,
          entryData.entry_type,
          entryData.skill_question_answered || false,
          entryData.skill_question_correct || false,
          entryData.postal_entry_received || false,
          entryData.user_address || null,
          entryData.postal_proof || null,
          entryData.status || 'ACTIVE'
        ]
      );

      // Update sold tickets if it's a paid entry or verified free entry
      if (entryData.entry_type === 'PAID_ENTRY' || 
          (entryData.entry_type === 'FREE_ENTRY' && entryData.postal_entry_received)) {
        await this.updateSoldTickets(entryData.competition_id, 1);
      }

      // Check for instant wins
      const ticketNumber = await this.assignTicketNumber(entryData.competition_id, entryData.user_id);
      const instantWinCheck = await this.checkInstantWin(entryData.competition_id, ticketNumber);
      
      let instantWinClaimed = null;
      if (instantWinCheck) {
        const [claimResult] = await connection.execute(
          `UPDATE instant_wins 
           SET claimed_by = ?, claimed_at = CURRENT_TIMESTAMP 
           WHERE id = ? AND claimed_by IS NULL`,
          [binaryUserId, this.uuidToBinary(instantWinCheck.id)]
        );
        
        // Only consider it claimed if update succeeded
        if (claimResult.affectedRows > 0) {
          instantWinClaimed = instantWinCheck;
        }
      }

      // Check for achievements
      await this.checkAchievements(entryData.competition_id, entryData.user_id);

      await connection.commit();
      
      return {
        entry_id: entryId,
        ticket_number: ticketNumber,
        instant_win: instantWinClaimed
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== GET JACKPOT PROGRESS ====================
  
  static async getJackpotProgress(competitionId) {
    const [rows] = await pool.execute(
      `SELECT 
        total_tickets, sold_tickets,
        ROUND((sold_tickets / total_tickets) * 100, 2) as percentage,
        prize_option, ticket_model, threshold_value,
        CASE 
          WHEN ticket_model = 'MODEL_1' THEN ROUND(total_tickets * 0.2)
          WHEN ticket_model = 'MODEL_2' THEN ROUND(total_tickets * 0.1)
          ELSE 0
        END as free_tickets_allocation,
        CASE 
          WHEN threshold_type = 'AUTOMATIC' AND sold_tickets >= threshold_value THEN TRUE
          ELSE FALSE
        END as threshold_reached,
        TIMESTAMPDIFF(SECOND, NOW(), 
          CASE WHEN threshold_type = 'MANUAL' THEN created_at + INTERVAL 7 DAY
               ELSE NULL 
          END) as countdown_seconds
       FROM competitions 
       WHERE id = UUID_TO_BIN(?) AND category = 'JACKPOT'`,
      [competitionId]
    );
    
    return rows[0] || null;
  }

  // ==================== CHECK THRESHOLD ====================
  
  static async checkThreshold(competitionId) {
    const [rows] = await pool.execute(
      `SELECT 
        sold_tickets, threshold_type, threshold_value,
        CASE 
          WHEN threshold_type = 'AUTOMATIC' AND sold_tickets >= threshold_value THEN TRUE
          ELSE FALSE
        END as threshold_reached
       FROM competitions 
       WHERE id = UUID_TO_BIN(?) AND category = 'JACKPOT'`,
      [competitionId]
    );
    
    return rows[0] || null;
  }

  // ==================== PROCESS WHEEL SPIN ====================
  
  static async processWheelSpin(competitionId, userId) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check spin limit
      const [spinCount] = await connection.execute(
        `SELECT spins_per_user FROM competitions WHERE id = UUID_TO_BIN(?)`,
        [this.uuidToBinary(competitionId)]
      );
      
      const maxSpins = spinCount[0]?.spins_per_user || 1;
      
      const [userSpins] = await connection.execute(
        `SELECT COUNT(*) as spin_count 
         FROM spin_history 
         WHERE user_id = UUID_TO_BIN(?) 
         AND competition_id = UUID_TO_BIN(?)
         AND DATE(created_at) = CURDATE()`,
        [this.uuidToBinary(userId), this.uuidToBinary(competitionId)]
      );
      
      if (userSpins[0].spin_count >= maxSpins) {
        throw new Error('Daily spin limit reached');
      }

      // Get random segment based on probability
      const [segments] = await connection.execute(
        `SELECT * FROM wheel_segments 
         WHERE competition_id = UUID_TO_BIN(?)
         ORDER BY probability DESC`,
        [this.uuidToBinary(competitionId)]
      );

      // Weighted random selection
      const totalProbability = segments.reduce((sum, seg) => sum + seg.probability, 0);
      let random = Math.random() * totalProbability;
      let selectedSegment = null;

      for (const segment of segments) {
        random -= segment.probability;
        if (random <= 0) {
          selectedSegment = segment;
          break;
        }
      }

      if (!selectedSegment) {
        selectedSegment = segments[0];
      }

      // Record spin
      const spinId = uuidv4();
      await connection.execute(
        `INSERT INTO spin_history (id, user_id, competition_id, prize_type, prize_value, segment_label, created_at)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          this.uuidToBinary(userId),
          this.uuidToBinary(competitionId),
          selectedSegment.prize_type,
          selectedSegment.amount || 0,
          selectedSegment.label
        ]
      );

      await connection.commit();
      
      return {
        segment_index: selectedSegment.segment_index,
        label: selectedSegment.label,
        prize_type: selectedSegment.prize_type,
        amount: selectedSegment.amount || 0,
        spins_remaining: maxSpins - userSpins[0].spin_count - 1
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== AWARD WHEEL PRIZE ====================
  
  static async awardWheelPrize(userId, spinResult) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let awardDetails = {};

      switch (spinResult.prize_type) {
        case 'POINTS':
          await connection.execute(
            `UPDATE user_points 
             SET total_points = total_points + ?, earned_points = earned_points + ?
             WHERE user_id = UUID_TO_BIN(?)`,
            [spinResult.amount, spinResult.amount, this.uuidToBinary(userId)]
          );
          
          await connection.execute(
            `INSERT INTO points_history (id, user_id, points, type, source, description)
             VALUES (UUID_TO_BIN(UUID()), ?, ?, 'EARNED', 'WHEEL_SPIN', ?)`,
            [this.uuidToBinary(userId), spinResult.amount, `Wheel spin: ${spinResult.label}`]
          );
          
          awardDetails = { type: 'points', amount: spinResult.amount };
          break;

        case 'SITE_CREDIT':
          await connection.execute(
            `UPDATE wallets 
             SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = UUID_TO_BIN(?) AND type = 'CREDIT'`,
            [spinResult.amount, this.uuidToBinary(userId)]
          );
          
          awardDetails = { type: 'site_credit', amount: spinResult.amount };
          break;

        case 'CASH':
          await connection.execute(
            `UPDATE wallets 
             SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = UUID_TO_BIN(?) AND type = 'CASH'`,
            [spinResult.amount, this.uuidToBinary(userId)]
          );
          
          awardDetails = { type: 'cash', amount: spinResult.amount };
          break;

        case 'FREE_TICKETS':
          // Create universal ticket
          const ticketId = uuidv4();
          await connection.execute(
            `INSERT INTO universal_tickets (id, user_id, ticket_type, expires_at, created_at)
             VALUES (UUID_TO_BIN(UUID()), ?, 'WHEEL_SPIN', DATE_ADD(CURDATE(), INTERVAL 30 DAY), CURRENT_TIMESTAMP)`,
            [this.uuidToBinary(userId)]
          );
          
          awardDetails = { type: 'free_tickets', amount: spinResult.amount, ticket_id: ticketId };
          break;

        case 'BONUS_SPIN':
          // Add bonus spin
          await connection.execute(
            `INSERT INTO bonus_spins (id, user_id, competition_id, expires_at, created_at)
             VALUES (UUID_TO_BIN(UUID()), ?, ?, DATE_ADD(CURDATE(), INTERVAL 7 DAY), CURRENT_TIMESTAMP)`,
            [this.uuidToBinary(userId), this.uuidToBinary(spinResult.competition_id)]
          );
          
          awardDetails = { type: 'bonus_spin', expires_in: '7 days' };
          break;
      }

      await connection.commit();
      return awardDetails;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== RECORD MINI GAME SCORE ====================
  
  static async recordMiniGameScore(scoreData) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const scoreId = uuidv4();
      
      await connection.execute(
        `INSERT INTO mini_game_scores (
          id, user_id, game_id, competition_id, score, 
          time_taken, level_reached, session_data, created_at
        ) VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          this.uuidToBinary(scoreData.user_id),
          this.uuidToBinary(scoreData.game_id),
          this.uuidToBinary(scoreData.competition_id),
          scoreData.score,
          scoreData.time_taken || null,
          scoreData.level_reached || null,
          scoreData.session_data ? JSON.stringify(scoreData.session_data) : null
        ]
      );

      // Update daily game stats
      await connection.execute(
        `INSERT INTO daily_game_stats (id, user_id, game_id, date, plays_today, points_earned_today)
         VALUES (UUID_TO_BIN(UUID()), ?, ?, CURDATE(), 1, ?)
         ON DUPLICATE KEY UPDATE 
           plays_today = plays_today + 1,
           points_earned_today = points_earned_today + ?,
           updated_at = CURRENT_TIMESTAMP`,
        [
          this.uuidToBinary(scoreData.user_id),
          this.uuidToBinary(scoreData.game_id),
          scoreData.points || 0,
          scoreData.points || 0
        ]
      );

      await connection.commit();
      return { score_id: scoreId, ...scoreData };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== GET LEADERBOARD ====================
  
  static async getLeaderboard(competitionId, leaderboardType = 'DAILY', limit = 50) {
    let dateCondition = '';
    
    switch (leaderboardType) {
      case 'DAILY':
        dateCondition = 'AND DATE(mgs.created_at) = CURDATE()';
        break;
      case 'WEEKLY':
        dateCondition = 'AND YEARWEEK(mgs.created_at) = YEARWEEK(CURDATE())';
        break;
      case 'MONTHLY':
        dateCondition = 'AND YEAR(mgs.created_at) = YEAR(CURDATE()) AND MONTH(mgs.created_at) = MONTH(CURDATE())';
        break;
    }

 const [rows] = await pool.query(
  `
  SELECT
    BIN_TO_UUID(u.id) AS user_id,
    u.username,
    u.profile_photo,
    MAX(mgs.score) AS high_score,
    AVG(mgs.score) AS avg_score,
    COUNT(mgs.id) AS play_count,
    SUM(mgs.time_taken) AS total_time,
    MAX(mgs.level_reached) AS max_level
  FROM mini_game_scores mgs
  JOIN users u ON mgs.user_id = u.id
  WHERE mgs.competition_id = UUID_TO_BIN(?)
  ${dateCondition}
  GROUP BY u.id, u.username, u.profile_photo
  ORDER BY high_score DESC
  LIMIT ?
  `,
  [competitionId, limit]
);


    return rows;
  }

  // ==================== GET INSTANT WINS ====================
  
  static async getInstantWins(competitionId) {
    const [rows] = await pool.execute(
      `SELECT 
        BIN_TO_UUID(id) as id,
        ticket_number,
        prize_name,
        prize_value,
        payout_type,
        max_winners,
        current_winners,
        GREATEST(max_winners - current_winners, 0) as remaining_tickets,
        claimed_by,
        claimed_at,
        image_url
       FROM instant_wins
       WHERE competition_id = UUID_TO_BIN(?)
       ORDER BY prize_value DESC`,
      [competitionId]
    );

    return rows;
  }

  static async getInstantWinStats(competitionId) {
    const [rows] = await pool.execute(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN claimed_by IS NOT NULL THEN 1 ELSE 0 END) as claimed
       FROM instant_wins
       WHERE competition_id = UUID_TO_BIN(?)`,
      [competitionId]
    );

    const total = rows[0]?.total || 0;
    const claimed = rows[0]?.claimed || 0;
    return {
      total,
      claimed,
      remaining: Math.max(0, total - claimed)
    };
  }

  // ==================== GET ACHIEVEMENTS ====================
  
  static async getAchievements(competitionId) {
    const [rows] = await pool.execute(
      `SELECT 
        BIN_TO_UUID(id) as id,
        title,
        description,
        type,
        condition_value,
        points_awarded,
        image_url
       FROM competition_achievements
       WHERE competition_id = UUID_TO_BIN(?)
       ORDER BY points_awarded DESC`,
      [competitionId]
    );

    return rows;
  }

  // ==================== GET WHEEL SEGMENTS ====================
  
  static async getWheelSegments(competitionId) {
    const [rows] = await pool.execute(
      `SELECT 
        segment_index,
        label,
        prize_type,
        amount,
        color,
        probability,
        image_url
       FROM wheel_segments
       WHERE competition_id = UUID_TO_BIN(?)
       ORDER BY segment_index`,
      [competitionId]
    );

    return rows;
  }

  // ==================== GET STATISTICS ====================
  
  static async getStats(competitionId) {
    const [rows] = await pool.execute(
      `SELECT 
        c.title,
        c.category,
        c.status,
        c.total_tickets,
        c.sold_tickets,
        c.price,
        c.start_date,
        c.end_date,
        COUNT(DISTINCT ce.user_id) as unique_participants,
        COUNT(ce.id) as total_entries,
        SUM(CASE WHEN ce.entry_type = 'PAID_ENTRY' THEN 1 ELSE 0 END) as paid_entries,
        SUM(CASE WHEN ce.entry_type = 'FREE_ENTRY' THEN 1 ELSE 0 END) as free_entries,
        SUM(CASE WHEN ce.skill_question_correct = 1 THEN 1 ELSE 0 END) as skill_correct_entries,
        SUM(CASE WHEN ce.postal_entry_received = 1 THEN 1 ELSE 0 END) as postal_entries,
        (SELECT COUNT(*) FROM instant_wins WHERE competition_id = UUID_TO_BIN(?) AND claimed_by IS NOT NULL) as instant_wins_claimed,
        (SELECT SUM(prize_value) FROM instant_wins WHERE competition_id = UUID_TO_BIN(?) AND claimed_by IS NOT NULL) as instant_wins_value,
        (SELECT COUNT(*) FROM winners WHERE competition_id = UUID_TO_BIN(?)) as winners_count
       FROM competitions c
       LEFT JOIN competition_entries ce ON c.id = ce.competition_id
       WHERE c.id = UUID_TO_BIN(?)
       GROUP BY c.id, c.title, c.category, c.status, c.total_tickets, c.sold_tickets, 
                c.price, c.start_date, c.end_date`,
      [competitionId, competitionId, competitionId, competitionId]
    );

    return rows[0] || null;
  }

  // ==================== SELECT WINNERS ====================
  
  static async selectWinners(competitionId, winners, method) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const winner of winners) {
        await connection.execute(
          `INSERT INTO winners (id, competition_id, user_id, ticket_id, prize_description, draw_method, created_at)
           VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            this.uuidToBinary(competitionId),
            this.uuidToBinary(winner.user_id),
            winner.ticket_id ? this.uuidToBinary(winner.ticket_id) : null,
            winner.prize_description || 'Main Prize',
            method,
          ]
        );
      }

      await connection.commit();
      return winners.length;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== HELPER METHODS ====================
  
  static async updateSoldTickets(competitionId, count) {
    await pool.execute(
      `UPDATE competitions 
       SET sold_tickets = sold_tickets + ?, 
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = UUID_TO_BIN(?)`,
      [count, this.uuidToBinary(competitionId)]
    );
  }

  static async assignTicketNumber(competitionId, userId) {
    // Generate unique ticket number
    const [maxTicket] = await pool.execute(
      `SELECT COALESCE(MAX(ticket_number), 0) as max_ticket 
       FROM tickets 
       WHERE competition_id = UUID_TO_BIN(?)`,
      [this.uuidToBinary(competitionId)]
    );

    const ticketNumber = maxTicket[0].max_ticket + 1;
    
    await pool.execute(
      `INSERT INTO tickets (id, competition_id, user_id, ticket_number, created_at)
       VALUES (UUID_TO_BIN(UUID()), ?, ?, ?, CURRENT_TIMESTAMP)`,
      [this.uuidToBinary(competitionId), this.uuidToBinary(userId), ticketNumber]
    );

    return ticketNumber;
  }

  // Weighted random instant win selection based on probability
  static async checkInstantWin(competitionId, ticketNumber) {
    // Get all unclaimed instant wins for this competition and ticket
    const [rows] = await pool.execute(
      `SELECT BIN_TO_UUID(id) as id, title, prize_value, payout_type, probability
       FROM instant_wins 
       WHERE competition_id = UUID_TO_BIN(?) 
       AND ticket_number = ? 
       AND claimed_by IS NULL`,
      [this.uuidToBinary(competitionId), ticketNumber]
    );
    if (!rows.length) return null;
    // Weighted random selection
    const totalProb = rows.reduce((sum, r) => sum + (r.probability || 0), 0);
    let rand = Math.random() * totalProb;
    for (const win of rows) {
      rand -= win.probability || 0;
      if (rand <= 0) return win;
    }
    return rows[0];
  }

  static async checkAchievements(competitionId, userId) {
    const [achievements] = await pool.execute(
      `SELECT * FROM competition_achievements 
       WHERE competition_id = UUID_TO_BIN(?)`,
      [this.uuidToBinary(competitionId)]
    );

    const [userEntries] = await pool.execute(
      `SELECT COUNT(*) as entry_count, 
              SUM(CASE WHEN entry_type = 'PAID_ENTRY' THEN 1 ELSE 0 END) as paid_entries,
              GROUP_CONCAT(ticket_number ORDER BY ticket_number) as ticket_numbers
       FROM competition_entries ce
       LEFT JOIN tickets t ON ce.competition_id = t.competition_id AND ce.user_id = t.user_id
       WHERE ce.competition_id = UUID_TO_BIN(?) AND ce.user_id = UUID_TO_BIN(?)
       GROUP BY ce.user_id`,
      [this.uuidToBinary(competitionId), this.uuidToBinary(userId)]
    );

    const userStats = userEntries[0] || { entry_count: 0, paid_entries: 0, ticket_numbers: '' };
    
    const unlockedAchievements = [];

    for (const achievement of achievements) {
      let unlocked = false;
      
      switch (achievement.type) {
        case 'PURCHASE_X_TICKETS':
          if (userStats.paid_entries >= achievement.condition_value) {
            unlocked = true;
          }
          break;
          
        case 'SPEND_X_AMOUNT':
          // Would need to calculate actual spend
          break;
          
        case 'FIRST_PURCHASE':
          if (userStats.paid_entries >= 1) {
            unlocked = true;
          }
          break;
          
        case 'HIGHEST_TICKET_NUMBER':
        case 'LOWEST_TICKET_NUMBER':
        case 'SEQUENTIAL_TICKETS':
        case 'MOST_INSTANT_WINS':
          // More complex logic needed
          break;
      }

      if (unlocked) {
        unlockedAchievements.push(achievement);
        
        // Award points
        await pool.execute(
          `INSERT INTO user_achievements (id, user_id, achievement_id, unlocked_at)
           VALUES (UUID_TO_BIN(UUID()), ?, UUID_TO_BIN(?), CURRENT_TIMESTAMP)`,
          [this.uuidToBinary(userId), this.uuidToBinary(achievement.id)]
        );

        if (achievement.points_awarded > 0) {
          await pool.execute(
            `UPDATE user_points 
             SET total_points = total_points + ?, earned_points = earned_points + ?
             WHERE user_id = UUID_TO_BIN(?)`,
            [achievement.points_awarded, achievement.points_awarded, this.uuidToBinary(userId)]
          );
        }
      }
    }

    return unlockedAchievements;
  }

  static async autoSubscribeToCompetition(competitionId) {
    const competition = await this.findById(competitionId);
    if (competition.category !== 'SUBSCRIPTION' || !competition.auto_entry_enabled) {
      return { subscribed_count: 0, already_subscribed: 0 };
    }
    // Get eligible users based on subscription tier
    const tierMapping = { TIER_1: 1, TIER_2: 2, TIER_3: 3 };
    const requiredTier = tierMapping[competition.subscription_tier] || 1;
    const [eligibleUsers] = await pool.execute(
      `SELECT DISTINCT u.id as user_id
       FROM users u
       JOIN user_subscriptions us ON u.id = us.user_id AND us.status = 'ACTIVE'
       JOIN subscription_tiers st ON us.tier_id = st.id
       WHERE st.tier_level >= ?
       AND NOT EXISTS (
         SELECT 1 FROM competition_entries ce 
         WHERE ce.competition_id = UUID_TO_BIN(?) 
         AND ce.user_id = u.id
       )`,
      [requiredTier, this.uuidToBinary(competitionId)]
    );
    let subscribedCount = 0;
    const errors = [];
    for (const user of eligibleUsers) {
      try {
        // Double-check eligibility before entry
        const eligibility = await this.checkSubscriptionEligibility(competitionId, user.user_id);
        if (!eligibility.eligible) continue;
        await this.recordEntry({
          competition_id: competitionId,
          user_id: user.user_id,
          entry_type: 'FREE_ENTRY',
          skill_question_answered: false,
          postal_entry_received: true // Auto-entry doesn't require postal proof
        });
        subscribedCount++;
      } catch (error) {
        errors.push({ user_id: user.user_id, error: error.message });
      }
    }
    return {
      subscribed_count: subscribedCount,
      already_subscribed: eligibleUsers.length - subscribedCount,
      errors: errors
    };
  }

  static uuidToBinary(uuid) {
    // Convert UUID string to binary(16)
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
  }

  // ==================== ADDITIONAL METHODS ====================
static async getAnalytics(competitionId, period = '7d') {
  let dateCondition = '';

  switch (period) {
    case '1d':
      dateCondition = 'AND DATE(c.created_at) = CURDATE()';
      break;

    case '7d':
      dateCondition = 'AND c.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
      break;

    case '30d':
      dateCondition = 'AND c.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
      break;

    case 'all':
    default:
      dateCondition = '';
      break;
  }

const [rows] = await pool.execute(
  `
  SELECT 
    DATE(c.created_at) AS date,
    COUNT(e.id) AS entries,
    SUM(CASE WHEN e.entry_type = 'PAID_ENTRY' THEN 1 ELSE 0 END) AS paid_entries,
    SUM(CASE WHEN e.entry_type = 'FREE_ENTRY' THEN 1 ELSE 0 END) AS free_entries,
    COUNT(DISTINCT e.user_id) AS unique_users
  FROM competition_entries e
  INNER JOIN competitions c 
    ON c.id = e.competition_id
  WHERE e.competition_id = UUID_TO_BIN(?)
  ${dateCondition}
  GROUP BY DATE(c.created_at)
  ORDER BY date
  `,
  [competitionId] // 👈 STRING UUID
);


  return rows;
}


  static async getRevenueStats(competitionId) {
    const [rows] = await pool.execute(
      `SELECT 
        SUM(p.total_amount) as total_revenue,
        SUM(p.site_credit_used) as credit_used,
        SUM(p.cash_wallet_used) as cash_used,
        COUNT(DISTINCT p.user_id) as paying_users,
        AVG(p.total_amount) as avg_order_value
       FROM purchases p
       WHERE p.competition_id = UUID_TO_BIN(?)
       AND p.status = 'PAID'`,
      [competitionId]
       );

    return rows[0] || null;
  }

  static async getParticipationStats(competitionId) {
    const [rows] = await pool.execute(
      `SELECT 
        COUNT(DISTINCT user_id) as total_participants,
        COUNT(*) as total_entries,
        AVG(entries_per_user) as avg_entries_per_user,
        MAX(entries_per_user) as max_entries_per_user
       FROM (
         SELECT user_id, COUNT(*) as entries_per_user
         FROM competition_entries
         WHERE competition_id = UUID_TO_BIN(?)
         GROUP BY user_id
       ) as user_entries`,
  [competitionId]
    );

    return rows[0] || null;
  }

  static async duplicate(competitionId, titleSuffix, overrides = {}) {
    const original = await this.findById(competitionId);
    
    if (!original) {
      throw new Error('Original competition not found');
    }

    // Create new competition data
    const newCompetition = {
      ...original,
      title: `${original.title} - ${titleSuffix}`,
      created_at: undefined,
      updated_at: undefined,
      sold_tickets: 0,
      status: 'ACTIVE',
      ...overrides
    };

    // Remove ID to create new record
    delete newCompetition.id;

    // Create new competition
    const newCompetitionId = await this.create(newCompetition);

    // Duplicate related data
    const instantWins = await this.getInstantWins(competitionId);
    const achievements = await this.getAchievements(competitionId);
    const wheelSegments = await this.getWheelSegments(competitionId);

    if (instantWins.length > 0) {
      await this.createInstantWins(newCompetitionId, instantWins.map(iw => ({
        prize_name: iw.title,
        prize_amount: iw.prize_value,
        payout_type: iw.payout_type,
        ticket_numbers: [iw.ticket_number],
        max_count: 1,
        image_url: iw.image_url
      })));
    }

    if (achievements.length > 0) {
      await this.createAchievements(newCompetitionId, achievements);
    }

    if (wheelSegments.length > 0) {
      await this.createWheelSegments(newCompetitionId, wheelSegments);
    }

    return newCompetitionId;
  }

  static async exportData(competitionId, format = 'csv', include = 'all') {
    const competition = await this.findById(competitionId);
    
    if (!competition) {
      throw new Error('Competition not found');
    }

    let data = { competition };

    if (include === 'all' || include.includes('entries')) {
      const [entries] = await pool.execute(
        `SELECT 
          BIN_TO_UUID(ce.id) as entry_id,
          BIN_TO_UUID(ce.user_id) as user_id,
          u.username,
          u.email,
          ce.entry_type,
          ce.skill_question_answered,
          ce.skill_question_correct,
          ce.postal_entry_received,
          ce.user_address,
          ce.entry_date,
          t.ticket_number
         FROM competition_entries ce
         JOIN users u ON ce.user_id = u.id
         LEFT JOIN tickets t ON ce.competition_id = t.competition_id AND ce.user_id = t.user_id
         WHERE ce.competition_id = UUID_TO_BIN(?)
         ORDER BY ce.entry_date`,
        [this.uuidToBinary(competitionId)]
      );
      data.entries = entries;
    }

    if (include === 'all' || include.includes('winners')) {
      const [winners] = await pool.execute(
        `SELECT 
          BIN_TO_UUID(w.id) as winner_id,
          BIN_TO_UUID(w.user_id) as user_id,
          u.username,
          u.email,
          w.prize_description,
          w.draw_method,
          w.created_at as win_date
         FROM winners w
         JOIN users u ON w.user_id = u.id
         WHERE w.competition_id = UUID_TO_BIN(?)
         ORDER BY w.created_at`,
        [this.uuidToBinary(competitionId)]
      );
      data.winners = winners;
    }

    if (include === 'all' || include.includes('instant_wins')) {
      data.instant_wins = await this.getInstantWins(competitionId);
    }

    if (include === 'all' || include.includes('purchases')) {
      const [purchases] = await pool.execute(
        `SELECT 
          BIN_TO_UUID(p.id) as purchase_id,
          BIN_TO_UUID(p.user_id) as user_id,
          u.username,
          p.total_amount,
          p.site_credit_used,
          p.cash_wallet_used,
          p.payment_method,
          p.status,
          p.created_at
         FROM purchases p
         JOIN users u ON p.user_id = u.id
         WHERE p.competition_id = UUID_TO_BIN(?)
         ORDER BY p.created_at`,
        [this.uuidToBinary(competitionId)]
      );
      data.purchases = purchases;
    }

    // Convert to requested format
    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      // Simple CSV conversion
      let csv = 'Section,Data\n';
      csv += `Competition,${JSON.stringify(data.competition)}\n`;
      
      if (data.entries) {
        csv += 'Entries\n';
        data.entries.forEach(entry => {
          csv += `${JSON.stringify(entry)}\n`;
        });
      }
      
      return csv;
    }

    return data;
  }
}

export default Competition;