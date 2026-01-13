import { z } from "zod";

export const UserStatusSchema = z.object({
  status: z.enum(["active", "suspended", "verified", "unverified"]),
  reason: z.string().min(1, "Reason is required"),
});

export const CompetitionSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  featured_image: z.string().url().optional(),
  featured_video: z.string().url().optional(),
  price: z.number().positive("Price must be positive"),
  total_tickets: z.number().int().positive("Total tickets must be positive"),
  category: z.enum(["JACKPOT", "SPIN", "VIP", "INSTANT_WIN", "ROLLING"]),
  type: z.enum(["STANDARD", "MANUAL_DRAW", "AUTO_DRAW", "SPIN_COMPETITION"]),
  start_date: z.string().datetime(),
  end_date: z.string().datetime().optional(),
  no_end_date: z.boolean().default(false),
  is_free_competition: z.boolean().default(false),
  points_per_pound: z.number().int().min(0).default(0),
});

export const WithdrawalStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED", "PROCESSING"]),
  admin_notes: z.string().optional(),
});

export const PaginationSchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20"),
});

export const AnalyticsPeriodSchema = z.object({
  period: z.enum(["7d", "30d", "90d", "1y"]).optional().default("30d"),
});
export const VerificationStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejection_reason: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 10,
      "Rejection reason must be at least 10 characters if provided"
    ),
});

export const VerificationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20"),
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});
