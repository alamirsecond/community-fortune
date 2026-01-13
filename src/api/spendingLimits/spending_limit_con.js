import pool from "../../../database.js";
import { v4 as uuidv4 } from "uuid";

class SpendingLimitsService {
  static async checkSpendingLimits(
    connection,
    user_id,
    amount,
    payment_method
  ) {
    const [limits] = await connection.query(
      `SELECT * FROM spending_limits WHERE user_id = UUID_TO_BIN(?)`,
      [user_id]
    );

    const limit = limits[0];

    if (!limit) {
      return { allowed: true };
    }

    const now = new Date();
    let limitExceeded = false;
    let message = "";

    if (
      limit.single_purchase_limit > 0 &&
      amount > limit.single_purchase_limit
    ) {
      limitExceeded = true;
      message = `Single purchase limit exceeded. Maximum: £${limit.single_purchase_limit}`;
    }

    if (!limitExceeded && limit.daily_limit > 0) {
      const newDailySpent = limit.daily_spent + amount;
      if (newDailySpent > limit.daily_limit) {
        limitExceeded = true;
        message = `Daily spending limit exceeded. Limit: £${limit.daily_limit}, Spent: £${limit.daily_spent}`;
      }
    }

    if (!limitExceeded && limit.weekly_limit > 0) {
      const newWeeklySpent = limit.weekly_spent + amount;
      if (newWeeklySpent > limit.weekly_limit) {
        limitExceeded = true;
        message = `Weekly spending limit exceeded. Limit: £${limit.weekly_limit}, Spent: £${limit.weekly_spent}`;
      }
    }

    if (!limitExceeded && limit.monthly_limit > 0) {
      const newMonthlySpent = limit.monthly_spent + amount;
      if (newMonthlySpent > limit.monthly_limit) {
        limitExceeded = true;
        message = `Monthly spending limit exceeded. Limit: £${limit.monthly_limit}, Spent: £${limit.monthly_spent}`;
      }
    }

    if (limitExceeded) {
      return { allowed: false, message };
    }

    return { allowed: true };
  }

  static async updateSpending(connection, user_id, amount) {
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    const [limits] = await connection.query(
      `SELECT * FROM spending_limits WHERE user_id = UUID_TO_BIN(?)`,
      [user_id]
    );

    const limit = limits[0];

    if (!limit) {
      await connection.query(
        `INSERT INTO spending_limits (id, user_id, daily_spent, weekly_spent, monthly_spent, limit_reset_date) 
         VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?)`,
        [uuidv4(), user_id, amount, amount, amount, today]
      );
      return;
    }

    if (limit.limit_reset_date !== today) {
      await this.resetSpendingLimits(connection, user_id, today);
    }

    await connection.query(
      `UPDATE spending_limits 
       SET daily_spent = daily_spent + ?, 
           weekly_spent = weekly_spent + ?, 
           monthly_spent = monthly_spent + ?,
           updated_at = NOW()
       WHERE user_id = UUID_TO_BIN(?)`,
      [amount, amount, amount, user_id]
    );
  }

  static async resetSpendingLimits(connection, user_id, today) {
    const [limits] = await connection.query(
      `SELECT * FROM spending_limits WHERE user_id = UUID_TO_BIN(?)`,
      [user_id]
    );

    const limit = limits[0];

    if (!limit) return;

    const lastReset = new Date(limit.limit_reset_date);
    const now = new Date(today);
    const diffTime = Math.abs(now - lastReset);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 1) {
      await connection.query(
        `UPDATE spending_limits SET daily_spent = 0 WHERE user_id = UUID_TO_BIN(?)`,
        [user_id]
      );
    }

    if (diffDays >= 7) {
      await connection.query(
        `UPDATE spending_limits SET weekly_spent = 0 WHERE user_id = UUID_TO_BIN(?)`,
        [user_id]
      );
    }

    if (
      now.getMonth() !== lastReset.getMonth() ||
      now.getFullYear() !== lastReset.getFullYear()
    ) {
      await connection.query(
        `UPDATE spending_limits SET monthly_spent = 0 WHERE user_id = UUID_TO_BIN(?)`,
        [user_id]
      );
    }

    await connection.query(
      `UPDATE spending_limits SET limit_reset_date = ? WHERE user_id = UUID_TO_BIN(?)`,
      [today, user_id]
    );
  }

  static async setSpendingLimits(req, res) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const user_id = req.user.id;
      const {
        daily_limit,
        weekly_limit,
        monthly_limit,
        single_purchase_limit,
      } = req.body;

      const today = new Date().toISOString().split("T")[0];

      const [existing] = await connection.query(
        `SELECT id FROM spending_limits WHERE user_id = UUID_TO_BIN(?)`,
        [user_id]
      );

      if (existing.length > 0) {
        await connection.query(
          `UPDATE spending_limits 
           SET daily_limit = ?, 
               weekly_limit = ?, 
               monthly_limit = ?, 
               single_purchase_limit = ?,
               limit_reset_date = ?,
               updated_at = NOW()
           WHERE user_id = UUID_TO_BIN(?)`,
          [
            daily_limit || 0,
            weekly_limit || 0,
            monthly_limit || 0,
            single_purchase_limit || 0,
            today,
            user_id,
          ]
        );
      } else {
        await connection.query(
          `INSERT INTO spending_limits 
           (id, user_id, daily_limit, weekly_limit, monthly_limit, single_purchase_limit, limit_reset_date) 
           VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), ?, ?, ?, ?, ?)`,
          [
            uuidv4(),
            user_id,
            daily_limit || 0,
            weekly_limit || 0,
            monthly_limit || 0,
            single_purchase_limit || 0,
            today,
          ]
        );
      }

      await connection.commit();

      res.json({
        success: true,
        message: "Spending limits updated successfully",
      });
    } catch (error) {
      await connection.rollback();
      res.status(400).json({
        error: error.message,
        code: "LIMIT_UPDATE_ERROR",
      });
    } finally {
      connection.release();
    }
  }
}

export default SpendingLimitsService;
