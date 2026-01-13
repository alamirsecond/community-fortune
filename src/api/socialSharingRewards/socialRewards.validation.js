import { z } from "zod";

export const ShareCompetitionSchema = z.object({
  competition_id: z.string().uuid("Invalid competition ID"),
  platform: z.enum([
    "FACEBOOK",
    "TWITTER",
    "WHATSAPP",
    "TELEGRAM",
    "INSTAGRAM",
  ]),
});

export const UpdateLimitsSchema = z
  .array(
    z.object({
      platform: z.enum([
        "FACEBOOK",
        "TWITTER",
        "WHATSAPP",
        "TELEGRAM",
        "INSTAGRAM",
      ]),
      points_per_share: z.number().int().min(1).max(100),
      daily_limit: z.number().int().min(1).max(50),
      weekly_limit: z.number().int().min(1).max(100),
    })
  )
  .min(1);

export const PaginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("20"),
});

export const AnalyticsQuerySchema = z.object({
  days: z.string().regex(/^\d+$/).optional().default("30"),
});
