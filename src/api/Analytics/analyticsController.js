// controllers/analyticsController.js
import analyticsService from './/analyticsService.js';
import { validationResult } from 'express-validator';

class AnalyticsController {
    // ===========================================
    // SALES OVERVIEW
    // ===========================================
    
    async getSalesOverview(req, res) {
        try {
            const { dateRange = 'last_7_days' } = req.query;
            
            const data = await analyticsService.getSalesOverview(dateRange);
            
            res.json({
                success: true,
                message: 'Sales overview retrieved successfully',
                data: {
                    ...data,
                    dateRange: {
                        from: analyticsService.parseDateRange(dateRange).startDate,
                        to: analyticsService.parseDateRange(dateRange).endDate
                    }
                }
            });
        } catch (error) {
            console.error('Sales overview error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve sales overview',
                error: error.message
            });
        }
    }
    
    // ===========================================
    // ANALYTICS DASHBOARD
    // ===========================================
    
    async getAnalyticsDashboard(req, res) {
        try {
            const { dateRange = 'last_7_days' } = req.query;
            
            const data = await analyticsService.getAnalyticsDashboard(dateRange);
            
            res.json({
                success: true,
                message: 'Analytics dashboard retrieved successfully',
                data: {
                    ...data,
                    dateRange: {
                        from: analyticsService.parseDateRange(dateRange).startDate,
                        to: analyticsService.parseDateRange(dateRange).endDate
                    }
                }
            });
        } catch (error) {
            console.error('Analytics dashboard error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve analytics dashboard',
                error: error.message
            });
        }
    }
    
    // ===========================================
    // PRODUCTS & STOCK
    // ===========================================
    
    async getProductsStock(req, res) {
        try {
            const {
                status = 'all',
                show = 'all',
                search = '',
                page = 1,
                limit = 10
            } = req.query;
            
            const data = await analyticsService.getProductsStockOverview({
                status,
                show,
                search,
                page: parseInt(page),
                limit: parseInt(limit)
            });
            
            res.json({
                success: true,
                message: 'Products and stock data retrieved successfully',
                data
            });
        } catch (error) {
            console.error('Products stock error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve products and stock data',
                error: error.message
            });
        }
    }
    
    // ===========================================
    // PERFORMANCE ANALYTICS
    // ===========================================
    
    async getPerformanceAnalytics(req, res) {
        try {
            const { dateRange = 'last_7_days' } = req.query;
            
            const data = await analyticsService.getPerformanceAnalytics(dateRange);
            
            res.json({
                success: true,
                message: 'Performance analytics retrieved successfully',
                data: {
                    ...data,
                    dateRange: {
                        from: analyticsService.parseDateRange(dateRange).startDate,
                        to: analyticsService.parseDateRange(dateRange).endDate
                    }
                }
            });
        } catch (error) {
            console.error('Performance analytics error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve performance analytics',
                error: error.message
            });
        }
    }
    
    // ===========================================
    // DOWNLOAD STOCK REPORT
    // ===========================================
    
    async downloadStockReport(req, res) {
        try {
            const { format = 'csv' } = req.query;
            
            const data = await analyticsService.getProductsStockOverview({ limit: 1000 });
            
            if (format === 'csv') {
                // Generate CSV
                const csv = this.generateStockCSV(data.products);
                
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=stock-report.csv');
                res.send(csv);
            } else {
                // JSON response
                res.json({
                    success: true,
                    message: 'Stock report generated successfully',
                    data: data.products
                });
            }
        } catch (error) {
            console.error('Download stock report error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate stock report',
                error: error.message
            });
        }
    }

    // ===========================================
    // EXPORT SALES NET REVENUE (CSV)
    // ===========================================
    async exportSalesNetRevenueCsv(req, res) {
        try {
            const { dateRange = 'last_7_days' } = req.query;
            const salesData = await analyticsService.getSalesOverview(dateRange);
            const netSalesChart = salesData?.charts?.netSales?.data || [];
            const range = analyticsService.parseDateRange(dateRange);
            const totalNetSales = salesData?.overview?.net_sales || 0;

            const headers = [
                'day',
                'net_sales',
                'transaction_count',
                'range_start',
                'range_end',
                'total_net_sales'
            ];

            const escapeCsv = (val) => {
                if (val === null || val === undefined) return '';
                const str = String(val);
                if (/[\n\r,"]/g.test(str)) return `"${str.replace(/"/g, '""')}"`;
                return str;
            };

            const lines = [headers.join(',')];
            netSalesChart.forEach((row) => {
                lines.push([
                    row.day,
                    row.value || 0,
                    row.count || 0,
                    range.startDate,
                    range.endDate,
                    totalNetSales
                ].map(escapeCsv).join(','));
            });

            const csv = lines.join('\n');
            const filename = `sales_net_revenue_${new Date().toISOString().slice(0, 10)}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csv);
        } catch (error) {
            console.error('Export sales net revenue error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export sales net revenue',
                error: error.message
            });
        }
    }
    
    // ===========================================
    // PRIVATE HELPER METHODS
    // ===========================================
    
    generateStockCSV(products) {
        let csv = 'Product Title,Category,Status,Total Stock,Sold Tickets,Available,Orders,Net Sales,Price\n';
        
        products.forEach(product => {
            csv += `"${product.product_title || ''}",`;
            csv += `"${product.category || ''}",`;
            csv += `"${product.status || ''}",`;
            csv += `${product.total_stock || 0},`;
            csv += `${product.sold_tickets || 0},`;
            csv += `${product.available_stock || 0},`;
            csv += `${product.orders || 0},`;
            csv += `${product.net_sales || 0},`;
            csv += `${product.price || 0}\n`;
        });
        
        return csv;
    }
    
    // ===========================================
    // REAL-TIME METRICS
    // ===========================================
    
    async getRealTimeMetrics(req, res) {
        try {
            const today = new Date();
            const startOfToday = new Date(today.setHours(0, 0, 0, 0));
            const endOfToday = new Date(today.setHours(23, 59, 59, 999));
            
            const db = await import('../config/database.js');
            
            const query = `
                SELECT 
                    -- Today's metrics
                    (SELECT COALESCE(SUM(amount), 0)
                     FROM transactions 
                     WHERE status = 'completed' 
                       AND created_at BETWEEN ? AND ?) as today_sales,
                    
                    (SELECT COUNT(DISTINCT user_id)
                     FROM transactions 
                     WHERE status = 'completed' 
                       AND created_at BETWEEN ? AND ?) as today_customers,
                    
                    (SELECT COUNT(*)
                     FROM transactions 
                     WHERE status = 'completed' 
                       AND type = 'competition_entry'
                       AND created_at BETWEEN ? AND ?) as today_orders,
                    
                    -- This month's metrics
                    (SELECT COALESCE(SUM(amount), 0)
                     FROM transactions 
                     WHERE status = 'completed' 
                       AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) as month_sales,
                    
                    -- Active competitions
                    (SELECT COUNT(*) 
                     FROM competitions 
                     WHERE status = 'ACTIVE') as active_competitions,
                    
                    -- Low stock items
                    (SELECT COUNT(*) 
                     FROM competitions 
                     WHERE status = 'ACTIVE' 
                       AND (total_tickets - sold_tickets) < 10 
                       AND (total_tickets - sold_tickets) > 0) as low_stock_items
            `;
            
            const [rows] = await db.default.execute(query, [
                startOfToday, endOfToday,
                startOfToday, endOfToday,
                startOfToday, endOfToday
            ]);
            
            res.json({
                success: true,
                message: 'Real-time metrics retrieved successfully',
                data: rows[0] || {}
            });
        } catch (error) {
            console.error('Real-time metrics error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve real-time metrics',
                error: error.message
            });
        }
    }
}

const analyticsController = new AnalyticsController();
export default analyticsController;