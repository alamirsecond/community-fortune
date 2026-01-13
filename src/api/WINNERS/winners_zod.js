import { z } from "zod";

const winnerSchema = {
  getRecentWinners: z.object({
    query: z.object({
      limit: z.string().regex(/^\d+$/).optional().default("20"),
      category: z
        .enum([
          "ALL",
          "MAIN",
          "INSTANT",
          "MINI_GAME",
          "SUBSCRIPTION",
          "JACKPOT",
        ])
        .optional()
        .default("ALL"),
      days: z.string().regex(/^\d+$/).optional().default("30"),
    }),
  }),

  declareWinner: z.object({
    body: z.object({
      competition_id: z.string().uuid("Competition ID must be a valid UUID"),
      user_id: z.string().uuid("User ID must be a valid UUID"),
      ticket_id: z.string().uuid("Ticket ID must be a valid UUID").optional(),
      prize_description: z.string().min(1, "Prize description is required"),
      draw_method: z
        .enum([
          "MANUAL",
          "RANDOM_DRAW",
          "SKILL_BASED",
          "FIRST_ENTRY",
          "WEIGHTED_DRAW",
        ])
        .default("MANUAL"),
    }),
  }),

  selectWinners: z.object({
    body: z
      .object({
        competition_id: z.string().uuid("Competition ID must be a valid UUID"),
        method: z.enum([
          "RANDOM_DRAW",
          "MANUAL_SELECTION",
          "SKILL_BASED",
          "FIRST_ENTRY",
          "WEIGHTED_DRAW",
        ]),
        winners_count: z.number().int().min(1).max(100).optional().default(1),
        criteria: z
          .object({
            user_ids: z.array(z.string().uuid()).optional(),
            prize_descriptions: z.array(z.string()).optional(),
            min_score: z.number().int().min(0).optional(),
            min_plays: z.number().int().min(1).optional(),
            weight_multiplier: z
              .number()
              .min(0.1)
              .max(10)
              .optional()
              .default(1),
            exclude_instant_winners: z.boolean().optional().default(false),
          })
          .optional(),
      })
      .superRefine((data, ctx) => {
        // Validate manual selection requires user_ids
        if (
          data.method === "MANUAL_SELECTION" &&
          (!data.criteria?.user_ids || data.criteria.user_ids.length === 0)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Manual selection requires user_ids array",
            path: ["criteria", "user_ids"],
          });
        }

        // Validate number of winners for first entry
        if (data.method === "FIRST_ENTRY" && data.winners_count > 10) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "First entry selection limited to 10 winners",
            path: ["winners_count"],
          });
        }
      }),
  }),

  getCompetitionWinners: z.object({
    params: z.object({
      competition_id: z.string().uuid("Competition ID must be a valid UUID"),
    }),
    query: z.object({
      include_instant_wins: z
        .enum(["true", "false"])
        .optional()
        .default("true"),
      format: z.enum(["detailed", "summary"]).optional().default("detailed"),
    }),
  }),

  verifyWinnerClaim: z.object({
    body: z.object({
      winner_id: z.string().uuid("Winner ID must be a valid UUID"),
      verification_status: z.enum([
        "VERIFIED",
        "REJECTED",
        "PENDING_VERIFICATION",
      ]),
      admin_notes: z.string().optional(),
    }),
  }),

  adminList: z.object({
    query: z.object({
      page: z.string().regex(/^\d+$/).optional().default("1"),
      per_page: z.string().regex(/^\d+$/).optional().default("20"),
      q: z.string().optional().default(""),
      category: z.string().optional().default("ALL"),
      source: z.enum(["ALL", "MAIN", "INSTANT"]).optional().default("ALL"),
      from: z.string().optional(),
      to: z.string().optional(),
      sort: z.enum(["newest", "oldest"]).optional().default("newest"),
    }),
  }),

  adminStats: z.object({
    query: z.object({
      days: z.string().regex(/^\d+$/).optional().default("7"),
    }),
  }),

  adminExport: z.object({
    query: z.object({
      q: z.string().optional().default(""),
      category: z.string().optional().default("ALL"),
      source: z.enum(["ALL", "MAIN", "INSTANT"]).optional().default("ALL"),
      from: z.string().optional(),
      to: z.string().optional(),
      sort: z.enum(["newest", "oldest"]).optional().default("newest"),
    }),
  }),
};

export default winnerSchema;
