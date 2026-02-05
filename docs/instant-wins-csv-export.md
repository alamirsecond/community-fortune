# Instant Wins CSV Export API

## Base Endpoints
- `GET /api/INSTANT%20WINS/admin/export`
- `GET /api/INSTANT%20WINS/admin/competition/:competition_id/export`

### Description
Exports instant wins as CSV. You can use query parameters on the base endpoints or use preset endpoints for export buttons.

### Query Parameters (base endpoints)
- `status` (optional): `claimed`, `unclaimed`
- `prize_type` (optional): any prize type value stored in `instant_wins.prize_type`

## Preset Endpoints (for export buttons)
- `GET /api/INSTANT%20WINS/admin/export/claimed`
- `GET /api/INSTANT%20WINS/admin/export/unclaimed`
- `GET /api/INSTANT%20WINS/admin/export/prize/:prize_type`

## Response
- **Content-Type:** `text/csv; charset=utf-8`
- **Content-Disposition:** attachment with a date-based filename

## Auth
- Requires `ADMIN` or `SUPERADMIN` authentication.
