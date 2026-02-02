// routes/analyticsRoutes.js
import express, { Router } from 'express';
import analyticsController from './analyticsController.js';
import  authenticate from '../../../middleware/auth.js';

const analyticsRoutes = Router();
// ===========================================
// AUTHENTICATION MIDDLEWARE
// ===========================================

analyticsRoutes.use(authenticate(['SUPERADMIN', 'ADMIN']));

// ===========================================
// SALES OVERVIEW ROUTES
// ===========================================
analyticsRoutes.get('/sales/overview', analyticsController.getSalesOverview);

// ===========================================
// ANALYTICS DASHBOARD ROUTES
// ===========================================
analyticsRoutes.get('/dashboard', analyticsController.getAnalyticsDashboard);

// ===========================================
// PRODUCTS & STOCK ROUTES
// ===========================================
analyticsRoutes.get('/products/stock', analyticsController.getProductsStock);
analyticsRoutes.get('/products/stock/download', analyticsController.downloadStockReport);

// ===========================================
// PERFORMANCE ANALYTICS ROUTES
// ===========================================
analyticsRoutes.get('/performance', analyticsController.getPerformanceAnalytics);

// ===========================================
// REAL-TIME METRICS
// ===========================================
analyticsRoutes.get('/realtime', analyticsController.getRealTimeMetrics);

// ===========================================
// EXPORT ANALYTICS DATA
// ===========================================
analyticsRoutes.get('/export', async (req, res) => {
    try {
        const { type, format, dateRange } = req.query;
        
        // This would be a comprehensive export function
        // For now, return a placeholder response
        res.json({
            success: true,
            message: 'Export functionality will be implemented',
            data: {
                type,
                format,
                dateRange,
                exportUrl: `/api/analytics/export/file/${Date.now()}.${format || 'csv'}`
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Export failed',
            error: error.message
        });
    }
});

export default analyticsRoutes;