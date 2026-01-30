import Joi from 'joi';

// Password Settings
export const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required().messages({
    'string.empty': 'Current password is required'
  }),
  newPassword: Joi.string()
    .min(8)
    .required()
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.empty': 'New password is required'
    }),
  confirmNewPassword: Joi.string()
    .valid(Joi.ref('newPassword'))
    .required()
    .messages({
      'any.only': 'Passwords do not match',
      'string.empty': 'Please confirm your new password'
    })
});

// Maintenance Settings
export const maintenanceSchema = Joi.object({
  maintenance_mode: Joi.boolean().required(),
  allowed_ips: Joi.array().items(Joi.string().ip()).default([]),
  maintenance_message: Joi.string().max(500).default('System is under maintenance. Please try again later.'),
  estimated_duration: Joi.string().max(50).default('2 hours')
});

// Payment Gateway Settings
export const paymentGatewaySchema = Joi.object({
  enabled_methods: Joi.array().items(
    Joi.string().valid('credit_debit_card', 'paypal', 'bank_transfer', 'revolut')
  ).default(['credit_debit_card', 'paypal']),
  stripe: Joi.object({
    enabled: Joi.boolean().default(false),
    publishable_key: Joi.string().allow(''),
    secret_key: Joi.string().allow('')
  }).optional(),
  paypal: Joi.object({
    enabled: Joi.boolean().default(false),
    client_id: Joi.string().allow(''),
    secret: Joi.string().allow('')
  }).optional(),
  revolut: Joi.object({
    enabled: Joi.boolean().default(false),
    api_key: Joi.string().allow('')
  }).optional()
});

// Transaction Limits
export const transactionLimitsSchema = Joi.object({
  min_deposit: Joi.number().min(0).max(1000).default(10),
  max_deposit: Joi.number().min(0).max(100000).default(10000),
  min_withdrawal: Joi.number().min(0).max(1000).default(20),
  max_withdrawal: Joi.number().min(0).max(50000).default(5000),
  daily_deposit_limit: Joi.number().min(0).max(100000).default(5000),
  daily_withdrawal_limit: Joi.number().min(0).max(50000).default(2000)
});

// Security Settings
export const securitySchema = Joi.object({
  admin_session_timeout: Joi.number().min(5).max(240).default(30),
  enable_captcha_failed_attempts: Joi.boolean().default(true),
  failed_attempts_threshold: Joi.number().min(1).max(20).default(5),
  lock_account_minutes: Joi.number().min(1).max(1440).default(30),
  two_factor_enabled: Joi.boolean().default(false),
  password_min_length: Joi.number().min(6).max(50).default(8),
  password_require_special: Joi.boolean().default(true)
});

// Subscription Tier
export const subscriptionTierSchema = Joi.object({
  tier_name: Joi.string().max(100).required(),
  tier_level: Joi.number().min(1).max(10).required(),
  monthly_price: Joi.number().min(0).max(10000).required(),
  benefits: Joi.array().items(Joi.string()).default([]),
  free_jackpot_tickets: Joi.number().min(0).default(0),
  monthly_site_credit: Joi.number().min(0).default(0),
  badge_name: Joi.string().max(100).allow('', null),
  subscriber_competition_access: Joi.boolean().default(false)
});

// Notification Settings
export const notificationSchema = Joi.object({
  user_notifications: Joi.object({
    welcome_email: Joi.boolean().default(true),
    competition_entry_confirmation: Joi.boolean().default(true),
    winner_notification: Joi.boolean().default(true),
    marketing_emails: Joi.boolean().default(false),
    deposit_notification: Joi.boolean().default(true),
    withdrawal_notification: Joi.boolean().default(true),
    kyc_status_update: Joi.boolean().default(true),
    referral_reward: Joi.boolean().default(true)
  }).optional(),
  admin_notifications: Joi.object({
    new_user_signup: Joi.boolean().default(true),
    new_deposit: Joi.boolean().default(true),
    new_withdrawal: Joi.boolean().default(true),
    kyc_submission: Joi.boolean().default(true),
    competition_winner: Joi.boolean().default(true),
    system_alerts: Joi.boolean().default(true)
  }).optional(),
  email_templates: Joi.object({
    welcome_subject: Joi.string().max(200).default('Welcome to Community Fortune!'),
    welcome_body: Joi.string().max(5000).default('Welcome {{username}}! Thank you for joining our community.'),
    winner_subject: Joi.string().max(200).default('Congratulations! You Won!'),
    winner_body: Joi.string().max(5000).default('Congratulations {{username}}! You won {{prize}} in {{competition}}.')
  }).optional()
});

// Legal Document
export const legalDocumentSchema = Joi.object({
  title: Joi.string().max(100).required(),
  content: Joi.string().required(),
  version: Joi.string().max(20).default('1.0'),
  effective_date: Joi.date().default(() => new Date())
});

// Contact Settings
export const contactSettingsSchema = Joi.object({
  company_name: Joi.string().max(100).optional(),
  contact_email: Joi.string().email().optional(),
  website_url: Joi.string().uri().optional(),
  address_line1: Joi.string().max(200).optional(),
  address_line2: Joi.string().max(200).optional(),
  address_line3: Joi.string().max(200).optional(),
  support_email: Joi.string().email().optional(),
  business_hours: Joi.string().max(100).optional(),
  phone_number: Joi.string().max(20).optional(),
  response_time: Joi.string().max(50).optional()
});

// FAQ
export const faqSchema = Joi.object({
  scope: Joi.string().valid('HOME', 'SUBSCRIPTION').required(),
  question: Joi.string().max(500).required(),
  answer: Joi.string().required(),
  is_published: Joi.boolean().default(true),
  sort_order: Joi.number().min(1).default(1)
});

// Voucher
export const voucherSchema = Joi.object({
  code: Joi.string().max(32).optional(),
  campaign_name: Joi.string().max(255).required(),
  voucher_type: Joi.string().valid('SINGLE_USE', 'MULTI_USE', 'BULK_CODES').default('SINGLE_USE'),
  reward_type: Joi.string().valid('SITE_CREDIT', 'FREE_ENTRY', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'POINTS', 'RAFFLE_TICKETS').default('SITE_CREDIT'),
  reward_value: Joi.number().min(0).max(100000).required(),
  start_date: Joi.date().required(),
  expiry_date: Joi.date().required().greater(Joi.ref('start_date')),
  usage_limit: Joi.number().min(1).max(1000000).default(1),
  code_prefix: Joi.string().max(32).allow('', null),
  bulk_quantity: Joi.number().min(0).max(10000).default(0),
  bulk_code_length: Joi.number().min(4).max(32).default(8),
  status: Joi.string().valid('ACTIVE', 'EXPIRED', 'DISABLED', 'DELETED', 'USED_UP').default('ACTIVE')
});

// System Settings
export const systemSettingsSchema = Joi.object({
  site_name: Joi.string().max(100).optional(),
  site_url: Joi.string().uri().optional(),
  support_email: Joi.string().email().optional(),
  default_currency: Joi.string().length(3).optional(),
  timezone: Joi.string().optional(),
  date_format: Joi.string().optional(),
  items_per_page: Joi.number().min(5).max(100).optional(),
  enable_registration: Joi.boolean().optional(),
  enable_email_verification: Joi.boolean().optional(),
  enable_kyc_verification: Joi.boolean().optional(),
  referral_enabled: Joi.boolean().optional(),
  social_sharing_enabled: Joi.boolean().optional(),
  game_leaderboard_enabled: Joi.boolean().optional()
});