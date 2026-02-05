# Voucher CSV Export API

## Base Endpoint
`GET /api/Vouchers/admin/export`

### Description
Exports vouchers as a CSV file. You can either use the base endpoint with query parameters or the dedicated preset endpoints for export buttons.

### Query Parameters (base endpoint)
- `status` (optional): `active`, `expired`, `scheduled`, `inactive`
- `type` (optional): `SINGLE_USE`, `MULTI_USE`, `BULK_CODES`
- `is_active` (optional): `true`, `false`
- `q` (optional): search text
- `sort` (optional): `latest`, `value_desc`, `expiry_asc`, `usage_desc`, `usage_asc`

## Preset Endpoints (for export buttons)
### By Status
- `GET /api/Vouchers/admin/export/active`
- `GET /api/Vouchers/admin/export/expired`
- `GET /api/Vouchers/admin/export/scheduled`
- `GET /api/Vouchers/admin/export/inactive`

### By Voucher Type
- `GET /api/Vouchers/admin/export/type/single-use`
- `GET /api/Vouchers/admin/export/type/multi-use`
- `GET /api/Vouchers/admin/export/type/bulk-codes`

## Response
- **Content-Type:** `text/csv`
- **Content-Disposition:** `attachment; filename="vouchers.csv"`
- **Body:** CSV rows with columns:
  - Voucher ID
  - Code
  - Campaign
  - Type
  - Reward Type
  - Reward Value
  - Usage Limit
  - Times Redeemed
  - Usage Remaining
  - Usage %
  - Status
  - Active
  - Start Date
  - Expiry Date
  - Created At
  - Updated At

## Auth
- Requires `ADMIN` or `SUPERADMIN` authentication.
