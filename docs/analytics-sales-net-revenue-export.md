# Analytics Sales Net Revenue CSV Export

## Endpoint
- `GET /api/analytics/sales/net-revenue/export`

## Alternate Endpoint
- `GET /api/analytics/export?type=sales_net_revenue`

## Description
Exports sales net revenue as CSV using the same data as the sales overview (`net_sales` chart). Each row is a day in the selected date range.

## Query Parameters
- `dateRange` (optional): Range key used by analytics service. Example values:
  - `last_7_days`
  - `last_30_days`
  - `this_month`
  - `last_month`

## Response
- **Content-Type:** `text/csv; charset=utf-8`
- **Content-Disposition:** attachment with date-based filename

## CSV Columns
- day
- net_sales
- transaction_count
- range_start
- range_end
- total_net_sales

## Auth
- Requires `ADMIN` or `SUPERADMIN`.
