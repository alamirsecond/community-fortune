import { z } from "zod";

export const UpdateReferralSettingsSchema = z.object({
  total_referral_amount: z
    .number()
    .min(0, "Total referral amount must be positive")
    .optional(),
  
  reward_per_referral: z
    .number()
    .min(0, "Reward per referral must be positive")
    .optional(),
  
  alternative_reward: z
    .number()
    .min(0, "Alternative reward must be positive")
    .optional(),
  
  condition_min_spend: z
    .number()
    .min(0, "Minimum spend must be positive")
    .optional(),
  
  total_new_user_amount: z
    .number()
    .min(0, "Total new user amount must be positive")
    .optional(),
  
  onboarding_reward: z
    .number()
    .min(0, "Onboarding reward must be positive")
    .optional(),
  
  alternative_onboarding_reward: z
    .number()
    .min(0, "Alternative onboarding reward must be positive")
    .optional(),
  
  reward_type: z.enum(['SITE_CREDIT', 'POINTS']).optional(),
  
  amount_left: z
    .number()
    .min(0, "Amount left must be positive")
    .optional(),
  
  is_active: z.boolean().optional()
});

export const ReferralTierSchema = z.object({
  name: z
    .string()
    .min(1, "Tier name is required")
    .max(50, "Tier name cannot exceed 50 characters"),
  
  min_referrals: z
    .number()
    .int()
    .min(0, "Minimum referrals must be 0 or more"),
  
  max_referrals: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional(),
  
  cash_reward: z
    .number()
    .min(0, "Cash reward must be positive"),
  
  points_reward: z
    .number()
    .int()
    .min(0, "Points reward must be positive"),
  
  color: z
    .string()
    .regex(/^#[0-9A-F]{6}$/i, "Color must be a valid hex code (e.g., #FF5733)")
    .optional()
});

export const ManualRewardSchema = z.object({
  referrer_id: z.string().uuid("Invalid referrer ID"),
  referred_user_id: z.string().uuid("Invalid referred user ID"),
  amount: z.number().positive("Amount must be positive"),
  reward_type: z.enum(['CASH', 'SITE_CREDIT', 'POINTS']),
  notes: z.string().max(500).optional()
});

export const ReferralAnalyticsQuerySchema = z.object({
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  tier: z.string().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'ALL']).optional().default('ALL'),
  page: z.string().regex(/^\d+$/).optional().default("1"),
  limit: z.string().regex(/^\d+$/).optional().default("50")
});

export const validate = (schema, data) => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format Zod errors into a readable format
      const errors = {};
      error.errors.forEach((err) => {
        const field = err.path.join('.');
        errors[field] = err.message;
      });
      
      const validationError = new Error('Validation error');
      validationError.errors = errors;
      validationError.details = error.errors;
      throw validationError;
    }
    throw error;
  }
};