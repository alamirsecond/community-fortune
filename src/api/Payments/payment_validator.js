import { body, param, query } from 'express-validator';

export const paymentMethodValidator = [
  body('gateway')
    .isIn(['STRIPE', 'PAYPAL', 'REVOLUT', 'BANK_TRANSFER'])
    .withMessage('Invalid payment gateway'),
  
  body('method_type')
    .isIn(['CARD', 'BANK_ACCOUNT', 'PAYPAL', 'REVOLUT'])
    .withMessage('Invalid method type'),
  
  body('display_name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Display name must be between 2 and 100 characters'),
  
  body('last_four')
    .optional()
    .isLength({ min: 4, max: 4 })
    .isNumeric()
    .withMessage('Last four must be 4 digits'),
  
  body('expiry_month')
    .optional()
    .isInt({ min: 1, max: 12 })
    .withMessage('Expiry month must be between 1 and 12'),
  
  body('expiry_year')
    .optional()
    .isInt({ min: new Date().getFullYear(), max: new Date().getFullYear() + 20 })
    .withMessage('Invalid expiry year'),
];

export const depositValidator = [
  body('amount')
    .isFloat({ min: 1, max: 100000 })
    .withMessage('Amount must be between 1 and 100,000'),
  
  body('gateway')
    .isIn(['STRIPE', 'PAYPAL', 'REVOLUT', 'BANK_TRANSFER'])
    .withMessage('Invalid gateway'),
  
  body('wallet_type')
    .isIn(['CASH', 'CREDIT'])
    .withMessage('Invalid wallet type'),
  
  body('currency')
    .optional()
    .isIn(['GBP', 'USD', 'EUR'])
    .withMessage('Invalid currency'),
  
  body('payment_method_id')
    .isLength({ min: 32, max: 36 })
    .withMessage('Invalid payment method ID'),
];

export const withdrawalValidator = [
  body('amount')
    .isFloat({ min: 10, max: 50000 })
    .withMessage('Amount must be between 10 and 50,000'),
  
  body('gateway')
    .isIn(['PAYPAL', 'BANK_TRANSFER', 'REVOLUT', 'STRIPE'])
    .withMessage('Invalid withdrawal gateway'),
  
  body('payment_method_id')
    .isLength({ min: 32, max: 36 })
    .withMessage('Invalid payment method ID'),

  body('account_details')
    .isObject()
    .withMessage('Account details must be an object'),
  
  body('account_details.receiver_email')
    .if(body('gateway').equals('PAYPAL'))
    .isEmail()
    .withMessage('Valid email required for PayPal'),
  
  body('account_details.account_holder_name')
    .if(body('gateway').equals('BANK_TRANSFER'))
    .notEmpty()
    .withMessage('Account holder name required for bank transfer'),
  
  body('account_details.account_number')
    .if(body('gateway').equals('BANK_TRANSFER'))
    .notEmpty()
    .withMessage('Account number required for bank transfer'),
  
  body('account_details.sort_code')
    .if(body('gateway').equals('BANK_TRANSFER'))
    .matches(/^\d{6}$/)
    .withMessage('Valid sort code required (6 digits)'),

  body('account_details')
    .custom((value, { req }) => {
      if (String(req.body.gateway || '').toUpperCase() !== 'STRIPE') {
        return true;
      }

      const hasStripeTarget = value && (value.stripe_account_id || value.destination || value.bank_account);
      if (!hasStripeTarget) {
        throw new Error('For STRIPE withdrawals provide stripe_account_id, destination, or bank_account');
      }

      return true;
    }),
];

export const refundValidator = [
  body('amount')
    .optional()
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least 1'),
  
  body('reason')
    .notEmpty()
    .isLength({ min: 10, max: 500 })
    .withMessage('Reason must be between 10 and 500 characters'),
];

export const gatewayConfigValidator = [
  body('gateway')
    .isIn(['STRIPE', 'PAYPAL', 'REVOLUT'])
    .withMessage('Invalid gateway'),
  
  body('environment')
    .isIn(['SANDBOX', 'LIVE'])
    .withMessage('Invalid environment'),
  
  body('is_enabled')
    .optional()
    .isBoolean()
    .withMessage('is_enabled must be boolean'),
  
  body('client_id')
    .optional()
    .isString()
    .withMessage('Client ID must be string'),
  
  body('client_secret')
    .optional()
    .isString()
    .withMessage('Client secret must be string'),
  
  body('api_key')
    .optional()
    .isString()
    .withMessage('API key must be string'),
];

export const paginationValidator = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be 0 or greater'),
];

export const idValidator = [
  param('methodId')
    .optional()
    .isLength({ min: 32, max: 36 })
    .withMessage('Invalid ID format'),
  
  param('depositId')
    .optional()
    .isLength({ min: 32, max: 36 })
    .withMessage('Invalid deposit ID format'),
  
  param('withdrawalId')
    .optional()
    .isLength({ min: 32, max: 36 })
    .withMessage('Invalid withdrawal ID format'),
  
  param('transactionId')
    .optional()
    .isLength({ min: 32, max: 36 })
    .withMessage('Invalid transaction ID format'),
  
  param('requestId')
    .optional()
    .isLength({ min: 32, max: 36 })
    .withMessage('Invalid request ID format'),
];