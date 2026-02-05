# Transactions CSV Export API

## Endpoints
- `GET /api/payments/transactions/export/all`
- `GET /api/payments/transactions/export/deposits`
- `GET /api/payments/transactions/export/withdrawals`
- `GET /api/payments/transactions/export/competition-entries`
- `GET /api/payments/transactions/export/status/all`
- `GET /api/payments/transactions/export/status/pending`
- `GET /api/payments/transactions/export/status/completed`
- `GET /api/payments/transactions/export/status/failed`

## Description
Exports transactions as CSV. These preset endpoints are intended for export buttons.

## Optional Query Parameters
For any endpoint:
- `startDate` (optional): ISO date
- `endDate` (optional): ISO date
- `gateway` (optional): `PAYPAL`, `STRIPE`, `REVOLUT`
- `limit` (optional): default `200000`

## Response
- **Content-Type:** `text/csv; charset=utf-8`
- **Content-Disposition:** attachment with date-based filename

## CSV Columns
- id
- user_id
- type
- amount
- currency
- status
- gateway
- description
- created_at
- completed_at
- reference_table
- reference_id

## Auth
- Requires `ADMIN` or `SUPERADMIN`.
