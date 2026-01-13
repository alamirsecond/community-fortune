import { z } from "zod";

const instantWinSchemas = {
  createInstantWin: z
    .object({
      competition_id: z.string().uuid(),
      ticket_numbers: z.array(z.number().int().positive()).optional(),
      pattern: z
        .object({
          type: z.string(),
          count: z.number().int().positive(),
          start: z.number().int().positive().optional(),
          end: z.number().int().positive().optional(),
        })
        .optional(),
      prizes: z
        .array(
          z.object({
            name: z.string().min(1).max(100),
            value: z.number().positive(),
            type: z.string(),
            max_winners: z.number().int().positive().default(1),
            title: z.string().optional(),
            image_url: z.string().url().optional(),
            payout_type: z.string().optional(),
            claimed_by: z.string().uuid().optional(),
            claimed_at: z.string().datetime().optional(),
            user_details: z.object({}).passthrough().optional(),
          })
        )
        .min(1),
    })
    .refine(
      (data) => {
        return data.ticket_numbers || data.pattern;
      },
      {
        message: "Either ticket_numbers or pattern must be provided",
      }
    ),

  createInstantWinManual: z.object({
    competition_id: z.string().uuid(),
    ticket_number: z.number().int().positive(),
    title: z.string().optional(),
    prize_name: z.string().min(1).max(255),
    prize_value: z.number().positive(),
    prize_type: z.string(),
    payout_type: z.string().optional(),
    image_url: z.string().url().optional(),
    max_winners: z.number().int().positive().default(1),
    current_winners: z.number().int().nonnegative().default(0),
    claimed_by: z.string().uuid().optional(),
    claimed_at: z.string().datetime().optional(),
    user_details: z.object({}).passthrough().optional(),
  }),

  updateClaimedStatus: z.object({
    instant_win_id: z.string().uuid(),
    claimed_by: z.string().uuid().optional(),
    claimed_at: z.string().datetime().optional(),
    user_details: z.object({}).passthrough().optional(),
    increment_current_winners: z.boolean().default(false),
  }),

  claimInstantWin: z.object({
    instant_win_id: z.string().uuid(),
    user_details: z
      .object({
        full_name: z.string().optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
      })
      .optional(),
  }),
};

export default instantWinSchemas;
