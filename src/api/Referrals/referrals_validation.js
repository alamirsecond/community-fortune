import { z } from "zod";

const uuidValidator = z.string().uuid({ message: "Invalid UUID" });
const referralCodeValidator = z
  .string()
  .min(6)
  .max(50)
  .regex(/^[A-Z0-9]+$/, "Invalid referral code format");

export const ReferralSchema = z.object({
  user_id: uuidValidator,
});

export const ReferralHistorySchema = z.object({
  referral_id: uuidValidator,
  referred_user_id: uuidValidator,
});

export const ApplyReferralSchema = z.object({
  referral_code: referralCodeValidator,
  new_user_id: uuidValidator,
});

export const LeaderboardQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional().default("10"),
});

export const ActivitiesQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20"),
  status: z.enum(["PENDING", "REWARDED"]).optional(),
});
