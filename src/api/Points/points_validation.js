import { z } from "zod";

export const AwardPointsSchema = z.object({
  user_id: z.string().uuid("Invalid user ID"),
  points: z
    .number()
    .int("Points must be an integer")
    .positive("Points must be positive")
    .max(10000, "Cannot award more than 10000 points at once"),
  reason: z
    .string()
    .min(5, "Reason must be at least 5 characters")
    .max(200, "Reason cannot exceed 200 characters"),
  type: z
    .enum(["MANUAL_AWARD", "COMPENSATION", "PROMOTIONAL"])
    .optional()
    .default("MANUAL_AWARD"),
  source: z.string().optional().default("ADMIN"),
});

export const RedeemPointsSchema = z.object({
  points: z
    .number()
    .int("Points must be an integer")
    .min(1000, "Minimum redemption is 1000 points")
    .max(100000, "Cannot redeem more than 100000 points at once")
    .refine(p => p % 1000 === 0, { message: "Points must be in multiples of 1000" }),
});

export const MissionActionSchema = z
  .object({
    action: z.enum(["DAILY_LOGIN", "GAME_COMPLETE", "MISSION_COMPLETE"]),
    game_id: z.string().optional(),
    score: z.number().optional(),
    metadata: z
      .object({
        mission_id: z.string().uuid().optional(),
        difficulty: z.string().optional(),
        time_spent: z.number().optional(),
        rank: z.number().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      // For GAME_COMPLETE, game_id and score are required
      if (data.action === "GAME_COMPLETE") {
        return data.game_id !== undefined && data.score !== undefined;
      }
      return true;
    },
    {
      message: "game_id and score are required for GAME_COMPLETE action",
      path: ["game_id"],
    }
  );

export const PaginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20"),
});

export const LeaderboardQuerySchema = z.object({
  period: z
    .enum(["daily", "weekly", "monthly", "all_time"])
    .optional()
    .default("weekly"),
  game_id: z.string().optional(),
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("100"),
});

export const AdminTransactionsQuerySchema = PaginationQuerySchema.extend({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  user_id: z.string().uuid().optional(),
  type: z.enum(["EARNED", "REDEEMED"]).optional(),
});

export default {
  AwardPointsSchema,
  RedeemPointsSchema,
  MissionActionSchema,
  PaginationQuerySchema,
  LeaderboardQuerySchema,
  AdminTransactionsQuerySchema,
};
