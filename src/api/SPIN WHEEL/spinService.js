// services/spinService.js
class SpinService {
  /**
   * Check if user is eligible to spin a wheel
   * @param {Connection} connection - Database connection
   * @param {string} user_id - User UUID string
   * @param {string} wheel_id - Wheel UUID string
   * @returns {Promise<Object>} Eligibility information
   */
  static async checkSpinEligibility(connection, user_id, wheel_id) {
    try {
      // Get wheel details
      const [wheels] = await connection.query(
        `SELECT 
          sw.spins_per_user_period,
          sw.max_spins_per_period,
          sw.cooldown_hours,
          sw.min_tier,
          sw.wheel_type,
          sw.is_active
        FROM spin_wheels sw
        WHERE sw.id = UUID_TO_BIN(?)`,
        [wheel_id]
      );

      if (wheels.length === 0) {
        return {
          allowed: false,
          reason: "Wheel not found",
        };
      }

      const wheel = wheels[0];

      // Check if wheel is active
      if (!wheel.is_active) {
        return {
          allowed: false,
          reason: "Wheel is not active",
        };
      }

      // Check user level if required
      if (wheel.min_tier) {
        const [userData] = await connection.query(
          `SELECT level FROM users WHERE id = UUID_TO_BIN(?)`,
          [user_id]
        );

        if (
          userData.length === 0 ||
          !SpinService.isLevelSufficient(userData[0].level, wheel.min_tier) // FIXED: Use SpinService.
        ) {
          return {
            allowed: false,
            reason: `Minimum level ${wheel.min_tier} required. Your level: ${
              userData[0]?.level || 0
            }`,
          };
        }
      }

      // Determine period type based on configuration string
      const period = SpinService.getPeriodForWheelType(wheel.wheel_type);

      // Number of spins allowed for a user this period is the numeric column
      // max_spins_per_period (legacy name; may represent per‑user limit).
      const userLimit = wheel.max_spins_per_period || 0;

      // Get user's spin count for the period (and record last spin time)
      const spinCount = await SpinService.getUserSpinCountForPeriod(
        connection,
        user_id,
        wheel_id,
        period,
        wheel.cooldown_hours || 24
      );
      const lastSpin = await SpinService.getLastSpinTime(connection, user_id, wheel_id);

      // If we have exhausted our personal quota, compute next available time
      if (spinCount >= userLimit) {
        const nextAvailable = SpinService.calculateNextAvailable(lastSpin, wheel.cooldown_hours || 24);

        return {
          allowed: false,
          reason: "No spins remaining for this period",
          next_available: nextAvailable,
          remaining_spins: 0,
          max_spins: userLimit,
          period,
          wheel_type: wheel.wheel_type,
          spins_used: spinCount,
          last_spin: lastSpin,
        };
      }

      // Also enforce a global cap if defined (wheel-wide limit)
      if (wheel.max_spins_per_period) {
        const globalSpinCount = await SpinService.getGlobalSpinCountForPeriod(
          connection,
          wheel_id,
          period,
          wheel.cooldown_hours || 24
        );

        if (globalSpinCount >= wheel.max_spins_per_period) {
          return {
            allowed: false,
            reason: "Wheel has reached maximum spins for this period",
            next_available: SpinService.getNextPeriodStart(period),
            remaining_spins: 0,
            max_spins: userLimit,
            period,
            wheel_type: wheel.wheel_type,
          };
        }
      }

      const remainingSpins = Math.max(0, userLimit - spinCount);

      return {
        allowed: true,
        remaining_spins: remainingSpins,
        max_spins: userLimit,
        period,
        wheel_type: wheel.wheel_type,
        spins_used: spinCount,
        last_spin: lastSpin,
      };
    } catch (error) {
      console.error("Check spin eligibility error:", error);
      throw error;
    }
  }

  /**
   * Update user's spin count
   * @param {Connection} connection - Database connection
   * @param {string} user_id - User UUID string
   * @param {string} wheel_id - Wheel UUID string
   * @returns {Promise<Object>} Update result
   */
  static async updateSpinCount(connection, user_id, wheel_id) {
    try {
      // Get wheel type to determine period
      const [wheels] = await connection.query(
        `SELECT wheel_type, cooldown_hours FROM spin_wheels WHERE id = UUID_TO_BIN(?)`,
        [wheel_id]
      );

      if (wheels.length === 0) {
        throw new Error("Wheel not found");
      }

      const wheelType = wheels[0].wheel_type;
      const period = SpinService.getPeriodForWheelType(wheelType); // FIXED: Use SpinService.

      // No additional tracking needed as spin_history table records all spins
      return {
        success: true,
        message: "Spin recorded",
        period: period,
      };
    } catch (error) {
      console.error("Update spin count error:", error);
      throw error;
    }
  }

  /**
   * Get user's spin count for a specific period
   * @param {Connection} connection - Database connection
   * @param {string} user_id - User UUID string
   * @param {string} wheel_id - Wheel UUID string
   * @param {string} period - Period type (DAILY, WEEKLY, MONTHLY)
   * @param {number} cooldownHours - Cooldown hours for wheel
   * @returns {Promise<number>} Spin count
   */
  static async getUserSpinCountForPeriod(
    connection,
    user_id,
    wheel_id,
    period,
    cooldownHours = 24
  ) {
    let query;
    let params;

    // Handle different period types
    if (period === "ALL_TIME") {
      query = `
        SELECT COUNT(*) as count
        FROM spin_history sh
        WHERE sh.user_id = UUID_TO_BIN(?)
          AND sh.wheel_id = UUID_TO_BIN(?)
      `;
      params = [user_id, wheel_id];
    } else if (period === "COOLDOWN") {
      query = `
        SELECT COUNT(*) as count
        FROM spin_history sh
        WHERE sh.user_id = UUID_TO_BIN(?)
          AND sh.wheel_id = UUID_TO_BIN(?)
          AND sh.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      `;
      params = [user_id, wheel_id, cooldownHours];
    } else {
      // DAILY, WEEKLY, MONTHLY
      const periodStart = SpinService.getPeriodStart(period); // FIXED: Use SpinService.
      query = `
        SELECT COUNT(*) as count
        FROM spin_history sh
        WHERE sh.user_id = UUID_TO_BIN(?)
          AND sh.wheel_id = UUID_TO_BIN(?)
          AND sh.created_at >= ?
      `;
      params = [user_id, wheel_id, periodStart];
    }

    const [result] = await connection.query(query, params);
    return result[0]?.count || 0;
  }

  /**
   * Get global spin count for a wheel in a period
   * @param {Connection} connection - Database connection
   * @param {string} wheel_id - Wheel UUID string
   * @param {string} period - Period type
   * @param {number} cooldownHours - Cooldown hours for wheel
   * @returns {Promise<number>} Global spin count
   */
  static async getGlobalSpinCountForPeriod(
    connection,
    wheel_id,
    period,
    cooldownHours = 24
  ) {
    let query;
    let params;

    if (period === "ALL_TIME") {
      query = `
        SELECT COUNT(*) as count
        FROM spin_history sh
        WHERE sh.wheel_id = UUID_TO_BIN(?)
      `;
      params = [wheel_id];
    } else if (period === "COOLDOWN") {
      query = `
        SELECT COUNT(*) as count
        FROM spin_history sh
        WHERE sh.wheel_id = UUID_TO_BIN(?)
          AND sh.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
      `;
      params = [wheel_id, cooldownHours];
    } else {
      const periodStart = SpinService.getPeriodStart(period); // FIXED: Use SpinService.
      query = `
        SELECT COUNT(*) as count
        FROM spin_history sh
        WHERE sh.wheel_id = UUID_TO_BIN(?)
          AND sh.created_at >= ?
      `;
      params = [wheel_id, periodStart];
    }

    const [result] = await connection.query(query, params);
    return result[0]?.count || 0;
  }

  /**
   * Get user's last spin time for a wheel
   * @param {Connection} connection - Database connection
   * @param {string} user_id - User UUID string
   * @param {string} wheel_id - Wheel UUID string
   * @returns {Promise<Date|null>} Last spin time
   */
  static async getLastSpinTime(connection, user_id, wheel_id) {
    const query = `
      SELECT MAX(created_at) as last_spin
      FROM spin_history
      WHERE user_id = UUID_TO_BIN(?)
        AND wheel_id = UUID_TO_BIN(?)
    `;

    const [result] = await connection.query(query, [user_id, wheel_id]);
    return result[0]?.last_spin || null;
  }

  /**
   * Helper: Get period based on wheel type
   * @param {string} wheelType - Type of wheel (from your DB: DAILY, VIP, SUBSCRIBER_ONLY, EVENT)
   * @returns {string} Period type
   */
  static getPeriodForWheelType(wheelType) {
    const periodMap = {
      DAILY: "DAILY",
      VIP: "COOLDOWN",
      SUBSCRIBER_ONLY: "COOLDOWN",
      EVENT: "ALL_TIME",
      FREE_SPIN: "DAILY",
      PAID_SPIN: "COOLDOWN",
    };

    return periodMap[wheelType?.toUpperCase()] || "DAILY";
  }

  /**
   * Helper: Get period start date
   * @param {string} period - Period type
   * @returns {Date} Period start date
   */
  static getPeriodStart(period) {
    const now = new Date();

    switch (period.toUpperCase()) {
      case "DAILY":
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case "WEEKLY":
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Start on Monday
        return new Date(now.getFullYear(), now.getMonth(), diff);
      case "MONTHLY":
        return new Date(now.getFullYear(), now.getMonth(), 1);
      case "COOLDOWN":
        // For cooldown period, we don't use a fixed start date
        return new Date(0); // Not used, query uses DATE_SUB
      default:
        return new Date(0); // Beginning of time for ALL_TIME
    }
  }

  /**
   * Helper: Calculate next available spin time
   * @param {Date|null} lastSpin - Last spin time
   * @param {number} cooldownHours - Cooldown in hours
   * @returns {Date|null} Next available time
   */
  static calculateNextAvailable(lastSpin, cooldownHours) {
    if (!lastSpin) return null;

    const nextAvailable = new Date(lastSpin);
    nextAvailable.setHours(nextAvailable.getHours() + cooldownHours);

    return nextAvailable;
  }

  /**
   * Helper: Get next period start
   * @param {string} period - Period type
   * @returns {Date} Next period start
   */
  static getNextPeriodStart(period) {
    const now = new Date();

    switch (period.toUpperCase()) {
      case "DAILY":
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      case "WEEKLY":
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1) + 7; // Next Monday
        return new Date(now.getFullYear(), now.getMonth(), diff);
      case "MONTHLY":
        return new Date(now.getFullYear(), now.getMonth() + 1, 1);
      default:
        return null;
    }
  }

  /**
   * Helper: Check if user level is sufficient
   * @param {number} userLevel - User's level
   * @param {string} requiredTier - Required tier/level
   * @returns {boolean} True if sufficient
   */
  static isLevelSufficient(userLevel, requiredTier) {
    // Convert requiredTier to number if it's stored as string
    const requiredLevel = parseInt(requiredTier) || 0;
    const userLevelNum = parseInt(userLevel) || 0;

    return userLevelNum >= requiredLevel;
  }

  /**
   * Get user's remaining spins for all wheels
   * @param {Connection} connection - Database connection
   * @param {string} user_id - User UUID string
   * @returns {Promise<Array>} List of wheels with remaining spins
   */
  static async getUserSpinStatus(connection, user_id) {
    try {
      // Get all active wheels
      const [wheels] = await connection.query(
        `SELECT 
          BIN_TO_UUID(sw.id) as id,
          sw.wheel_name,
          sw.wheel_type,
          sw.spins_per_user_period,
          sw.max_spins_per_period,
          sw.cooldown_hours,
          sw.min_tier,
          sw.is_active,
          sw.background_image_url
        FROM spin_wheels sw
        WHERE sw.is_active = TRUE`
      );

      const result = [];

      for (const wheel of wheels) {
        const eligibility = await SpinService.checkSpinEligibility(
          // FIXED: Use SpinService.
          connection,
          user_id,
          wheel.id
        );

        result.push({
          wheel_id: wheel.id,
          wheel_name: wheel.wheel_name,
          wheel_type: wheel.wheel_type,
          is_eligible: eligibility.allowed,
          remaining_spins: eligibility.remaining_spins || 0,
          max_spins: wheel.spins_per_user_period,
          next_available: eligibility.next_available,
          cooldown_hours: wheel.cooldown_hours,
          background_image: wheel.background_image_url,
          min_tier: wheel.min_tier,
        });
      }

      return result;
    } catch (error) {
      console.error("Get user spin status error:", error);
      throw error;
    }
  }

  /**
   * Get detailed spin history for user
   * @param {Connection} connection - Database connection
   * @param {string} user_id - User UUID string
   * @param {number} limit - Number of records to return
   * @returns {Promise<Array>} Spin history
   */
  static async getUserSpinHistory(connection, user_id, limit = 50) {
    try {
      const [history] = await connection.query(
        `SELECT 
          BIN_TO_UUID(sh.id) as spin_id,
          BIN_TO_UUID(sh.wheel_id) as wheel_id,
          BIN_TO_UUID(sh.segment_id) as segment_id,
          sw.wheel_name,
          sws.prize_name,
          sws.prize_type,
          sws.prize_value,
          sh.prize_type as result_prize_type,
          sh.spin_result,
          sh.created_at
        FROM spin_history sh
        LEFT JOIN spin_wheels sw ON sh.wheel_id = sw.id
        LEFT JOIN spin_wheel_segments sws ON sh.segment_id = sws.id
        WHERE sh.user_id = UUID_TO_BIN(?)
        ORDER BY sh.created_at DESC
        LIMIT ?`,
        [user_id, limit]
      );

      return history;
    } catch (error) {
      console.error("Get user spin history error:", error);
      throw error;
    }
  }

  /**
   * Check if user can spin (simple check without detailed reasons)
   * @param {Connection} connection - Database connection
   * @param {string} user_id - User UUID string
   * @param {string} wheel_id - Wheel UUID string
   * @returns {Promise<boolean>} True if can spin
   */
  static async canUserSpin(connection, user_id, wheel_id) {
    try {
      const eligibility = await SpinService.checkSpinEligibility(
        // FIXED: Use SpinService.
        connection,
        user_id,
        wheel_id
      );
      return eligibility.allowed;
    } catch (error) {
      console.error("Can user spin error:", error);
      return false;
    }
  }

  /**
   * Get wheel details with segments
   * @param {Connection} connection - Database connection
   * @param {string} wheel_id - Wheel UUID string
   * @returns {Promise<Object>} Wheel details with segments
   */
  static async getWheelDetails(connection, wheel_id) {
    try {
      // Get wheel details
      const [wheels] = await connection.query(
        `SELECT 
          BIN_TO_UUID(sw.id) as id,
          sw.wheel_name,
          sw.wheel_type,
          sw.wheel_description,
          sw.spins_per_user_period,
          sw.max_spins_per_period,
          sw.cooldown_hours,
          sw.min_tier,
          sw.is_active,
          sw.background_image_url,
          sw.animation_speed_ms,
          sw.created_at
        FROM spin_wheels sw
        WHERE sw.id = UUID_TO_BIN(?)`,
        [wheel_id]
      );

      if (wheels.length === 0) {
        throw new Error("Wheel not found");
      }

      const wheel = wheels[0];

      // Get wheel segments
      const [segments] = await connection.query(
        `SELECT 
          BIN_TO_UUID(sws.id) as id,
          sws.position,
          sws.color_hex,
          sws.prize_name,
          sws.prize_type,
          sws.prize_value,
          sws.probability,
          sws.image_url,
          sws.text_color,
          sws.stock,
          sws.current_stock
        FROM spin_wheel_segments sws
        WHERE sws.wheel_id = UUID_TO_BIN(?)
        ORDER BY sws.position`,
        [wheel_id]
      );

      return {
        ...wheel,
        segments: segments,
      };
    } catch (error) {
      console.error("Get wheel details error:", error);
      throw error;
    }
  }
}

// Export functions
export const {
  checkSpinEligibility,
  updateSpinCount,
  getUserSpinStatus,
  getUserSpinHistory,
  canUserSpin,
  getWheelDetails,
  getLastSpinTime,
  getUserSpinCountForPeriod,
  getGlobalSpinCountForPeriod,
} = SpinService;

export default SpinService;
