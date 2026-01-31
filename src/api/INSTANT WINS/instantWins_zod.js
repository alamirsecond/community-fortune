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
            name: z.string().min(1).max(255), // CHANGED: from 100 to 255
            value: z.number().positive(),
            type: z.string(),
            max_winners: z.number().int().positive().default(1),
            current_winners: z.number().int().nonnegative().default(0), // ADDED
            probability: z.number().min(0).max(100).default(0.00), // ADDED
            title: z.string().max(255).optional(),
            image_url: z.string().url().max(255).optional(),
            payout_type: z.string().max(50).optional(),
            claimed_by: z.string().uuid().optional(),
            claimed_at: z.string().datetime().optional(),
            user_details: z.record(z.any()).optional(),
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
    title: z.string().max(255).optional(),
    prize_name: z.string().min(1).max(255),
    prize_value: z.number().positive(),
    prize_type: z.string(),
    payout_type: z.string().max(50).optional(),
    image_url: z.string().url().max(255).optional(),
    max_winners: z.number().int().positive().default(1),
    current_winners: z.number().int().nonnegative().default(0),
    probability: z.number().min(0).max(100).default(0.00), // ADDED
    claimed_by: z.string().uuid().optional(),
    claimed_at: z.string().datetime().optional(),
    user_details: z.record(z.any()).optional(),
  }),

  updateClaimedStatus: z.object({
    instant_win_id: z.string().uuid(),
    claimed_by: z.string().uuid().optional(),
    claimed_at: z.string().datetime().optional(),
    user_details: z.record(z.any()).optional(),
    increment_current_winners: z.boolean().default(false),
    probability: z.number().min(0).max(100).optional(), // ADDED (optional update)
  }),

  claimInstantWin: z.object({
    instant_win_id: z.string().uuid(),
    user_details: z
      .record(z.any())
      .optional(),
  }),
};

export default instantWinSchemas;