import pool from "../../../database.js";
import spinWheelSchemas from "./spinWheel_zod.js";
import { addSiteCredit, addPoints } from "../../api/wallet/walletController.js";
import { checkSpinEligibility, updateSpinCount } from "./spinService.js";
import SpinService from "./spinService.js";
import TicketSystemController from "../TICKETS/tickets_con.js";

class SpinWheelController {
  static async spin(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const validationResult = spinWheelSchemas.spinRequest.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid request data",
          details: validationResult.error.errors,
        });
      }

      const { wheel_id, competition_id } = validationResult.data;
      const user_id = req.user.id;
      // const user_id = "66666666-7777-8888-9999-000000000000";

      const eligibility = await checkSpinEligibility(
        connection,
        user_id,
        wheel_id
      );
      console.log(
        "SpinService methods available:",
        Object.getOwnPropertyNames(SpinService)
      );
      console.log(
        "isLevelSufficient exists:",
        typeof SpinService.isLevelSufficient
      );
      if (!eligibility.allowed) {
        return res.status(403).json({
          error: "Not eligible to spin",
          details: eligibility.reason,
          next_available: eligibility.next_available,
        });
      }

      // 2. Get wheel with segments using UUID functions
      const [wheels] = await connection.query(
        `
      SELECT 
        BIN_TO_UUID(sw.id) as id,
        sw.wheel_name,
        sw.wheel_type,
        sw.animation_speed_ms,
        sw.is_active,
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', BIN_TO_UUID(sws.id),
              'position', sws.position,
              'color_hex', sws.color_hex,
              'prize_name', sws.prize_name,
              'prize_type', sws.prize_type,
              'prize_value', sws.prize_value,
              'probability', sws.probability,
              'image_url', sws.image_url,
              'current_stock', sws.current_stock,
              'stock', sws.stock
            )
          )
          FROM spin_wheel_segments sws 
          WHERE sws.wheel_id = sw.id
          ORDER BY sws.position
        ) as segments
      FROM spin_wheels sw
      WHERE sw.id = UUID_TO_BIN(?) 
        AND sw.is_active = TRUE
      FOR UPDATE
      `,
        [wheel_id]
      );

      if (!wheels || wheels.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          error: "Wheel not found or is inactive",
          code: "WHEEL_NOT_FOUND",
        });
      }

      const wheel = wheels[0];

      let segments;
      if (Array.isArray(wheel.segments)) {
        segments = wheel.segments;
      } else {
        try {
          segments = JSON.parse(wheel.segments || "[]");
        } catch (e) {
          console.error("Error parsing segments JSON:", e);
          await connection.rollback();
          return res.status(500).json({
            error: "Invalid wheel configuration",
            code: "INVALID_WHEEL_CONFIG",
          });
        }
      }

      if (segments.length === 0) {
        await connection.rollback();
        return res.status(400).json({
          error: "Wheel has no valid segments",
          code: "NO_SEGMENTS",
        });
      }

      // 3. Select winning segment with weighted probability
      let selectedSegment = await SpinWheelController.selectWinningSegment(
        segments
      );

      if (!selectedSegment) {
        await connection.rollback();
        return res.status(500).json({
          error: "Failed to select winning segment - no available prizes",
          code: "NO_AVAILABLE_PRIZES",
        });
      }

      // 4. Check stock availability for limited prizes
      // FIXED: Changed comparison from >= to <= or >= based on your logic
      if (
        selectedSegment.stock !== null &&
        selectedSegment.current_stock !== null &&
        selectedSegment.current_stock >= selectedSegment.stock
      ) {
        // Out of stock - award alternative prize
        const alternativeSegment =
          await SpinWheelController.getAlternativeSegment(segments);
        if (!alternativeSegment) {
          await connection.rollback();
          return res.status(500).json({
            error: "Prize out of stock and no alternative available",
            code: "OUT_OF_STOCK",
          });
        }
        selectedSegment = alternativeSegment;
      }

      // 5. Validate selectedSegment has an id
      if (!selectedSegment.id) {
        await connection.rollback();
        return res.status(500).json({
          error: "Invalid segment selected",
          code: "INVALID_SEGMENT",
        });
      }

      // 6. Record spin history
      const spinHistoryId = crypto.randomUUID();
      await connection.query(
        `
      INSERT INTO spin_history (
        id, wheel_id, user_id, segment_id,
        prize_type, prize_value, spin_result
      ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?)
      `,
        [
          spinHistoryId,
          wheel_id,
          user_id,
          selectedSegment.id,
          selectedSegment.prize_type,
          selectedSegment.prize_value || 0,
          JSON.stringify({
            segment_position: selectedSegment.position,
            prize_name: selectedSegment.prize_name,
            wheel_name: wheel.wheel_name,
            segment_id: selectedSegment.id,
            wheel_id: wheel_id,
          }),
        ]
      );

      // 7. Update stock if limited
      if (selectedSegment.stock !== null && selectedSegment.id) {
        await connection.query(
          `
        UPDATE spin_wheel_segments 
        SET current_stock = current_stock + 1 
        WHERE id = UUID_TO_BIN(?)
        `,
          [selectedSegment.id]
        );
      }

      // 8. Update spin count for user (if needed - handled by eligibility service)
      await updateSpinCount(connection, user_id, wheel_id);

      // 9. Award prize
      const prizeAwarded = await SpinWheelController.awardPrize(
        connection,
        user_id,
        selectedSegment,
        competition_id
      );

      await connection.commit();

      // 10. Return result
      res.json({
        success: true,
        spin_id: spinHistoryId,
        prize: {
          name: selectedSegment.prize_name,
          type: selectedSegment.prize_type,
          value: selectedSegment.prize_value || 0,
          color: selectedSegment.color_hex,
        },
        award_result: prizeAwarded,
        wheel: {
          id: wheel_id,
          name: wheel.wheel_name,
          type: wheel.wheel_type,
          animation_speed: wheel.animation_speed_ms,
        },
        spin_remaining: (eligibility.remaining_spins || 0) - 1,
      });
    } catch (error) {
      await connection.rollback();
      console.error("Spin error:", error);
      res.status(400).json({
        error: error.message,
        code: "SPIN_ERROR",
      });
    } finally {
      connection.release();
    }
  }

  static getAlternativeSegment(segments) {
    const validSegments = segments.filter((seg) => seg && seg.id);

    if (validSegments.length === 0) {
      return null;
    }

    // Prioritize 'NO_WIN' or small credit prizes as alternatives
    const alternatives = validSegments.filter(
      (seg) =>
        seg.prize_type === "NO_WIN" ||
        (seg.prize_type === "SITE_CREDIT" &&
          parseFloat(seg.prize_value || 0) <= 5)
    );

    if (alternatives.length > 0) {
      // Find first available alternative
      const availableAlternative = alternatives.find(
        (seg) =>
          seg.stock === null ||
          seg.stock === undefined ||
          (seg.current_stock || 0) < seg.stock
      );

      if (availableAlternative) {
        return availableAlternative;
      }
    }

    // If no alternatives found, return the first available segment
    const availableSegment = validSegments.find(
      (seg) =>
        seg.stock === null ||
        seg.stock === undefined ||
        (seg.current_stock || 0) < seg.stock
    );

    return availableSegment || validSegments[0] || null;
  }

  // Weighted random selection of segment
  static selectWinningSegment(segments) {
    const availableSegments = segments.filter(
      (seg) => seg.stock === null || seg.current_stock < seg.stock
    );

    if (availableSegments.length === 0) {
      return null;
    }

    const totalWeight = availableSegments.reduce(
      (sum, seg) => sum + seg.probability,
      0
    );
    let random = Math.random() * totalWeight;

    for (const segment of availableSegments) {
      random -= segment.probability;
      if (random <= 0) {
        return segment;
      }
    }

    return availableSegments[availableSegments.length - 1];
  }

  // Award the prize to user
  static async awardPrize(connection, user_id, segment, competition_id = null) {
    switch (segment.prize_type) {
      case "SITE_CREDIT":
        await SpinWheelController.addSiteCredit(
          connection,
          user_id,
          parseFloat(segment.prize_value),
          "SPIN_WIN"
        );
        return { type: "SITE_CREDIT", amount: segment.prize_value };

      case "POINTS":
        await addPoints(
          connection,
          user_id,
          parseInt(segment.prize_value),
          "SPIN_WIN"
        );
        return { type: "POINTS", amount: segment.prize_value };

      case "FREE_TICKET":
        const ticketIds = await TicketSystemController.awardUniversalTickets(
          connection,
          user_id,
          "SPIN_WIN",
          1
        );
        return { type: "FREE_TICKET", ticket_ids: ticketIds };

      case "CASH":
        // Add to cash wallet (withdrawable)
        await addSiteCredit(
          connection,
          user_id,
          parseFloat(segment.prize_value),
          "SPIN_WIN",
          "CASH"
        );
        return { type: "CASH", amount: segment.prize_value };

      case "BONUS_SPIN":
        // Grant extra spin immediately - insert into bonus_spins table
        const bonusSpinId = crypto.randomUUID();
        await connection.query(
          `
          INSERT INTO bonus_spins (id, user_id, expires_at)
          VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), DATE_ADD(NOW(), INTERVAL 7 DAY))
          `,
          [bonusSpinId, user_id]
        );
        return { type: "BONUS_SPIN", spins: 1, bonus_spin_id: bonusSpinId };

      case "NO_WIN":
        return { type: "NO_WIN", message: "Better luck next time!" };

      default:
        throw new Error(`Unknown prize type: ${segment.prize_type}`);
    }
  }

  // Get user's spin history
  static async getSpinHistory(req, res) {
    const connection = await pool.getConnection();

    try {
      const user_id = req.user.id;
      // const user_id = "66666666-7777-8888-9999-000000000000";
      const { wheel_id, limit = 50, offset = 0 } = req.query;

      let query = `
        SELECT 
          BIN_TO_UUID(sh.id) as id,
          BIN_TO_UUID(sh.wheel_id) as wheel_id,
          BIN_TO_UUID(sh.user_id) as user_id,
          BIN_TO_UUID(sh.segment_id) as segment_id,
          sh.prize_type,
          sh.prize_value,
          sh.spin_result,
          sh.created_at,
          sw.wheel_name as wheel_name,
          sws.prize_name,
          sws.prize_type as segment_prize_type,
          sws.color_hex,
          sws.image_url as segment_image
        FROM spin_history sh
        JOIN spin_wheels sw ON sh.wheel_id = sw.id
        LEFT JOIN spin_wheel_segments sws ON sh.segment_id = sws.id
        WHERE sh.user_id = UUID_TO_BIN(?)
      `;

      const params = [user_id];

      if (wheel_id) {
        query += ` AND sh.wheel_id = UUID_TO_BIN(?)`;
        params.push(wheel_id);
      }

      query += ` ORDER BY sh.created_at DESC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));

      const [historyRows] = await connection.query(query, params);

      // Parse spin_result JSON
      const history = historyRows.map((row) => ({
        ...row,
        spin_result:
          typeof row.spin_result === "string"
            ? JSON.parse(row.spin_result)
            : row.spin_result,
      }));

      // Get total count for pagination
      const [countResult] = await connection.query(
        `SELECT COUNT(*) as total FROM spin_history WHERE user_id = UUID_TO_BIN(?)`,
        [user_id]
      );

      res.json({
        total: countResult[0].total,
        history,
      });
    } catch (error) {
      console.error("Get spin history error:", error);
      res.status(500).json({
        error: "Failed to fetch spin history",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // Admin: Create new wheel
  static async createWheel(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const validationResult = spinWheelSchemas.createWheel.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid wheel data",
          details: validationResult.error.errors,
        });
      }

      const wheelData = validationResult.data;
      const wheelId = crypto.randomUUID();

      await connection.query(
        `
        INSERT INTO spin_wheels (
          id, wheel_name, wheel_type, wheel_description, min_tier,
          spins_per_user_period, max_spins_per_period,
          cooldown_hours, background_image_url,
          animation_speed_ms, is_active
        ) VALUES (UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          wheelId,
          wheelData.name,
          wheelData.type,
          wheelData.description || null,
          wheelData.min_tier || null,
          wheelData.spins_per_user_period,
          wheelData.max_spins_per_period || null,
          wheelData.cooldown_hours,
          wheelData.background_image_url || null,
          wheelData.animation_speed_ms,
          wheelData.is_active !== undefined ? wheelData.is_active : true,
        ]
      );

      await connection.commit();

      res.json({
        success: true,
        wheel_id: wheelId,
        message: "Wheel created successfully",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Create wheel error:", error);
      res.status(400).json({
        error: error.message,
        code: "WHEEL_CREATION_ERROR",
      });
    } finally {
      connection.release();
    }
  }

  // Admin: Add segments to wheel
  static async addSegments(req, res) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const validationResult = spinWheelSchemas.addSegment.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid segment data",
          details: validationResult.error.errors,
        });
      }

      const { wheel_id, segments } = validationResult.data;

      // Check if wheel exists
      const [wheel] = await connection.query(
        `SELECT BIN_TO_UUID(id) as id FROM spin_wheels WHERE id = UUID_TO_BIN(?)`,
        [wheel_id]
      );

      if (!wheel || wheel.length === 0) {
        throw new Error("Wheel not found");
      }

      // Validate total probability equals 100%
      const totalProbability = segments.reduce(
        (sum, seg) => sum + parseFloat(seg.probability),
        0
      );
      if (Math.abs(totalProbability - 100) > 0.01) {
        throw new Error(
          `Total probability must equal 100%, got ${totalProbability}%`
        );
      }

      // Insert segments
      const segmentValues = [];
      for (const segment of segments) {
        const segmentId = crypto.randomUUID();
        segmentValues.push([
          segmentId,
          wheel_id,
          segment.position,
          segment.color_hex,
          segment.prize_name,
          segment.prize_type,
          parseFloat(segment.prize_value) || 0,
          parseFloat(segment.probability),
          segment.image_url || null,
          segment.text_color || "#FFFFFF",
          segment.stock || null,
          0, // current_stock
        ]);
      }

      // Bulk insert segments
      for (const segmentValue of segmentValues) {
        await connection.query(
          `
          INSERT INTO spin_wheel_segments (
            id, wheel_id, position, color_hex,
            prize_name, prize_type, prize_value,
            probability, image_url, text_color, stock,
            current_stock
          ) VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          segmentValue
        );
      }

      await connection.commit();

      res.json({
        success: true,
        segments_added: segments.length,
        segment_ids: segmentValues.map((sv) => sv[0]),
        message: "Segments added successfully",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Add segments error:", error);
      res.status(400).json({
        error: error.message,
        code: "SEGMENT_CREATION_ERROR",
      });
    } finally {
      connection.release();
    }
  }

  // Admin: Get wheel with segments
  static async getWheel(req, res) {
    const connection = await pool.getConnection();

    try {
      const { wheel_id } = req.params;

      // Get wheel details
      const [wheels] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(sw.id) as id,
          sw.wheel_name,
          sw.wheel_type,
          sw.wheel_description,
          sw.min_tier,
          sw.spins_per_user_period,
          sw.max_spins_per_period,
          sw.cooldown_hours,
          sw.background_image_url,
          sw.animation_speed_ms,
          sw.is_active,
          sw.created_at,
          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', BIN_TO_UUID(sws.id),
                'position', sws.position,
                'color_hex', sws.color_hex,
                'prize_name', sws.prize_name,
                'prize_type', sws.prize_type,
                'prize_value', sws.prize_value,
                'probability', sws.probability,
                'image_url', sws.image_url,
                'text_color', sws.text_color,
                'stock', sws.stock,
                'current_stock', sws.current_stock
              )
            )
            FROM spin_wheel_segments sws
            WHERE sws.wheel_id = sw.id
            ORDER BY sws.position
          ) as segments
        FROM spin_wheels sw
        WHERE sw.id = UUID_TO_BIN(?)
        `,
        [wheel_id]
      );

      if (!wheels || wheels.length === 0) {
        return res.status(404).json({
          error: "Wheel not found",
          code: "WHEEL_NOT_FOUND",
        });
      }

      const wheel = wheels[0];

      // Parse segments
      let segments = [];
      try {
        segments = JSON.parse(wheel.segments || "[]");
      } catch (e) {
        console.error("Error parsing segments:", e);
      }

      // Get wheel statistics
      const [stats] = await connection.query(
        `
        SELECT 
          COUNT(sh.id) as total_spins,
          COUNT(DISTINCT sh.user_id) as unique_users,
          COUNT(CASE WHEN sh.prize_type != 'NO_WIN' THEN 1 END) as winning_spins,
          SUM(CASE WHEN sh.prize_value > 0 THEN sh.prize_value ELSE 0 END) as total_prize_value
        FROM spin_history sh
        WHERE sh.wheel_id = UUID_TO_BIN(?)
        `,
        [wheel_id]
      );

      res.json({
        wheel: {
          id: wheel.id,
          wheel_name: wheel.wheel_name,
          type: wheel.wheel_type,
          description: wheel.wheel_description,
          min_tier: wheel.min_tier,
          spins_per_user_period: wheel.spins_per_user_period,
          max_spins_per_period: wheel.max_spins_per_period,
          cooldown_hours: wheel.cooldown_hours,
          background_image_url: wheel.background_image_url,
          animation_speed_ms: wheel.animation_speed_ms,
          is_active: wheel.is_active,
          created_at: wheel.created_at,
        },
        segments,
        statistics: stats[0] || {},
        segment_count: segments.length,
      });
    } catch (error) {
      console.error("Get wheel error:", error);
      res.status(500).json({
        error: "Failed to fetch wheel details",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }

  // Admin: Update wheel
  static async updateWheel(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { wheel_id } = req.params;

      const validationResult = spinWheelSchemas.updateWheel.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid wheel update data",
          details: validationResult.error.errors,
        });
      }

      const wheelData = validationResult.data;

      // Build update query dynamically
      const updates = [];
      const params = [];

      const allowedFields = [
        "wheel_name",
        "wheel_type",
        "wheel_description",
        "min_tier",
        "spins_per_user_period",
        "max_spins_per_period",
        "cooldown_hours",
        "background_image_url",
        "animation_speed_ms",
        "is_active",
      ];

      allowedFields.forEach((field) => {
        if (wheelData[field] !== undefined) {
          updates.push(`${field} = ?`);
          params.push(wheelData[field]);
        }
      });

      if (updates.length === 0) {
        throw new Error("No valid fields to update");
      }

      params.push(wheel_id);

      const updateQuery = `
        UPDATE spin_wheels 
        SET ${updates.join(", ")}
        WHERE id = UUID_TO_BIN(?)
      `;

      await connection.query(updateQuery, params);

      await connection.commit();

      res.json({
        success: true,
        message: "Wheel updated successfully",
        updated_fields: updates.map((u) => u.split(" = ")[0]),
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update wheel error:", error);
      res.status(400).json({
        error: error.message,
        code: "WHEEL_UPDATE_ERROR",
      });
    } finally {
      connection.release();
    }
  }

  // Admin: List all wheels with pagination
  static async listWheels(req, res) {
    const connection = await pool.getConnection();

    try {
      const { page = 1, limit = 20, type, is_active, min_tier } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Build WHERE conditions
      const whereConditions = [];
      const params = [];

      if (type) {
        whereConditions.push("sw.wheel_type = ?");
        params.push(type);
      }

      if (is_active !== undefined) {
        whereConditions.push("sw.is_active = ?");
        params.push(is_active === "true");
      }

      if (min_tier) {
        whereConditions.push("sw.min_tier = ?");
        params.push(min_tier);
      }

      const whereClause =
        whereConditions.length > 0
          ? `WHERE ${whereConditions.join(" AND ")}`
          : "";

      // Get wheels with segment count
      const [wheels] = await connection.query(
        `
        SELECT 
          BIN_TO_UUID(sw.id) as id,
          sw.wheel_name,
          sw.wheel_type,
          sw.wheel_description,
          sw.min_tier,
          sw.spins_per_user_period,
          sw.max_spins_per_period,
          sw.cooldown_hours,
          sw.is_active,
          sw.created_at,
          COUNT(sws.id) as segment_count,
          (
            SELECT COUNT(*) 
            FROM spin_history sh 
            WHERE sh.wheel_id = sw.id
          ) as total_spins
        FROM spin_wheels sw
        LEFT JOIN spin_wheel_segments sws ON sw.id = sws.wheel_id
        ${whereClause}
        GROUP BY sw.id
        ORDER BY sw.created_at DESC
        LIMIT ? OFFSET ?
        `,
        [...params, parseInt(limit), offset]
      );

      // Get total count for pagination
      const [countResult] = await connection.query(
        `
        SELECT COUNT(*) as total
        FROM spin_wheels sw
        ${whereClause}
        `,
        params
      );

      res.json({
        wheels,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: countResult[0].total,
          total_pages: Math.ceil(countResult[0].total / parseInt(limit)),
        },
      });
    } catch (error) {
      console.error("List wheels error:", error);
      res.status(500).json({
        error: "Failed to fetch wheels",
        details: error.message,
      });
    } finally {
      connection.release();
    }
  }
}

export default SpinWheelController;
