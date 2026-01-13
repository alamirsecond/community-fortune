// withdrawalSchemas.js - ENHANCED
import Joi from 'joi';

const withdrawalSchemas = {
  createWithdrawalSchema: Joi.object({
    amount: Joi.number()
      .positive()
      .min(10)
      .max(10000)
      .precision(2)
      .required()
      .messages({
        'number.min': 'Minimum withdrawal amount is £10',
        'number.max': 'Maximum withdrawal amount is £10,000',
        'number.positive': 'Amount must be positive',
        'any.required': 'Amount is required'
      }),
    paymentMethod: Joi.string()
      .valid('MASTERCARD', 'VISA', 'BANK_TRANSFER', 'PAYPAL')
      .required()
      .messages({
        'any.only': 'Payment method must be MASTERCARD, VISA, BANK_TRANSFER, or PAYPAL',
        'any.required': 'Payment method is required'
      }),
    accountDetails: Joi.object({
            // For PayPal
            paypalEmail: Joi.string()
              .email()
              .when('...paymentMethod', {
                is: 'PAYPAL',
                then: Joi.string().required(),
                otherwise: Joi.forbidden()
              })
              .messages({
                'string.email': 'PayPal email must be a valid email address',
                'any.required': 'PayPal email is required for PayPal withdrawals'
              }),
      // For cards
      cardLastFour: Joi.string()
        .when('paymentMethod', {
          is: Joi.valid('MASTERCARD', 'VISA'),
          then: Joi.string().length(4).pattern(/^\d+$/).required(),
          otherwise: Joi.forbidden()
        })
        .messages({
          'string.length': 'Card last four digits must be exactly 4 digits',
          'string.pattern': 'Card last four digits must be numbers only'
        }),
      cardHolderName: Joi.string()
        .when('paymentMethod', {
          is: Joi.valid('MASTERCARD', 'VISA'),
          then: Joi.string().min(2).max(100).required(),
          otherwise: Joi.forbidden()
        })
        .messages({
          'string.min': 'Card holder name must be at least 2 characters',
          'string.max': 'Card holder name cannot exceed 100 characters'
        }),
      
      // For bank transfers
      accountNumber: Joi.string()
        .when('paymentMethod', {
          is: 'BANK_TRANSFER',
          then: Joi.string().pattern(/^\d+$/).min(8).max(12).required(),
          otherwise: Joi.forbidden()
        }),
      sortCode: Joi.string()
        .when('paymentMethod', {
          is: 'BANK_TRANSFER',
          then: Joi.string().pattern(/^\d{2}-\d{2}-\d{2}$/).required(),
          otherwise: Joi.forbidden()
        }),
      accountHolderName: Joi.string()
        .when('paymentMethod', {
          is: 'BANK_TRANSFER',
          then: Joi.string().min(2).max(100).required(),
          otherwise: Joi.forbidden()
        })
    }).required()
  }),

  otpVerificationSchema: Joi.object({
    withdrawalId: Joi.string().uuid().required(),
    otp: Joi.string().length(6).pattern(/^\d+$/).required()
  }),

  updateWithdrawalSchema: Joi.object({
    status: Joi.string()
      .valid('APPROVED', 'REJECTED', 'COMPLETED', 'PROCESSING', 'CANCELLED')
      .required()
      .messages({
        'any.only': 'Status must be APPROVED, REJECTED, COMPLETED, PROCESSING, or CANCELLED',
        'any.required': 'Status is required'
      }),
    reason: Joi.string()
      .when('status', {
        is: 'REJECTED',
        then: Joi.string().required().min(10).max(500),
        otherwise: Joi.string().optional().allow('', null)
      })
      .messages({
        'string.min': 'Rejection reason must be at least 10 characters',
        'string.max': 'Rejection reason cannot exceed 500 characters',
        'any.required': 'Reason is required when rejecting withdrawal'
      }),
    adminNotes: Joi.string().max(1000).optional().allow('', null),
    processingDetails: Joi.object({
      transactionId: Joi.string().optional(),
      processedBy: Joi.string().optional(),
      estimatedCompletion: Joi.date().optional()
    }).optional()
  }),

  withdrawalIdSchema: Joi.object({
    id: Joi.string().uuid().required().messages({
      'string.guid': 'Valid withdrawal ID is required',
      'any.required': 'Withdrawal ID is required'
    })
  }),

  withdrawalQuerySchema: Joi.object({
    status: Joi.string()
      .valid('PENDING', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'COMPLETED', 'PROCESSING', 'CANCELLED')
      .optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    minAmount: Joi.number().positive().optional(),
    maxAmount: Joi.number().positive().optional(),
    paymentMethod: Joi.string().valid('MASTERCARD', 'VISA', 'BANK_TRANSFER').optional(),
    userId: Joi.string().uuid().optional(),
    sortBy: Joi.string()
      .valid('amount', 'requested_at', 'updated_at', 'status')
      .default('requested_at'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  kycVerificationSchema: Joi.object({
    userId: Joi.string().uuid().required(),
    kycStatus: Joi.string()
      .valid('verified', 'pending', 'rejected', 'under_review')
      .required(),
    verificationLevel: Joi.string()
      .valid('basic', 'enhanced', 'premium')
      .optional()
      .default('basic'),
    reviewNotes: Joi.string().max(1000).optional(),
    documents: Joi.array().items(
      Joi.object({
        type: Joi.string().required(),
        status: Joi.string().valid('approved', 'rejected', 'pending').required(),
        notes: Joi.string().optional()
      })
    ).optional()
  }),

  spendingLimitsSchema: Joi.object({
    dailyLimit: Joi.number()
      .min(0)
      .max(100000)
      .default(0),
    weeklyLimit: Joi.number()
      .min(0)
      .max(500000)
      .default(0),
    monthlyLimit: Joi.number()
      .min(0)
      .max(2000000)
      .default(0),
    singlePurchaseLimit: Joi.number()
      .min(0)
      .max(50000)
      .default(0),
    resetFrequency: Joi.string()
      .valid('daily', 'weekly', 'monthly', 'never')
      .default('monthly'),
    notificationThreshold: Joi.number()
      .min(0)
      .max(100)
      .default(80)
      .description('Percentage threshold for spending limit notifications')
  })
};

export default withdrawalSchemas;