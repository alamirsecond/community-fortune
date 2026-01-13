// src/api/wallet/walletValidation.js
import Joi from 'joi';

const walletValidation = {
    redeemPointsSchema: Joi.object({
      points: Joi.number().integer().min(100).required().messages({
        'number.base': 'Points must be a number',
        'number.integer': 'Points must be an integer',
        'number.min': 'Minimum redeemable points is 100',
        'any.required': 'Points is required'
      })
    }),
  toggleFreezeSchema: Joi.object({
    isFrozen: Joi.boolean().required().messages({
      'boolean.base': 'isFrozen must be a boolean',
      'any.required': 'isFrozen is required'
    })
  }),

  transferSchema: Joi.object({
    fromWallet: Joi.string().valid('CASH', 'CREDIT').required().messages({
      'any.only': 'fromWallet must be either CASH or CREDIT',
      'any.required': 'fromWallet is required'
    }),
    toWallet: Joi.string().valid('CASH', 'CREDIT').required().messages({
      'any.only': 'toWallet must be either CASH or CREDIT',
      'any.required': 'toWallet is required'
    }),
    amount: Joi.number().positive().precision(2).max(100000).required().messages({
      'number.positive': 'Amount must be positive',
      'number.max': 'Amount cannot exceed £100,000',
      'any.required': 'Amount is required'
    }),
    reason: Joi.string().max(500).optional().allow('', null)
  }),

  buyCreditSchema: Joi.object({
    amount: Joi.number().positive().precision(2).min(5).max(5000).required().messages({
      'number.positive': 'Amount must be positive',
      'number.min': 'Minimum purchase amount is £5',
      'number.max': 'Maximum purchase amount is £5,000',
      'any.required': 'Amount is required'
    }),
    paymentMethod: Joi.string().valid('CARD', 'BANK_TRANSFER', 'PAYPAL').required().messages({
      'any.only': 'Payment method must be CARD, BANK_TRANSFER, or PAYPAL',
      'any.required': 'Payment method is required'
    })
  }),

  walletQuerySchema: Joi.object({
    walletType: Joi.string().valid('CASH', 'CREDIT').optional(),
    type: Joi.string().valid('CREDIT', 'DEBIT').optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  }),

  adminWalletQuerySchema: Joi.object({
    walletType: Joi.string().valid('CASH', 'CREDIT').optional(),
    userId: Joi.string().uuid().optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  })
};

export default walletValidation;