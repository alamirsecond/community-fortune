# Winners CSV Export API

## Base Endpoint
`GET /api/WINNERS/admin/export`

### Description
Exports winners as a CSV file. You can use the base endpoint with query parameters or the dedicated preset endpoints for export buttons.

### Query Parameters (base endpoint)
- `source` (optional): `ALL`, `MAIN`, `INSTANT`
- `category` (optional): `ALL`, `JACKPOT`, `SUBSCRIPTION`, etc.
- `q` (optional): search text
- `from` (optional): start date
- `to` (optional): end date
- `sort` (optional): `newest`, `oldest`

## Preset Endpoints (for export buttons)
### By Source
- `GET /api/WINNERS/admin/export/source/all`
- `GET /api/WINNERS/admin/export/source/main`
- `GET /api/WINNERS/admin/export/source/instant`

### By Category
- `GET /api/WINNERS/admin/export/category/jackpot`
- `GET /api/WINNERS/admin/export/category/subscription`

## Response
- **Content-Type:** `text/csv; charset=utf-8`
- **Content-Disposition:** `attachment; filename="winners_export_YYYY-MM-DD.csv"`
- **Body:** CSV rows with columns:
  - source
  - winner_id
  - username
  - email
  - competition_title
  - competition_category
  - reward_value
  - entry_price
  - date_ended
  - ticket_number
  - prize_description
  - event_at

## Auth
- Requires `ADMIN` or `SUPERADMIN` authentication.
