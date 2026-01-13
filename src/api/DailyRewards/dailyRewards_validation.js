import { z } from "zod";

export const DailyRewardConfigSchema = z.object({
  day_number: z.number().int().min(1).max(7),
  reward_type: z.enum(["POINTS", "SITE_CREDIT", "CASH", "FREE_TICKETS"]),
  reward_value: z.number().positive("Reward value must be positive"),
  streak_required: z.boolean().optional().default(false),
});

export const ClaimRewardSchema = z.object({
  // No fields needed - uses authenticated user
});

export const UserRewardsQuerySchema = z.object({
  user_id: z.string().uuid("Invalid user ID"),
});

export const PaginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20"),
});

export default DailyRewardConfigSchema;
