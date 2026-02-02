// validators/analyticsValidator.js
const { query } = require('express-validator');

const analyticsValidator = {
    getAnalytics: [
        query('dateRange')
            .optional()
            .isIn(['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'last_month', 'custom'])
            .withMessage('Invalid date range'),
        query('startDate')
            .optional()
            .isISO8601()
            .withMessage('Invalid start date format'),
        query('endDate')
            .optional()
            .isISO8601()
            .withMessage('Invalid end date format'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ],
    
    getProductsStock: [
        query('status')
            .optional()
            .isIn(['all', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DRAFT'])
            .withMessage('Invalid status'),
        query('show')
            .optional()
            .isIn(['all', 'in-stock', 'out-of-stock', 'low-stock'])
            .withMessage('Invalid show filter'),
        query('search')
            .optional()
            .trim()
            .isLength({ max: 100 })
            .withMessage('Search query too long'),
        query('page')
            .optional()
            .isInt({ min: 1 })
            .withMessage('Page must be a positive integer'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage('Limit must be between 1 and 100')
    ]
};

module.exports = analyticsValidator;