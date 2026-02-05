# Competition CSV Export API

## Endpoints
`GET /api/Competition/export/csv`
`GET /api/Competition/export/all`
`GET /api/Competition/export/active`
`GET /api/Competition/export/ended`
`GET /api/Competition/export/free`
`GET /api/Competition/export/paid`
`GET /api/Competition/export/jackpot`

### Description
Exports competitions as a CSV file. You can either use the base endpoint with query parameters or the dedicated preset endpoints for export buttons.

### Query Parameters (base endpoint only)
- `status` (optional): Filter by status. Accepted values: `active`, `ended`, `all`.
- `type` (optional): Filter by type. Accepted values: `jackpot`.
- `is_free` (optional): Filter by free/paid. Accepted values: `true`, `false`.

### Example Requests (preset endpoints)
- Export all competitions:
  `/api/Competition/export/all`
- Export active competitions:
  `/api/Competition/export/active`
- Export ended competitions:
  `/api/Competition/export/ended`
- Export free competitions:
  `/api/Competition/export/free`
- Export paid competitions:
  `/api/Competition/export/paid`
- Export jackpot competitions:
  `/api/Competition/export/jackpot`

### Example Requests (base endpoint)
- Export all active competitions:
  `/api/Competition/export/csv?status=active`
- Export all ended competitions:
  `/api/Competition/export/csv?status=ended`
- Export all free competitions:
  `/api/Competition/export/csv?status=all&is_free=true`
- Export all paid competitions:
  `/api/Competition/export/csv?status=all&is_free=false`
- Export all jackpot competitions:
  `/api/Competition/export/csv?status=all&type=jackpot`

### Response
- **Content-Type:** `text/csv`
- **Content-Disposition:** `attachment; filename="competitions-export.csv"`
- **Body:** CSV file with columns:
  - id
  - title
  - status
  - competition_type
  - is_free_competition
  - price
  - start_date
  - end_date
  - total_tickets
  - sold_tickets

### Example CSV Output
```csv
id,title,status,competition_type,is_free_competition,price,start_date,end_date,total_tickets,sold_tickets
1,Winter Jackpot,ACTIVE,JACKPOT,false,10,2026-02-01,2026-02-28,1000,500
2,Spring Freebie,ACTIVE,REGULAR,true,0,2026-03-01,2026-03-31,500,200
```

### Auth
- Requires `ADMIN` or `SUPERADMIN` authentication.

### Notes
- Use query parameters to filter as needed.
- The endpoint is designed for easy integration with frontend download features.
