// services/analyticsService.js
import db from '../../../database.js';

class AnalyticsService {
    // ===========================================
    // SALES OVERVIEW ANALYTICS
    // ===========================================
    
    async getSalesOverview(dateRange) {
        const { startDate, endDate } = this.parseDateRange(dateRange);
        
        // 1. Get total sales metrics
        const salesMetrics = await this.getSalesMetrics(startDate, endDate);
        
        // 2. Get total sales chart data (by day)
        const totalSalesChart = await this.getSalesChartData(startDate, endDate, 'total_sales');
        
        // 3. Get net sales chart data (by day)
        const netSalesChart = await this.getSalesChartData(startDate, endDate, 'net_sales');
        
        // 4. Get orders chart data (by day)
        const ordersChart = await this.getOrdersChartData(startDate, endDate);
        
        // 5. Get products sold chart data (by day)
        const productsSoldChart = await this.getProductsSoldChartData(startDate, endDate);
        
        return {
            overview: salesMetrics,
            charts: {
                totalSales: totalSalesChart,
                netSales: netSalesChart,
                orders: ordersChart,
                productsSold: productsSoldChart
            }
        };
    }
    
    // ===========================================
    // ANALYTICS DASHBOARD
    // ===========================================
    
    async getAnalyticsDashboard(dateRange) {
        const { startDate, endDate } = this.parseDateRange(dateRange);
        
        const [
            dashboardMetrics,
            ordersChart,
            netSalesChart,
            avgOrderValueChart,
            avgItemsChart
        ] = await Promise.all([
            this.getDashboardMetrics(startDate, endDate),
            this.getOrdersChartData(startDate, endDate),
            this.getNetSalesChartByMonth(startDate, endDate),
            this.getAvgOrderValueChart(startDate, endDate),
            this.getAvgItemsPerOrderChart(startDate, endDate)
        ]);
        
        return {
            dashboard: dashboardMetrics,
            charts: {
                orders: ordersChart,
                netSales: netSalesChart,
                avgOrderValue: avgOrderValueChart,
                avgItemsPerOrder: avgItemsChart
            }
        };
    }
    
    // ===========================================
    // PRODUCTS & STOCK ANALYTICS
    // ===========================================
    
    async getProductsStockOverview(filters = {}) {
        const {
            status = 'all',
            show = 'all',
            search = '',
            page = 1,
            limit = 10
        } = filters;
        
        // Get competition-based products (tickets)
        const products = await this.getCompetitionProducts({
            status,
            search,
            page,
            limit
        });
        
        // Get stock summary
        const stockSummary = await this.getStockSummary();
        
        return {
            products,
            stockSummary,
            filters: {
                status,
                show,
                search,
                page,
                limit
            }
        };
    }
    
    // ===========================================
    // PERFORMANCE ANALYTICS
    // ===========================================
    
    async getPerformanceAnalytics(dateRange) {
        const { startDate, endDate } = this.parseDateRange(dateRange);
        
        const [
            performanceMetrics,
            totalSalesChart,
            productsSoldChart,
            ordersChart,
            productsList
        ] = await Promise.all([
            this.getPerformanceMetrics(startDate, endDate),
            this.getSalesChartData(startDate, endDate, 'total_sales'),
            this.getProductsSoldChartData(startDate, endDate),
            this.getOrdersChartData(startDate, endDate),
            this.getCompetitionProducts({ limit: 10 })
        ]);
        
        return {
            performance: performanceMetrics,
            charts: {
                totalSales: totalSalesChart,
                productsSold: productsSoldChart,
                orders: ordersChart
            },
            products: productsList
        };
    }
    
    // ===========================================
    // PRIVATE HELPER METHODS
    // ===========================================
async getSalesMetrics(startDate, endDate) {
    const query = `
        SELECT 
            COALESCE(SUM(t.amount), 0) as total_sales,
            COALESCE(SUM(CASE WHEN t.type IN ('deposit', 'purchase', 'competition_entry') THEN t.amount ELSE 0 END), 0) as total_deposits,
            COALESCE(SUM(CASE WHEN t.type IN ('withdrawal', 'instant_win') THEN t.amount ELSE 0 END), 0) as total_withdrawals,
            COALESCE(SUM(CASE WHEN t.type IN ('purchase', 'competition_entry') THEN t.amount ELSE 0 END), 0) as net_sales,
            COALESCE(SUM(CASE WHEN t.type = 'competition_entry' THEN t.amount ELSE 0 END), 0) as competition_revenue,
            COUNT(CASE WHEN t.type = 'competition_entry' THEN 1 END) as orders,
            COUNT(DISTINCT t.user_id) as active_customers,
            COALESCE(SUM(
                CASE 
                    WHEN ti.ticket_type = 'COMPETITION' THEN 1 
                    WHEN ti.ticket_type = 'UNIVERSAL' AND ut.quantity IS NOT NULL THEN ut.quantity
                    ELSE 1 
                END
            ), 0) as products_sold
        FROM transactions t
        LEFT JOIN purchases p ON t.id = p.payment_id
        LEFT JOIN tickets ti ON p.id = ti.purchase_id
        LEFT JOIN universal_tickets ut ON ti.universal_ticket_id = ut.id
        WHERE t.status = 'completed'
            AND t.created_at BETWEEN ? AND ?
    `;
    
    const [rows] = await db.execute(query, [startDate, endDate]);
    return rows[0] || {};
}
    
    async getSalesChartData(startDate, endDate, metric = 'total_sales') {
        const daysOfWeek = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        
        const query = `
            SELECT 
                DAYNAME(created_at) as day_name,
                DAYOFWEEK(created_at) as day_of_week,
                DATE(created_at) as date,
                COUNT(*) as transaction_count,
                COALESCE(SUM(
                    CASE 
                        WHEN ? = 'total_sales' AND type IN ('deposit', 'purchase', 'competition_entry') THEN amount
                        WHEN ? = 'net_sales' AND type IN ('purchase', 'competition_entry') THEN amount
                        ELSE 0 
                    END
                ), 0) as amount
            FROM transactions
            WHERE status = 'completed'
                AND created_at BETWEEN ? AND ?
            GROUP BY DATE(created_at), DAYNAME(created_at), DAYOFWEEK(created_at)
            ORDER BY date
        `;
        
        const [rows] = await db.execute(query, [metric, metric, startDate, endDate]);
        
        // Map to days of week
        const chartData = daysOfWeek.map(day => {
            const dayData = rows.find(r => r.day_name.toUpperCase().startsWith(day));
            return {
                day,
                value: dayData ? dayData.amount : 0,
                count: dayData ? dayData.transaction_count : 0
            };
        });
        
        return {
            xAxis: daysOfWeek,
            yAxis: this.generateYAxisValues(chartData.map(d => d.value)),
            data: chartData,
            legend: rows.length > 0 ? null : 'No data for the selected date range'
        };
    }
    
    async getOrdersChartData(startDate, endDate) {
        const daysOfWeek = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        
        const query = `
            SELECT 
                DAYNAME(t.created_at) as day_name,
                DAYOFWEEK(t.created_at) as day_of_week,
                DATE(t.created_at) as date,
                COUNT(DISTINCT p.id) as order_count,
                COUNT(DISTINCT ti.id) as ticket_count,
                COALESCE(SUM(t.amount), 0) as total_amount
            FROM transactions t
            LEFT JOIN purchases p ON t.id = p.payment_id
            LEFT JOIN tickets ti ON p.id = ti.purchase_id
            WHERE t.status = 'completed'
                AND t.type = 'competition_entry'
                AND t.created_at BETWEEN ? AND ?
            GROUP BY DATE(t.created_at), DAYNAME(t.created_at), DAYOFWEEK(t.created_at)
            ORDER BY date
        `;
        
        const [rows] = await db.execute(query, [startDate, endDate]);
        
        const chartData = daysOfWeek.map(day => {
            const dayData = rows.find(r => r.day_name.toUpperCase().startsWith(day));
            return {
                day,
                orders: dayData ? dayData.order_count : 0,
                tickets: dayData ? dayData.ticket_count : 0,
                amount: dayData ? dayData.total_amount : 0
            };
        });
        
        return {
            xAxis: daysOfWeek,
            yAxis: this.generateYAxisValues(chartData.map(d => d.orders)),
            data: chartData,
            legend: rows.length > 0 ? null : 'No data for the selected date range'
        };
    }
    
async getProductsSoldChartData(startDate, endDate) {
    const daysOfWeek = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    
    const query = `
        SELECT 
            DAYNAME(p.created_at) as day_name,
            DAYOFWEEK(p.created_at) as day_of_week,
            DATE(p.created_at) as date,
            COUNT(ti.id) as products_sold  -- Changed from SUM(ti.quantity) to COUNT(ti.id)
        FROM purchases p
        LEFT JOIN tickets ti ON p.id = ti.purchase_id
        WHERE p.status = 'PAID'
            AND p.created_at BETWEEN ? AND ?
        GROUP BY DATE(p.created_at), DAYNAME(p.created_at), DAYOFWEEK(p.created_at)
        ORDER BY date
    `;
    
    const [rows] = await db.execute(query, [startDate, endDate]);
    
    const chartData = daysOfWeek.map(day => {
        const dayData = rows.find(r => r.day_name.toUpperCase().startsWith(day));
        return {
            day,
            productsSold: dayData ? dayData.products_sold : 0
        };
    });
    
    return {
        xAxis: daysOfWeek,
        yAxis: this.generateYAxisValues(chartData.map(d => d.productsSold)),
        data: chartData,
        legend: rows.length > 0 ? null : 'No data for the selected date range'
    };
}
    
async getDashboardMetrics(startDate, endDate) {
    // First, get the previous period dates
    const dateDiff = await this.getDateDifference(startDate, endDate);
    const previousStartDate = this.subtractDays(startDate, dateDiff);
    const previousEndDate = this.subtractDays(endDate, dateDiff);
    
    // Get current period metrics
    const currentMetrics = await this.getPeriodMetrics(startDate, endDate);
    
    // Get previous period metrics
    const previousMetrics = await this.getPeriodMetrics(previousStartDate, previousEndDate);
    
    // Calculate performance (growth percentage)
    const performance = previousMetrics.net_sales > 0 
        ? ((currentMetrics.net_sales - previousMetrics.net_sales) / previousMetrics.net_sales) * 100 
        : 0;
    
    // Calculate score (custom metric)
    const daysDiff = dateDiff > 0 ? dateDiff : 1;
    const score = (currentMetrics.net_sales / daysDiff) * 100;
    
    return {
        score: parseFloat(score.toFixed(2)),
        performance: parseFloat(performance.toFixed(2)),
        orders: currentMetrics.orders,
        net_sales: currentMetrics.net_sales,
        avg_order_value: currentMetrics.avg_order_value,
        avg_items_per_order: currentMetrics.avg_items_per_order
    };
}

async getPeriodMetrics(startDate, endDate) {
    const query = `
        SELECT 
            COUNT(DISTINCT p.id) as orders,
            COALESCE(SUM(CASE WHEN t.type IN ('purchase', 'competition_entry') THEN t.amount ELSE 0 END), 0) as net_sales,
            COALESCE(
                AVG(CASE WHEN t.type = 'competition_entry' THEN t.amount ELSE NULL END), 
                0
            ) as avg_order_value,
            COALESCE(
                AVG(CASE 
                    WHEN p.id IS NOT NULL THEN (
                        SELECT COUNT(*)
                        FROM tickets ti 
                        WHERE ti.purchase_id = p.id
                    )
                    ELSE 0 
                END), 
                0
            ) as avg_items_per_order
        FROM transactions t
        LEFT JOIN purchases p ON t.id = p.payment_id
        WHERE t.status = 'completed'
            AND t.created_at BETWEEN ? AND ?
    `;
    
    const [rows] = await db.execute(query, [startDate, endDate]);
    return rows[0] || {};
}

async getDateDifference(startDate, endDate) {
    const query = `SELECT DATEDIFF(?, ?) as diff`;
    const [rows] = await db.execute(query, [endDate, startDate]);
    return rows[0]?.diff || 1;
}

subtractDays(dateString, days) {
    const date = new Date(dateString);
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0] + ' 00:00:00';
}
    
    async getNetSalesChartByMonth(startDate, endDate) {
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        
        const query = `
            SELECT 
                MONTH(created_at) as month_num,
                DATE_FORMAT(created_at, '%b') as month_name,
                COALESCE(SUM(
                    CASE 
                        WHEN type IN ('purchase', 'competition_entry') THEN amount
                        ELSE 0 
                    END
                ), 0) as amount
            FROM transactions
            WHERE status = 'completed'
                AND created_at BETWEEN ? AND ?
            GROUP BY MONTH(created_at), DATE_FORMAT(created_at, '%b')
            ORDER BY month_num
        `;
        
        const [rows] = await db.execute(query, [startDate, endDate]);
        
        const chartData = months.map((month, index) => {
            const monthData = rows.find(r => r.month_name.toUpperCase() === month);
            return {
                month,
                value: monthData ? monthData.amount : 0
            };
        }).slice(0, 6); // Show last 6 months as in image
        
        return {
            xAxis: chartData.map(d => d.month),
            yAxis: this.generateYAxisValues(chartData.map(d => d.value), true), // currency format
            data: chartData,
            legend: rows.length > 0 ? null : 'No data for the selected date range'
        };
    }
    
    async getAvgOrderValueChart(startDate, endDate) {
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        
        const query = `
            SELECT 
                MONTH(t.created_at) as month_num,
                DATE_FORMAT(t.created_at, '%b') as month_name,
                COALESCE(
                    AVG(CASE WHEN t.type = 'competition_entry' THEN t.amount ELSE NULL END), 
                    0
                ) as avg_order_value
            FROM transactions t
            WHERE t.status = 'completed'
                AND t.created_at BETWEEN ? AND ?
            GROUP BY MONTH(t.created_at), DATE_FORMAT(t.created_at, '%b')
            ORDER BY month_num
        `;
        
        const [rows] = await db.execute(query, [startDate, endDate]);
        
        const chartData = months.map((month, index) => {
            const monthData = rows.find(r => r.month_name.toUpperCase() === month);
            return {
                month,
                value: monthData ? monthData.avg_order_value : 0
            };
        }).slice(0, 6);
        
        return {
            xAxis: chartData.map(d => d.month),
            yAxis: this.generateYAxisValues(chartData.map(d => d.value), true),
            data: chartData,
            legend: rows.length > 0 ? null : 'No data for the selected date range'
        };
    }
    
    async getAvgItemsPerOrderChart(startDate, endDate) {
        const daysOfWeek = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        
        const query = `
            SELECT 
                DAYNAME(p.created_at) as day_name,
                DAYOFWEEK(p.created_at) as day_of_week,
                DATE(p.created_at) as date,
                COALESCE(
                    AVG(CASE 
                        WHEN p.id IS NOT NULL THEN (
                            SELECT COUNT(*)
                            FROM tickets ti 
                            WHERE ti.purchase_id = p.id
                        )
                        ELSE 0 
                    END), 
                    0
                ) as avg_items_per_order
            FROM purchases p
            WHERE p.status = 'PAID'
                AND p.created_at BETWEEN ? AND ?
            GROUP BY DATE(p.created_at), DAYNAME(p.created_at), DAYOFWEEK(p.created_at)
            ORDER BY date
        `;
        
        const [rows] = await db.execute(query, [startDate, endDate]);
        
        const chartData = daysOfWeek.map(day => {
            const dayData = rows.find(r => r.day_name.toUpperCase().startsWith(day));
            return {
                day,
                value: dayData ? dayData.avg_items_per_order : 0
            };
        });
        
        return {
            xAxis: daysOfWeek,
            yAxis: this.generateYAxisValues(chartData.map(d => d.value), false, true), // items format
            data: chartData,
            legend: rows.length > 0 ? null : 'No data for the selected date range'
        };
    }
    
    async getCompetitionProducts(filters = {}) {
        const {
            status = 'all',
            search = '',
            page = 1,
            limit = 10
        } = filters;
        
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT 
                BIN_TO_UUID(c.id) as id,
                c.title as product_title,
                c.category,
                c.status,
                c.total_tickets as total_stock,
                c.sold_tickets as sold_tickets,
                (c.total_tickets - c.sold_tickets) as available_stock,
                COALESCE(COUNT(DISTINCT p.id), 0) as orders,
                COALESCE(SUM(CASE WHEN t.type = 'competition_entry' THEN t.amount ELSE 0 END), 0) as net_sales,
                c.price,
                c.start_date,
                c.end_date
            FROM competitions c
            LEFT JOIN purchases p ON c.id = p.competition_id AND p.status = 'PAID'
            LEFT JOIN transactions t ON p.payment_id = t.id AND t.status = 'completed'
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status !== 'all') {
            query += ` AND c.status = ?`;
            params.push(status);
        }
        
        if (search) {
            query += ` AND (c.title LIKE ? OR c.description LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }
        
        query += ` 
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        params.push(limit, offset);
        
        const [rows] = await db.query(query, params);
        
        // Get total count for pagination
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM competitions c
            WHERE 1=1
            ${status !== 'all' ? 'AND c.status = ?' : ''}
            ${search ? 'AND (c.title LIKE ? OR c.description LIKE ?)' : ''}
        `;
        
        const countParams = [];
        if (status !== 'all') countParams.push(status);
        if (search) {
            countParams.push(`%${search}%`, `%${search}%`);
        }
        
        const [countRows] = await db.execute(countQuery, countParams);
        const total = countRows[0]?.total || 0;
        
        return {
            products: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
    
    async getStockSummary() {
        const query = `
            SELECT 
                SUM(total_tickets) as total_stock,
                SUM(sold_tickets) as total_sold,
                SUM(total_tickets - sold_tickets) as total_available,
                COUNT(*) as total_products,
                SUM(CASE WHEN (total_tickets - sold_tickets) <= 0 THEN 1 ELSE 0 END) as out_of_stock,
                SUM(CASE WHEN (total_tickets - sold_tickets) < 10 AND (total_tickets - sold_tickets) > 0 THEN 1 ELSE 0 END) as low_stock
            FROM competitions
            WHERE status = 'ACTIVE'
        `;
        
        const [rows] = await db.execute(query);
        return rows[0] || {};
    }
    
    async getPerformanceMetrics(startDate, endDate) {
        const query = `
            SELECT 
                COALESCE(SUM(CASE WHEN t.type = 'competition_entry' THEN t.amount ELSE 0 END), 0) as total_sales,
                COUNT(DISTINCT CASE WHEN t.type = 'competition_entry' THEN t.user_id END) as active_customers,
                COUNT(DISTINCT p.id) as orders,
                COALESCE(SUM(CASE 
                    WHEN p.id IS NOT NULL THEN (
                        SELECT COUNT(*)
                        FROM tickets ti 
                        WHERE ti.purchase_id = p.id
                    )
                    ELSE 0 
                END), 0) as products_sold
        FROM transactions t
        LEFT JOIN purchases p ON t.id = p.payment_id
        WHERE t.status = 'completed'
            AND t.created_at BETWEEN ? AND ?
    `;
    
    const [rows] = await db.execute(query, [startDate, endDate]);
    return rows[0] || {};
}

// ===========================================
// UTILITY METHODS
// ===========================================

parseDateRange(dateRange = 'last_7_days') {
    const now = new Date();
    let startDate, endDate;
    
    switch(dateRange) {
        case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            endDate = new Date(now.setHours(23, 59, 59, 999));
            break;
        case 'yesterday':
            startDate = new Date(now.setDate(now.getDate() - 1));
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(now.setDate(now.getDate() + 1));
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'last_7_days':
            startDate = new Date(now.setDate(now.getDate() - 7));
            endDate = new Date();
            break;
        case 'last_30_days':
            startDate = new Date(now.setDate(now.getDate() - 30));
            endDate = new Date();
            break;
        case 'this_month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
        case 'last_month':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;
        default:
            // Custom date range in format 'YYYY-MM-DD,YYYY-MM-DD'
            if (dateRange.includes(',')) {
                const [startStr, endStr] = dateRange.split(',');
                startDate = new Date(startStr);
                endDate = new Date(endStr);
            } else {
                startDate = new Date(now.setDate(now.getDate() - 7));
                endDate = new Date();
            }
    }
    
    return {
        startDate: startDate.toISOString().split('T')[0] + ' 00:00:00',
        endDate: endDate.toISOString().split('T')[0] + ' 23:59:59'
    };
}

generateYAxisValues(data, isCurrency = false, isItems = false) {
    if (!data || data.length === 0) return [0, 1000, 2000, 3000, 4000, 5000];
    
    const maxValue = Math.max(...data);
    if (maxValue === 0) {
        return isCurrency ? ['£0', '£200', '£400', '£600', '£800', '£1,000'] 
             : isItems ? [0, 20, 40, 60, 80, 100]
             : [0, 1000, 2000, 3000, 4000, 5000];
    }
    
    const step = Math.ceil(maxValue / 5);
    const steps = [];
    
    for (let i = 0; i <= 5; i++) {
        const value = i * step;
        if (isCurrency) {
            steps.push(`£${this.formatCurrency(value)}`);
        } else if (isItems) {
            steps.push(value);
        } else {
            steps.push(value);
        }
    }
    
    return steps;
}

formatCurrency(amount) {
    return new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}
}

const analyticsService = new AnalyticsService();
export default analyticsService;