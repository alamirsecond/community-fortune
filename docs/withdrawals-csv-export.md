# Withdrawals CSV Export API

## Endpoints
- `GET /api/withdrawals/export/all`
- `GET /api/withdrawals/export/pending`
- `GET /api/withdrawals/export/approved`
- `GET /api/withdrawals/export/rejected`
- `GET /api/withdrawals/export/completed`
- `GET /api/withdrawals/export/weekly-completed`
- `GET /api/withdrawals/export/large-amount`
- `GET /api/withdrawals/export/first-time`

## Description
Exports withdrawals as CSV. These preset endpoints are intended for export buttons.

## Optional Query Parameters
For `/export/large-amount` only:
- `largeAmountMin` (number, default: 1000)

For `/export/all` only (advanced filtering):
- `status` (optional): `PENDING`, `PENDING_VERIFICATION`, `APPROVED`, `REJECTED`, `COMPLETED`, `PROCESSING`, `CANCELLED`
- `startDate` (optional): ISO date
- `endDate` (optional): ISO date
- `minAmount` (optional): number
- `maxAmount` (optional): number
- `paymentMethod` (optional): `REVOLT`, `STRIPE`, `BANK_TRANSFER`, `PAYPAL`
- `userId` (optional): UUID
- `sortBy` (optional): `amount`, `requested_at`, `updated_at`, `status`
- `sortOrder` (optional): `asc`, `desc`
- `thisWeekCompleted` (optional): `true` or `false`
- `firstTime` (optional): `true` or `false`
- `largeAmount` (optional): `true` or `false`
- `largeAmountMin` (optional): number
- `limit` (optional): default `200000`

## Response
- **Content-Type:** `text/csv; charset=utf-8`
- **Content-Disposition:** attachment with date-based filename

## CSV Columns
- id
- amount
- payment_method
- paypal_email
- bank_account_last_four
- bank_name
- status
- reason
- admin_notes
- admin_id
- requested_at
- updated_at
- is_payment_method
- user_id
- user_email
- user_username
- user_first_name
- user_last_name
- user_country
- user_kyc_status

## Auth
- Requires `ADMIN` or `SUPERADMIN`.
