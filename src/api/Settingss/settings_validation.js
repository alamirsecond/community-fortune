import Joi from 'joi';

// Validation schemas
export const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required(),
  confirmNewPassword: Joi.string().valid(Joi.ref('newPassword')).required()
});

export const maintenanceSchema = Joi.object({
  maintenance_mode: Joi.boolean().required(),
  allowed_ips: Joi.array().items(Joi.string()),
  maintenance_message: Joi.string(),
  estimated_duration: Joi.string()
});

export const gatewayConfigureSchema = Joi.object({
  gateway: Joi.string().valid('PAYPAL', 'STRIPE', 'REVOLUT').required(),
  environment: Joi.string().valid('SANDBOX', 'LIVE').required(),
  display_name: Joi.string().required(),
  client_id: Joi.string().allow('', null),
  client_secret: Joi.string().allow('', null),
  api_key: Joi.string().allow('', null),
  webhook_secret: Joi.string().allow('', null),
  public_key: Joi.string().allow('', null),
  private_key: Joi.string().allow('', null),
  min_deposit: Joi.number().min(0),
  max_deposit: Joi.number().min(0),
  min_withdrawal: Joi.number().min(0),
  max_withdrawal: Joi.number().min(0),
  processing_fee_percent: Joi.number().min(0).max(100),
  fixed_fee: Joi.number().min(0),
  logo_url: Joi.string().uri().allow('', null),
  is_default: Joi.boolean(),
  allowed_countries: Joi.array().items(Joi.string().length(2)),
  restricted_countries: Joi.array().items(Joi.string().length(2))
});

export const enableDisableGatewaySchema = Joi.object({
  gateway: Joi.string().valid('PAYPAL', 'STRIPE', 'REVOLUT').required(),
  environment: Joi.string().valid('SANDBOX', 'LIVE').required()
});

export const transactionLimitsSchema = Joi.object({
  min_deposit: Joi.number().min(0).max(1000),
  max_deposit: Joi.number().min(0).max(100000),
  min_withdrawal: Joi.number().min(0).max(1000),
  max_withdrawal: Joi.number().min(0).max(50000),
  daily_deposit_limit: Joi.number().min(0).max(100000),
  daily_withdrawal_limit: Joi.number().min(0).max(50000)
});

export const securitySchema = Joi.object({
  admin_session_timeout: Joi.number().min(5).max(240),
  enable_captcha_failed_attempts: Joi.boolean(),
  failed_attempts_threshold: Joi.number().min(1).max(20),
  lock_account_minutes: Joi.number().min(1).max(1440),
  two_factor_enabled: Joi.boolean(),
  password_min_length: Joi.number().min(6).max(50),
  password_require_special: Joi.boolean()
});

export const subscriptionTierSchema = Joi.object({
  tier_name: Joi.string().max(100).required(),
  tier_level: Joi.number().min(1).max(10).required(),
  monthly_price: Joi.number().min(0).max(10000).required(),
  benefits: Joi.array().items(Joi.string()),
  free_jackpot_tickets: Joi.number().min(0),
  monthly_site_credit: Joi.number().min(0),
  badge_name: Joi.string().max(100).allow('', null),
  subscriber_competition_access: Joi.boolean()
});

export const notificationTypeSchema = Joi.object({
  type: Joi.string().required(),
  category: Joi.string().valid('user', 'admin').required()
});

export const emailTemplateSchema = Joi.object({
  welcome_subject: Joi.string(),
  welcome_body: Joi.string(),
  winner_subject: Joi.string(),
  winner_body: Joi.string()
});

export const legalDocumentSchema = Joi.object({
  title: Joi.string().max(100).required(),
  content: Joi.string().required(),
  version: Joi.string().max(20),
  effective_date: Joi.date()
});

export const ageVerificationSchema = Joi.object({
  require_age_verification: Joi.boolean().required()
});

export const contactSchema = Joi.object({
  company_name: Joi.string().max(100),
  contact_email: Joi.string().email(),
  website_url: Joi.string().uri(),
  address_line1: Joi.string().max(200),
  address_line2: Joi.string().max(200),
  address_line3: Joi.string().max(200),
  support_email: Joi.string().email(),
  business_hours: Joi.string().max(100),
  phone_number: Joi.string().max(20),
  response_time: Joi.string().max(50)
});

export const faqSchema = Joi.object({
  scope: Joi.string().valid('HOME', 'SUBSCRIPTION').required(),
  question: Joi.string().max(500).required(),
  answer: Joi.string().required(),
  is_published: Joi.boolean(),
  sort_order: Joi.number().min(1)
});

export const voucherSchema = Joi.object({
  code: Joi.string().max(32),
  campaign_name: Joi.string().max(255).required(),
  voucher_type: Joi.string().valid('SINGLE_USE', 'MULTI_USE', 'BULK_CODES'),
  reward_type: Joi.string().valid('SITE_CREDIT', 'FREE_ENTRY', 'DISCOUNT_PERCENT', 'DISCOUNT_FIXED', 'POINTS', 'RAFFLE_TICKETS'),
  reward_value: Joi.number().min(0).max(100000).required(),
  start_date: Joi.date().required(),
  expiry_date: Joi.date().required(),
  usage_limit: Joi.number().min(1).max(1000000),
  code_prefix: Joi.string().max(32).allow('', null),
  bulk_quantity: Joi.number().min(0).max(10000),
  bulk_code_length: Joi.number().min(4).max(32),
  status: Joi.string().valid('ACTIVE', 'EXPIRED', 'DISABLED', 'DELETED', 'USED_UP')
});

export const systemSchema = Joi.object({
  site_name: Joi.string().max(100),
  site_url: Joi.string().uri(),
  support_email: Joi.string().email(),
  default_currency: Joi.string().length(3),
  timezone: Joi.string(),
  date_format: Joi.string(),
  items_per_page: Joi.number().min(5).max(100),
  enable_registration: Joi.boolean(),
  enable_email_verification: Joi.boolean(),
  enable_kyc_verification: Joi.boolean(),
  referral_enabled: Joi.boolean(),
  social_sharing_enabled: Joi.boolean(),
  game_leaderboard_enabled: Joi.boolean()
});

// Schema mapping for middleware
const schemas = {
  changePassword: changePasswordSchema,
  maintenance: maintenanceSchema,
  gatewayConfigure: gatewayConfigureSchema,
  enableDisableGateway: enableDisableGatewaySchema,
  transactionLimits: transactionLimitsSchema,
  security: securitySchema,
  subscriptionTier: subscriptionTierSchema,
  notificationType: notificationTypeSchema,
  emailTemplate: emailTemplateSchema,
  legalDocument: legalDocumentSchema,
  ageVerification: ageVerificationSchema,
  contact: contactSchema,
  faq: faqSchema,
  voucher: voucherSchema,
  system: systemSchema
};

// Validation middleware
export const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      return res.status(500).json({
        success: false,
        message: 'Validation schema not found'
      });
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const validationError = new Error('Validation error');
      validationError.details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationError.details
      });
    }

    req.body = value;
    next();
  };
};