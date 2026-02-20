import { z } from 'zod';

// Base competition schema - UPDATED with all types from PDF (without SPIN_WHEEL)
const baseCompetitionSchema = {
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().optional(),
  featured_image: z.string().url("Invalid featured image URL").optional().nullable(),
  featured_video: z.string().url("Invalid featured video URL").optional().nullable(),
  banner_image: z.string().url("Invalid banner image URL").optional().nullable(),
  gallery_images: z.array(z.string().url("Invalid image URL")).optional().default([]),
  price: z.number().min(0, "Price must be positive"),
  // total_tickets can now be null/undefined to support unlimited or unspecified stock.  
  // when provided it must still be a positive integer.
  total_tickets: z
    .number()
    .int()
    .positive("Total tickets must be positive")
    .optional()
    .nullable(),
  category: z.enum(['PAID', 'FREE', 'JACKPOT', 'MINI_GAME', 'SUBSCRIPTION', 'VIP', 'INSTANT_WIN', 'ROLLING']),
  type: z.enum(['STANDARD', 'MANUAL_DRAW', 'AUTO_DRAW']),
  start_date: z.date("Invalid start date format"),
  end_date: z.date("Invalid end date format").optional().nullable(),
  no_end_date: z.boolean().default(false),
  is_free_competition: z.boolean().default(false),
  points_per_pound: z.number().int().min(0).default(0),
  competition_type: z.enum(['PAID', 'FREE']),
  skill_question_enabled: z.boolean().default(false),
  skill_question_text: z.string().optional(),
  skill_question_answer: z.string().optional(),
  free_entry_enabled: z.boolean().default(false),
  free_entry_instructions: z.string().optional(),
  postal_address: z.string().optional(),
  max_entries_per_user: z.number().int().positive().default(1),
  requires_address: z.boolean().default(false),
  status: z.enum([ 'ACTIVE', 'COMPLETED', 'CANCELLED']).default('ACTIVE'),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional()
};

// Jackpot-specific schema - UPDATED per PDF
const jackpotSchema = {
  prize_option: z.enum(['A', 'B', 'C', 'CUSTOM']).optional().default('A'),
  ticket_model: z.enum(['MODEL_1', 'MODEL_2', 'CUSTOM']).optional().default('MODEL_1'),
  threshold_type: z.enum(['AUTOMATIC', 'MANUAL']).optional().default('AUTOMATIC'),
  threshold_value: z.coerce.number().int().min(0).optional().default(1200), // Use coerce
  min_ticket_price: z.coerce.number().min(10, "Jackpot minimum ticket price is £10").optional().default(10), // Use coerce
  jackpot_amount: z.coerce.number().min(1000, "Jackpot amount must be at least £1000").optional(), // Use coerce
  max_instant_wins: z.coerce.number().int().min(0).optional().default(0), // Use coerce
  guaranteed_winners: z.coerce.number().int().min(0).optional() // Use coerce
};

// Subscription-specific schema - UPDATED per PDF
const subscriptionSchema = {
  subscription_tier: z.enum(['TIER_1', 'TIER_2', 'TIER_3', 'CUSTOM']).optional(),
  auto_entry_enabled: z.coerce.boolean().default(true), // Add coerce
  subscriber_competition_type: z.enum(['CHAMPION_SUB_COMPETITION', 'HERO_SUB_COMPETITION', 'CUSTOM_SUB_COMPETITION']).optional(),
  max_subscribers: z.coerce.number().int().positive().optional(), // Add coerce
  subscription_required: z.coerce.boolean().default(true) // Add coerce
};
// Mini-game specific schema - UPDATED per PDF
const miniGameSchema = {
  game_id: z.string().uuid("Invalid game ID").optional(),
  game_type: z.enum(['FREE_TO_PLAY', 'PAY_TO_PLAY', 'REFER_A_FRIEND']).optional(),
  leaderboard_type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).optional(),
  game_name: z.string().optional(),
  game_code: z.string().optional(),
  points_per_play: z.coerce.number().int().min(0).default(0), // Add coerce
  max_plays_per_user: z.coerce.number().int().min(1).optional(), // Add coerce
  game_rules: z.string().optional(),
  difficulty_level: z.enum(['EASY', 'MEDIUM', 'HARD']).optional()
};
// Instant Win schema - NEW per PDF
const instantWinSchema = {
  instant_wins: z.array(z.object({
    prize_name: z.string().min(1, "Prize name is required"),
    prize_amount: z.number().min(0, "Prize amount must be positive"),
    payout_type: z.enum(['CASH', 'SITE_CREDIT', 'POINTS', 'FREE_ENTRY', 'PHYSICAL_PRIZE']),
    ticket_numbers: z.array(z.number().int().positive("Invalid ticket number")),
    max_count: z.number().int().positive("Max count must be positive"),
    random_count: z.number().int().min(0).optional(),
    first_entry_count: z.number().int().min(0).optional(),
    image_url: z.string().optional().nullable(),
    description: z.string().optional(),
    claim_deadline: z.string().datetime("Invalid deadline format").optional(),
    is_claimed: z.boolean().default(false),
    claimed_by: z.string().uuid("Invalid user ID").optional().nullable(),
    claimed_at: z.string().datetime("Invalid claim date").optional().nullable()
  })).optional().default([]),
  instant_win_enabled: z.boolean().default(false),
  max_instant_wins_per_user: z.number().int().min(1).optional().default(1)
};

// Achievement schema - NEW per PDF
const achievementSchema = {
  achievements: z.array(z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    type: z.enum(['PURCHASE_X_TICKETS', 'SPEND_X_AMOUNT', 'FIRST_PURCHASE', 'HIGHEST_TICKET_NUMBER', 'LOWEST_TICKET_NUMBER', 'SEQUENTIAL_TICKETS', 'MOST_INSTANT_WINS', 'CUSTOM', 'MINI_GAME_SCORE', 'LEADERBOARD_POSITION']),
    condition_value: z.number().optional(),
    points_awarded: z.number().int().min(0).default(0),
    image_url: z.string().url("Invalid image URL").optional(),
    is_hidden: z.boolean().default(false),
    repeatable: z.boolean().default(false),
    max_repeats: z.number().int().min(1).optional()
  })).optional().default([]),
  achievements_enabled: z.boolean().default(false)
};

// VIP Competition Schema
const vipSchema = {
  vip_required: z.boolean().default(false),
  vip_tier: z.enum(['TIER_1', 'TIER_2', 'TIER_3']).optional(),
  vip_exclusive_content: z.string().optional(),
  vip_early_access: z.boolean().default(false)
};

// Rolling Competition Schema
const rollingSchema = {
  rolling_duration_days: z.number().int().min(1).optional(),
  rolling_prize_pool: z.number().min(0).optional(),
  rolling_winners_per_cycle: z.number().int().min(1).optional(),
  next_draw_date: z.string().datetime("Invalid next draw date").optional()
};

// Documents Schema
const documentsSchema = {
  terms_pdf: z.string().url("Invalid terms PDF URL").optional(),
  rules_pdf: z.string().url("Invalid rules PDF URL").optional(),
  winner_announcement_pdf: z.string().url("Invalid announcement PDF URL").optional(),
  prize_documentation: z.array(z.string().url("Invalid document URL")).optional().default([])
};

const rulesAndRestrictionsSchema = {
  rules_and_restrictions: z.array(z.object({
    title: z.string().min(1, "Rule title is required"),
    description: z.string().optional()
  })).max(20, "Maximum 20 rules or restrictions").optional().default([])
};

export const createCompetitionSchema = z.object({
  body: z.object({
    ...baseCompetitionSchema,
    ...jackpotSchema,
    ...subscriptionSchema,
    ...miniGameSchema,
    ...instantWinSchema,
    ...achievementSchema,
    ...vipSchema,
    ...rollingSchema,
    ...documentsSchema,
    ...rulesAndRestrictionsSchema
  }).superRefine((data, ctx) => {
    // UK compliance validation for paid competitions (PDF page 7)
    if (data.competition_type === 'PAID' && data.category !== 'JACKPOT') {
      if (!data.skill_question_enabled && !data.free_entry_enabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Paid competitions must have either skill question or free entry enabled for UK compliance",
          path: ['skill_question_enabled']
        });
      }
      
      if (data.skill_question_enabled && data.free_entry_enabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Paid competitions cannot have both skill question and free entry enabled",
          path: ['skill_question_enabled']
        });
      }
    }

    // Free competitions validation (PDF page 8)
    if (data.category === 'FREE') {
      if (data.price > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Free competitions must have price set to 0",
          path: ['price']
        });
      }
      if (data.is_free_competition !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Free competitions must have is_free_competition = true",
          path: ['is_free_competition']
        });
      }
      if (data.competition_type !== 'FREE') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Free competitions must have competition_type = 'FREE'",
          path: ['competition_type']
        });
      }
    }

    // Jackpot-specific validation (PDF pages 8-9)
    if (data.category === 'JACKPOT') {
      if (data.price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Jackpot competitions must have a positive ticket price",
          path: ['price']
        });
      }
      
      if (data.price < (data.min_ticket_price || 10)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Jackpot competitions minimum ticket price is £${data.min_ticket_price || 10}`,
          path: ['price']
        });
      }
      
      if (!data.prize_option || !data.ticket_model) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Jackpot competitions require prize_option and ticket_model",
          path: ['prize_option']
        });
      }
      
      // Validate total tickets for jackpot (usually 1,000,000)
      if (data.total_tickets <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Jackpot competitions must have positive total tickets",
          path: ['total_tickets']
        });
      }
      
      // Validate jackpot amount
      if (data.prize_option === 'A' && (!data.jackpot_amount || data.jackpot_amount < 1000000)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Option A requires a jackpot amount of at least £1,000,000",
          path: ['jackpot_amount']
        });
      }
    }

    // Subscription competition validation (PDF page 13)
    if (data.category === 'SUBSCRIPTION') {
      if (!data.subscription_tier) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Subscription competitions require a subscription tier",
          path: ['subscription_tier']
        });
      }
      
      if (data.price > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Subscription competitions should be free (price = 0)",
          path: ['price']
        });
      }
      
      if (!data.subscriber_competition_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Subscription competitions require subscriber competition type",
          path: ['subscriber_competition_type']
        });
      }
      
      if (data.auto_entry_enabled && !data.max_subscribers) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Auto-entry enabled competitions require max_subscribers limit",
          path: ['max_subscribers']
        });
      }
    }

    // Mini-game competition validation (PDF pages 10-12)
    if (data.category === 'MINI_GAME') {
      if (!data.game_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mini-game competitions require game_type",
          path: ['game_type']
        });
      }
      
      if (!data.leaderboard_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mini-game competitions require leaderboard_type",
          path: ['leaderboard_type']
        });
      }
      
      if (!data.game_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Mini-game competitions require game_name",
          path: ['game_name']
        });
      }
      
      if (data.game_type === 'PAY_TO_PLAY' && data.price <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Pay-to-play mini-games require a positive price",
          path: ['price']
        });
      }
    }

    // VIP Competition validation
    if (data.category === 'VIP') {
      if (!data.vip_required) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "VIP competitions must have vip_required = true",
          path: ['vip_required']
        });
      }
      
      if (!data.vip_tier) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "VIP competitions require a VIP tier",
          path: ['vip_tier']
        });
      }
    }

    // Instant Win validation (PDF pages 2, 17-18)
    if (data.instant_wins && data.instant_wins.length > 0) {
      data.instant_wins.forEach((instantWin, index) => {
        const hasSplitCounts =
          instantWin.random_count !== undefined || instantWin.first_entry_count !== undefined;
        const randomCount = instantWin.random_count ?? 0;
        const firstEntryCount = instantWin.first_entry_count ?? 0;

        if (hasSplitCounts) {
          if (randomCount + firstEntryCount !== instantWin.max_count) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Instant Win ${index + 1}: random_count + first_entry_count must equal max_count (${instantWin.max_count})`,
              path: ['instant_wins', index]
            });
          }

          if (instantWin.ticket_numbers.length !== randomCount) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Instant Win ${index + 1}: Number of ticket numbers (${instantWin.ticket_numbers.length}) must match random_count (${randomCount})`,
              path: ['instant_wins', index]
            });
          }
        } else if (instantWin.ticket_numbers.length !== instantWin.max_count) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Instant Win ${index + 1}: Number of ticket numbers (${instantWin.ticket_numbers.length}) must match max_count (${instantWin.max_count})`,
            path: ['instant_wins', index]
          });
        }
        
        // Validate unique ticket numbers within this instant win
        const uniqueTicketNumbers = new Set(instantWin.ticket_numbers);
        if (uniqueTicketNumbers.size !== instantWin.ticket_numbers.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Instant Win ${index + 1}: Ticket numbers must be unique`,
            path: ['instant_wins', index, 'ticket_numbers']
          });
        }
      });
      
      // Check for duplicate ticket numbers across all instant wins
      const allTicketNumbers = data.instant_wins.flatMap(iw => iw.ticket_numbers);
      const uniqueAllTicketNumbers = new Set(allTicketNumbers);
      if (uniqueAllTicketNumbers.size !== allTicketNumbers.length) {
        const duplicates = allTicketNumbers.filter((num, idx) => allTicketNumbers.indexOf(num) !== idx);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate ticket numbers found across instant wins: ${[...new Set(duplicates)].join(', ')}`,
          path: ['instant_wins']
        });
      }
    }

    // Achievement validation (PDF pages 18, 24-25)
    if (data.achievements && data.achievements.length > 0) {
      data.achievements.forEach((achievement, index) => {
        if (achievement.type === 'PURCHASE_X_TICKETS' || achievement.type === 'SPEND_X_AMOUNT' || achievement.type === 'MINI_GAME_SCORE') {
          if (!achievement.condition_value || achievement.condition_value <= 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Achievement "${achievement.title}": Condition value required for ${achievement.type}`,
              path: ['achievements', index, 'condition_value']
            });
          }
        }
        
        if (achievement.repeatable && !achievement.max_repeats) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Achievement "${achievement.title}": Repeatable achievements require max_repeats`,
            path: ['achievements', index, 'max_repeats']
          });
        }
      });
    }

    // Validate end date logic
    if (!data.no_end_date && !data.end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date is required unless no_end_date is true",
        path: ['end_date']
      });
    }

    // Validate start date is before end date
    if (data.start_date && data.end_date) {
      const startDate = new Date(data.start_date);
      const endDate = new Date(data.end_date);
      if (endDate <= startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "End date must be after start date",
          path: ['end_date']
        });
      }
    }

    // Validate max entries per user doesn't exceed total tickets
    if (data.max_entries_per_user > data.total_tickets) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Max entries per user cannot exceed total tickets",
        path: ['max_entries_per_user']
      });
    }

    // Validate gallery images count
    if (data.gallery_images && data.gallery_images.length > 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum 20 gallery images allowed",
        path: ['gallery_images']
      });
    }

    // Validate price constraints by category
    const maxPrices = {
      'PAID': 10000,
      'JACKPOT': 100,
      'FREE': 0,
      'SUBSCRIPTION': 0,
      'MINI_GAME': 50,
      'VIP': 500,
      'INSTANT_WIN': 100,
      'ROLLING': 1000
    };

    if (data.price > (maxPrices[data.category] || 10000)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Maximum price for ${data.category} competitions is £${maxPrices[data.category]}`,
        path: ['price']
      });
    }

    // Validate total tickets by category
    const maxTickets = {
      'JACKPOT': 10000000,
      'PAID': 100000,
      'FREE': 10000,
      'SUBSCRIPTION': 5000,
      'MINI_GAME': 50000,
      'VIP': 1000,
      'INSTANT_WIN': 50000,
      'ROLLING': 100000
    };

    if (data.total_tickets > (maxTickets[data.category] || 100000)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Maximum tickets for ${data.category} competitions is ${maxTickets[data.category]}`,
        path: ['total_tickets']
      });
    }
  })
});

export const updateCompetitionSchema = createCompetitionSchema.partial();

export const skillQuestionAnswerSchema = z.object({
  body: z.object({
    answer: z.string().min(1, "Answer is required"),
    competition_id: z.string().uuid("Valid competition ID required"),
    user_id: z.string().uuid("Valid user ID required").optional()
  })
});

export const freeEntrySchema = z.object({
  body: z.object({
    competition_id: z.string().uuid("Valid competition ID required"),
    user_id: z.string().uuid("Valid user ID required").optional(),
    user_address: z.string().min(1, "Address is required for postal entry"),
    postal_proof: z.string().url("Invalid proof URL").optional(),
    answer: z.string().optional() // For skill question in free entry
  })
});

export const subscribeToCompetitionSchema = z.object({
  body: z.object({
    competition_id: z.string().uuid("Valid competition ID required"),
    tier_id: z.string().uuid("Valid tier ID required"),
    user_id: z.string().uuid("Valid user ID required").optional(),
    payment_method_id: z.string().optional()
  })
});

export const jackpotThresholdSchema = z.object({
  body: z.object({
    competition_id: z.string().uuid("Valid competition ID required"),
    start_countdown: z.boolean().default(false),
    threshold_value: z.number().int().min(0).optional(),
    manual_override: z.boolean().default(false)
  })
});

export const instantWinSchemaValidation = z.object({
  body: z.object({
    competition_id: z.string().uuid("Valid competition ID required"),
    ticket_number: z.number().int().positive("Valid ticket number required"),
    user_id: z.string().uuid("Valid user ID required").optional(),
    claim_proof: z.string().url("Invalid proof URL").optional()
  })
});

export const miniGameScoreSchema = z.object({
  body: z.object({
    competition_id: z.string().uuid("Valid competition ID required"),
    game_id: z.string().uuid("Valid game ID required"),
    score: z.number().min(0, "Score must be positive"),
    time_taken: z.number().int().min(0, "Time must be positive").optional(),
    level_reached: z.number().int().min(0, "Level must be positive").optional(),
    session_data: z.record(z.any()).optional(),
    screenshots: z.array(z.string().url("Invalid screenshot URL")).optional()
  })
});

export const winnerSelectionSchema = z.object({
  body: z.object({
    competition_id: z.string().uuid("Valid competition ID required"),
    method: z.enum(['RANDOM_DRAW', 'MANUAL_SELECTION', 'SKILL_BASED', 'FIRST_ENTRY', 'LUCKY_DIP', 'WEIGHTED_DRAW']),
    winners_count: z.number().int().min(1, "At least 1 winner required").optional(),
    criteria: z.record(z.any()).optional(),
    notify_winners: z.boolean().default(true),
    verification_required: z.boolean().default(false)
  })
});

export const bulkCompetitionSchema = z.object({
  body: z.object({
    competitions: z.array(createCompetitionSchema.shape.body).min(1, "At least 1 competition required").max(100, "Maximum 100 competitions per bulk operation"),
    template_id: z.string().uuid("Invalid template ID").optional(),
    import_format: z.enum(['CSV', 'JSON', 'EXCEL']).default('CSV')
  })
});

export const competitionStatusSchema = z.object({
  body: z.object({
    status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'DRAFT']),
    reason: z.string().optional(),
    effective_date: z.string().datetime("Invalid effective date").optional()
  })
});

export const competitionExportSchema = z.object({
  query: z.object({
    format: z.enum(['CSV', 'JSON', 'EXCEL', 'PDF']).default('JSON'),
    include: z.enum(['BASIC', 'EXTENDED', 'ALL']).default('BASIC'),
    start_date: z.string().datetime("Invalid start date").optional(),
    end_date: z.string().datetime("Invalid end date").optional()
  })
});

export const competitionAnalyticsSchema = z.object({
  query: z.object({
    period: z.enum(['TODAY', 'YESTERDAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'THIS_MONTH', 'LAST_MONTH', 'CUSTOM']).default('LAST_7_DAYS'),
    start_date: z.string().datetime("Invalid start date").optional(),
    end_date: z.string().datetime("Invalid end date").optional(),
    metrics: z.array(z.enum(['ENTRIES', 'REVENUE', 'PARTICIPANTS', 'CONVERSION', 'ENGAGEMENT'])).optional()
  })
});

export const competitionLeaderboardSchema = z.object({
  query: z.object({
    type: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'ALL_TIME']).default('ALL_TIME'),
    limit: z.number().int().min(1).max(1000).default(50),
    page: z.number().int().min(1).default(1),
    sort_by: z.enum(['SCORE', 'WINS', 'ENTRIES', 'POINTS']).default('SCORE'),
    sort_order: z.enum(['ASC', 'DESC']).default('DESC')
  })
});

export const validateEntrySchema = z.object({
  body: z.object({
    competition_id: z.string().uuid("Valid competition ID required"),
    user_id: z.string().uuid("Valid user ID required").optional(),
    entry_type: z.enum(['PAID', 'FREE', 'SKILL_QUESTION', 'SUBSCRIPTION']).optional()
  })
});

export const duplicateCompetitionSchema = z.object({
  body: z.object({
    title_suffix: z.string().min(1, "Title suffix required").default("Copy"),
    copy_files: z.boolean().default(true),
    copy_settings: z.boolean().default(true),
    copy_participants: z.boolean().default(false),
    new_status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT')
  })
});

export const competitionFilterSchema = z.object({
  query: z.object({
    category: z.enum(['PAID', 'FREE', 'JACKPOT', 'MINI_GAME', 'SUBSCRIPTION', 'VIP', 'INSTANT_WIN', 'ROLLING', 'ALL']).optional(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED', 'DRAFT', 'ALL']).optional(),
    competition_type: z.enum(['PAID', 'FREE', 'ALL']).optional(),
    min_price: z.number().min(0).optional(),
    max_price: z.number().min(0).optional(),
    search: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(20),
    page: z.number().int().min(1).default(1),
    sort_by: z.enum(['CREATED_AT', 'START_DATE', 'END_DATE', 'PRICE', 'POPULARITY']).default('CREATED_AT'),
    sort_order: z.enum(['ASC', 'DESC']).default('DESC'),
    featured_only: z.boolean().default(false),
    ending_soon: z.boolean().default(false),
    subscription_tier: z.enum(['TIER_1', 'TIER_2', 'TIER_3']).optional()
  })
});