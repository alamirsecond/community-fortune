import express from "express";
import { authenticate } from "../../../middleware/auth.js";
import SpendingLimitsService from "./spending_limit_con";
const spendingLimitRouter = express.Router();
spendingLimitRouter.post(
  "/spending-limits",
  authenticate,
  SpendingLimitsService.setSpendingLimits
);
spendingLimitRouter.get(
  "/spending-limits/status",
  authenticate,
  async (req, res) => {
    try {
      const user_id = req.user.id;
      const connection = await pool.getConnection();

      const limits = ["DAILY", "WEEKLY", "MONTHLY", "SINGLE_PURCHASE"];
      const result = {};

      for (const limitType of limits) {
        const currentSpending = await SpendingLimitsService.getCurrentSpending(
          connection,
          user_id,
          limitType
        );

        const [limit] = await connection.query(
          `
                SELECT amount FROM spending_limits 
                WHERE user_id = ? AND limit_type = ?
            `,
          [user_id, limitType]
        );

        result[limitType.toLowerCase()] = {
          current_spending: currentSpending,
          limit: limit[0]?.amount || 0,
          remaining: limit[0]
            ? Math.max(0, limit[0].amount - currentSpending)
            : null,
        };
      }

      connection.release();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default spendingLimitRouter;
